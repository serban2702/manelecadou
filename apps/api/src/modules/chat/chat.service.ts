import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  forwardRef,
  Inject,
  OnModuleInit,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Conversation, AiChatMode } from './conversation.entity';
import { ChatMessage, ChatMessageType, ChatMessagePayload } from './message.entity';
import { GuestSession } from '../guest-sessions/guest-session.entity';
import { User } from '../users/user.entity';
import { AnalyticsSession } from '../analytics/analytics-session.entity';
import { ChatGateway } from './chat.gateway';
import { TranslationService } from '../../openai/translation.service';
import { WebPushService } from '../web-push/web-push.service';
import { ChatAttachmentsService } from './chat-attachments.service';
import { PaymentsService } from '../payments/payments.service';
import { SitesService } from '../sites/sites.service';
import { SettingsService } from '../settings/settings.service';

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
export class ChatService implements OnModuleInit {
  constructor(
    @InjectRepository(Conversation) private readonly conv: Repository<Conversation>,
    @InjectRepository(ChatMessage) private readonly msg: Repository<ChatMessage>,
    @InjectRepository(GuestSession) private readonly guests: Repository<GuestSession>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(AnalyticsSession) private readonly analyticsSessions: Repository<AnalyticsSession>,
    @Inject(forwardRef(() => ChatGateway))
    private readonly gateway: ChatGateway,
    private readonly translation: TranslationService,
    private readonly webPush: WebPushService,
    private readonly attachments: ChatAttachmentsService,
    private readonly payments: PaymentsService,
    private readonly sites: SitesService,
    private readonly chatSettings: SettingsService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /** Citeste AI_CHAT_MODE_DEFAULT (manual|suggest|auto) pentru conversații noi. */
  private async getDefaultAiMode(): Promise<'manual' | 'suggest' | 'auto'> {
    const raw = (await this.chatSettings.get('AI_CHAT_MODE_DEFAULT')).trim().toLowerCase();
    if (raw === 'suggest' || raw === 'auto' || raw === 'manual') return raw;
    return 'manual';
  }

  /** Wire ACK handler la gateway după ce ambele sunt construite. */
  onModuleInit() {
    this.gateway.registerAckHandler(async (messageIds, status, actor) => {
      await this.handleAckFromSocket(messageIds, status, actor);
    });
  }

  /** Apelat din gateway când userul/adminul confirmă receipt/citire mesaje. */
  private async handleAckFromSocket(
    messageIds: string[],
    status: 'delivered' | 'read',
    actor: { userId: string | null; guestId: string | null; isAdmin: boolean },
  ): Promise<void> {
    if (messageIds.length === 0) return;
    // Receiver-ul ACK confirmă doar mesaje pe care NU le-a scris el.
    // Adminul confirmă mesajele de la user. Userul/guest confirmă mesajele admin.
    const expectedAuthorRole: 'user' | 'admin' = actor.isAdmin ? 'user' : 'admin';
    const messages = await this.msg.find({
      where: { id: In(messageIds), authorRole: expectedAuthorRole },
    });
    if (messages.length === 0) return;

    // Pentru security: dacă actor e user/guest, verificăm că mesajele aparțin conversațiilor lor.
    if (!actor.isAdmin) {
      const convIds = Array.from(new Set(messages.map((m) => m.conversationId)));
      const ownConvs = await this.conv.find({
        where: actor.userId
          ? { id: In(convIds), userId: actor.userId }
          : { id: In(convIds), guestId: actor.guestId! },
      });
      const ownedIds = new Set(ownConvs.map((c) => c.id));
      const filtered = messages.filter((m) => ownedIds.has(m.conversationId));
      if (filtered.length === 0) return;
      messages.length = 0;
      messages.push(...filtered);
    }

    const now = new Date();
    const byConv = new Map<string, ChatMessage[]>();
    for (const m of messages) {
      if (status === 'delivered' && !m.deliveredAt) m.deliveredAt = now;
      if (status === 'read') {
        if (!m.deliveredAt) m.deliveredAt = now;
        if (!m.readAt) m.readAt = now;
      }
      const arr = byConv.get(m.conversationId) ?? [];
      arr.push(m);
      byConv.set(m.conversationId, arr);
    }
    await this.msg.save(messages);

    // Broadcast ACK pentru fiecare conversație
    for (const [convId, msgs] of byConv) {
      const c = await this.conv.findOne({ where: { id: convId } });
      if (!c) continue;
      this.gateway.emitMessageAck({
        conversation: c,
        messageIds: msgs.map((m) => m.id),
        status,
        by: actor.isAdmin ? 'admin' : 'user',
      });
    }
  }

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
      const defaultMode = await this.getDefaultAiMode();
      const created = this.conv.create({
        userId: ctx.userId,
        siteId: ctx.siteId,
        email: u?.email ?? null,
        subject: 'Conversație',
        aiMode: defaultMode,
      });
      return this.conv.save(created);
    }
    if (!ctx.guestId) throw new ForbiddenException('Need guest or user');
    const existing = await this.conv.findOne({ where: scopedWhere({ guestId: ctx.guestId }) });
    if (existing) return existing;
    const g = await this.guests.findOne({ where: { id: ctx.guestId } });
    const defaultMode = await this.getDefaultAiMode();
    const created = this.conv.create({
      guestId: ctx.guestId,
      siteId: ctx.siteId,
      email: g?.email ?? null,
      subject: 'Conversație guest',
      aiMode: defaultMode,
    });
    return this.conv.save(created);
  }

  async listMyMessages(ctx: OwnerCtx): Promise<{ conversation: Conversation; messages: ChatMessage[] }> {
    const conversation = await this.getOrCreateMine(ctx);
    // Marchează ca delivered toate mesajele admin → user (client le-a primit).
    // Read se setează separat când userul deschide widgetul (via WS chat_toggle + message:ack).
    await this.markAllAdminMessagesDelivered(conversation.id);
    const all = await this.msg.find({
      where: { conversationId: conversation.id },
      order: { createdAt: 'ASC' },
    });
    // Clientul NU vede mesaje internal: AI suggestions, system messages.
    const messages = all.filter(
      (m) => m.messageType !== 'ai_suggestion' && m.messageType !== 'system' && m.authorRole !== 'system',
    );
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
    // AI agent dacă conversația e în mod suggest/auto (non-blocking).
    void this.maybeTriggerAi(conversation.id, saved.id);
    // Web Push notification către toți adminii subscribed (best-effort, non-blocking).
    const senderLabel = conversation.email
      ?? (ctx.userId ? `user:${ctx.userId.slice(0, 8)}` : `guest:${ctx.guestId?.slice(0, 8) ?? '?'}`);
    const preview = body.trim().slice(0, 140);
    void this.webPush.sendToAll({
      title: `💬 ${senderLabel}`,
      body: preview + (body.length > 140 ? '…' : ''),
      tag: `chat-${conversation.id}`, // mesajele din aceeași conversație se înlocuiesc
      url: `/chat?c=${conversation.id}`,
      icon: '/icon-512.png',
      badge: '/icon-512.png',
      data: { conversationId: conversation.id, messageId: saved.id },
    }).catch(() => {
      /* silent — push e best-effort */
    });
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
   *  1. Online (user activ pe site) + cu mesaje
   *  2. Online fără mesaje
   *  3. Offline + cu mesaje
   *  4. Offline fără mesaje
   */
  /**
   * Listare conversații pentru admin. Cross-tenant „all" e prea zgomotos pentru
   * inbox — forțăm un site activ. Adminul comută între site-uri prin selector.
   */
  async listAllConversations(
    siteId: string | null,
    opts: { q?: string } = {},
  ): Promise<ConversationWithPresence[]> {
    const q = opts.q?.trim();
    // Listing-ul e cross-tenant când nu ai un site activ — UI-ul afișează badge-ul
    // siteId per conversație ca să distingi vizual. Acțiunile write rămân scoped la conversație
    // (ex: reply ia siteId din entitate, nu din header).
    // BUG-FIX (2026-05-25): Postgres sortează NULL FIRST în DESC, deci `lastMessageAt DESC`
    // întorcea PRIMELE 200 conversații cu `lastMessageAt = NULL` (guests goi care nu au scris
    // niciodată), iar cele cu mesaje reale (inclusiv cea în care tocmai răspunsesem) erau
    // împinse după index 200 și dispăreau din UI. Fix: NULLS LAST + includem și conversațiile
    // online (chiar fără mesaje) prin OR pe ID-urile din presence snapshot, ca să nu cadă
    // bucket 1 (online fără mesaje) când avem 200+ goi.
    const qb = this.conv.createQueryBuilder('c');
    if (siteId) qb.where('c.siteId = :siteId', { siteId });

    if (q) {
      // SEARCH MODE: scanăm TOATE conversațiile (inclusiv offline+fără mesaje filtrate
      // în mod normal). Match pe: email, prefix ID (user/guest), IP — analytics_sessions
      // pentru IP-uri persistate + WS handshake pentru IP-uri vii care n-au ajuns încă în DB.
      const like = `%${q}%`;
      const ipMatchedIds = await this.findIdsByIpSearch(q);
      const wsMatched = this.gateway.findIdsByIp(q);
      const matchedUserIds = Array.from(new Set([...ipMatchedIds.userIds, ...wsMatched.userIds]));
      const matchedGuestIds = Array.from(new Set([...ipMatchedIds.guestIds, ...wsMatched.guestIds]));

      const clauses: string[] = [
        'c.email ILIKE :like',
        'c."userId"::text ILIKE :like',
        'c."guestId"::text ILIKE :like',
      ];
      const params: Record<string, unknown> = { like };
      if (matchedUserIds.length > 0) {
        clauses.push('c."userId" IN (:...ipUserIds)');
        params.ipUserIds = matchedUserIds;
      }
      if (matchedGuestIds.length > 0) {
        clauses.push('c."guestId" IN (:...ipGuestIds)');
        params.ipGuestIds = matchedGuestIds;
      }
      qb.andWhere(`(${clauses.join(' OR ')})`, params);
      // Search nu limităm la 200 doar la 100 ca să nu împlinim DOM-ul.
      qb.orderBy('c."lastMessageAt"', 'DESC', 'NULLS LAST')
        .addOrderBy('c."updatedAt"', 'DESC')
        .take(100);
    } else {
      // DEFAULT: filtrăm la conversațiile relevante — cu mesaje SAU online acum.
      const onlineIds = this.gateway.snapshot();
      const relevanceClauses: string[] = ['c."lastMessageAt" IS NOT NULL'];
      const relevanceParams: Record<string, unknown> = {};
      if (onlineIds.users.length > 0) {
        relevanceClauses.push('c."userId" IN (:...onlineUsers)');
        relevanceParams.onlineUsers = onlineIds.users;
      }
      if (onlineIds.guests.length > 0) {
        relevanceClauses.push('c."guestId" IN (:...onlineGuests)');
        relevanceParams.onlineGuests = onlineIds.guests;
      }
      qb.andWhere(`(${relevanceClauses.join(' OR ')})`, relevanceParams);
      qb.orderBy('c."lastMessageAt"', 'DESC', 'NULLS LAST')
        .addOrderBy('c."updatedAt"', 'DESC')
        .take(200);
    }
    const all = await qb.getMany();

    const userIds = all.map((c) => c.userId).filter((v): v is string => !!v);
    const guestIds = all.map((c) => c.guestId).filter((v): v is string => !!v);
    const convIds = all.map((c) => c.id);
    const [presence, ips, lastAuthors] = await Promise.all([
      this.fetchPresence(userIds, guestIds),
      this.fetchLastIp(userIds, guestIds),
      this.fetchLastMessageAuthors(convIds),
    ]);

    const now = Date.now();
    const augmented: Array<ConversationWithPresence & { lastMessageRole: 'user' | 'admin' | null }> =
      all.map((c) => {
        const seenAt =
          (c.userId && presence.users.get(c.userId)) ||
          (c.guestId && presence.guests.get(c.guestId)) ||
          null;
        const lastSeenMs = seenAt ? new Date(seenAt).getTime() : 0;
        // Presence: WS-online (real-time, instant) SAU activitate analytics în ultimele 2 min.
        const wsOnline = this.gateway.isOnline({ userId: c.userId, guestId: c.guestId });
        const analyticsOnline = lastSeenMs > 0 && (now - lastSeenMs) / 1000 < ONLINE_WINDOW_SEC;
        const online = wsOnline || analyticsOnline;
        // IP: analytics_sessions (precis, persistent) → fallback WS handshake (capturat
        // chiar dacă guest nu a tras încă /track) → null.
        const ip =
          (c.userId && ips.users.get(c.userId)) ||
          (c.guestId && ips.guests.get(c.guestId)) ||
          this.gateway.getKnownIp({ userId: c.userId, guestId: c.guestId }) ||
          null;
        return {
          ...c,
          online,
          lastSeenAt: wsOnline ? new Date().toISOString() : seenAt ? new Date(seenAt).toISOString() : null,
          ip,
          lastMessageRole: lastAuthors.get(c.id) ?? null,
        };
      });

    /**
     * Bucket priority (cerere user — 2026-05-25):
     * 0 = online + ultimul mesaj de la EI (user)
     * 1 = online + ultimul mesaj de la NOI (admin)
     * 2 = online + fără mesaje
     * 3 = offline + ultimul mesaj de la EI (user)
     * 4 = offline + ultimul mesaj de la NOI (admin)
     * (offline fără mesaje sunt deja excluse din query prin filtrul de relevanță)
     */
    const bucket = (c: (typeof augmented)[number]) => {
      const role = c.lastMessageRole;
      if (c.online) {
        if (role === 'user') return 0;
        if (role === 'admin') return 1;
        return 2;
      }
      if (role === 'user') return 3;
      if (role === 'admin') return 4;
      // Offline fără mesaje — în mod normal filtrate, dar fallback la coadă dacă apar.
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

  /** Caută în analytics_sessions toate user/guest IDs care au cel puțin o sesiune
   *  cu IP-ul potrivit pe substring. Folosit la search-ul după IP din admin chat
   *  (acoperă inclusiv conversații care nu mai sunt active sau n-au scris mesaje). */
  private async findIdsByIpSearch(
    needle: string,
  ): Promise<{ userIds: string[]; guestIds: string[] }> {
    const like = `%${needle}%`;
    const [userRows, guestRows] = await Promise.all([
      this.analyticsSessions
        .createQueryBuilder('s')
        .select('DISTINCT s."userId"', 'userId')
        .where('s.ip ILIKE :like', { like })
        .andWhere('s."userId" IS NOT NULL')
        .limit(500)
        .getRawMany<{ userId: string }>(),
      this.analyticsSessions
        .createQueryBuilder('s')
        .select('DISTINCT s."guestId"', 'guestId')
        .where('s.ip ILIKE :like', { like })
        .andWhere('s."guestId" IS NOT NULL')
        .limit(500)
        .getRawMany<{ guestId: string }>(),
    ]);
    return {
      userIds: userRows.map((r) => r.userId),
      guestIds: guestRows.map((r) => r.guestId),
    };
  }

  /** DISTINCT ON pe chat_messages — întoarce rolul ultimului mesaj per conversație.
   *  Folosit la sortarea inbox-ului admin (cele cu ultimul mesaj de la user au prioritate
   *  peste cele unde noi am răspuns ultimii). */
  private async fetchLastMessageAuthors(
    convIds: string[],
  ): Promise<Map<string, 'user' | 'admin'>> {
    const out = new Map<string, 'user' | 'admin'>();
    if (convIds.length === 0) return out;
    const rows = await this.msg
      .createQueryBuilder('m')
      .select('m.conversationId', 'cid')
      .addSelect('m.authorRole', 'role')
      .where('m.conversationId IN (:...ids)', { ids: convIds })
      .distinctOn(['m.conversationId'])
      .orderBy('m.conversationId')
      .addOrderBy('m.createdAt', 'DESC')
      .getRawMany<{ cid: string; role: 'user' | 'admin' }>();
    for (const r of rows) out.set(r.cid, r.role);
    return out;
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

  /** Enriched presence (currentPath, device, chatOpen, connectedAt) pentru sidebar admin. */
  getEnrichedPresenceForConversation(c: Conversation) {
    return this.gateway.getEnriched({ userId: c.userId, guestId: c.guestId });
  }

  async getConversation(id: string): Promise<Conversation> {
    const c = await this.conv.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Conversation not found');
    return c;
  }

  async listMessages(conversationId: string): Promise<ChatMessage[]> {
    const all = await this.msg.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });
    // Filtrăm sugestiile AI aprobate/respinse — nu mai au valoare în thread (după approve
    // există deja un admin message real cu aiSuggestionFor link). Audit-ul rămâne în DB.
    return all.filter((m) => !(m.messageType === 'ai_suggestion' && m.aiApprovedBy));
  }

  async markReadByAdmin(conversationId: string): Promise<void> {
    await this.conv.update({ id: conversationId }, { unreadByAdmin: 0 });
    // Marchează ca read toate mesajele user → admin (adminul are thread-ul deschis).
    await this.markAllUserMessagesRead(conversationId);
  }

  async sendAsAdmin(
    conversationId: string,
    adminUserId: string,
    body: string,
    opts?: {
      forceTargetLang?: string;
      skipTranslation?: boolean;
      messageType?: ChatMessageType;
      payload?: ChatMessagePayload | null;
      attachment?: { url: string; mime: string; size: number; name: string } | null;
      aiGenerated?: boolean;
      aiApprovedBy?: string | null;
      aiSuggestionFor?: string | null;
    },
  ): Promise<ChatMessage & { translation?: { original: string; targetLang: string; consensus: number } | null }> {
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
      messageType: opts?.messageType ?? 'text',
      payload: opts?.payload ?? null,
      attachmentUrl: opts?.attachment?.url ?? null,
      attachmentMime: opts?.attachment?.mime ?? null,
      attachmentSize: opts?.attachment?.size ?? null,
      attachmentName: opts?.attachment?.name ?? null,
      aiGenerated: !!opts?.aiGenerated,
      aiApprovedBy: opts?.aiApprovedBy ?? null,
      aiSuggestionFor: opts?.aiSuggestionFor ?? null,
    });
    const saved = await this.msg.save(msg);
    conv.lastMessageAt = saved.createdAt;
    conv.unreadByUser += 1;
    conv.unreadByAdmin = 0;
    await this.conv.save(conv);
    this.gateway.emitMessage({ message: saved, conversation: conv });
    return Object.assign(saved, { translation: translationMeta });
  }

  /**
   * Trigger AIChatAgentService dacă conversația e în mod suggest/auto.
   * Folosim ModuleRef cu lazy resolve ca să evităm dependency circulară între
   * ChatModule și AiChatModule.
   */
  private async maybeTriggerAi(conversationId: string, userMessageId: string): Promise<void> {
    try {
      // strict: false → permite resolve cross-module fără a marca dependency
      const agent = this.moduleRef.get(
        await import('../ai-chat/ai-chat-agent.service').then((m) => m.AIChatAgentService),
        { strict: false },
      );
      await agent.maybeRun(conversationId, userMessageId);
    } catch (e) {
      // Silent — AI e opțional, nu blocăm chat-ul dacă agentul eșuează
    }
  }

  // ============== Faza 4: Approve AI suggestion ==============

  /** Convertește un mesaj `ai_suggestion` într-un mesaj admin real trimis către user. */
  async approveAiSuggestion(suggestionMessageId: string, adminUserId: string, editedText?: string): Promise<ChatMessage> {
    const suggestion = await this.msg.findOne({ where: { id: suggestionMessageId } });
    if (!suggestion) throw new NotFoundException('Sugestia nu există');
    if (suggestion.messageType !== 'ai_suggestion') {
      throw new ForbiddenException('Mesajul nu e o sugestie AI');
    }
    const conv = await this.getConversation(suggestion.conversationId);
    const text = (editedText ?? suggestion.body).trim();
    if (!text) throw new ForbiddenException('Text gol');

    // Marchează sugestia ca aprobată
    suggestion.aiApprovedBy = adminUserId;
    await this.msg.save(suggestion);

    // Creează mesaj admin real (cu sourceTag că vine de la AI, dacă text-ul nu a fost editat)
    return this.sendAsAdmin(conv.id, adminUserId, text, {
      aiGenerated: editedText ? false : true,
      aiApprovedBy: adminUserId,
      aiSuggestionFor: suggestion.aiSuggestionFor,
    });
  }

  /** Respinge o sugestie AI (o șterge silent). */
  async rejectAiSuggestion(suggestionMessageId: string): Promise<{ ok: true }> {
    await this.msg.delete({ id: suggestionMessageId, messageType: 'ai_suggestion' });
    return { ok: true };
  }

  /**
   * Apelat de GenerationsProcessor după ce o generare se termină cu succes.
   * Caută conversația care a inițiat comanda prin wizard (wizardState.generationId match)
   * și trimite un mesaj în chat cu link către melodie. Actualizează și wizardState.step.
   */
  async notifyGenerationCompleted(generationId: string, status: 'succeeded' | 'failed'): Promise<void> {
    // Query Postgres direct prin TypeORM raw (jsonb path operator nu e tipat în TypeORM)
    const conv = await this.conv
      .createQueryBuilder('c')
      .where(`c."wizardState"->>'generationId' = :gid`, { gid: generationId })
      .getOne();
    if (!conv) return;

    // Update wizard state
    const state = conv.wizardState;
    if (state) {
      state.step = status === 'succeeded' ? 'completed' : 'idle';
      state.updatedAt = new Date().toISOString();
      conv.wizardState = state;
    }
    conv.lastMessageAt = new Date();

    // Construiește mesajul
    const isOk = status === 'succeeded';
    const body = isOk
      ? `🎵 Melodia ta e gata! O poți asculta și descărca aici: ${this.buildGenerationUrl(conv, generationId)}`
      : `⚠️ A apărut o eroare la generarea melodiei. Operatorul nostru se ocupă imediat — te ținem la curent.`;

    const msg = this.msg.create({
      conversationId: conv.id,
      siteId: conv.siteId ?? null,
      authorRole: 'admin',
      authorId: null,
      body,
      messageType: isOk ? 'song_preview' : 'text',
      payload: isOk ? { generationId, audioUrl: this.buildGenerationUrl(conv, generationId) } : null,
      aiGenerated: true,
      detectedLang: 'ro',
    });
    const saved = await this.msg.save(msg);
    conv.unreadByUser += 1;
    // Setează aiMode înapoi la 'manual' dacă a fost generare nereușită — vrem ca admin uman să intervină
    if (!isOk && conv.aiMode === 'auto') conv.aiMode = 'manual';
    await this.conv.save(conv);
    this.gateway.emitMessage({ message: saved, conversation: conv });

    // Push notification către admins (best-effort)
    void this.webPush.sendToAll({
      title: isOk ? `🎵 Comandă finalizată — ${conv.email ?? 'guest'}` : `⚠️ Generare eșuată — ${conv.email ?? 'guest'}`,
      body: isOk ? 'Melodia s-a generat cu succes.' : 'Verifică conversația și ia legătura cu clientul.',
      tag: `chat-${conv.id}`,
      url: `/chat?c=${conv.id}`,
      icon: '/icon-512.png',
      badge: '/icon-512.png',
      data: { conversationId: conv.id, generationId },
    }).catch(() => {});
  }

  private buildGenerationUrl(conv: { siteId: string | null }, generationId: string): string {
    // Folosim URL relativ care va fi rezolvat de site curent — link ajunge la /m/:id
    // pe domeniul site-ului care a originat conversația (din siteId → site.domain)
    // Pentru moment, link relativ funcționează când userul e pe site.
    return `/m/${generationId}`;
  }

  // ============== Faza 3: Attachments + Rich messages ==============

  /** Admin trimite un atașament (imagine / pdf) cu caption opțional. */
  async sendAttachmentAsAdmin(
    conversationId: string,
    adminUserId: string,
    file: { buffer: Buffer; originalName: string; mime: string },
    caption?: string,
  ): Promise<ChatMessage> {
    const conv = await this.getConversation(conversationId);
    const saved = await this.attachments.save({
      conversationId: conv.id,
      fileBuffer: file.buffer,
      originalName: file.originalName,
      mime: file.mime,
    });

    const isImage = saved.mime.startsWith('image/');
    const msg = this.msg.create({
      conversationId: conv.id,
      siteId: conv.siteId ?? null,
      authorRole: 'admin',
      authorId: adminUserId,
      body: caption?.trim() || (isImage ? '📷 Imagine' : `📎 ${saved.originalName}`),
      messageType: isImage ? 'image' : 'file',
      attachmentUrl: saved.url,
      attachmentMime: saved.mime,
      attachmentSize: saved.size,
      attachmentName: saved.originalName,
      bodyRo: caption?.trim() || null,
      detectedLang: 'ro',
    });
    const persisted = await this.msg.save(msg);
    conv.lastMessageAt = persisted.createdAt;
    conv.unreadByUser += 1;
    conv.unreadByAdmin = 0;
    await this.conv.save(conv);
    this.gateway.emitMessage({ message: persisted, conversation: conv });
    return persisted;
  }

  /** Admin trimite un link de plată — generează Stripe Checkout pentru ownerul conversației. */
  async sendPaymentLinkAsAdmin(
    conversationId: string,
    adminUserId: string,
    opts: {
      amount?: number; // cents — default site.basePriceCents
      currency?: string; // default site.currency
      description?: string;
      premium?: boolean;
    },
  ): Promise<ChatMessage> {
    const conv = await this.getConversation(conversationId);
    if (!conv.siteId) {
      throw new ForbiddenException('Conversația nu are siteId — nu pot determina prețul/Stripe context.');
    }
    const site = await this.sites.findById(conv.siteId);
    if (!site) throw new NotFoundException('Site nu există');

    const description = opts.description?.trim() || `Manea personalizată${opts.premium ? ' (premium)' : ''}`;
    const customAmount = typeof opts.amount === 'number' && opts.amount > 0 ? Math.round(opts.amount) : undefined;
    const customCurrency = opts.currency?.toUpperCase();

    // Creează Checkout Session prin PaymentsService — propagă override-urile din
    // modal (admin poate alege liber suma/valuta/descrierea, NU se folosește site pricing).
    const checkout = await this.payments.createCheckoutSession({
      userId: conv.userId,
      guestId: conv.guestId,
      premium: !!opts.premium,
      email: conv.email ?? undefined,
      site,
      overrideAmount: customAmount,
      overrideCurrency: customCurrency,
      overrideProductName: description,
    });

    // Computăm amount/currency efective pentru payload-ul mesajului (ce vede userul în card)
    const amount = customAmount ?? site.basePriceCents + (opts.premium ? site.premiumExtraCents : 0);
    const currency = customCurrency ?? site.currency.toUpperCase();

    const msg = this.msg.create({
      conversationId: conv.id,
      siteId: conv.siteId,
      authorRole: 'admin',
      authorId: adminUserId,
      body: `💳 Link de plată: ${description} — ${(amount / 100).toFixed(2)} ${currency}`,
      messageType: 'payment_link',
      payload: {
        amount,
        currency,
        description,
        checkoutUrl: checkout.url,
        paymentId: checkout.paymentId,
        premium: !!opts.premium,
      },
      bodyRo: null,
      detectedLang: 'ro',
    });
    const persisted = await this.msg.save(msg);
    conv.lastMessageAt = persisted.createdAt;
    conv.unreadByUser += 1;
    conv.unreadByAdmin = 0;
    await this.conv.save(conv);
    this.gateway.emitMessage({ message: persisted, conversation: conv });

    // Push notification pentru client (dacă are notificări — viitoare faza)
    return persisted;
  }

  // ============== Faza 1: AI mode + force-open + delivery batch-mark ==============

  /** Setează modul AI pentru o conversație (manual / suggest / auto). */
  async setAiMode(conversationId: string, mode: AiChatMode): Promise<Conversation> {
    if (!['manual', 'suggest', 'auto'].includes(mode)) {
      throw new ForbiddenException('Invalid AI mode');
    }
    const c = await this.getConversation(conversationId);
    c.aiMode = mode;
    return this.conv.save(c);
  }

  /** Forțează deschiderea chat-ului pe partea de client (admin sau AI). */
  async forceOpenChat(conversationId: string): Promise<{ ok: true; online: boolean }> {
    const c = await this.getConversation(conversationId);
    const online = this.gateway.isOnline({ userId: c.userId, guestId: c.guestId });
    this.gateway.forceOpenChat({ userId: c.userId, guestId: c.guestId });
    return { ok: true, online };
  }

  /** Marchează toate mesajele admin → user dintr-o conversație ca delivered (folosit la listMyMessages). */
  async markAllAdminMessagesDelivered(conversationId: string): Promise<void> {
    const now = new Date();
    const undelivered = await this.msg.find({
      where: { conversationId, authorRole: 'admin', deliveredAt: IsNull() },
      select: ['id'],
    });
    if (undelivered.length === 0) return;
    await this.msg
      .createQueryBuilder()
      .update(ChatMessage)
      .set({ deliveredAt: now })
      .where('id IN (:...ids)', { ids: undelivered.map((m) => m.id) })
      .execute();
    const c = await this.conv.findOne({ where: { id: conversationId } });
    if (c) {
      this.gateway.emitMessageAck({
        conversation: c,
        messageIds: undelivered.map((m) => m.id),
        status: 'delivered',
        by: 'user',
      });
    }
  }

  /** Marchează ca read toate mesajele admin → user (folosit când userul deschide chat-ul). */
  async markAllAdminMessagesRead(conversationId: string): Promise<void> {
    const now = new Date();
    const unread = await this.msg.find({
      where: { conversationId, authorRole: 'admin', readAt: IsNull() },
      select: ['id', 'deliveredAt'],
    });
    if (unread.length === 0) return;
    await this.msg
      .createQueryBuilder()
      .update(ChatMessage)
      .set({ readAt: now })
      .where('id IN (:...ids)', { ids: unread.map((m) => m.id) })
      .execute();
    // Și setăm deliveredAt unde lipsește
    const needDelivered = unread.filter((m) => !m.deliveredAt).map((m) => m.id);
    if (needDelivered.length > 0) {
      await this.msg
        .createQueryBuilder()
        .update(ChatMessage)
        .set({ deliveredAt: now })
        .where('id IN (:...ids)', { ids: needDelivered })
        .execute();
    }
    const c = await this.conv.findOne({ where: { id: conversationId } });
    if (c) {
      this.gateway.emitMessageAck({
        conversation: c,
        messageIds: unread.map((m) => m.id),
        status: 'read',
        by: 'user',
      });
    }
  }

  /** Folosit din admin: marchează ca read mesajele user → admin (când adminul deschide thread-ul). */
  async markAllUserMessagesRead(conversationId: string): Promise<void> {
    const now = new Date();
    const unread = await this.msg.find({
      where: { conversationId, authorRole: 'user', readAt: IsNull() },
      select: ['id', 'deliveredAt'],
    });
    if (unread.length === 0) return;
    const ids = unread.map((m) => m.id);
    await this.msg
      .createQueryBuilder()
      .update(ChatMessage)
      .set({ readAt: now })
      .where('id IN (:...ids)', { ids })
      .execute();
    const needDel = unread.filter((m) => !m.deliveredAt).map((m) => m.id);
    if (needDel.length > 0) {
      await this.msg
        .createQueryBuilder()
        .update(ChatMessage)
        .set({ deliveredAt: now })
        .where('id IN (:...ids)', { ids: needDel })
        .execute();
    }
    const c = await this.conv.findOne({ where: { id: conversationId } });
    if (c) {
      this.gateway.emitMessageAck({
        conversation: c,
        messageIds: ids,
        status: 'read',
        by: 'admin',
      });
    }
  }
}
