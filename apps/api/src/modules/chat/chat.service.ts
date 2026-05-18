import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from './conversation.entity';
import { ChatMessage } from './message.entity';
import { GuestSession } from '../guest-sessions/guest-session.entity';
import { User } from '../users/user.entity';
import { AnalyticsSession } from '../analytics/analytics-session.entity';
import { ChatGateway } from './chat.gateway';
import { TranslationService } from '../../openai/translation.service';

/** Pragul în secunde sub care o sesiune e considerată "online". */
const ONLINE_WINDOW_SEC = 120;

export interface ConversationWithPresence extends Conversation {
  online: boolean;
  lastSeenAt: string | null;
  /** Cel mai recent IP al userului/guest-ului din analytics_sessions. */
  ip: string | null;
}

interface OwnerCtx {
  userId: string | null;
  guestId: string | null;
  siteId: string | null;
}

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(Conversation) private readonly conv: Repository<Conversation>,
    @InjectRepository(ChatMessage) private readonly msg: Repository<ChatMessage>,
    @InjectRepository(GuestSession) private readonly guests: Repository<GuestSession>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(AnalyticsSession) private readonly analyticsSessions: Repository<AnalyticsSession>,
    @Inject(forwardRef(() => ChatGateway))
    private readonly gateway: ChatGateway,
    private readonly translation: TranslationService,
  ) {}

  /**
   * Întoarce un Map cu lastSeenAt pentru fiecare userId/guestId trimis ca input.
   * Folosit pentru a determina online presence pe lista de conversații.
   */
  private async fetchPresence(
    userIds: string[],
    guestIds: string[],
  ): Promise<{ users: Map<string, Date>; guests: Map<string, Date> }> {
    const users = new Map<string, Date>();
    const guests = new Map<string, Date>();
    if (userIds.length > 0) {
      const rows = await this.analyticsSessions
        .createQueryBuilder('s')
        .select('s.userId', 'userId')
        .addSelect('MAX(s.lastActivityAt)', 'lastSeenAt')
        .where('s.userId IN (:...ids)', { ids: userIds })
        .groupBy('s.userId')
        .getRawMany<{ userId: string; lastSeenAt: Date }>();
      for (const r of rows) users.set(r.userId, r.lastSeenAt);
    }
    if (guestIds.length > 0) {
      const rows = await this.analyticsSessions
        .createQueryBuilder('s')
        .select('s.guestId', 'guestId')
        .addSelect('MAX(s.lastActivityAt)', 'lastSeenAt')
        .where('s.guestId IN (:...ids)', { ids: guestIds })
        .groupBy('s.guestId')
        .getRawMany<{ guestId: string; lastSeenAt: Date }>();
      for (const r of rows) guests.set(r.guestId, r.lastSeenAt);
    }
    return { users, guests };
  }

  /**
   * Întoarce ultimul IP cunoscut pentru fiecare user/guest, din analytics_sessions.
   * IP-ul se schimbă rar (per sesiune) — îl folosim ca indicator informativ în chat.
   */
  private async fetchLastIp(
    userIds: string[],
    guestIds: string[],
  ): Promise<{ users: Map<string, string>; guests: Map<string, string> }> {
    const users = new Map<string, string>();
    const guests = new Map<string, string>();
    if (userIds.length > 0) {
      const rows = await this.analyticsSessions
        .createQueryBuilder('s')
        .select('s.userId', 'userId')
        .addSelect('s.ip', 'ip')
        .where('s.userId IN (:...ids)', { ids: userIds })
        .andWhere('s.ip IS NOT NULL')
        .distinctOn(['s.userId'])
        .orderBy('s.userId')
        .addOrderBy('s.lastActivityAt', 'DESC')
        .getRawMany<{ userId: string; ip: string }>();
      for (const r of rows) if (r.ip) users.set(r.userId, r.ip);
    }
    if (guestIds.length > 0) {
      const rows = await this.analyticsSessions
        .createQueryBuilder('s')
        .select('s.guestId', 'guestId')
        .addSelect('s.ip', 'ip')
        .where('s.guestId IN (:...ids)', { ids: guestIds })
        .andWhere('s.ip IS NOT NULL')
        .distinctOn(['s.guestId'])
        .orderBy('s.guestId')
        .addOrderBy('s.lastActivityAt', 'DESC')
        .getRawMany<{ guestId: string; ip: string }>();
      for (const r of rows) if (r.ip) guests.set(r.guestId, r.ip);
    }
    return { users, guests };
  }

  async getOrCreateMine(ctx: OwnerCtx): Promise<Conversation> {
    // Conversațiile sunt scoped pe site — același user pe RO și BG = două conversații.
    const scopedWhere = (base: Record<string, unknown>) =>
      ctx.siteId ? { ...base, siteId: ctx.siteId } : base;

    if (ctx.userId) {
      const existing = await this.conv.findOne({ where: scopedWhere({ userId: ctx.userId }) });
      if (existing) return existing;
      const u = await this.users.findOne({ where: { id: ctx.userId } });
      const created = this.conv.create({
        userId: ctx.userId,
        siteId: ctx.siteId,
        email: u?.email ?? null,
        subject: 'Conversație',
      });
      return this.conv.save(created);
    }
    if (!ctx.guestId) throw new ForbiddenException('Need guest or user');
    const existing = await this.conv.findOne({ where: scopedWhere({ guestId: ctx.guestId }) });
    if (existing) return existing;
    const g = await this.guests.findOne({ where: { id: ctx.guestId } });
    const created = this.conv.create({
      guestId: ctx.guestId,
      siteId: ctx.siteId,
      email: g?.email ?? null,
      subject: 'Conversație guest',
    });
    return this.conv.save(created);
  }

  async listMyMessages(ctx: OwnerCtx): Promise<{ conversation: Conversation; messages: ChatMessage[] }> {
    const conversation = await this.getOrCreateMine(ctx);
    const messages = await this.msg.find({
      where: { conversationId: conversation.id },
      order: { createdAt: 'ASC' },
    });
    if (conversation.unreadByUser > 0) {
      conversation.unreadByUser = 0;
      await this.conv.save(conversation);
    }
    return { conversation, messages };
  }

  async sendAsUser(ctx: OwnerCtx, body: string): Promise<ChatMessage> {
    const conversation = await this.getOrCreateMine(ctx);
    const msg = this.msg.create({
      conversationId: conversation.id,
      siteId: ctx.siteId ?? null,
      authorRole: 'user',
      authorId: ctx.userId,
      body: body.trim(),
    });
    const saved = await this.msg.save(msg);
    conversation.lastMessageAt = saved.createdAt;
    conversation.unreadByAdmin += 1;
    await this.conv.save(conversation);
    this.gateway.emitMessage({ message: saved, conversation });
    // Auto-translate inbound non-RO → RO (background, nu blocăm răspunsul către user).
    void this.translateMessageAsync(saved.id);
    return saved;
  }

  /** Aplică pipeline-ul multi-agent peste un mesaj de chat și salvează `bodyRo`. */
  private async translateMessageAsync(messageId: string): Promise<void> {
    try {
      const m = await this.msg.findOne({ where: { id: messageId } });
      if (!m) return;
      const r = await this.translation.translateToRo(m.body);
      m.detectedLang = r?.sourceLang ?? 'ro';
      if (r) {
        m.bodyRo = r.final;
        m.translationConsensus = r.consensus;
      }
      await this.msg.save(m);
    } catch {
      // log silent — mesajul e oricum vizibil în original.
    }
  }

  /**
   * Traduce textul scris de admin (în RO) în limba detectată a conversației
   * (deduce din ultimul mesaj inbound non-RO). Folosit pe trimitere admin → user.
   * Întoarce { final, sourceLang } sau null dacă nu e cazul.
   */
  async translateAdminOutbound(conversationId: string, text: string, forceTargetLang?: string): Promise<{ final: string; targetLang: string; consensus: number } | null> {
    let target = (forceTargetLang ?? '').toLowerCase();
    if (!target) {
      const lastInbound = await this.msg.findOne({
        where: { conversationId, authorRole: 'user' },
        order: { createdAt: 'DESC' },
      });
      target = (lastInbound?.detectedLang ?? 'ro').toLowerCase();
    }
    if (!target || target === 'ro') return null;
    const r = await this.translation.translateFromRo(text, target);
    if (!r) return null;
    return { final: r.final, targetLang: target, consensus: r.consensus };
  }

  // ============ ADMIN ============
  /**
   * Întoarce conversațiile augmentate cu `online` + `lastSeenAt`, ordonate astfel:
   *  1. Online + cu mesaje necitite (descrescător după unread)
   *  2. Online + cu mesaje citite (descrescător după lastMessageAt)
   *  3. Online + fără mesaje
   *  4. Offline + cu mesaje necitite
   *  5. Offline + cu mesaje citite
   *  6. La final: orice conversație fără mesaje (offline sau fără presence)
   */
  /**
   * Listare conversații pentru admin. Cross-tenant „all" e prea zgomotos pentru
   * inbox — forțăm un site activ. Adminul comută între site-uri prin selector.
   */
  async listAllConversations(siteId: string | null): Promise<ConversationWithPresence[]> {
    // Listing-ul e cross-tenant când nu ai un site activ — UI-ul afișează badge-ul
    // siteId per conversație ca să distingi vizual. Acțiunile write rămân scoped la conversație
    // (ex: reply ia siteId din entitate, nu din header).
    const all = await this.conv.find({
      where: siteId ? { siteId } : {},
      order: { lastMessageAt: 'DESC', updatedAt: 'DESC' },
      take: 200,
    });

    const userIds = all.map((c) => c.userId).filter((v): v is string => !!v);
    const guestIds = all.map((c) => c.guestId).filter((v): v is string => !!v);
    const [presence, ips] = await Promise.all([
      this.fetchPresence(userIds, guestIds),
      this.fetchLastIp(userIds, guestIds),
    ]);

    const now = Date.now();
    const augmented: ConversationWithPresence[] = all.map((c) => {
      const seenAt =
        (c.userId && presence.users.get(c.userId)) ||
        (c.guestId && presence.guests.get(c.guestId)) ||
        null;
      const lastSeenMs = seenAt ? new Date(seenAt).getTime() : 0;
      // Presence: WS-online (real-time, instant) SAU activitate analytics în ultimele 2 min.
      const wsOnline = this.gateway.isOnline({ userId: c.userId, guestId: c.guestId });
      const analyticsOnline = lastSeenMs > 0 && (now - lastSeenMs) / 1000 < ONLINE_WINDOW_SEC;
      const online = wsOnline || analyticsOnline;
      const ip =
        (c.userId && ips.users.get(c.userId)) ||
        (c.guestId && ips.guests.get(c.guestId)) ||
        null;
      return {
        ...c,
        online,
        lastSeenAt: wsOnline ? new Date().toISOString() : seenAt ? new Date(seenAt).toISOString() : null,
        ip,
      };
    });

    /**
     * Bucket priority:
     * 0 = online + unread, 1 = online + read, 2 = online + no msgs,
     * 3 = offline + unread, 4 = offline + read, 5 = no messages (offline)
     */
    const bucket = (c: ConversationWithPresence) => {
      const hasMsgs = !!c.lastMessageAt;
      const hasUnread = c.unreadByAdmin > 0;
      if (c.online && hasUnread) return 0;
      if (c.online && hasMsgs) return 1;
      if (c.online && !hasMsgs) return 2;
      if (!c.online && hasUnread) return 3;
      if (!c.online && hasMsgs) return 4;
      return 5;
    };

    augmented.sort((a, b) => {
      const ba = bucket(a);
      const bb = bucket(b);
      if (ba !== bb) return ba - bb;
      // În interiorul bucket-ului: unread DESC, apoi lastMessageAt DESC, apoi updatedAt DESC.
      if (a.unreadByAdmin !== b.unreadByAdmin) return b.unreadByAdmin - a.unreadByAdmin;
      const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      if (at !== bt) return bt - at;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    return augmented;
  }

  /** Returnează presence + ultimul IP pentru o singură conversație (folosit în view-ul thread). */
  async conversationPresence(
    c: Conversation,
  ): Promise<{ online: boolean; lastSeenAt: string | null; ip: string | null }> {
    const wsOnline = this.gateway.isOnline({ userId: c.userId, guestId: c.guestId });
    const userIds = c.userId ? [c.userId] : [];
    const guestIds = c.guestId ? [c.guestId] : [];
    const [presence, ips] = await Promise.all([
      this.fetchPresence(userIds, guestIds),
      this.fetchLastIp(userIds, guestIds),
    ]);
    const ip =
      (c.userId && ips.users.get(c.userId)) ||
      (c.guestId && ips.guests.get(c.guestId)) ||
      null;
    if (wsOnline) {
      return { online: true, lastSeenAt: new Date().toISOString(), ip };
    }
    const seenAt =
      (c.userId && presence.users.get(c.userId)) ||
      (c.guestId && presence.guests.get(c.guestId)) ||
      null;
    const lastSeenMs = seenAt ? new Date(seenAt).getTime() : 0;
    const online = lastSeenMs > 0 && (Date.now() - lastSeenMs) / 1000 < ONLINE_WINDOW_SEC;
    return { online, lastSeenAt: seenAt ? new Date(seenAt).toISOString() : null, ip };
  }

  async getConversation(id: string): Promise<Conversation> {
    const c = await this.conv.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Conversation not found');
    return c;
  }

  async listMessages(conversationId: string): Promise<ChatMessage[]> {
    return this.msg.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });
  }

  async markReadByAdmin(conversationId: string): Promise<void> {
    await this.conv.update({ id: conversationId }, { unreadByAdmin: 0 });
  }

  async sendAsAdmin(conversationId: string, adminUserId: string, body: string, opts?: { forceTargetLang?: string; skipTranslation?: boolean }): Promise<ChatMessage & { translation?: { original: string; targetLang: string; consensus: number } | null }> {
    const conv = await this.getConversation(conversationId);
    const trimmed = body.trim();

    // Auto-translate RO → limba clientului (dacă există un mesaj inbound non-RO).
    let finalBody = trimmed;
    let translationMeta: { original: string; targetLang: string; consensus: number } | null = null;
    if (!opts?.skipTranslation) {
      const r = await this.translateAdminOutbound(conversationId, trimmed, opts?.forceTargetLang);
      if (r) {
        translationMeta = { original: trimmed, targetLang: r.targetLang, consensus: r.consensus };
        finalBody = r.final;
      }
    }

    const msg = this.msg.create({
      conversationId: conv.id,
      siteId: conv.siteId ?? null,
      authorRole: 'admin',
      authorId: adminUserId,
      body: finalBody,
      // Stocăm originalul RO ca „bodyRo" inversat: pentru mesajele admin, bodyRo = ce a scris adminul în română.
      bodyRo: translationMeta ? translationMeta.original : null,
      detectedLang: translationMeta?.targetLang ?? 'ro',
      translationConsensus: translationMeta?.consensus ?? null,
    });
    const saved = await this.msg.save(msg);
    conv.lastMessageAt = saved.createdAt;
    conv.unreadByUser += 1;
    conv.unreadByAdmin = 0;
    await this.conv.save(conv);
    this.gateway.emitMessage({ message: saved, conversation: conv });
    return Object.assign(saved, { translation: translationMeta });
  }
}
