import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Sse,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { Observable, interval } from 'rxjs';
import { switchMap, distinctUntilChanged } from 'rxjs/operators';
import { ChatService } from './chat.service';
import { OptionalJwtAuthGuard } from '../../common/jwt.guard';
import { AdminGuard } from '../../common/admin.guard';
import {
  AuthedRequestUser,
  CurrentGuestId,
  CurrentSiteId,
  CurrentUser,
} from '../../common/decorators';

class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}

class SetAiModeDto {
  @IsString()
  @IsIn(['manual', 'suggest', 'auto'])
  mode!: 'manual' | 'suggest' | 'auto';
}

class ApproveSuggestionDto {
  @IsOptional() @IsString() @MaxLength(4000)
  editedText?: string;
}

class PaymentLinkDto {
  @IsOptional() @IsNumber() @Min(1)
  amount?: number;
  @IsOptional() @IsString()
  currency?: string;
  @IsOptional() @IsString() @MaxLength(200)
  description?: string;
  @IsOptional() @IsBoolean()
  premium?: boolean;
}

class RenameDto {
  @IsString() @MinLength(1) @MaxLength(200)
  subject!: string;
}

class ArchiveDto {
  @IsOptional()
  archived?: boolean;
}

class LyricsPreviewDto {
  @IsString() @MinLength(1) @MaxLength(64) style!: string;
  @IsString() @MinLength(1) @MaxLength(64) occasion!: string;
  @IsString() @MinLength(1) @MaxLength(120) recipientName!: string;
  @IsString() @MinLength(1) @MaxLength(600) message!: string;
  @IsString() @MinLength(1) @MaxLength(64) voiceArtist!: string;
  @IsOptional() @IsString() @MaxLength(120) dedication?: string;
  @IsOptional() @IsNumber() @Min(0) tipAmount?: number;
  @IsOptional() @IsBoolean() refine?: boolean;
}

class LaunchGenerationDto {
  @IsString() paymentId!: string;
  @IsString() @MinLength(1) @MaxLength(64) style!: string;
  @IsString() @MinLength(1) @MaxLength(64) occasion!: string;
  @IsString() @MinLength(1) @MaxLength(120) recipientName!: string;
  @IsString() @MinLength(1) @MaxLength(600) message!: string;
  @IsString() @MinLength(1) @MaxLength(64) voiceArtist!: string;
  @IsOptional() @IsString() @MaxLength(120) dedication?: string;
  @IsOptional() @IsString() @MaxLength(4000) customLyrics?: string;
  @IsOptional() @IsBoolean() premium?: boolean;
  /** Email pentru livrare — necesar dacă guest nu l-a setat încă. */
  @IsOptional() @IsString() @MaxLength(320) email?: string;
  /** Sumă dedicată audio (cents, opțional). Apare ca extra în melodie. */
  @IsOptional() @IsNumber() @Min(0) tipAmount?: number;
}

@UseGuards(OptionalJwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly svc: ChatService) {}

  @Get('me')
  async me(
    @CurrentUser() user: AuthedRequestUser | null,
    @CurrentGuestId() guestId: string | null,
    @CurrentSiteId() siteId: string | null,
  ) {
    return this.svc.listMyMessages({
      userId: user?.id ?? null,
      guestId: user ? null : guestId,
      siteId,
    });
  }

  /**
   * Server-Sent Events stream pentru chat user.
   * EventSource nu suportă headers, deci primim guestId via query string.
   * (Tokenul JWT îl putem trece tot în query când userul e logat.)
   */
  @Sse('me/stream')
  meStream(
    @Query('guestId') guestQuery: string | undefined,
    @CurrentUser() user: AuthedRequestUser | null,
    @CurrentGuestId() headerGuest: string | null,
    @CurrentSiteId() siteId: string | null,
  ): Observable<MessageEvent> {
    const guestId = headerGuest ?? guestQuery ?? null;
    return interval(2000).pipe(
      switchMap(async () => {
        const data = await this.svc.listMyMessages({
          userId: user?.id ?? null,
          guestId: user ? null : guestId,
          siteId,
        });
        return {
          conversation: data.conversation,
          messageCount: data.messages.length,
          lastUpdate: data.conversation.lastMessageAt,
          messages: data.messages,
        };
      }),
      distinctUntilChanged((a, b) => a.messageCount === b.messageCount && a.conversation.unreadByUser === b.conversation.unreadByUser),
      switchMap((payload) => {
        const ev = { data: JSON.stringify(payload) } as MessageEvent;
        return [ev];
      }),
    );
  }

  @Throttle({ short: { limit: 5, ttl: 10_000 }, medium: { limit: 30, ttl: 60_000 } })
  @Post('me/messages')
  async send(
    @Body() body: SendMessageDto,
    @CurrentUser() user: AuthedRequestUser | null,
    @CurrentGuestId() guestId: string | null,
    @CurrentSiteId() siteId: string | null,
  ) {
    return this.svc.sendAsUser(
      { userId: user?.id ?? null, guestId: user ? null : guestId, siteId },
      body.body,
    );
  }
}

@UseGuards(AdminGuard)
@Controller('admin/chat')
export class AdminChatController {
  constructor(private readonly svc: ChatService) {}

  @Get('conversations')
  list(
    @CurrentSiteId() siteId: string | null,
    @Query('q') q?: string,
    @Query('archived') archivedStr?: string,
  ) {
    return this.svc.listAllConversations(siteId, {
      q,
      archived: archivedStr === 'true',
    });
  }

  /** Arhivează (sau dezarhivează cu ?unarchive=true) o conversație. */
  @Patch('conversations/:id/archive')
  async toggleArchive(
    @Param('id') id: string,
    @Body() body: ArchiveDto,
  ) {
    const archived = body.archived !== false;
    const c = await this.svc.setArchived(id, archived);
    return { ok: true, archivedAt: c.archivedAt };
  }

  /** Redenumește subiectul afișat al conversației. */
  @Patch('conversations/:id/rename')
  async rename(@Param('id') id: string, @Body() body: RenameDto) {
    const c = await this.svc.renameConversation(id, body.subject);
    return { ok: true, subject: c.subject };
  }

  /** Șterge complet conversația + toate mesajele. Ireversibil. */
  @Delete('conversations/:id')
  deleteConversation(@Param('id') id: string) {
    return this.svc.deleteConversation(id);
  }

  @Get('conversations/:id')
  async getOne(@Param('id') id: string) {
    const conversation = await this.svc.getConversation(id);
    const presence = await this.svc.conversationPresence(conversation);
    const enriched = this.svc.getEnrichedPresenceForConversation(conversation);
    const messages = await this.svc.listMessages(id);
    await this.svc.markReadByAdmin(id);
    return { conversation: { ...conversation, ...presence, enriched }, messages };
  }

  @Post('conversations/:id/messages')
  reply(
    @Param('id') id: string,
    @Body() body: SendMessageDto,
    @CurrentUser() user: AuthedRequestUser | null,
  ) {
    return this.svc.sendAsAdmin(id, user?.id ?? '00000000-0000-0000-0000-000000000000', body.body);
  }

  /**
   * Claim/release assignment pe conversație. Body opțional: `{ adminUserId }`.
   * Dacă lipsește sau e null → folosește admin-ul curent (auto-claim).
   * Dacă adminUserId === 'release' → eliberează (set null).
   */
  @Post('conversations/:id/assign')
  async assignAdmin(
    @Param('id') id: string,
    @Body() body: { adminUserId?: string | null } | undefined,
    @CurrentUser() user: AuthedRequestUser | null,
  ) {
    let target: string | null;
    if (!body || body.adminUserId === undefined) {
      target = user?.id ?? null; // auto-claim de current admin
    } else if (body.adminUserId === null || body.adminUserId === 'release') {
      target = null;
    } else {
      target = body.adminUserId;
    }
    const c = await this.svc.setAssignedAdmin(id, target);
    return {
      ok: true,
      assignedAdminId: c.assignedAdminId,
      assignedAdminEmail: c.assignedAdminEmail,
      assignedAt: c.assignedAt,
    };
  }

  /** Setează modul AI pentru o conversație (manual / suggest / auto). */
  @Post('conversations/:id/ai-mode')
  async setAiMode(@Param('id') id: string, @Body() body: SetAiModeDto) {
    const conv = await this.svc.setAiMode(id, body.mode);
    return { ok: true, aiMode: conv.aiMode };
  }

  /**
   * Forțează deschiderea SAU închiderea chat-ului pe client.
   * Body opțional: `{ open: boolean }` — default `true` (backward-compat).
   */
  @Post('conversations/:id/force-open')
  async forceOpen(
    @Param('id') id: string,
    @Body() body?: { open?: boolean },
  ) {
    const open = body?.open !== false;
    return this.svc.forceToggleChat(id, open);
  }

  /** Upload atașament (imagine / PDF) — multipart 'file', optional caption în body. */
  @Post('conversations/:id/attachments')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadAttachment(
    @Param('id') id: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string; size: number; mimetype: string } | undefined,
    @Body('caption') caption: string | undefined,
    @CurrentUser() user: AuthedRequestUser | null,
  ) {
    if (!file) throw new BadRequestException('Lipsește file');
    return this.svc.sendAttachmentAsAdmin(
      id,
      user?.id ?? '00000000-0000-0000-0000-000000000000',
      { buffer: file.buffer, originalName: file.originalname, mime: file.mimetype },
      caption,
    );
  }

  /** Aprobă o sugestie AI și o trimite ca mesaj admin către user. */
  @Post('suggestions/:messageId/approve')
  approveSuggestion(
    @Param('messageId') messageId: string,
    @Body() body: ApproveSuggestionDto,
    @CurrentUser() user: AuthedRequestUser | null,
  ) {
    return this.svc.approveAiSuggestion(messageId, user?.id ?? '00000000-0000-0000-0000-000000000000', body.editedText);
  }

  /** Respinge o sugestie AI (ștergere silent). */
  @Post('suggestions/:messageId/reject')
  rejectSuggestion(@Param('messageId') messageId: string) {
    return this.svc.rejectAiSuggestion(messageId);
  }

  /** Generează un preview de versuri (writer + opțional critic). Nu salvează nimic. */
  @Post('lyrics/preview')
  previewLyrics(
    @Body() dto: LyricsPreviewDto,
    @CurrentSiteId() siteId: string | null,
  ) {
    return this.svc.previewLyrics({ ...dto, siteId });
  }

  /** Lansează manual o generare pentru un paymentId deja plătit (ad-hoc admin link). */
  @Post('conversations/:id/launch-generation')
  launchGeneration(@Param('id') id: string, @Body() dto: LaunchGenerationDto) {
    return this.svc.launchGenerationFromPayment(id, dto);
  }

  /**
   * Combo: lansează generation type='demo' + creează Stripe Checkout cu metadata
   * unlock-generation + trimite payment_link în chat. La plată confirmată,
   * webhook-ul deblochează full automat (paidUnlocked=true) + trimite mesaj cu link.
   */
  @Post('conversations/:id/demo-with-payment')
  async demoWithPayment(
    @Param('id') id: string,
    @Body()
    body: {
      style: string;
      occasion: string;
      recipientName: string;
      message: string;
      voiceArtist: string;
      dedication?: string;
      customLyrics?: string;
      premium?: boolean;
      tipAmount?: number;
      email?: string;
      amount: number;
      currency?: string;
      productName?: string;
    },
    @CurrentUser() user: AuthedRequestUser | null,
  ) {
    return this.svc.sendDemoWithPaymentLink(
      id,
      user?.id ?? '00000000-0000-0000-0000-000000000000',
      body,
    );
  }

  /** Setează email pe sesiunea curentă (guest sau user). */
  @Patch('conversations/:id/email')
  setEmail(@Param('id') id: string, @Body() body: { email: string }) {
    return this.svc.setConversationEmail(id, body.email);
  }

  /** Marchează conversația ca favorită (toggle). */
  @Patch('conversations/:id/favorite')
  setFavorite(@Param('id') id: string, @Body() body: { favorite: boolean }) {
    return this.svc.setFavorite(id, body.favorite);
  }

  /** Setează nota privată admin pe conversație (string sau null pentru clear). */
  @Patch('conversations/:id/note')
  setNote(@Param('id') id: string, @Body() body: { note: string | null }) {
    return this.svc.setAdminNote(id, body.note);
  }

  /** AI extract: rezumă conversația și extrage datele pentru wizard de comandă. */
  @Post('conversations/:id/summarize-order')
  summarizeOrder(@Param('id') id: string) {
    return this.svc.summarizeOrderFromConversation(id);
  }

  /** Editează body-ul unui mesaj admin existent. WS update live. */
  @Patch('messages/:id')
  editMessage(@Param('id') id: string, @Body() body: { body: string }) {
    return this.svc.editMessage(id, body.body);
  }

  /** Soft-delete mesaj. Dispare instant la admin și user prin WS. */
  @Delete('messages/:id')
  deleteMessage(@Param('id') id: string) {
    return this.svc.deleteMessage(id);
  }

  // ============== Quick Replies (per-site) ==============

  @Get('quick-replies')
  listQuickReplies(@CurrentSiteId() siteId: string | null) {
    return this.svc.listQuickReplies(siteId);
  }

  @Post('quick-replies')
  createQuickReply(
    @CurrentSiteId() siteId: string | null,
    @Body() body: { label: string; text: string; color?: string; sortOrder?: number },
  ) {
    return this.svc.createQuickReply(siteId, body);
  }

  @Patch('quick-replies/:id')
  updateQuickReply(
    @Param('id') id: string,
    @Body() body: { label?: string; text?: string; color?: string; sortOrder?: number },
  ) {
    return this.svc.updateQuickReply(id, body);
  }

  @Delete('quick-replies/:id')
  deleteQuickReply(@Param('id') id: string) {
    return this.svc.deleteQuickReply(id);
  }

  /** Trimite link de plată Stripe Checkout către utilizator. */
  @Post('conversations/:id/payment-link')
  async paymentLink(
    @Param('id') id: string,
    @Body() body: PaymentLinkDto,
    @CurrentUser() user: AuthedRequestUser | null,
  ) {
    return this.svc.sendPaymentLinkAsAdmin(
      id,
      user?.id ?? '00000000-0000-0000-0000-000000000000',
      body,
    );
  }
}
