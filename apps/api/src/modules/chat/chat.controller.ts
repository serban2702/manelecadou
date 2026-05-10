import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength, MinLength } from 'class-validator';
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
  list(@CurrentSiteId() siteId: string | null) {
    return this.svc.listAllConversations(siteId);
  }

  @Get('conversations/:id')
  async getOne(@Param('id') id: string) {
    const conversation = await this.svc.getConversation(id);
    const presence = await this.svc.conversationPresence(conversation);
    const messages = await this.svc.listMessages(id);
    await this.svc.markReadByAdmin(id);
    return { conversation: { ...conversation, ...presence }, messages };
  }

  @Post('conversations/:id/messages')
  reply(
    @Param('id') id: string,
    @Body() body: SendMessageDto,
    @CurrentUser() user: AuthedRequestUser | null,
  ) {
    return this.svc.sendAsAdmin(id, user?.id ?? '00000000-0000-0000-0000-000000000000', body.body);
  }
}
