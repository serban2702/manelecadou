import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { AdminGuard } from '../../common/admin.guard';
import { AuthedRequestUser, CurrentUser } from '../../common/decorators';
import { WebPushService } from './web-push.service';

class SubscribeDto {
  @IsString()
  endpoint!: string;
  @IsString()
  p256dh!: string;
  @IsString()
  auth!: string;
  @IsString() @IsOptional()
  userAgent?: string;
  @IsString() @IsOptional()
  label?: string;
}

class UnsubscribeDto {
  @IsString()
  endpoint!: string;
}

@UseGuards(AdminGuard)
@Controller('admin/web-push')
export class WebPushController {
  constructor(private readonly svc: WebPushService) {}

  /** Returnează cheia publică VAPID pentru ca SW-ul să se aboneze. */
  @Get('public-key')
  async publicKey() {
    return { publicKey: this.svc.getPublicKey(), configured: this.svc.isConfigured() };
  }

  @Get('subscriptions')
  async my(@CurrentUser() user: AuthedRequestUser) {
    const subs = await this.svc.listForUser(user.id);
    // Nu expunem p256dh/auth în UI — doar metadata.
    return subs.map((s) => ({
      id: s.id,
      endpoint: s.endpoint.slice(0, 60) + '…',
      userAgent: s.userAgent,
      label: s.label,
      createdAt: s.createdAt,
      lastSuccessAt: s.lastSuccessAt,
      failureCount: s.failureCount,
    }));
  }

  @Post('subscribe')
  async subscribe(@Body() dto: SubscribeDto, @CurrentUser() user: AuthedRequestUser) {
    if (!this.svc.isConfigured()) {
      // Tentativă să recitim — userul poate tocmai a salvat cheile.
      await this.svc.reloadVapid();
      if (!this.svc.isConfigured()) {
        return { ok: false, reason: 'VAPID not configured' };
      }
    }
    const sub = await this.svc.subscribe({ ...dto, userId: user.id });
    return { ok: true, id: sub.id };
  }

  @Delete('subscribe')
  async unsubscribe(@Body() dto: UnsubscribeDto) {
    await this.svc.unsubscribe(dto.endpoint);
    return { ok: true };
  }

  /** Trimite o notificare de test către toți adminii subscribed. */
  @Post('test')
  async test() {
    const r = await this.svc.sendToAll({
      title: '🎉 Test push de la Manele Cadou',
      body: 'Notificările funcționează. Mesajele noi vor apărea aici.',
      tag: 'test',
      url: '/chat',
      icon: '/icon-512.png',
      badge: '/icon-512.png',
    });
    return { ok: true, ...r };
  }

  /** Re-citește VAPID din settings (după update). */
  @Post('reload')
  async reload() {
    const ok = await this.svc.reloadVapid();
    return { ok, configured: this.svc.isConfigured() };
  }
}
