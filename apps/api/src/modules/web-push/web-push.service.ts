import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import webpush from 'web-push';
import { WebPushSubscription } from './web-push-subscription.entity';
import { SettingsService } from '../settings/settings.service';

/** Payload trimis prin push (decodat de SW în notification). */
export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string; // mesaje cu același tag se înlocuiesc între ele
  url?: string; // unde duce click-ul
  data?: Record<string, unknown>;
}

@Injectable()
export class WebPushService implements OnModuleInit {
  private readonly logger = new Logger('WebPush');
  private configured = false;
  private publicKey: string | null = null;

  constructor(
    @InjectRepository(WebPushSubscription)
    private readonly subs: Repository<WebPushSubscription>,
    private readonly settings: SettingsService,
  ) {}

  async onModuleInit() {
    await this.reloadVapid();
  }

  /** Re-citește VAPID keys din settings (apelat după update sau la boot). */
  async reloadVapid(): Promise<boolean> {
    const pub = (await this.settings.get('VAPID_PUBLIC_KEY')).trim();
    const priv = (await this.settings.get('VAPID_PRIVATE_KEY')).trim();
    const subject = (await this.settings.get('VAPID_SUBJECT')).trim() || 'mailto:admin@manelecadou.ro';
    if (!pub || !priv) {
      this.configured = false;
      this.publicKey = null;
      this.logger.warn('VAPID keys not configured — push disabled. Generate cu: npx web-push generate-vapid-keys');
      return false;
    }
    try {
      webpush.setVapidDetails(subject, pub, priv);
      this.publicKey = pub;
      this.configured = true;
      this.logger.log('VAPID configured');
      return true;
    } catch (e) {
      this.configured = false;
      this.publicKey = null;
      this.logger.error(`VAPID setup failed: ${(e as Error).message}`);
      return false;
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  getPublicKey(): string | null {
    return this.publicKey;
  }

  /** Înregistrează (sau actualizează prin endpoint) o subscription. */
  async subscribe(args: {
    userId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent?: string | null;
    label?: string | null;
  }): Promise<WebPushSubscription> {
    const existing = await this.subs.findOne({ where: { endpoint: args.endpoint } });
    if (existing) {
      existing.userId = args.userId;
      existing.p256dh = args.p256dh;
      existing.auth = args.auth;
      existing.userAgent = args.userAgent ?? existing.userAgent;
      existing.label = args.label ?? existing.label;
      existing.failureCount = 0;
      return this.subs.save(existing);
    }
    const created = this.subs.create({
      userId: args.userId,
      endpoint: args.endpoint,
      p256dh: args.p256dh,
      auth: args.auth,
      userAgent: args.userAgent ?? null,
      label: args.label ?? null,
    });
    return this.subs.save(created);
  }

  async unsubscribe(endpoint: string): Promise<void> {
    await this.subs.delete({ endpoint });
  }

  async listForUser(userId: string): Promise<WebPushSubscription[]> {
    return this.subs.find({ where: { userId }, order: { updatedAt: 'DESC' } });
  }

  /** Trimite la o listă de userIds (de obicei: toți adminii). */
  async sendToUsers(userIds: string[], payload: PushPayload): Promise<{ sent: number; pruned: number }> {
    if (!this.configured || userIds.length === 0) return { sent: 0, pruned: 0 };
    const subs = await this.subs.find({ where: { userId: In(userIds) } });
    return this.sendBatch(subs, payload);
  }

  /** Trimite la TOATE subscription-urile (un singur admin user pe acest sistem de obicei). */
  async sendToAll(payload: PushPayload): Promise<{ sent: number; pruned: number }> {
    if (!this.configured) return { sent: 0, pruned: 0 };
    const subs = await this.subs.find();
    return this.sendBatch(subs, payload);
  }

  private async sendBatch(
    subs: WebPushSubscription[],
    payload: PushPayload,
  ): Promise<{ sent: number; pruned: number }> {
    const body = JSON.stringify(payload);
    let sent = 0;
    const toPrune: string[] = [];
    const toBumpFail: string[] = [];

    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body,
          );
          sent++;
          s.lastSuccessAt = new Date();
          s.failureCount = 0;
          await this.subs.save(s).catch(() => {});
        } catch (e) {
          const err = e as Error & { statusCode?: number };
          // 410 Gone / 404 Not Found → subscription invalid, șterge.
          if (err.statusCode === 410 || err.statusCode === 404) {
            toPrune.push(s.endpoint);
          } else {
            toBumpFail.push(s.id);
            this.logger.warn(`push failed (${err.statusCode ?? '??'}) for ${s.endpoint.slice(-30)}: ${err.message}`);
          }
        }
      }),
    );

    if (toPrune.length > 0) {
      await this.subs.delete({ endpoint: In(toPrune) });
    }
    if (toBumpFail.length > 0) {
      await this.subs
        .createQueryBuilder()
        .update(WebPushSubscription)
        .set({ failureCount: () => '"failureCount" + 1' })
        .where('id IN (:...ids)', { ids: toBumpFail })
        .execute();
      // La >=5 eșecuri consecutive, drop.
      await this.subs
        .createQueryBuilder()
        .delete()
        .where('"failureCount" >= 5')
        .execute();
    }

    return { sent, pruned: toPrune.length };
  }
}
