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

  /** Setează modul AI pentru o conversație (manual / suggest / auto). */
  @Post('conversations/:id/ai-mode')
  async setAiMode(@Param('id') id: string, @Body() body: SetAiModeDto) {
    const conv = await this.svc.setAiMode(id, body.mode);
    return { ok: true, aiMode: conv.aiMode };
  }

  /** Forțează deschiderea chat-ului pe client (admin sau AI). */
  @Post('conversations/:id/force-open')
  async forceOpen(@Param('id') id: string) {
    return this.svc.forceOpenChat(id);
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

  /** Lansează manual o generare pentru un paymentId deja plătit (ad-hoc admin link). */
  @Post('conversations/:id/launch-generation')
  launchGeneration(@Param('id') id: string, @Body() dto: LaunchGenerationDto) {
    return this.svc.launchGenerationFromPayment(id, dto);
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
