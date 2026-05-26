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
import { QuickReply } from './quick-reply.entity';
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
import { LyricsService } from '../lyrics/lyrics.module';

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
    @InjectRepository(QuickReply) private readonly quickReplies: Repository<QuickReply>,
    @Inject(forwardRef(() => ChatGateway))
    private readonly gateway: ChatGateway,
    private readonly translation: TranslationService,
    private readonly webPush: WebPushService,
    private readonly attachments: ChatAttachmentsService,
    private readonly payments: PaymentsService,
    private readonly sites: SitesService,
    private readonly chatSettings: SettingsService,
    private readonly lyrics: LyricsService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * Generează un preview de versuri pentru o manea folosind exact aceleași
   * prompt-uri ca wizard-ul user (writer + critic). Admin folosește butonul
   * '✨ Versuri' din chat input pentru a previzualiza înainte de a lansa generare.
   */
  async previewLyrics(args: {
    siteId: string | null;
    style: string;
    occasion: string;
    recipientName: string;
    message: string;
    voiceArtist: string;
    dedication?: string;
    tipAmount?: number;
    refine?: boolean;
  }): Promise<{ draft: string; refined?: string; locale: string }> {
    const site = args.siteId ? await this.sites.findById(args.siteId) : null;
    const draft = await this.lyrics.writeDraft({
      style: args.style,
      occasion: args.occasion,
      recipientName: args.recipientName,
      message: args.message,
      voiceArtist: args.voiceArtist,
      dedication: args.dedication,
      tipAmount: args.tipAmount,
      currency: site?.currency ?? 'RON',
      locale: site?.locale ?? 'ro',
      siteId: args.siteId ?? undefined,
      writerSystemPrompt: site?.suno?.writerSystemPrompt,
      writerUserTemplate: site?.suno?.writerUserTemplate,
    });
    const result: { draft: string; refined?: string; locale: string } = {
      draft,
      locale: site?.locale ?? 'ro',
    };
    if (args.refine) {
      result.refined = await this.lyrics.refineDraft(
        {
          style: args.style,
          occasion: args.occasion,
          recipientName: args.recipientName,
          message: args.message,
          voiceArtist: args.voiceArtist,
          dedication: args.dedication,
          tipAmount: args.tipAmount,
          currency: site?.currency ?? 'RON',
          locale: site?.locale ?? 'ro',
          siteId: args.siteId ?? undefined,
          criticSystemPrompt: site?.suno?.criticSystemPrompt,
          criticUserTemplate: site?.suno?.criticUserTemplate,
        },
        draft,
      );
    }
    return result;
  }

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

      // Când userul confirmă că a CITIT mesaje admin → resetăm unreadByUser
      // (badge-ul dispare). Pentru ACK delivered nu facem nimic — userul doar a
      // primit, n-a deschis încă.
      if (!actor.isAdmin && status === 'read' && c.unreadByUser > 0) {
        c.unreadByUser = 0;
        await this.conv.save(c);
      }
      // Simetric: când adminul confirmă citirea (deschide thread-ul) → reset unreadByAdmin.
      if (actor.isAdmin && status === 'read' && c.unreadByAdmin > 0) {
        c.unreadByAdmin = 0;
        await this.conv.save(c);
      }

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
    // Read + reset unreadByUser se setează separat când userul deschide widgetul
    // (via WS chat_toggle + message:ack — vezi handleAckFromSocket).
    await this.markAllAdminMessagesDelivered(conversation.id);
    const all = await this.msg.find({
      where: { conversationId: conversation.id },
      order: { createdAt: 'ASC' },
    });
    // Clientul NU vede mesaje internal: AI suggestions, system messages.
    const messages = all.filter(
      (m) => m.messageType !== 'ai_suggestion' && m.messageType !== 'system' && m.authorRole !== 'system',
    );
    // BUG-FIX 2026-05-26: NU mai resetăm unreadByUser aici. Polling-ul (la 30-60s)
    // și refetch-ul după WS chat:message apelau listMyMessages care reseta
    // contorul ÎNAINTE ca UI-ul să-l fi consumat → badge-ul rămânea mereu 0.
    // Reset-ul are loc acum doar prin ACK explicit (user a deschis chatul).
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
    // Dacă adminul arhivase conversația dar userul revine cu un mesaj nou,
    // o readucem activă în sidebar (altfel ar rămâne ascunsă și admin n-ar
    // vedea că userul a revenit).
    if (conversation.archivedAt) {
      conversation.archivedAt = null;
    }
    await this.conv.save(conversation);
    this.gateway.emitMessage({ message: saved, conversation });
    // Auto-translate DEZACTIVAT (2026-05-26) — detecția de limbă pe mesaje
    // scurte ("Ok", "Da") era nesigură și ducea la admin-outbound traducere
    // RO → EN nedorită. Mesajele se afișează în original.
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
    opts: { q?: string; archived?: boolean } = {},
  ): Promise<ConversationWithPresence[]> {
    const q = opts.q?.trim();
    const includeArchived = opts.archived === true;
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
    // Default: exclude arhivate. Cu ?archived=true returnăm DOAR arhivate.
    if (includeArchived) {
      qb.andWhere('c."archivedAt" IS NOT NULL');
    } else {
      qb.andWhere('c."archivedAt" IS NULL');
    }

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

    // Auto-translate DEZACTIVAT (2026-05-26) — admin trimite verbatim.
    const finalBody = trimmed;
    const translationMeta: { original: string; targetLang: string; consensus: number } | null = null as { original: string; targetLang: string; consensus: number } | null;

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
   * Apelat de PaymentsService.handleWebhook după ce o plată e confirmată.
   * Găsește toate mesajele payment_link cu acel paymentId, le marchează ca paid în
   * payload (pentru render-ul UI), emite WS update, și adaugă un system message
   * de confirmare. Update și conv.wizardState.step dacă există.
   */
  async markPaymentLinksAsPaid(paymentId: string, status: 'paid' | 'failed' = 'paid'): Promise<void> {
    // Postgres jsonb path query
    const messages = await this.msg
      .createQueryBuilder('m')
      .where(`m."messageType" = 'payment_link'`)
      .andWhere(`m.payload->>'paymentId' = :pid`, { pid: paymentId })
      .getMany();
    if (messages.length === 0) return;

    const conversationIds = new Set<string>();
    for (const m of messages) {
      const oldPayload = (m.payload ?? {}) as Record<string, unknown>;
      m.payload = {
        ...oldPayload,
        status,
        paidAt: status === 'paid' ? new Date().toISOString() : undefined,
      };
      await this.msg.save(m);
      conversationIds.add(m.conversationId);
    }

    // Trimite un mesaj system + update wizard pentru fiecare conversație afectată
    for (const convId of conversationIds) {
      const conv = await this.conv.findOne({ where: { id: convId } });
      if (!conv) continue;

      // Re-emit message-urile updated (clients vor refetch)
      for (const m of messages.filter((x) => x.conversationId === convId)) {
        this.gateway.emitMessage({ message: m, conversation: conv });
      }

      // System message de confirmare (vizibil pe ambele părți)
      const body = status === 'paid'
        ? '✅ Plată primită! Începem să generăm melodia ta — vei primi linkul aici sau pe email în câteva minute.'
        : '⚠️ Plata nu s-a procesat. Te rugăm să reîncerci sau scrie-ne aici.';
      const sysMsg = this.msg.create({
        conversationId: convId,
        siteId: conv.siteId ?? null,
        authorRole: 'admin',
        authorId: null,
        body,
        messageType: 'text',
        aiGenerated: true,
        detectedLang: 'ro',
      });
      const saved = await this.msg.save(sysMsg);
      conv.lastMessageAt = saved.createdAt;
      conv.unreadByUser += 1;
      // Update wizard state dacă există
      if (conv.wizardState) {
        conv.wizardState.step = status === 'paid' ? 'paid' : 'collecting';
        conv.wizardState.updatedAt = new Date().toISOString();
      }
      await this.conv.save(conv);
      this.gateway.emitMessage({ message: saved, conversation: conv });

      // Push notification admin (best-effort)
      void this.webPush.sendToAll({
        title: status === 'paid' ? `💰 Plată primită — ${conv.email ?? 'guest'}` : `⚠️ Plată eșuată — ${conv.email ?? 'guest'}`,
        body: status === 'paid' ? 'Verifică conversația.' : 'Userul a eșuat plata, ia legătura cu el.',
        tag: `chat-${convId}`,
        url: `/chat?c=${convId}`,
        icon: '/icon-512.png',
        badge: '/icon-512.png',
        data: { conversationId: convId, paymentId },
      }).catch(() => {});
    }
  }

  /**
   * Apelat din admin button — admin alege o conversație + paymentId plătit
   * + completează datele și lansează manual o Generation. Folosit pentru
   * payment links ad-hoc (fără wizard, fără generationId atașat).
   */
  async launchGenerationFromPayment(
    conversationId: string,
    dto: {
      paymentId: string;
      style: string;
      occasion: string;
      recipientName: string;
      message: string;
      voiceArtist: string;
      dedication?: string;
      customLyrics?: string;
      premium?: boolean;
      email?: string;
      tipAmount?: number;
    },
  ): Promise<{ generationId: string }> {
    const conv = await this.getConversation(conversationId);
    if (!conv.siteId) throw new ForbiddenException('Conversație fără siteId');

    // Verifică paymentId aparține acestei conversații
    const paymentMsg = await this.msg
      .createQueryBuilder('m')
      .where('m.conversationId = :cid', { cid: conversationId })
      .andWhere(`m."messageType" = 'payment_link'`)
      .andWhere(`m.payload->>'paymentId' = :pid`, { pid: dto.paymentId })
      .getOne();
    if (!paymentMsg) throw new NotFoundException('Payment link inexistent în această conversație');
    const payload = paymentMsg.payload as Record<string, unknown> | null;
    if (payload?.status !== 'paid') throw new ForbiddenException('Plata nu e confirmată încă');
    if (payload?.generationId) throw new ForbiddenException('Această plată are deja o melodie atașată');

    // Lazy import pentru a evita dependency circular ChatModule ↔ GenerationsModule
    const { GenerationsService } = await import('../generations/generations.service');
    const generations = this.moduleRef.get(GenerationsService, { strict: false });

    const site = await this.sites.findById(conv.siteId);
    const locale = site?.locale ?? 'ro';

    // Email collection — pentru guest care n-a setat email
    if (dto.email && conv.guestId) {
      try {
        const { GuestSessionsService } = await import('../guest-sessions/guest-sessions.service');
        const guests = this.moduleRef.get(GuestSessionsService, { strict: false });
        await guests.setEmail(conv.guestId, dto.email);
        conv.email = dto.email.toLowerCase().trim();
      } catch {
        // ignore — caz în care nu putem seta, GenerationsService o să zică oricum
      }
    }

    // create() cu type='full' + paymentId → queue direct
    const generation = await generations.create(
      {
        type: 'full',
        style: dto.style,
        occasion: dto.occasion,
        recipientName: dto.recipientName,
        message: dto.message,
        voiceArtist: dto.voiceArtist,
        dedication: dto.dedication,
        customLyrics: dto.customLyrics,
        premium: !!dto.premium,
        tipAmount: dto.tipAmount,
        paymentId: dto.paymentId,
        locale,
      },
      { userId: conv.userId, guestId: conv.guestId, siteId: conv.siteId },
    );

    // Update payment_link payload cu generationId și update wizard
    paymentMsg.payload = { ...(payload ?? {}), generationId: generation.id };
    await this.msg.save(paymentMsg);
    if (conv.wizardState) {
      conv.wizardState.step = 'generating';
      conv.wizardState.generationId = generation.id;
      conv.wizardState.updatedAt = new Date().toISOString();
      await this.conv.save(conv);
    }
    this.gateway.emitMessage({ message: paymentMsg, conversation: conv });

    // System message
    const sys = this.msg.create({
      conversationId: conv.id,
      siteId: conv.siteId,
      authorRole: 'admin',
      authorId: null,
      body: `🎵 Am lansat generarea pentru ${dto.recipientName}. Melodia va fi gata în ~90 secunde.`,
      messageType: 'text',
      aiGenerated: true,
      detectedLang: 'ro',
    });
    const saved = await this.msg.save(sys);
    conv.lastMessageAt = saved.createdAt;
    conv.unreadByUser += 1;
    await this.conv.save(conv);
    this.gateway.emitMessage({ message: saved, conversation: conv });

    return { generationId: generation.id };
  }

  /**
   * Apelat de GenerationsProcessor după ce o generare se termină cu succes.
   * Caută conversația care a inițiat comanda prin wizard (wizardState.generationId match)
   * și trimite un mesaj în chat cu link către melodie. Actualizează și wizardState.step.
   */
  /**
   * Admin trimite simultan: Generation demo (Suno va produce 30s preview)
   * + Stripe Checkout cu metadata `unlockGenerationId` (pe plată → unlock full)
   * + payment_link card vizibil instant în chat.
   *
   * Când Suno termină demo-ul: notifyGenerationCompleted trimite song_preview.
   * Când userul plătește: webhook → unlockGenerationAfterPayment trimite mesaj
   * cu linkul către versiunea completă.
   */
  async sendDemoWithPaymentLink(
    conversationId: string,
    adminUserId: string,
    dto: {
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
      amount: number; // cents — preț custom setat de admin
      currency?: string;
      productName?: string;
    },
  ): Promise<{ generationId: string; paymentMessageId: string }> {
    const conv = await this.getConversation(conversationId);
    if (!conv.siteId) throw new ForbiddenException('Conversație fără siteId');
    const site = await this.sites.findById(conv.siteId);
    if (!site) throw new NotFoundException('Site nu există');

    // Asigură-te că guest-ul are email (Suno necesită pentru livrare).
    if (dto.email && conv.guestId) {
      try {
        const { GuestSessionsService } = await import('../guest-sessions/guest-sessions.service');
        const guests = this.moduleRef.get(GuestSessionsService, { strict: false });
        await guests.setEmail(conv.guestId, dto.email);
        conv.email = dto.email.toLowerCase().trim();
        await this.conv.save(conv);
      } catch {
        /* ignore */
      }
    }

    const { GenerationsService } = await import('../generations/generations.service');
    const generations = this.moduleRef.get(GenerationsService, { strict: false });

    // Creează generation type='demo' — Suno produce automat și full și demo (30s).
    // Full rămâne ascuns până paidUnlocked=true.
    const generation = await generations.create(
      {
        type: 'demo',
        style: dto.style,
        occasion: dto.occasion,
        recipientName: dto.recipientName,
        message: dto.message,
        voiceArtist: dto.voiceArtist,
        dedication: dto.dedication,
        customLyrics: dto.customLyrics,
        premium: !!dto.premium,
        tipAmount: dto.tipAmount,
        locale: site.locale ?? 'ro',
      },
      { userId: conv.userId, guestId: conv.guestId, siteId: conv.siteId },
    );

    // Creează Stripe Checkout cu metadata unlockGenerationId — webhook va dezolba.
    const description = dto.productName?.trim() || `Manea personalizată pentru ${dto.recipientName}`;
    const checkout = await this.payments.createCheckoutSession({
      userId: conv.userId,
      guestId: conv.guestId,
      premium: !!dto.premium,
      email: conv.email ?? undefined,
      site,
      overrideAmount: Math.round(dto.amount),
      overrideCurrency: dto.currency?.toUpperCase(),
      overrideProductName: description,
      unlockGenerationId: generation.id,
    });

    const currency = (dto.currency ?? site.currency).toUpperCase();
    const msg = this.msg.create({
      conversationId: conv.id,
      siteId: conv.siteId,
      authorRole: 'admin',
      authorId: adminUserId,
      body: `🎵 Lansăm demo + link plată: ${description} — ${(dto.amount / 100).toFixed(2)} ${currency}`,
      messageType: 'payment_link',
      payload: {
        amount: dto.amount,
        currency,
        description,
        checkoutUrl: checkout.url,
        paymentId: checkout.paymentId,
        premium: !!dto.premium,
        // Flag-ul ăsta îi spune client-ului că plata DEBLOCHEAZĂ o melodie
        // existentă (nu o lansează de la zero).
        unlockGenerationId: generation.id,
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

    return { generationId: generation.id, paymentMessageId: persisted.id };
  }

  /**
   * Apelat din webhook Stripe când metadata are `unlockGenerationId`. Setează
   * paidUnlocked=true + trimite în chat mesaj cu linkul către versiunea
   * completă + retrimite email cu MP3-urile.
   */
  async unlockGenerationAfterPayment(generationId: string, paymentId: string): Promise<void> {
    const { GenerationsService } = await import('../generations/generations.service');
    const generations = this.moduleRef.get(GenerationsService, { strict: false });

    // markPaidAndQueue setează paidUnlocked=true + trimite email confirmare plată
    // + (dacă status='pending', queue). Pentru flux demo→full status nu e pending.
    const gen = await generations.markPaidAndQueue(generationId, paymentId);
    if (!gen) throw new NotFoundException('Generation inexistent');

    // Găsim conversația — fie prin wizardState.generationId, fie prin payment_link payload
    let conv = await this.conv
      .createQueryBuilder('c')
      .where(`c."wizardState"->>'generationId' = :gid`, { gid: generationId })
      .getOne();
    if (!conv) {
      const m = await this.msg
        .createQueryBuilder('m')
        .where(`m."messageType" = 'payment_link'`)
        .andWhere(`m.payload->>'unlockGenerationId' = :gid`, { gid: generationId })
        .getOne();
      if (m) conv = await this.conv.findOne({ where: { id: m.conversationId } });
    }
    if (!conv) return;

    const fullLink = this.buildGenerationUrl(conv, generationId);
    const sys = this.msg.create({
      conversationId: conv.id,
      siteId: conv.siteId ?? null,
      authorRole: 'admin',
      authorId: null,
      body: `🎉 Plată confirmată! Versiunea completă a melodiei este deblocată: ${fullLink}`,
      messageType: 'song_preview',
      payload: { generationId, audioUrl: fullLink, unlocked: true },
      aiGenerated: true,
      detectedLang: 'ro',
    });
    const saved = await this.msg.save(sys);
    conv.lastMessageAt = saved.createdAt;
    conv.unreadByUser += 1;
    await this.conv.save(conv);
    this.gateway.emitMessage({ message: saved, conversation: conv });

    // markPaidAndQueue trimite deja email de confirmare plată.
  }

  async notifyGenerationCompleted(generationId: string, status: 'succeeded' | 'failed'): Promise<void> {
    // Caut conv prin wizardState (flux AI wizard) SAU prin payment_link
    // (flux admin demo+plată — payload.unlockGenerationId).
    let conv = await this.conv
      .createQueryBuilder('c')
      .where(`c."wizardState"->>'generationId' = :gid`, { gid: generationId })
      .getOne();
    if (!conv) {
      const linkMsg = await this.msg
        .createQueryBuilder('m')
        .where(`m."messageType" = 'payment_link'`)
        .andWhere(`m.payload->>'unlockGenerationId' = :gid`, { gid: generationId })
        .getOne();
      if (linkMsg) conv = await this.conv.findOne({ where: { id: linkMsg.conversationId } });
    }
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

  /** Arhivează sau dezarhivează o conversație. */
  async setArchived(conversationId: string, archived: boolean): Promise<Conversation> {
    const c = await this.getConversation(conversationId);
    c.archivedAt = archived ? new Date() : null;
    return this.conv.save(c);
  }

  /**
   * Atribuie conversația unui admin (sau o eliberează cu adminUserId=null).
   * Returnează entitatea actualizată — admin UI o pune în cache.
   */
  async setAssignedAdmin(
    conversationId: string,
    adminUserId: string | null,
  ): Promise<Conversation> {
    const c = await this.getConversation(conversationId);
    if (adminUserId) {
      const u = await this.users.findOne({ where: { id: adminUserId } });
      if (!u) throw new NotFoundException('Admin user inexistent');
      c.assignedAdminId = u.id;
      c.assignedAdminEmail = u.email ?? null;
      c.assignedAt = new Date();
    } else {
      c.assignedAdminId = null;
      c.assignedAdminEmail = null;
      c.assignedAt = null;
    }
    const saved = await this.conv.save(c);
    // Anunță toți adminii prin WS să refacă cache-ul sidebar-ului.
    this.gateway.emitConversationUpdated(saved);
    return saved;
  }

  /** Redenumește subiectul afișat în sidebar. */
  async renameConversation(conversationId: string, subject: string): Promise<Conversation> {
    const trimmed = subject.trim().slice(0, 200);
    if (!trimmed) throw new ForbiddenException('Subiect gol');
    const c = await this.getConversation(conversationId);
    c.subject = trimmed;
    return this.conv.save(c);
  }

  /** Șterge complet conversația + toate mesajele + audit tool calls. Ireversibil. */
  async deleteConversation(conversationId: string): Promise<{ ok: true; deletedMessages: number }> {
    const c = await this.getConversation(conversationId);
    const msgCount = await this.msg.count({ where: { conversationId: c.id } });
    // Ștergem mesajele întâi
    await this.msg.delete({ conversationId: c.id });
    // Ștergem audit tool calls (best-effort, dacă tabela există)
    try {
      await this.msg.manager
        .createQueryBuilder()
        .delete()
        .from('ai_tool_calls')
        .where('"conversationId" = :id', { id: c.id })
        .execute();
    } catch {
      /* ai_tool_calls poate să nu existe sau să nu refere — ignored */
    }
    // În final conversation
    await this.conv.delete({ id: c.id });
    return { ok: true, deletedMessages: msgCount };
  }

  /** Forțează deschiderea chat-ului pe partea de client (admin sau AI). */
  async forceOpenChat(conversationId: string): Promise<{ ok: true; online: boolean }> {
    return this.forceToggleChat(conversationId, true);
  }

  /** Forțează închiderea sau deschiderea widget-ului pe client. */
  async forceToggleChat(
    conversationId: string,
    open: boolean,
  ): Promise<{ ok: true; online: boolean; open: boolean }> {
    const c = await this.getConversation(conversationId);
    const online = this.gateway.isOnline({ userId: c.userId, guestId: c.guestId });
    this.gateway.forceToggleChat({ userId: c.userId, guestId: c.guestId }, open);
    return { ok: true, online, open };
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

  // ============== Quick Replies (răspunsuri predefinite per-site) ==============

  /** Listă răspunsuri pentru site-ul curent + cele globale (siteId=null). */
  async listQuickReplies(siteId: string | null): Promise<QuickReply[]> {
    const qb = this.quickReplies
      .createQueryBuilder('q')
      .orderBy('q."sortOrder"', 'ASC')
      .addOrderBy('q."createdAt"', 'ASC');
    if (siteId) {
      qb.where('(q.siteId = :siteId OR q.siteId IS NULL)', { siteId });
    }
    return qb.getMany();
  }

  async createQuickReply(
    siteId: string | null,
    dto: { label: string; text: string; color?: string; sortOrder?: number },
  ): Promise<QuickReply> {
    const label = dto.label.trim().slice(0, 120);
    const text = dto.text.trim().slice(0, 2000);
    if (!label || !text) throw new ForbiddenException('Label și text sunt obligatorii');
    const q = this.quickReplies.create({
      siteId,
      label,
      text,
      color: dto.color?.trim() || '#d4af37',
      sortOrder: dto.sortOrder ?? 0,
    });
    return this.quickReplies.save(q);
  }

  async updateQuickReply(
    id: string,
    dto: { label?: string; text?: string; color?: string; sortOrder?: number },
  ): Promise<QuickReply> {
    const q = await this.quickReplies.findOne({ where: { id } });
    if (!q) throw new NotFoundException('Quick reply inexistent');
    if (dto.label !== undefined) q.label = dto.label.trim().slice(0, 120);
    if (dto.text !== undefined) q.text = dto.text.trim().slice(0, 2000);
    if (dto.color !== undefined) q.color = dto.color.trim() || '#d4af37';
    if (dto.sortOrder !== undefined) q.sortOrder = dto.sortOrder;
    return this.quickReplies.save(q);
  }

  async deleteQuickReply(id: string): Promise<{ ok: true }> {
    await this.quickReplies.delete({ id });
    return { ok: true };
  }
}
