import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  forwardRef,
  Inject,
  OnModuleInit,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, MoreThan, Repository } from 'typeorm';
import { Conversation, AiChatMode, GeneratorFormState } from './conversation.entity';
import { ChatMessage, ChatMessageType, ChatMessagePayload } from './message.entity';
import { QuickReply } from './quick-reply.entity';
import { GuestSession } from '../guest-sessions/guest-session.entity';
import { User } from '../users/user.entity';
import { AnalyticsSession } from '../analytics/analytics-session.entity';
import { ChatGateway } from './chat.gateway';
import { TranslationService } from '../../openai/translation.service';
import { OpenAiClient } from '../../openai/openai.client';
import { WebPushService } from '../web-push/web-push.service';
import { ChatAttachmentsService } from './chat-attachments.service';
import { ChatBlacklistService } from './chat-blacklist.service';
import { PaymentsService } from '../payments/payments.service';
import { normalizeTier, packageLabel, type PackageTier } from '../payments/packages';
import { packageTotalCents } from '../payments/pricing';
import { SitesService } from '../sites/sites.service';
import { SettingsService } from '../settings/settings.service';
import { LyricsService } from '../lyrics/lyrics.module';
import { MetaCapiService } from '../meta-capi/meta-capi.service';

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
    private readonly openai: OpenAiClient,
    private readonly webPush: WebPushService,
    private readonly attachments: ChatAttachmentsService,
    private readonly blacklist: ChatBlacklistService,
    private readonly payments: PaymentsService,
    private readonly sites: SitesService,
    private readonly chatSettings: SettingsService,
    private readonly lyrics: LyricsService,
    private readonly moduleRef: ModuleRef,
    private readonly metaCapi: MetaCapiService,
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

  /**
   * Citeste modul AI default pentru conversații noi. Prioritate:
   *  1. site.aiChatModeDefault (per-site override) dacă siteId e pasat
   *  2. setarea globală AI_CHAT_MODE_DEFAULT
   *  3. fallback 'manual'
   */
  private async getDefaultAiMode(siteId?: string | null): Promise<'manual' | 'suggest' | 'auto'> {
    if (siteId) {
      try {
        const site = await this.sites.findById(siteId);
        const siteMode = site?.aiChatModeDefault;
        if (siteMode === 'suggest' || siteMode === 'auto' || siteMode === 'manual') {
          return siteMode;
        }
      } catch {
        /* fallback global */
      }
    }
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
      const defaultMode = await this.getDefaultAiMode(ctx.siteId);
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
    const defaultMode = await this.getDefaultAiMode(ctx.siteId);
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
    // Clientul NU vede mesaje internal: AI suggestions, system messages, mesaje șterse.
    const messages = all.filter(
      (m) =>
        m.messageType !== 'ai_suggestion' &&
        m.messageType !== 'system' &&
        m.authorRole !== 'system' &&
        !m.deletedAt,
    );
    // BUG-FIX 2026-05-26: NU mai resetăm unreadByUser aici. Polling-ul (la 30-60s)
    // și refetch-ul după WS chat:message apelau listMyMessages care reseta
    // contorul ÎNAINTE ca UI-ul să-l fi consumat → badge-ul rămânea mereu 0.
    // Reset-ul are loc acum doar prin ACK explicit (user a deschis chatul).
    return { conversation, messages };
  }

  async sendAsUser(ctx: OwnerCtx, body: string): Promise<ChatMessage> {
    const conversation = await this.getOrCreateMine(ctx);
    // Blacklist per-site: blochează după IP (din WS sau lastIp persistat) sau email.
    const ip =
      this.gateway.getKnownIp({ userId: ctx.userId, guestId: ctx.guestId }) ??
      conversation.lastIp;
    if (await this.blacklist.isBlocked({ siteId: ctx.siteId, ip, email: conversation.email })) {
      throw new ForbiddenException('blocked');
    }
    const msg = this.msg.create({
      conversationId: conversation.id,
      siteId: ctx.siteId ?? null,
      authorRole: 'user',
      authorId: ctx.userId,
      body: body.trim(),
    });
    const saved = await this.msg.save(msg);
    // Partial UPDATE — NU `save(conversation)` full entity. Race condition altfel:
    // dacă AI agent persistă wizardState între `getOrCreateMine` și acest save,
    // save-ul full entity overwrite-uiește wizardState cu valoarea stale din memoria
    // procesului (bug observat 2026-05-26: wizard_finalize găsea wizardState gol
    // după 5 wizard_update sequential reușite). Detalii §16 CLAUDE.md.
    const wasArchived = !!conversation.archivedAt;
    await this.conv
      .createQueryBuilder()
      .update(Conversation)
      .set({
        lastMessageAt: saved.createdAt,
        unreadByAdmin: () => '"unreadByAdmin" + 1',
        // Userul a scris → fereastra de tăcere s-a închis, follow-up-urile reîncep de la 0.
        aiFollowupCount: 0,
        ...(wasArchived ? { archivedAt: null } : {}),
      })
      .where('id = :id', { id: conversation.id })
      .execute();
    // Sincronizează in-memory ca să emit-ul WS să aibă valorile actualizate.
    conversation.lastMessageAt = saved.createdAt;
    conversation.unreadByAdmin += 1;
    if (wasArchived) conversation.archivedAt = null;
    this.gateway.emitMessage({ message: saved, conversation });
    // Auto-translate DEZACTIVAT (2026-05-26) — detecția de limbă pe mesaje
    // scurte ("Ok", "Da") era nesigură și ducea la admin-outbound traducere
    // RO → EN nedorită. Mesajele se afișează în original.
    // AI agent dacă conversația e în mod suggest/auto (non-blocking).
    void this.maybeTriggerAi(conversation.id, saved.id);

    // ============== Meta CAPI ==============
    // Lead event la PRIMUL mesaj user în conv (semnal early-funnel pentru Meta).
    // EngagedChatter custom event la al 3-lea mesaj user (audiență warm).
    void this.fireMetaChatEvents(conversation, ctx).catch(() => undefined);
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

  /**
   * Admin: „du clientul la mesajul ăsta" — deschide widget-ul pe client (dacă e
   * închis) și îi derulează chat-ul până la mesajul țintă, cu evidențiere.
   * Returnează online=false dacă clientul nu are nicio conexiune WS activă
   * (eventul nu are unde să ajungă acum — adminul primește feedback onest).
   */
  async spotlightMessage(messageId: string): Promise<{ ok: true; online: boolean }> {
    const m = await this.msg.findOne({ where: { id: messageId } });
    if (!m) throw new NotFoundException('Mesajul nu există');
    if (
      m.messageType === 'system' ||
      m.messageType === 'ai_suggestion' ||
      m.authorRole === 'system' ||
      m.deletedAt
    ) {
      throw new ForbiddenException('Mesajul nu e vizibil pentru client — nu pot derula la el');
    }
    const conv = await this.getConversation(m.conversationId);
    const target = { userId: conv.userId, guestId: conv.guestId };
    const online = this.gateway.isOnline(target);
    this.gateway.forceToggleChat(target, true);
    this.gateway.scrollToMessage(target, { conversationId: conv.id, messageId: m.id });
    return { ok: true, online };
  }

  /**
   * Clientul a apăsat „Plătește acum" pe un card payment_link din chat.
   * Persistăm momentul pe payload (clickCount / firstClickedAt / lastClickedAt),
   * re-emitem mesajul pe WS (adminul vede LIVE pe card), iar la PRIMUL click
   * trimitem push adminilor — e momentul cel mai fierbinte din funnel (clientul
   * e chiar acum pe pagina Stripe). Best-effort: nu aruncă niciodată spre client.
   */
  async markPaymentLinkClicked(ctx: OwnerCtx, messageId: string): Promise<{ ok: true }> {
    try {
      const conversation = await this.getOrCreateMine(ctx);
      const m = await this.msg.findOne({
        where: { id: messageId, conversationId: conversation.id },
      });
      if (!m || m.messageType !== 'payment_link') return { ok: true };
      const p = (m.payload ?? {}) as ChatMessagePayload;
      if (p.status === 'paid') return { ok: true }; // deja plătit — nu mai contează click-urile
      const nowIso = new Date().toISOString();
      const clickCount = (typeof p.clickCount === 'number' ? p.clickCount : 0) + 1;
      m.payload = {
        ...p,
        clickCount,
        firstClickedAt: p.firstClickedAt ?? nowIso,
        lastClickedAt: nowIso,
      };
      await this.msg.save(m);
      this.gateway.emitMessage({ message: m, conversation });

      if (clickCount === 1) {
        const who =
          conversation.email ??
          (conversation.userId
            ? `user:${conversation.userId.slice(0, 8)}`
            : `guest:${conversation.guestId?.slice(0, 8) ?? '?'}`);
        void this.webPush
          .sendToAll({
            title: `💳 ${who} a apăsat pe Plătește`,
            body: `${p.description ?? 'Manea'} — ${(((p.amount as number) ?? 0) / 100).toFixed(2)} ${p.currency ?? 'RON'}. E pe pagina Stripe chiar acum.`,
            tag: `paylink-${conversation.id}`,
            url: `/chat?c=${conversation.id}`,
            icon: '/icon-512.png',
            badge: '/icon-512.png',
            data: { conversationId: conversation.id, messageId: m.id },
          })
          .catch(() => {});
      }
    } catch {
      // tracking best-effort — niciodată eroare spre client
    }
    return { ok: true };
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
  /** Total mesaje necitite de admin (badge sidebar) — un singur SUM, fără augmentare. */
  async unreadTotalForAdmin(siteId: string | null): Promise<{ unread: number }> {
    const qb = this.conv
      .createQueryBuilder('c')
      .select('COALESCE(SUM(c."unreadByAdmin"), 0)', 'unread')
      .where('c."archivedAt" IS NULL');
    if (siteId) qb.andWhere('c."siteId" = :siteId', { siteId });
    const row = await qb.getRawOne<{ unread: string }>();
    return { unread: Number(row?.unread ?? 0) };
  }

  /**
   * Listare conversații pentru admin, PAGINATĂ (2026-06-10 — la 2700+ conversații,
   * varianta „totul deodată" augmenta și serializa mii de rânduri la fiecare 30s și
   * bloca UI-ul). Contract:
   *  - default: pagina cerută (limit/offset) ordonată după lastMessageAt DESC;
   *    PRIMA pagină (offset=0) include în plus TOATE conversațiile online acum
   *    (snapshot WS), sortate primele — comportamentul vechi păstrat.
   *  - search (q): max 100 rezultate, fără paginare (hasMore=false).
   */
  async listAllConversations(
    siteId: string | null,
    opts: { q?: string; archived?: boolean; limit?: number; offset?: number } = {},
  ): Promise<{ items: Array<ConversationWithPresence & { lastMessageRole: 'user' | 'admin' | null }>; total: number; hasMore: boolean }> {
    const q = opts.q?.trim();
    const includeArchived = opts.archived === true;
    const limit = Math.min(200, Math.max(1, Math.trunc(opts.limit ?? 50)));
    const offset = Math.max(0, Math.trunc(opts.offset ?? 0));
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
      // DEFAULT (paginat): conversațiile cu cel puțin un mesaj, pagina cerută.
      qb.andWhere('c."lastMessageAt" IS NOT NULL');
      qb.orderBy('c."lastMessageAt"', 'DESC', 'NULLS LAST')
        .addOrderBy('c."updatedAt"', 'DESC')
        .skip(offset)
        .take(limit);
    }

    // Total pentru paginare (doar în default mode; search întoarce tot ce găsește).
    let total = 0;
    if (!q) {
      const countQb = this.conv.createQueryBuilder('c');
      if (siteId) countQb.where('c.siteId = :siteId', { siteId });
      countQb.andWhere(includeArchived ? 'c."archivedAt" IS NOT NULL' : 'c."archivedAt" IS NULL');
      countQb.andWhere('c."lastMessageAt" IS NOT NULL');
      total = await countQb.getCount();
    }

    let all = await qb.getMany();
    if (q) total = all.length;

    // Prima pagină include și conversațiile ONLINE acum (chiar cu lastMessageAt vechi),
    // ca să păstrăm comportamentul „online primii" fără să încărcăm toate paginile.
    if (!q && offset === 0) {
      const online = this.gateway.onlineIds();
      if (online.userIds.length > 0 || online.guestIds.length > 0) {
        const onlineQb = this.conv.createQueryBuilder('c');
        if (siteId) onlineQb.where('c.siteId = :siteId', { siteId });
        onlineQb.andWhere(includeArchived ? 'c."archivedAt" IS NOT NULL' : 'c."archivedAt" IS NULL');
        onlineQb.andWhere('c."lastMessageAt" IS NOT NULL');
        const onlineClauses: string[] = [];
        const onlineParams: Record<string, unknown> = {};
        if (online.userIds.length > 0) {
          onlineClauses.push('c."userId" IN (:...onlineUserIds)');
          onlineParams.onlineUserIds = online.userIds;
        }
        if (online.guestIds.length > 0) {
          onlineClauses.push('c."guestId" IN (:...onlineGuestIds)');
          onlineParams.onlineGuestIds = online.guestIds;
        }
        onlineQb.andWhere(`(${onlineClauses.join(' OR ')})`, onlineParams);
        onlineQb.take(200);
        const onlineConvs = await onlineQb.getMany();
        const seen = new Set(all.map((c) => c.id));
        all = [...all, ...onlineConvs.filter((c) => !seen.has(c.id))];
      }
    }

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
        // IP în ordinea de prioritate:
        //  1. Conversation.lastIp (persistat la fiecare WS connect, supraviețuiește restart API)
        //  2. analytics_sessions (set la pageview, dar lipsă pentru guest care n-a încărcat încă /track)
        //  3. gateway memory (WS handshake) — doar dacă online acum
        //  4. null → UI arată „IP necunoscut" doar pentru conv-uri foarte vechi pre-feature
        const ip =
          c.lastIp ||
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
     * Sortare simplă (cerere user 2026-05-27):
     *  1. Online — DESC by lastMessageAt
     *  2. Offline — DESC by lastMessageAt
     * Aplicată DOAR pe prima pagină (acolo sunt injectate conversațiile online);
     * paginile următoare păstrează ordinea DB (lastMessageAt DESC) ca să nu sară
     * elementele între pagini la infinite scroll.
     */
    if (q || offset === 0) {
      augmented.sort((a, b) => {
        if (a.online !== b.online) return a.online ? -1 : 1;
        const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        if (at !== bt) return bt - at;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
    }

    return {
      items: augmented,
      total,
      hasMore: q ? false : offset + limit < total,
    };
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
      c.lastIp ||
      (c.userId && ips.users.get(c.userId)) ||
      (c.guestId && ips.guests.get(c.guestId)) ||
      this.gateway.getKnownIp({ userId: c.userId, guestId: c.guestId }) ||
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
    const live = this.gateway.getEnriched({ userId: c.userId, guestId: c.guestId });
    // Fallback DB pentru formularul Generator: dacă presence-ul in-memory s-a pierdut
    // (restart API) sau încă n-a sosit prin WS, folosim ultima stare persistată — astfel
    // panoul „Formular live" apare oricum la deschiderea conversației.
    if (c.lastFormState && !live?.formState) {
      if (live) return { ...live, formState: c.lastFormState };
      return {
        online: false,
        connectedAt: null,
        lastSeenAt: c.disconnectedAt ? c.disconnectedAt.toISOString() : null,
        currentPath: c.lastClientPath ?? null,
        currentTitle: null,
        chatOpen: c.chatOpenOnClient ?? false,
        device: c.lastDevice ?? null,
        ip: c.lastIp ?? null,
        formState: c.lastFormState,
      };
    }
    return live;
  }

  async getConversation(id: string): Promise<Conversation> {
    const c = await this.conv.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Conversation not found');
    return c;
  }

  // ============== Blacklist chat (per-site) ==============

  listBlacklist(siteId: string | null) {
    return this.blacklist.list(siteId);
  }

  addBlacklist(args: {
    siteId: string | null;
    type: 'ip' | 'email';
    value: string;
    reason?: string | null;
    byEmail?: string | null;
  }) {
    return this.blacklist.add({
      siteId: args.siteId,
      type: args.type,
      value: args.value,
      reason: args.reason,
      createdByEmail: args.byEmail,
    });
  }

  removeBlacklist(id: string) {
    return this.blacklist.remove(id);
  }

  /**
   * Blochează persoana dintr-o conversație după IP și/sau email, dintr-un singur
   * click ("din latura de chat"). Deconectează imediat socket-urile active.
   */
  async blockFromConversation(
    conversationId: string,
    opts: { blockIp?: boolean; blockEmail?: boolean; reason?: string | null; byEmail?: string | null },
  ): Promise<{ ok: true; blocked: { ip?: string; email?: string } }> {
    const conv = await this.getConversation(conversationId);
    const ip =
      this.gateway.getKnownIp({ userId: conv.userId, guestId: conv.guestId }) ?? conv.lastIp;
    const blocked: { ip?: string; email?: string } = {};
    if (opts.blockIp && ip) {
      await this.blacklist.add({
        siteId: conv.siteId,
        type: 'ip',
        value: ip,
        reason: opts.reason,
        createdByEmail: opts.byEmail,
      });
      blocked.ip = ip;
    }
    if (opts.blockEmail && conv.email) {
      await this.blacklist.add({
        siteId: conv.siteId,
        type: 'email',
        value: conv.email,
        reason: opts.reason,
        createdByEmail: opts.byEmail,
      });
      blocked.email = conv.email.toLowerCase();
    }
    // Deconectează imediat sesiunea curentă.
    this.gateway.disconnectTarget({ userId: conv.userId, guestId: conv.guestId });
    return { ok: true, blocked };
  }

  async listMessages(conversationId: string): Promise<ChatMessage[]> {
    const all = await this.msg.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });
    // Filtrăm sugestiile AI aprobate/respinse + mesajele soft-deleted.
    return all.filter(
      (m) => !m.deletedAt && !(m.messageType === 'ai_suggestion' && m.aiApprovedBy),
    );
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
    // Partial UPDATE — vezi comentariu în sendAsUser pentru motivul anti-race condition.
    // PLUS: dacă admin uman trimite mesaj într-o conv `auto`, comut automat pe `manual`
    // (admin a preluat explicit). Anti-bug observat 2026-05-27 conv 32c31016: admin
    // răspundea în paralel cu AI → 3 mesaje aproape identice „Manea costă 29.99..."
    // confuzând userul. Marker `aiGenerated=false` = admin uman real (NU AI care
    // scrie ca admin). Excludem AI-generated ca să nu se auto-comute pe propriile
    // mesaje.
    const isHumanAdmin = !opts?.aiGenerated;
    const shouldDeactivateAi = isHumanAdmin && conv.aiMode === 'auto';
    await this.conv
      .createQueryBuilder()
      .update(Conversation)
      .set({
        lastMessageAt: saved.createdAt,
        unreadByUser: () => '"unreadByUser" + 1',
        unreadByAdmin: 0,
        ...(shouldDeactivateAi ? { aiMode: 'manual' as const } : {}),
      })
      .where('id = :id', { id: conv.id })
      .execute();
    conv.lastMessageAt = saved.createdAt;
    conv.unreadByUser += 1;
    conv.unreadByAdmin = 0;
    if (shouldDeactivateAi) {
      conv.aiMode = 'manual';
    }
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
        ? '✅ Plată primită! Începem să generăm melodia ta — durează 5-10 minute. Vei primi linkul aici și pe email când e gata.'
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
        if (status === 'paid') {
          // Reset contoare la plată reușită — clientul fidel pornește curat la
          // următoarea comandă (re-cotare preț permisă, link nou permis).
          conv.wizardState.priceQuotedCount = 0;
          conv.wizardState.linkReissueCount = 0;
        }
      }
      if (status === 'paid') {
        // Fereastra limitei de mesaje AI repornește după fiecare vânzare.
        conv.aiCapResetAt = new Date();
      }
      await this.conv.save(conv);
      this.gateway.emitMessage({ message: saved, conversation: conv });

      // ── Modificare contra cost plătită → pornește refacerea automat. AI-ul a
      // stocat pe payment_link payload generația-țintă + schimbările cerute.
      if (status === 'paid') {
        for (const m of messages.filter((x) => x.conversationId === convId)) {
          const p = (m.payload ?? {}) as Record<string, unknown>;
          const modGenId = typeof p.modificationForGenerationId === 'string' ? p.modificationForGenerationId : null;
          const modChanges = typeof p.modificationChanges === 'string' ? p.modificationChanges : '';
          const modNewName =
            typeof p.modificationNewRecipientName === 'string' && p.modificationNewRecipientName.trim()
              ? p.modificationNewRecipientName.trim().slice(0, 120)
              : null;
          if (!modGenId) continue;
          try {
            const { GenerationsService } = await import('../generations/generations.service');
            const generations = this.moduleRef.get(GenerationsService, { strict: false });
            const rows: Array<{ message: string }> = await this.conv.manager.query(
              `SELECT message FROM generations WHERE id = $1`,
              [modGenId],
            );
            const baseMessage = rows[0]?.message ?? '';
            // Corecțiile PRIMELE, imperativ, cu prioritate absolută asupra versiunii vechi —
            // altfel writer-ul diluează modificarea (BUG 2026-07-06 conv 4581c882). Numele
            // corectat merge și pe câmpul structurat recipientName (semnalul dominant).
            const nameLine = modNewName
              ? `\n- Numele CORECT al destinatarului este „${modNewName}". Folosește EXACT acest nume; ignoră orice alt nume din varianta veche.`
              : '';
            const newMessage = [
              `⚠️ MODIFICĂRI PLĂTITE DE CLIENT — CORECȚII OBLIGATORII, cu PRIORITATE ABSOLUTĂ asupra versiunii anterioare.`,
              `Aplică EXACT schimbările de mai jos și păstrează tot restul la fel:`,
              `- ${modChanges}${nameLine}`,
              ``,
              `Context original al comenzii (pentru referință, dar corecțiile de mai sus au prioritate):`,
              baseMessage,
            ].join('\n');
            const regen = await generations.adminRegenerate(modGenId, {
              target: 'overwrite',
              lyricsMode: 'rewrite',
              edits: { message: newMessage, ...(modNewName ? { recipientName: modNewName } : {}) },
            });
            if (conv.wizardState) {
              conv.wizardState.generationId = regen.id;
              conv.wizardState.step = 'generating';
              conv.wizardState.modification = null;
              conv.wizardState.updatedAt = new Date().toISOString();
              await this.conv.save(conv);
            }
            const modMsg = this.msg.create({
              conversationId: convId,
              siteId: conv.siteId ?? null,
              authorRole: 'admin',
              authorId: null,
              body: '🎵 Am pornit refacerea melodiei cu modificările tale — e gata în 5-10 minute și o primești pe email și aici.',
              messageType: 'text',
              aiGenerated: true,
              detectedLang: 'ro',
            });
            const savedMod = await this.msg.save(modMsg);
            this.gateway.emitMessage({ message: savedMod, conversation: conv });
          } catch (e) {
            // Refacerea automată a eșuat — adminii trebuie să intervină manual.
            void this.webPush.sendToAll({
              title: `⚠️ Modificare plătită NEPORNITĂ — ${conv.email ?? 'guest'}`,
              body: 'Clientul a plătit modificarea dar regenerarea a eșuat. Intervino manual.',
              tag: `chat-${convId}`,
              url: `/chat?c=${convId}`,
              icon: '/icon-512.png',
              badge: '/icon-512.png',
              data: { conversationId: convId, paymentId },
            }).catch(() => {});
          }
        }
      }

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
      packageTier?: 'basic' | 'plus' | 'premium';
      email?: string;
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
        packageTier: normalizeTier(dto.packageTier),
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
      body: `🎵 Am lansat generarea pentru ${dto.recipientName}. Melodia va fi gata în 5-10 minute.`,
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
      packageTier?: 'basic' | 'plus' | 'premium';
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
        packageTier: normalizeTier(dto.packageTier),
        locale: site.locale ?? 'ro',
      },
      { userId: conv.userId, guestId: conv.guestId, siteId: conv.siteId },
    );

    // ============== Flux GRATIS (amount=0) ==============
    // Skip Stripe + payment_link. Marchez direct paidUnlocked=true pe gen
    // (când Suno termină, /m/<id> va expune varianta full). Trimit două
    // mesaje în chat: unul informativ + unul card cu linkul către pagina manelei.
    if (Math.round(dto.amount) <= 0) {
      await this.msg.manager
        .createQueryBuilder()
        .update('generations')
        .set({ paidUnlocked: true })
        .where('id = :id', { id: generation.id })
        .execute();

      const sysBody = `🎵 Generăm acum maneaua. Va fi gata în aproximativ 5 minute. Următorul mesaj conține linkul către pagina manelei unde se generează. Apasă pe el și când s-a generat îți apare acolo. Inițial se generează versurile și apoi muzica.`;
      const sysMsg = this.msg.create({
        conversationId: conv.id,
        siteId: conv.siteId,
        authorRole: 'admin',
        authorId: adminUserId,
        body: sysBody,
        messageType: 'text',
        aiGenerated: true,
        detectedLang: 'ro',
      });
      const savedSys = await this.msg.save(sysMsg);

      // Card cu link către pagina manelei — renderat frumos pe client.
      const fullLink = this.buildGenerationUrl(conv, generation.id);
      const linkMsg = this.msg.create({
        conversationId: conv.id,
        siteId: conv.siteId,
        authorRole: 'admin',
        authorId: adminUserId,
        body: `🎶 Pagina manelei tale: ${fullLink}`,
        messageType: 'song_preview',
        payload: {
          generationId: generation.id,
          audioUrl: fullLink,
          recipientName: dto.recipientName,
          pending: true,
        },
        aiGenerated: true,
        detectedLang: 'ro',
      });
      const savedLink = await this.msg.save(linkMsg);

      conv.lastMessageAt = savedLink.createdAt;
      conv.unreadByUser += 2;
      conv.unreadByAdmin = 0;
      await this.conv.save(conv);
      this.gateway.emitMessage({ message: savedSys, conversation: conv });
      this.gateway.emitMessage({ message: savedLink, conversation: conv });
      return { generationId: generation.id, paymentMessageId: savedLink.id };
    }

    // Creează Stripe Checkout cu metadata unlockGenerationId — webhook va dezolba.
    const description = dto.productName?.trim() || `Manea personalizată pentru ${dto.recipientName}`;
    const tier = normalizeTier(dto.packageTier);
    const checkout = await this.payments.createCheckoutSession({
      userId: conv.userId,
      guestId: conv.guestId,
      packageTier: tier,
      email: conv.email ?? undefined,
      site,
      overrideAmount: Math.round(dto.amount),
      overrideCurrency: dto.currency?.toUpperCase(),
      overrideProductName: description,
      unlockGenerationId: generation.id,
      ipAddress: conv.lastIp ?? undefined,
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
        packageTier: tier,
        packageLabel: packageLabel(tier),
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
    // Caut conv prin 3 căi (în ordine de specificitate):
    //  1. wizardState.generationId — flux AI Irina wizard_finalize
    //  2. payment_link.payload.unlockGenerationId — flux admin demo+plată (legacy)
    //  3. payment_link.payload.generationId — flux Irina + flux admin direct (cel mai
    //     comun la 2026-05-27 după refactor Irina, înainte lipsea fallback-ul ăsta)
    //  4. Generation.ownerUserId / ownerGuestId — fallback ultim: caut conv activă
    //     a userului/guest-ului (cazul în care link-ul s-a creat în alt flow, ex.
    //     pagina /studio direct, fără chat).
    let conv = await this.conv
      .createQueryBuilder('c')
      .where(`c."wizardState"->>'generationId' = :gid`, { gid: generationId })
      .getOne();
    if (!conv) {
      const linkMsg = await this.msg
        .createQueryBuilder('m')
        .where(`m."messageType" = 'payment_link'`)
        .andWhere(
          `(m.payload->>'unlockGenerationId' = :gid OR m.payload->>'generationId' = :gid)`,
          { gid: generationId },
        )
        .getOne();
      if (linkMsg) conv = await this.conv.findOne({ where: { id: linkMsg.conversationId } });
    }
    if (!conv) {
      // Fallback final: găsește orice conv activă a owner-ului generation-ului.
      // Acoperă cazul când userul a generat prin /studio direct dar are conv chat
      // deschisă — vrem să-l notificăm acolo. Folosesc query SQL ca să nu adaug
      // dependency pe GenerationsService (circular risk).
      const rows: Array<{ ownerUserId: string | null; ownerGuestId: string | null }> = await this.conv.manager.query(
        `SELECT "ownerUserId", "ownerGuestId" FROM generations WHERE id = $1 LIMIT 1`,
        [generationId],
      );
      const gen = rows[0];
      if (gen?.ownerUserId) {
        conv = await this.conv.findOne({
          where: { userId: gen.ownerUserId },
          order: { lastMessageAt: 'DESC' },
        });
      } else if (gen?.ownerGuestId) {
        conv = await this.conv.findOne({
          where: { guestId: gen.ownerGuestId },
          order: { lastMessageAt: 'DESC' },
        });
      }
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

    // GUARD anti-duplicat livrare (2026-06-26, audit conv 1392a489 / af0b5a7d / c38bcca7):
    // notifyGenerationCompleted poate fi apelat de MAI MULTE ori pentru aceeași piesă
    // (BullMQ re-procesează jobul, regenerare overwrite pe același id, auto-retry care
    // reușește etc.) → clientul primea „🎵 Melodia ta e gata!" cu ACELAȘI link /m/<id>
    // de 2-4 ori la rând. Dacă în ultimele 3 minute a fost deja livrat un song_preview
    // pentru ACEST generationId pe această conversație, NU mai trimitem încă unul.
    // Fereastra de 3 min lasă o regenerare reală (5-10 min) să anunțe varianta nouă.
    if (isOk) {
      const alreadyDelivered = await this.msg
        .createQueryBuilder('m')
        .where('m."conversationId" = :cid', { cid: conv.id })
        .andWhere(`m."messageType" = 'song_preview'`)
        .andWhere(`m.payload->>'generationId' = :gid`, { gid: generationId })
        .andWhere('m."createdAt" > :since', { since: new Date(Date.now() - 3 * 60 * 1000) })
        .getOne();
      if (alreadyDelivered) {
        return;
      }
    }

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

    // Mesaj follow-up de mulțumire/CTA — DOAR pe success, după 2 secunde delay
    // ca să nu cadă același tick cu song_preview (UX: omul citește mai întâi
    // cardul cu manea, apoi vede mesajul cald de mulțumire).
    if (isOk) {
      setTimeout(() => {
        void this.sendThankYouAfterGeneration(conv.id, conv.siteId).catch(() => undefined);
      }, 2000);
    }

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

  /**
   * Meta CAPI events din chat — fire-and-forget. Decide pe baza counter-ului de
   * mesaje user dacă-i Lead (primul), EngagedChatter (al treilea) etc.
   */
  private async fireMetaChatEvents(conv: Conversation, ctx: OwnerCtx): Promise<void> {
    try {
      const userMsgCount = await this.msg.count({
        where: { conversationId: conv.id, authorRole: 'user' },
      });
      const externalId = ctx.userId ?? ctx.guestId ?? null;
      // userAgent din ultima conexiune WS — crește EMQ pe Lead/EngagedChatter.
      const userAgent = conv.lastDevice?.userAgent ?? null;
      // Per-site CAPI — fiecare site folosește propriul pixel + token.
      const site = conv.siteId ? await this.sites.findById(conv.siteId).catch(() => null) : null;
      const baseData = {
        externalId,
        email: conv.email,
        ip: conv.lastIp,
        userAgent,
        contentName: 'Manea personalizată',
        currency: 'RON',
      };
      if (userMsgCount === 1) {
        // Primul mesaj user — Lead semnal early-funnel
        await this.metaCapi.sendEvent(
          'Lead',
          { ...baseData, value: 5, customData: { source: 'chat_first_msg' } },
          'chat',
          site,
        );
      } else if (userMsgCount === 3) {
        // Audiență warm — useri activi care vor probabil să cumpere
        await this.metaCapi.sendEvent(
          'EngagedChatter',
          { ...baseData, value: 10, customData: { msg_count: 3 } },
          'chat',
          site,
        );
      }
    } catch {
      /* silent */
    }
  }

  /**
   * Trimite un mesaj cald de mulțumire în chat la 2s după song_preview. Personal,
   * scurt, cu emoji. Variere random ca să nu pară spam pe a treia comandă a aceluiași
   * user. Mesajul e marcat ca AI-generated dar authorRole='admin' ca să apară ca
   * dialog natural în UI.
   */
  private async sendThankYouAfterGeneration(conversationId: string, siteId: string | null): Promise<void> {
    const variants = [
      'Mă bucur tare că ți-a ieșit! 🎵 Sper să le placă și celor pentru care e dedicată. Mulțumesc că ne-ai ales! ❤️',
      'Gata, mulțumim mult! ✨ Sper să-i placă tare. Dacă vrei să mai faci una pentru cineva drag, mă găsești aici. 🎶',
      'Mulțumim pentru încredere! 🙏 Aștept să-mi spui cum a reacționat când a auzit-o. ❤️',
      'Felicitări, ai un cadou super! 🎤 Mulțumim că ne-ai dat o șansă să fim parte din momentul ăsta. ❤️',
      'Mă bucur că totul a ieșit cum trebuie! 🎶 Mulțumim mult, ne vedem la următoarea manea! ✨',
    ];
    // GUARD anti-spam (2026-06-17, audit conv af0b5a7d): când se completează mai multe
    // generații pentru aceeași conversație în câteva secunde (variante/regenerări
    // duplicate), fiecare ar apela acest thank-you → clientul primea „Felicitări, ai un
    // cadou super!" de 3 ori la rând. Trimitem UN SINGUR mesaj de mulțumire per fereastră
    // de 3 minute. (Cauza rădăcină — generările duplicate — e separată, vezi audit.)
    const recentThankYou = await this.msg.findOne({
      where: {
        conversationId,
        authorRole: 'admin',
        messageType: 'text',
        aiGenerated: true,
        body: In(variants),
        createdAt: MoreThan(new Date(Date.now() - 3 * 60 * 1000)),
      },
    });
    if (recentThankYou) return;

    // Evită repetarea IDENTICĂ a ultimei mulțumiri: clientul care primește a 2-a
    // melodie (ex. încă o generare pe site, mai târziu) primea exact același text
    // („Mă bucur că totul a ieșit cum trebuie!" de 2x — 2026-06-18, audit conv
    // 40db5e6a). Exclude varianta folosită ultima dată în această conversație.
    const lastThankYou = await this.msg.findOne({
      where: {
        conversationId,
        authorRole: 'admin',
        messageType: 'text',
        aiGenerated: true,
        body: In(variants),
      },
      order: { createdAt: 'DESC' },
    });
    const pool = lastThankYou ? variants.filter((v) => v !== lastThankYou.body) : variants;
    const text = pool[Math.floor(Math.random() * pool.length)];
    const conv = await this.conv.findOne({ where: { id: conversationId } });
    if (!conv) return;
    const msg = this.msg.create({
      conversationId,
      siteId,
      authorRole: 'admin',
      authorId: null,
      body: text,
      messageType: 'text',
      aiGenerated: true,
      detectedLang: 'ro',
    });
    const saved = await this.msg.save(msg);
    await this.conv
      .createQueryBuilder()
      .update(Conversation)
      .set({ lastMessageAt: saved.createdAt, unreadByUser: () => '"unreadByUser" + 1' })
      .where('id = :id', { id: conversationId })
      .execute();
    this.gateway.emitMessage({ message: saved, conversation: conv });
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
      amount?: number; // cents — default = prețul pachetului
      currency?: string; // default site.currency
      description?: string;
      packageTier?: 'basic' | 'plus' | 'premium';
    },
  ): Promise<ChatMessage> {
    const conv = await this.getConversation(conversationId);
    if (!conv.siteId) {
      throw new ForbiddenException('Conversația nu are siteId — nu pot determina prețul/Stripe context.');
    }
    const site = await this.sites.findById(conv.siteId);
    if (!site) throw new NotFoundException('Site nu există');

    const tier = normalizeTier(opts.packageTier);
    const tierLabel = packageLabel(tier);
    const description = opts.description?.trim() || `Manea personalizată — pachet ${tierLabel}`;
    const customAmount = typeof opts.amount === 'number' && opts.amount > 0 ? Math.round(opts.amount) : undefined;
    const customCurrency = opts.currency?.toUpperCase();

    // Dedup 3 min: dacă există deja un link identic (aceeași sumă + valută) trimis în
    // ultimele 3 minute pe această conversație, refolosește-l în loc să generăm un
    // checkout Stripe + card noi (evită spam de link-uri + sesiuni inutile). 2026-06-04.
    {
      const reuseAmount = customAmount ?? packageTotalCents(tier, site.packagePricesCents ?? null);
      const reuseCurrency = (customCurrency ?? site.currency).toUpperCase();
      const existing = await this.msg
        .createQueryBuilder('m')
        .where('m."conversationId" = :cid', { cid: conv.id })
        .andWhere(`m."messageType" = 'payment_link'`)
        .andWhere(`m."createdAt" > now() - interval '3 minutes'`)
        .andWhere(`(m.payload->>'amount') = :amt`, { amt: String(reuseAmount) })
        .andWhere(`UPPER(COALESCE(m.payload->>'currency','')) = :cur`, { cur: reuseCurrency })
        .andWhere(`m.payload->>'checkoutUrl' IS NOT NULL`)
        .orderBy('m."createdAt"', 'DESC')
        .getOne();
      if (existing) {
        // Link identic deja trimis în ultimele 3 min — îl refolosim (emit din nou
        // ca să apară instant la admin, dar fără checkout/card nou).
        this.gateway.emitMessage({ message: existing, conversation: conv });
        return existing;
      }
    }

    // Creează Checkout Session prin PaymentsService — propagă override-urile din
    // modal (admin poate alege liber suma/valuta/descrierea, NU se folosește site pricing).
    const checkout = await this.payments.createCheckoutSession({
      userId: conv.userId,
      guestId: conv.guestId,
      packageTier: tier,
      email: conv.email ?? undefined,
      site,
      overrideAmount: customAmount,
      overrideCurrency: customCurrency,
      overrideProductName: description,
      // IP-ul real al cumpărătorului (persistat la WS connect) — permite atribuirea
      // pe sursă a plăților din chat, care altfel n-au cum să fie legate de o
      // sesiune analytics (link generat server-side, fără request browser).
      ipAddress: conv.lastIp ?? undefined,
    });

    // Computăm amount/currency efective pentru payload-ul mesajului (ce vede userul în card)
    const amount = customAmount ?? packageTotalCents(tier, site.packagePricesCents ?? null);
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
        packageTier: tier,
        packageLabel: tierLabel,
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
    const reactivating = c.aiMode === 'manual' && mode !== 'manual';
    c.aiMode = mode;
    if (reactivating) {
      // Adminul re-pornește AI-ul → fereastra limitei de mesaje repornește de la 0
      // (altfel capul s-ar re-declanșa instant pe conversațiile lungi — bug istoric).
      c.aiCapResetAt = new Date();
      c.aiFollowupCount = 0;
    }
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

  /**
   * Câmpuri editabile din formularul Generator de pe site. Cheile coincid EXACT
   * cu `Data` din apps/web/components/Generator.tsx, ca patch-ul să se aplice
   * direct prin `upd(field, value)` pe client. Doar text liber (ce poate fi scris
   * greșit) — selecțiile (stil/voce/ocazie/pachet) rămân read-only în admin.
   */
  private static readonly FORM_FIELD_CAPS: Record<string, number> = {
    name: 60,
    dedic: 60,
    msg: 1200,
    customLyrics: 4000,
    // Selecții — ID-uri scurte. Pachetul (packageTier) e intenționat exclus:
    // owner-ul vrea editabile doar stil/ocazie/voce + textele, nu pachetul.
    style: 64,
    occ: 64,
    voice: 64,
  };

  /**
   * Adminul corectează din chat un câmp completat de client în formularul Generator
   * (ex. un nume scris greșit). Persistăm pe `conversation.lastFormState` (fallback DB
   * + context Irina) și împingem patch-ul la client prin WS — dacă userul e online pe
   * formular, input-ul se actualizează live. Returnează dacă clientul e online acum.
   */
  async patchGeneratorForm(
    conversationId: string,
    field: string,
    value: string | number | boolean,
  ): Promise<{ ok: true; online: boolean; field: string; value: string }> {
    const cap = ChatService.FORM_FIELD_CAPS[field];
    if (cap == null) throw new BadRequestException(`Câmp needitabil: ${field}`);
    const v = (typeof value === 'string' ? value : String(value ?? '')).slice(0, cap);
    const c = await this.getConversation(conversationId);
    const prev = c.lastFormState;
    const nextForm: GeneratorFormState = {
      step: prev?.step ?? 0,
      stepName: prev?.stepName,
      totalSteps: prev?.totalSteps,
      data: { ...(prev?.data ?? {}), [field]: v },
      options: prev?.options,
      generationId: prev?.generationId ?? null,
      updatedAt: new Date().toISOString(),
    };
    await this.conv
      .createQueryBuilder()
      .update(Conversation)
      .set({ lastFormState: nextForm })
      .where('id = :id', { id: conversationId })
      .execute();
    const online = this.gateway.patchFormState(
      { userId: c.userId, guestId: c.guestId },
      { [field]: v },
    );
    return { ok: true, online, field, value: v };
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

  // ============== Email pe sesiune, favorite, note, AI summarize ==============

  /**
   * Atribuie email pe sesiunea curentă (guest sau user) — folosit când adminul
   * obține emailul prin chat și vrea să-l seteze direct fără să cerem userului.
   * Pentru guest setează și pe GuestSession. Pentru user logat, doar pe conv
   * (nu modificăm email-ul user-ului — ar fi nesigur fără verificare).
   */
  async setConversationEmail(conversationId: string, email: string): Promise<Conversation> {
    const cleaned = email.trim().toLowerCase();
    if (!cleaned.includes('@') || cleaned.length < 5) {
      throw new ForbiddenException('Email invalid');
    }
    const conv = await this.getConversation(conversationId);
    conv.email = cleaned;
    if (conv.guestId) {
      try {
        const { GuestSessionsService } = await import('../guest-sessions/guest-sessions.service');
        const guests = this.moduleRef.get(GuestSessionsService, { strict: false });
        await guests.setEmail(conv.guestId, cleaned);
      } catch {
        /* best-effort */
      }
    }
    const saved = await this.conv.save(conv);
    this.gateway.emitConversationUpdated(saved);
    return saved;
  }

  /** Marchează conversația ca favorită (sau o scoate din favorite). */
  async setFavorite(conversationId: string, favorite: boolean): Promise<Conversation> {
    const conv = await this.getConversation(conversationId);
    conv.isFavorite = !!favorite;
    const saved = await this.conv.save(conv);
    this.gateway.emitConversationUpdated(saved);
    return saved;
  }

  /** Setează nota privată admin pe conversație (null pentru a o șterge). */
  async setAdminNote(conversationId: string, note: string | null): Promise<Conversation> {
    const conv = await this.getConversation(conversationId);
    conv.adminNote = note?.trim() || null;
    const saved = await this.conv.save(conv);
    this.gateway.emitConversationUpdated(saved);
    return saved;
  }

  /**
   * Trimite întreaga conversație la OpenAI ca să extragă datele pentru wizard
   * (style, occasion, recipientName, message, voiceArtist, dedication, etc.).
   * Returnează un obiect parțial — câmpurile lipsă sunt null/undefined.
   * Folosit pentru pre-completarea modalurilor de generare versuri / demo + plată.
   */
  async summarizeOrderFromConversation(conversationId: string): Promise<{
    style: string | null;
    occasion: string | null;
    recipientName: string | null;
    message: string | null;
    voiceArtist: string | null;
    dedication: string | null;
    packageTier: 'basic' | 'plus' | 'premium' | null;
    email: string | null;
    customLyrics: string | null;
    summary: string;
  }> {
    const conv = await this.getConversation(conversationId);
    const msgs = await this.msg.find({
      where: { conversationId: conv.id, deletedAt: IsNull() },
      order: { createdAt: 'ASC' },
      take: 200,
    });
    const transcript = msgs
      .filter((m) => m.messageType !== 'ai_suggestion' && m.messageType !== 'system')
      .map((m) => `[${m.authorRole.toUpperCase()}] ${m.body}`)
      .join('\n');

    if (!transcript.trim()) {
      return {
        style: null,
        occasion: null,
        recipientName: null,
        message: null,
        voiceArtist: null,
        dedication: null,
        packageTier: null,
        email: conv.email ?? null,
        customLyrics: null,
        summary: 'Conversație goală — nu sunt date de extras.',
      };
    }

    const STYLES = [
      'Clasică de pahar', 'Modernă', 'Orientală', 'Cu trompetă', 'De jale',
      'Comercială', 'De opulență', 'De iubire', 'Tallava', 'Kuchek', 'Trapanele',
    ];
    const OCCASIONS = [
      'Zi de naștere', 'Nuntă', 'Botez', 'Cumătrie', 'Aniversare cuplu',
      'Pentru șef', 'Declarație', 'Roast prieten', 'Naș/fin', 'Înmormântare',
      'Motivațională', 'Altă ocazie',
    ];

    const system = `Ești un asistent care extrage datele pentru o comandă de manea personalizată dintr-o conversație de chat între admin și client.

Citește întregul transcript și returnează DOAR un JSON valid cu următoarele câmpuri (toate opționale — pune null dacă info nu apare):
{
  "style": null | "Clasică de pahar" | "Modernă" | "Orientală" | "Cu trompetă" | "De jale" | "Comercială" | "De opulență" | "De iubire" | "Tallava" | "Kuchek" | "Trapanele",
  "occasion": null | "Zi de naștere" | "Nuntă" | "Botez" | "Cumătrie" | "Aniversare cuplu" | "Pentru șef" | "Declarație" | "Roast prieten" | "Naș/fin" | "Înmormântare" | "Motivațională" | "Altă ocazie",
  "recipientName": null | "<numele beneficiarului, scurt>",
  "message": null | "<mesajul/dedicația sentimentală, 1-3 propoziții>",
  "voiceArtist": null | "<preferință voce, ex. 'masculină', 'feminină', 'gravă'>",
  "dedication": null | "<de la cine, ex. 'de la Andrei și echipa'>",
  "packageTier": null | "basic" | "plus" | "premium",
  "email": null | "<emailul clientului dacă apare>",
  "customLyrics": null | "<versurile complete dacă userul le-a furnizat explicit>",
  "summary": "<1-2 propoziții rezumat al conversației pentru context>"
}

Reguli:
- style trebuie să fie EXACT unul din valorile listate (fuzzy match — "clasica" → "Clasică de pahar")
- occasion la fel — EXACT unul din valorile listate
- recipientName, message, dedication trebuie să fie ce a furnizat clientul, nu inventat
- packageTier: "premium" dacă userul a cerut videoclip/colaj/pagină premium; "plus" dacă a cerut imagini social-media; altfel "basic" sau null
- Dacă nu ești sigur, pune null
- NU explica, NU adăuga text înainte/după JSON, doar JSON pur`;

    try {
      const r = await this.openai.json<{
        style: string | null;
        occasion: string | null;
        recipientName: string | null;
        message: string | null;
        voiceArtist: string | null;
        dedication: string | null;
        packageTier: 'basic' | 'plus' | 'premium' | null;
        email: string | null;
        customLyrics: string | null;
        summary: string;
      }>({
        system,
        user: `Stiluri valide: ${STYLES.join(', ')}\nOcazii valide: ${OCCASIONS.join(', ')}\n\nTranscript:\n${transcript}`,
        temperature: 0.2,
        maxTokens: 800,
      });
      const d = r.data ?? {};
      return {
        style: d.style ?? null,
        occasion: d.occasion ?? null,
        recipientName: d.recipientName ?? null,
        message: d.message ?? null,
        voiceArtist: d.voiceArtist ?? null,
        dedication: d.dedication ?? null,
        packageTier: (d.packageTier === 'basic' || d.packageTier === 'plus' || d.packageTier === 'premium') ? d.packageTier : null,
        email: d.email ?? conv.email ?? null,
        customLyrics: d.customLyrics ?? null,
        summary: d.summary ?? 'Rezumat indisponibil.',
      };
    } catch (e) {
      throw new ForbiddenException(`Eșec extragere AI: ${(e as Error).message}`);
    }
  }

  // ============== Edit / Delete mesaje (admin) ==============

  /**
   * Editează body-ul unui mesaj admin existent. Doar mesaje text — nu se atinge
   * payload-ul (payment_link, song_preview etc.). Emite WS update live.
   */
  async editMessage(
    messageId: string,
    newBody: string,
  ): Promise<ChatMessage> {
    const m = await this.msg.findOne({ where: { id: messageId } });
    if (!m) throw new NotFoundException('Mesajul nu există');
    if (m.deletedAt) throw new ForbiddenException('Mesajul a fost șters');
    const trimmed = newBody.trim();
    if (!trimmed) throw new ForbiddenException('Text gol');
    m.body = trimmed;
    m.editedAt = new Date();
    const saved = await this.msg.save(m);
    const conv = await this.conv.findOne({ where: { id: m.conversationId } });
    if (conv) {
      this.gateway.emitMessageUpdated(saved, conv);
    }
    return saved;
  }

  /**
   * Soft-delete mesaj. Setează deletedAt + golește body-ul vizibil userului.
   * Emite WS — clientul/adminul îl scot din listă instant.
   */
  async deleteMessage(messageId: string): Promise<{ ok: true }> {
    const m = await this.msg.findOne({ where: { id: messageId } });
    if (!m) throw new NotFoundException('Mesajul nu există');
    if (m.deletedAt) return { ok: true };
    m.deletedAt = new Date();
    const saved = await this.msg.save(m);
    const conv = await this.conv.findOne({ where: { id: m.conversationId } });
    if (conv) {
      this.gateway.emitMessageDeleted(saved.id, conv);
    }
    return { ok: true };
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
