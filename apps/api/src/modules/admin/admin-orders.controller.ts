import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AdminGuard } from '../../common/admin.guard';
import { Generation } from '../generations/generation.entity';
import { Payment } from '../payments/payment.entity';
import { User } from '../users/user.entity';
import { GuestSession } from '../guest-sessions/guest-session.entity';
import { Site } from '../sites/site.entity';
import { Conversation } from '../chat/conversation.entity';
import { ChatMessage } from '../chat/message.entity';
import { OutboundEmail } from '../outbound-email/outbound-email.entity';
import { SunoLog } from '../suno/suno-log.entity';
import { LyricsLog } from '../lyrics/lyrics-log.entity';
import { AiToolCall } from '../ai-chat/ai-tool-call.entity';
import { AnalyticsSession } from '../analytics/analytics-session.entity';
import { AnalyticsEvent } from '../analytics/analytics-event.entity';

/**
 * Returnează ABSOLUT TOT ce știm despre o comandă: plata, generation,
 * conversația din chat (cu toate mesajele), toate apelurile către Suno,
 * toate apelurile către OpenAI (lyrics writer + critic), toate mailurile
 * trimise, toate AI tool calls, sursa de tranzacție (campanie/device/geo),
 * timeline cronologic și KPI-uri de timing.
 *
 * Acceptă fie paymentId, fie generationId (le legăm cap-coadă).
 */
@UseGuards(AdminGuard)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(
    @InjectRepository(Generation) private readonly generations: Repository<Generation>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(GuestSession) private readonly guests: Repository<GuestSession>,
    @InjectRepository(Site) private readonly sites: Repository<Site>,
    @InjectRepository(Conversation) private readonly conversations: Repository<Conversation>,
    @InjectRepository(ChatMessage) private readonly chatMessages: Repository<ChatMessage>,
    @InjectRepository(OutboundEmail) private readonly emails: Repository<OutboundEmail>,
    @InjectRepository(SunoLog) private readonly sunoLogs: Repository<SunoLog>,
    @InjectRepository(LyricsLog) private readonly lyricsLogs: Repository<LyricsLog>,
    @InjectRepository(AiToolCall) private readonly aiToolCalls: Repository<AiToolCall>,
    @InjectRepository(AnalyticsSession)
    private readonly analyticsSessions: Repository<AnalyticsSession>,
    @InjectRepository(AnalyticsEvent)
    private readonly analyticsEvents: Repository<AnalyticsEvent>,
  ) {}

  @Get(':id')
  async getOrder(@Param('id') id: string) {
    // ID-ul poate fi paymentId SAU generationId — încercăm ambele.
    let payment = await this.payments.findOne({ where: { id } });
    let generation: Generation | null = null;
    if (payment) {
      generation = await this.generations.findOne({ where: { paymentId: payment.id } });
    } else {
      generation = await this.generations.findOne({ where: { id } });
      if (generation?.paymentId) {
        payment = await this.payments.findOne({ where: { id: generation.paymentId } });
      }
    }
    if (!payment && !generation) {
      throw new NotFoundException('Order not found');
    }

    const ownerUserId = generation?.ownerUserId ?? payment?.userId ?? null;
    const ownerGuestId = generation?.ownerGuestId ?? payment?.guestId ?? null;
    const siteId = generation?.siteId ?? payment?.siteId ?? null;

    const [user, guest, site] = await Promise.all([
      ownerUserId ? this.users.findOne({ where: { id: ownerUserId } }) : null,
      ownerGuestId ? this.guests.findOne({ where: { id: ownerGuestId } }) : null,
      siteId ? this.sites.findOne({ where: { id: siteId } }) : null,
    ]);

    const ownerEmail = user?.email ?? guest?.email ?? null;

    // Mailuri: prin relatedId == generationId || paymentId. Plus fallback la
    // toate mailurile către ownerEmail în ±2 zile de generation (când mailer-ul
    // a omis relatedId — istoric).
    const relatedIds: string[] = [];
    if (generation) relatedIds.push(generation.id);
    if (payment) relatedIds.push(payment.id);
    let outboundEmails: OutboundEmail[] = [];
    if (relatedIds.length) {
      outboundEmails = await this.emails.find({
        where: { relatedId: In(relatedIds) },
        order: { createdAt: 'ASC' },
      });
    }
    if (ownerEmail && generation) {
      const t = generation.createdAt;
      const from = new Date(t.getTime() - 2 * 24 * 3600 * 1000);
      const to = new Date(t.getTime() + 5 * 24 * 3600 * 1000);
      const extra = await this.emails
        .createQueryBuilder('e')
        .where('e.to = :to', { to: ownerEmail })
        .andWhere('e.createdAt BETWEEN :from AND :to', { from, to })
        .orderBy('e.createdAt', 'ASC')
        .getMany();
      // Merge fără duplicat
      const seen = new Set(outboundEmails.map((x) => x.id));
      for (const e of extra) if (!seen.has(e.id)) outboundEmails.push(e);
      outboundEmails.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      );
    }

    // Suno logs — toate pentru această generation
    const sunoLogs = generation
      ? await this.sunoLogs.find({
          where: { generationId: generation.id },
          order: { createdAt: 'ASC' },
        })
      : [];

    // Lyrics logs (OpenAI writer + critic) — toate pentru această generation
    const lyricsLogs = generation
      ? await this.lyricsLogs.find({
          where: { generationId: generation.id },
          order: { createdAt: 'ASC' },
        })
      : [];

    // Chat conversation — căutăm prin (user/guest) + siteId. Acoperă cazul când
    // chat-ul a generat comanda prin wizard, dar și cazul când customer-ul
    // a vorbit pe chat și apoi a comandat din site.
    let conversation: Conversation | null = null;
    if (ownerUserId) {
      conversation = await this.conversations.findOne({
        where: { userId: ownerUserId },
        order: { updatedAt: 'DESC' },
      });
    }
    if (!conversation && ownerGuestId) {
      conversation = await this.conversations.findOne({
        where: { guestId: ownerGuestId },
        order: { updatedAt: 'DESC' },
      });
    }

    let chatMessages: ChatMessage[] = [];
    let aiToolCalls: AiToolCall[] = [];
    if (conversation) {
      chatMessages = await this.chatMessages.find({
        where: { conversationId: conversation.id },
        order: { createdAt: 'ASC' },
      });
      aiToolCalls = await this.aiToolCalls.find({
        where: { conversationId: conversation.id },
        order: { createdAt: 'ASC' },
      });
    }

    // Analytics: cea mai recentă sesiune asociată user/guest + eventurile
    // purchase_init / purchase_success care leagă paymentId.
    let analyticsSession: AnalyticsSession | null = null;
    if (ownerGuestId || ownerUserId) {
      const qb = this.analyticsSessions
        .createQueryBuilder('s')
        .orderBy('s.lastActivityAt', 'DESC')
        .limit(1);
      if (ownerUserId) qb.andWhere('s."userId" = :uid', { uid: ownerUserId });
      else if (ownerGuestId) qb.andWhere('s."guestId" = :gid', { gid: ownerGuestId });
      analyticsSession = await qb.getOne();
    }

    let analyticsEvents: AnalyticsEvent[] = [];
    if (payment) {
      // Evenimente purchase legate prin paymentId în props.transaction_id
      const qb = this.analyticsEvents
        .createQueryBuilder('e')
        .where(`(e.props->>'transaction_id') = :pid OR e.eventId = :pid`, {
          pid: payment.id,
        });
      if (generation) {
        qb.orWhere(`(e.props->>'content_id') = :gid OR e.eventId = :gid`, {
          gid: generation.id,
        });
      }
      analyticsEvents = await qb.orderBy('e.createdAt', 'ASC').limit(50).getMany();
    }

    // Timeline cronologic — toate evenimentele consolidate într-un singur array.
    type TimelineEvent = {
      at: string;
      kind: string;
      title: string;
      detail?: string;
      data?: Record<string, unknown>;
    };
    const timeline: TimelineEvent[] = [];

    if (generation) {
      timeline.push({
        at: generation.createdAt.toISOString(),
        kind: 'order_created',
        title: `Comandă creată (${generation.type})`,
        detail: `${generation.recipientName} · ${generation.style} · ${generation.voiceArtist}`,
      });
    }
    if (payment) {
      timeline.push({
        at: payment.createdAt.toISOString(),
        kind: 'payment_initiated',
        title: `Plată inițiată (${payment.provider})`,
        detail: `${(payment.amount / 100).toFixed(2)} ${payment.currency} · ${payment.status}`,
      });
      if (payment.status === 'paid' || payment.status === 'refunded') {
        timeline.push({
          at: payment.updatedAt.toISOString(),
          kind: payment.status === 'paid' ? 'payment_paid' : 'payment_refunded',
          title: payment.status === 'paid' ? '✓ Plată confirmată' : '↩ Refund',
          detail: `${(payment.amount / 100).toFixed(2)} ${payment.currency}`,
        });
      }
      if (payment.status === 'failed') {
        timeline.push({
          at: payment.updatedAt.toISOString(),
          kind: 'payment_failed',
          title: '✗ Plată eșuată',
          detail: payment.failureReason ?? payment.failureCode ?? 'necunoscut',
        });
      }
    }
    for (const l of lyricsLogs) {
      timeline.push({
        at: l.createdAt.toISOString(),
        kind: `lyrics_${l.stage}_${l.outcome}`,
        title: `OpenAI · ${l.stage} · ${l.outcome}`,
        detail: `${l.model ?? '-'} · ${l.tokensTotal ?? 0} tokens · ${l.durationMs ?? 0}ms`,
      });
    }
    for (const s of sunoLogs) {
      timeline.push({
        at: s.createdAt.toISOString(),
        kind: `suno_${s.outcome}`,
        title: `Suno · ${s.requestType} · ${s.outcome}${s.providerStatus ? ` (${s.providerStatus})` : ''}`,
        detail: s.errorMessage ?? `taskId=${s.taskId ?? '-'} · ${s.costCredits} credits`,
      });
    }
    for (const e of outboundEmails) {
      timeline.push({
        at: e.createdAt.toISOString(),
        kind: `email_${e.status}`,
        title: `📧 Email ${e.status} · ${e.kind ?? 'unknown'}`,
        detail: `${e.subject} → ${e.to}`,
      });
    }
    if (conversation) {
      // Mesajele relevante: doar primele 3 și ultimele 3 ca să nu inundăm
      // timeline-ul (chat poate avea zeci de mesaje).
      const slim = chatMessages.length > 6
        ? [...chatMessages.slice(0, 3), ...chatMessages.slice(-3)]
        : chatMessages;
      for (const m of slim) {
        timeline.push({
          at: m.createdAt.toISOString(),
          kind: `chat_${m.authorRole}`,
          title: `💬 ${m.authorRole}${m.aiGenerated ? ' (AI)' : ''}`,
          detail: m.body.slice(0, 120),
        });
      }
    }
    if (generation?.completedAt) {
      timeline.push({
        at: generation.completedAt.toISOString(),
        kind: `generation_${generation.status}`,
        title:
          generation.status === 'succeeded'
            ? '✓ Generation finalizată'
            : generation.status === 'failed'
              ? '✗ Generation eșuată'
              : `Generation ${generation.status}`,
        detail: generation.error ?? undefined,
      });
    }
    if (generation?.nextRetryAt) {
      timeline.push({
        at: generation.nextRetryAt.toISOString(),
        kind: 'auto_retry_scheduled',
        title: '⏱ Auto-retry programat',
        detail: `Încercarea #${(generation.retryCount ?? 0) + 1}`,
      });
    }

    timeline.sort((a, b) => a.at.localeCompare(b.at));

    // Timings — durate cheie ale comenzii.
    const timings: Record<string, number | null> = {
      orderToPaymentMs:
        generation && payment
          ? payment.createdAt.getTime() - generation.createdAt.getTime()
          : null,
      paymentInitToPaidMs:
        payment && payment.status === 'paid'
          ? payment.updatedAt.getTime() - payment.createdAt.getTime()
          : null,
      orderToCompletedMs:
        generation?.completedAt
          ? generation.completedAt.getTime() - generation.createdAt.getTime()
          : null,
      lyricsTotalMs: lyricsLogs.reduce(
        (acc, l) => acc + (l.durationMs ?? 0),
        0,
      ) || null,
    };

    return {
      payment: payment
        ? {
            id: payment.id,
            siteId: payment.siteId,
            provider: payment.provider,
            providerSessionId: payment.providerSessionId,
            amount: payment.amount,
            currency: payment.currency,
            status: payment.status,
            amountRonCents: payment.amountRonCents,
            exchangeRateToRon: payment.exchangeRateToRon,
            failureReason: payment.failureReason,
            failureCode: payment.failureCode,
            userId: payment.userId,
            guestId: payment.guestId,
            openReplaySessionId: payment.openReplaySessionId,
            createdAt: payment.createdAt,
            updatedAt: payment.updatedAt,
          }
        : null,
      generation: generation
        ? {
            id: generation.id,
            siteId: generation.siteId,
            type: generation.type,
            status: generation.status,
            durationSec: generation.durationSec,
            style: generation.style,
            occasion: generation.occasion,
            recipientName: generation.recipientName,
            recipientGender: generation.recipientGender,
            dedicatorName: generation.dedicatorName,
            message: generation.message,
            dedication: generation.dedication,
            voiceArtist: generation.voiceArtist,
            customLyrics: generation.customLyrics,
            lyricsDraft: generation.lyricsDraft,
            lyrics: generation.lyrics,
            tipAmount: generation.tipAmount,
            premium: generation.premium,
            paymentId: generation.paymentId,
            paidUnlocked: generation.paidUnlocked,
            audioUrl: generation.audioUrl,
            bonusAudioUrl: generation.bonusAudioUrl,
            demoAudioUrl: generation.demoAudioUrl,
            demoBonusAudioUrl: generation.demoBonusAudioUrl,
            coverUrl: generation.coverUrl,
            tracks: generation.tracks,
            providerJobId: generation.providerJobId,
            retryCount: generation.retryCount,
            nextRetryAt: generation.nextRetryAt,
            lastRetryAt: generation.lastRetryAt,
            error: generation.error,
            viewCount: generation.viewCount,
            locale: generation.locale,
            inferredFromChat: generation.inferredFromChat,
            inferenceMeta: generation.inferenceMeta,
            openReplaySessionId: generation.openReplaySessionId,
            createdAt: generation.createdAt,
            completedAt: generation.completedAt,
          }
        : null,
      owner: {
        kind: user ? 'user' : guest ? 'guest' : 'anonymous',
        id: user?.id ?? guest?.id ?? null,
        email: ownerEmail,
        name: user?.name ?? null,
        role: user?.role ?? null,
        freeDemoUsed: user?.freeDemoUsed ?? guest?.freeDemoUsed ?? null,
        createdAt: user?.createdAt ?? guest?.createdAt ?? null,
      },
      site: site
        ? {
            id: site.id,
            name: site.name,
            domain: site.domain,
            slug: site.slug,
            locale: site.locale,
            currency: site.currency,
          }
        : null,
      analytics: {
        session: analyticsSession
          ? {
              sessionKey: analyticsSession.sessionKey,
              country: analyticsSession.country,
              countryName: analyticsSession.countryName,
              city: analyticsSession.city,
              ip: analyticsSession.ip,
              device: analyticsSession.device,
              browserName: analyticsSession.browserName,
              browserVersion: analyticsSession.browserVersion,
              osName: analyticsSession.osName,
              source: analyticsSession.source,
              medium: analyticsSession.medium,
              campaign: analyticsSession.campaign,
              referrer: analyticsSession.referrer,
              landingPath: analyticsSession.landingPath,
              pageViews: analyticsSession.pageViews,
              durationSec: analyticsSession.durationSec,
              isBot: analyticsSession.isBot,
            }
          : null,
        events: analyticsEvents.map((e) => ({
          id: e.id,
          type: e.type,
          createdAt: e.createdAt,
          props: e.props,
        })),
      },
      sunoLogs: sunoLogs.map((s) => ({
        id: s.id,
        requestType: s.requestType,
        endpoint: s.endpoint,
        responseStatus: s.responseStatus,
        providerStatus: s.providerStatus,
        outcome: s.outcome,
        taskId: s.taskId,
        errorMessage: s.errorMessage,
        costCredits: s.costCredits,
        requestBody: s.requestBody,
        responseBody: s.responseBody,
        createdAt: s.createdAt,
        completedAt: s.completedAt,
      })),
      lyricsLogs: lyricsLogs.map((l) => ({
        id: l.id,
        stage: l.stage,
        model: l.model,
        locale: l.locale,
        outcome: l.outcome,
        responseStatus: l.responseStatus,
        responseContent: l.responseContent,
        systemPrompt: l.systemPrompt,
        userPrompt: l.userPrompt,
        tokensPrompt: l.tokensPrompt,
        tokensCompletion: l.tokensCompletion,
        tokensTotal: l.tokensTotal,
        durationMs: l.durationMs,
        errorMessage: l.errorMessage,
        createdAt: l.createdAt,
        completedAt: l.completedAt,
      })),
      outboundEmails: outboundEmails.map((e) => ({
        id: e.id,
        kind: e.kind,
        status: e.status,
        to: e.to,
        fromAddress: e.fromAddress,
        subject: e.subject,
        text: e.text,
        html: e.html,
        provider: e.provider,
        providerMessageId: e.providerMessageId,
        errorMessage: e.errorMessage,
        relatedId: e.relatedId,
        createdAt: e.createdAt,
        finalizedAt: e.finalizedAt,
      })),
      chat: conversation
        ? {
            conversation: {
              id: conversation.id,
              subject: conversation.subject,
              status: conversation.status,
              aiMode: conversation.aiMode,
              wizardState: conversation.wizardState,
              assignedAdminEmail: conversation.assignedAdminEmail,
              greetingSentAt: conversation.greetingSentAt,
              createdAt: conversation.createdAt,
              updatedAt: conversation.updatedAt,
              lastMessageAt: conversation.lastMessageAt,
            },
            messages: chatMessages.map((m) => ({
              id: m.id,
              authorRole: m.authorRole,
              body: m.body,
              detectedLang: m.detectedLang,
              bodyRo: m.bodyRo,
              messageType: m.messageType,
              payload: m.payload,
              attachmentUrl: m.attachmentUrl,
              attachmentName: m.attachmentName,
              attachmentMime: m.attachmentMime,
              deliveredAt: m.deliveredAt,
              readAt: m.readAt,
              aiGenerated: m.aiGenerated,
              createdAt: m.createdAt,
            })),
            aiToolCalls: aiToolCalls.map((t) => ({
              id: t.id,
              toolName: t.toolName,
              aiMode: t.aiMode,
              model: t.model,
              totalPromptTokens: t.totalPromptTokens,
              totalCompletionTokens: t.totalCompletionTokens,
              requiredApproval: t.requiredApproval,
              input: t.input,
              output: t.output,
              error: t.error,
              createdAt: t.createdAt,
            })),
          }
        : null,
      timeline,
      timings,
    };
  }
}
