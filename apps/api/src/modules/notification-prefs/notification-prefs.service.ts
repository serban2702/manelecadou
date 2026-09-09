import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AdminNotificationPrefs } from './notification-prefs.entity';
import {
  CHAT_NOTIFY_MODES,
  DEFAULT_NOTIFICATION_PREFS,
  type ChatNotifyMode,
  type EffectiveNotificationPrefs,
} from './notification-kind';

@Injectable()
export class NotificationPrefsService {
  private readonly logger = new Logger('NotificationPrefs');

  constructor(
    @InjectRepository(AdminNotificationPrefs)
    private readonly repo: Repository<AdminNotificationPrefs>,
  ) {}

  private toEffective(row: AdminNotificationPrefs | null): EffectiveNotificationPrefs {
    if (!row) return { ...DEFAULT_NOTIFICATION_PREFS };
    return {
      payment: row.payment,
      finalStep: row.finalStep,
      chatMode: CHAT_NOTIFY_MODES.includes(row.chatMode) ? row.chatMode : 'all',
      generation: row.generation,
      stalledDelivery: row.stalledDelivery,
      aiAlert: row.aiAlert,
    };
  }

  /** Preferințele unui admin. Fără rând în DB → toate pornite. */
  async get(userId: string): Promise<EffectiveNotificationPrefs> {
    const row = await this.repo.findOne({ where: { userId } });
    return this.toEffective(row);
  }

  /**
   * Preferințele pentru mai mulți admini deodată, ca un push să nu facă un
   * SELECT per abonament. Cheia lipsă din map înseamnă implicit — apelantul
   * folosește `DEFAULT_NOTIFICATION_PREFS`.
   */
  async getMany(userIds: string[]): Promise<Map<string, EffectiveNotificationPrefs>> {
    const out = new Map<string, EffectiveNotificationPrefs>();
    const unique = [...new Set(userIds)].filter(Boolean);
    if (unique.length === 0) return out;
    const rows = await this.repo.find({ where: { userId: In(unique) } });
    for (const r of rows) out.set(r.userId, this.toEffective(r));
    return out;
  }

  /** Scrie preferințele unui admin (upsert). Câmpurile absente rămân neatinse. */
  async update(
    userId: string,
    patch: Partial<EffectiveNotificationPrefs>,
  ): Promise<EffectiveNotificationPrefs> {
    let row = await this.repo.findOne({ where: { userId } });
    if (!row) {
      row = this.repo.create({ userId, ...DEFAULT_NOTIFICATION_PREFS });
    }
    if (typeof patch.payment === 'boolean') row.payment = patch.payment;
    if (typeof patch.finalStep === 'boolean') row.finalStep = patch.finalStep;
    if (typeof patch.generation === 'boolean') row.generation = patch.generation;
    if (typeof patch.stalledDelivery === 'boolean') {
      row.stalledDelivery = patch.stalledDelivery;
    }
    if (typeof patch.aiAlert === 'boolean') row.aiAlert = patch.aiAlert;
    if (patch.chatMode && CHAT_NOTIFY_MODES.includes(patch.chatMode as ChatNotifyMode)) {
      row.chatMode = patch.chatMode as ChatNotifyMode;
    }
    const saved = await this.repo.save(row);
    this.logger.log(`prefs updated for ${userId}: chat=${saved.chatMode}`);
    return this.toEffective(saved);
  }
}
