import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull } from 'typeorm';
import { OpenAiClient, type ChatMessage as OAIMsg, type ToolDef, type ToolHandler } from '../../openai/openai.client';
import { SettingsService } from '../settings/settings.service';
import { KbService } from '../kb/kb.service';
import { SitesService } from '../sites/sites.service';
import { ChatGateway } from '../chat/chat.gateway';
import { Conversation } from '../chat/conversation.entity';
import { ChatMessage, ChatMessagePayload } from '../chat/message.entity';
import { PaymentsService } from '../payments/payments.service';
import { AiMemory } from './ai-memory.entity';
import { AiToolCall } from './ai-tool-call.entity';

@Injectable()
export class AIChatAgentService {
  private readonly logger = new Logger('AIChatAgent');

  constructor(
    @InjectRepository(Conversation) private readonly conv: Repository<Conversation>,
    @InjectRepository(ChatMessage) private readonly msg: Repository<ChatMessage>,
    @InjectRepository(AiMemory) private readonly memory: Repository<AiMemory>,
    @InjectRepository(AiToolCall) private readonly audit: Repository<AiToolCall>,
    private readonly openai: OpenAiClient,
    private readonly settings: SettingsService,
    private readonly kb: KbService,
    private readonly sites: SitesService,
    private readonly payments: PaymentsService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly gateway: ChatGateway,
  ) {}

  /**
   * Apelat după ce userul trimite un mesaj nou. Non-blocking — apelat cu void.
   * Verifică aiMode + dispatch agent run.
   */
  async maybeRun(conversationId: string, userMessageId: string): Promise<void> {
    const conv = await this.conv.findOne({ where: { id: conversationId } });
    if (!conv) return;
    if (conv.aiMode === 'manual') return;
    try {
      await this.runAgent(conv, userMessageId);
    } catch (e) {
      this.logger.warn(`agent failed for conv=${conversationId.slice(0, 8)}: ${(e as Error).message}`);
    }
  }

  /**
   * Public — folosit de cron-ul proactive sau de admin pentru a forța AI să răspundă
   * (ex. „regenerează sugestia"). Nu cere un trigger message specific.
   */
  async runFor(conversationId: string, triggerMessageId: string | null = null): Promise<void> {
    const conv = await this.conv.findOne({ where: { id: conversationId } });
    if (!conv) return;
    await this.runAgent(conv, triggerMessageId);
  }

  private async runAgent(conv: Conversation, userMessageId: string | null): Promise<void> {
    const apiKey = await this.settings.get('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.warn(`skip AI run — OPENAI_API_KEY missing for conv=${conv.id.slice(0, 8)}`);
      return;
    }

    const history = await this.msg.find({
      where: { conversationId: conv.id },
      order: { createdAt: 'ASC' },
      take: 50,
    });
    const last20 = history.slice(-20);

    const site = conv.siteId ? await this.sites.findById(conv.siteId) : null;
    const memoryFacts = await this.loadActiveMemory(conv.siteId);
    const sysPrompt = await this.buildSystemPrompt(site, memoryFacts);

    const messages: OAIMsg[] = [
      { role: 'system', content: sysPrompt },
      ...last20
        // Skip ai_suggestion + system messages din context — sunt noise pentru AI
        .filter((m) => m.messageType !== 'ai_suggestion' && m.messageType !== 'system')
        .map((m): OAIMsg => ({
          role: m.authorRole === 'admin' ? 'assistant' : 'user',
          content: m.body,
        })),
    ];

    const ctx: AgentCtx = {
      conv,
      userMessageId,
      mode: conv.aiMode,
      suggestionMsgId: null,
      sentRealMessages: 0,
      escalated: false,
      paymentLinkSent: false,
      // settings flags pentru approval gates
      requireApprovalForPayment:
        (await this.settings.get('AI_CHAT_REQUIRE_APPROVAL_FOR_PAYMENT')).toLowerCase() !== 'false',
    };

    const tools = this.toolDefinitions();
    const toolHandlers = this.toolHandlers(ctx);

    const tempStr = await this.settings.get('AI_CHAT_TEMPERATURE');
    const temperature = tempStr ? parseFloat(tempStr) : 0.4;

    const startedAt = Date.now();
    const result = await this.openai.chatWithTools({
      messages,
      tools,
      toolHandlers,
      temperature: isFinite(temperature) ? temperature : 0.4,
      maxIterations: 6,
      maxTokens: 1000,
    });
    const durationMs = Date.now() - startedAt;

    this.logger.log(
      `agent done conv=${conv.id.slice(0, 8)} mode=${conv.aiMode} iter=${result.iterations} ` +
      `tools=${result.toolCalls.map((t) => t.request.name).join(',')} ` +
      `model=${result.model} tokens=${result.usage?.prompt ?? 0}/${result.usage?.completion ?? 0} ` +
      `dur=${durationMs}ms`,
    );

    // Persistă audit per tool call
    await this.persistAudit({
      ctx,
      toolCalls: result.toolCalls,
      model: result.model,
      tokensIn: result.usage?.prompt ?? null,
      tokensOut: result.usage?.completion ?? null,
    });

    // Bump usage count pe memory facts folosite (toate aici — proxy)
    if (memoryFacts.length > 0) {
      await this.memory
        .createQueryBuilder()
        .update(AiMemory)
        .set({ usageCount: () => '"usageCount" + 1' })
        .where('id IN (:...ids)', { ids: memoryFacts.map((m) => m.id) })
        .execute()
        .catch(() => {});
    }

    if (result.toolCalls.length === 0 && result.finalContent) {
      // AI a răspuns fără tool — fallback
      await this.handleSendMessage(ctx, result.finalContent);
    }
  }

  /** Top memory facts approved, sortat după utilitate (usageCount). */
  private async loadActiveMemory(siteId: string | null): Promise<AiMemory[]> {
    const qb = this.memory
      .createQueryBuilder('m')
      .where('m.approved = true')
      .orderBy('m."usageCount"', 'DESC')
      .addOrderBy('m."createdAt"', 'DESC')
      .take(12);
    if (siteId) {
      qb.andWhere('(m.siteId = :siteId OR m.siteId IS NULL)', { siteId });
    } else {
      qb.andWhere('m.siteId IS NULL');
    }
    return qb.getMany();
  }

  private async buildSystemPrompt(site: Awaited<ReturnType<SitesService['findById']>>, memory: AiMemory[]): Promise<string> {
    const override = (await this.settings.get('AI_CHAT_SYSTEM_PROMPT')).trim();
    if (override) return this.appendMemoryAndContacts(override, memory, site);

    const brand = site?.name ?? 'Manele Cadou';
    const tagline = site?.brand?.tagline ?? '';
    const locale = site?.locale ?? 'ro';
    const price = site ? `${(site.basePriceCents / 100).toFixed(2)} ${site.currency}` : '49.99 RON';

    const basePrompt = `Ești asistentul "${brand}" — un AI prietenos care răspunde clienților în chat-ul live.
${tagline ? `Tagline: "${tagline}"` : ''}
Limba conversației: ${locale}. Răspunde EXCLUSIV în această limbă, cu ton casual, prietenos, scurt (max 2-3 propoziții pe mesaj).

Context business:
- Vindem manele AI personalizate generate în 90 secunde.
- Preț de bază: ${price} per manea.
- Procesul: client completează formular (stil, ocazie, beneficiar, mesaj) → plătește Stripe → primește 2 versiuni pe email.
- 50.000+ manele generate, garanție 30 zile, plată unică (nu abonament).

Reguli stricte:
1. Răspunde DOAR prin tool call \`send_message\`. NU scrie text liber.
2. Înainte de a inventa detalii (preț specific, timpi, garanții), folosește \`search_memory\` SAU consultă faptele din "Memorie aprobată" de mai jos.
3. Dacă clientul cere refund / are problemă complexă / cere explicit "om real", folosește \`escalate_to_human\`.
4. Dacă clientul vrea să cumpere (preț, plată, "cum plătesc?"), folosește \`send_payment_link\` — va fi gated pentru aprobare admin.
5. Dacă clientul stă blocat pe formular și ai impresia că nu vede chat-ul, folosește \`force_open_chat\` pentru a-i atrage atenția.
6. NU promite ce nu poți livra (ex. nume artiști reali, modificări tehnice).
7. Nu pomeni că ești AI decât dacă userul te întreabă direct.
8. Folosește emoji moderat (1-2 per mesaj, opțional). Nu folosi markdown (** sau __).`;

    return this.appendMemoryAndContacts(basePrompt, memory, site);
  }

  private appendMemoryAndContacts(prompt: string, memory: AiMemory[], site: Awaited<ReturnType<SitesService['findById']>>): string {
    let out = prompt;
    if (memory.length > 0) {
      out += '\n\nMemorie aprobată (fapte verificate de admin, sursa de adevăr):';
      for (const m of memory) {
        out += `\n- [${m.kind}] ${m.content.replace(/\n+/g, ' ').slice(0, 300)}`;
      }
    }
    const support = site?.supportEmail ?? site?.fromEmail ?? null;
    if (support) {
      out += `\n\nEmail support: ${support}`;
    }
    return out;
  }

  // ============== TOOL DEFINITIONS ==============

  private toolDefinitions(): ToolDef[] {
    return [
      {
        name: 'send_message',
        description: 'Trimite un mesaj text către utilizator. Folosește limba conversației (vezi system prompt), ton casual, scurt (max 2-3 propoziții).',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Textul mesajului (max 600 caractere, conversational, fără markdown).' },
          },
          required: ['text'],
        },
      },
      {
        name: 'search_memory',
        description: 'Caută în baza de cunoștințe (KB + memorie) informații despre preț, procesul de generare, livrare, edge cases. Folosește înainte de a inventa detalii.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Întrebarea sau cuvântul cheie (1-10 cuvinte).' },
          },
          required: ['query'],
        },
      },
      {
        name: 'send_payment_link',
        description: 'Generează și trimite un link de plată Stripe Checkout. Folosește când clientul cere să cumpere, plătească, sau întreabă "cum plătesc?". Default folosește prețul site-ului. Tool-ul poate fi gated pentru aprobare admin în funcție de setări.',
        parameters: {
          type: 'object',
          properties: {
            description: { type: 'string', description: 'Descriere scurtă a produsului (ex. „Manea pentru aniversarea Mariei").' },
            amount: { type: 'number', description: 'Sumă în cents (opțional — default prețul site-ului).' },
            currency: { type: 'string', description: 'Valută ISO 3 litere (opțional — default valuta site-ului).' },
            premium: { type: 'boolean', description: 'Variantă premium (+extra). Default false.' },
          },
          required: ['description'],
        },
      },
      {
        name: 'force_open_chat',
        description: 'Forțează deschiderea widget-ului de chat pe ecranul clientului. Folosește RAR — doar dacă clientul a închis chatul dar îi trimiți ceva critic (ex. link plată, eroare la formular). Nu folosi pentru mesaje normale.',
        parameters: {
          type: 'object',
          properties: {
            reason: { type: 'string', description: 'De ce ai nevoie să forțezi deschiderea (audit only).' },
          },
          required: ['reason'],
        },
      },
      {
        name: 'escalate_to_human',
        description: 'Cere intervenția unui operator uman. Folosește dacă userul cere explicit „om real", dacă cere refund, dacă întrebarea e prea complexă sau dacă nu ai informația în KB/memorie.',
        parameters: {
          type: 'object',
          properties: {
            reason: { type: 'string', description: 'De ce escaladezi (max 200 caractere).' },
          },
          required: ['reason'],
        },
      },
    ];
  }

  private toolHandlers(ctx: AgentCtx): Record<string, ToolHandler> {
    return {
      send_message: async (args) => this.handleSendMessage(ctx, String(args.text ?? '')),
      search_memory: async (args) => this.handleSearchMemory(ctx.conv, String(args.query ?? '')),
      send_payment_link: async (args) => this.handleSendPaymentLink(ctx, args),
      force_open_chat: async (args) => this.handleForceOpen(ctx, String(args.reason ?? '')),
      escalate_to_human: async (args) => this.handleEscalate(ctx, String(args.reason ?? 'unspecified')),
    };
  }

  // ============== TOOL HANDLERS ==============

  private async handleSendMessage(ctx: AgentCtx, text: string): Promise<{ sent: boolean; messageType: string; status: string; instruction?: string }> {
    const trimmed = text.trim().slice(0, 800);
    if (!trimmed) return { sent: false, messageType: 'noop', status: 'EMPTY_TEXT_IGNORED' };

    const isFirst = ctx.sentRealMessages === 0 && !ctx.suggestionMsgId;

    if (ctx.mode === 'suggest' && ctx.suggestionMsgId) {
      return {
        sent: false,
        messageType: 'duplicate_blocked',
        status: 'SUGGESTION_ALREADY_PENDING',
        instruction: 'You already sent ONE suggestion this turn. Stop calling tools and END your turn now.',
      };
    }
    if (ctx.mode === 'auto' && ctx.sentRealMessages >= 3) {
      return {
        sent: false,
        messageType: 'rate_limited',
        status: 'TOO_MANY_MESSAGES_THIS_TURN',
        instruction: 'You already sent 3 messages this turn. Stop calling tools and END your turn now.',
      };
    }

    if (ctx.mode === 'suggest') {
      const m = this.msg.create({
        conversationId: ctx.conv.id,
        siteId: ctx.conv.siteId ?? null,
        authorRole: 'system',
        authorId: null,
        body: trimmed,
        messageType: 'ai_suggestion',
        aiGenerated: true,
        aiSuggestionFor: ctx.userMessageId,
        detectedLang: 'ro',
      });
      const saved = await this.msg.save(m);
      ctx.suggestionMsgId = saved.id;
      this.gateway.emitAiSuggestion({ conversation: ctx.conv, message: saved });
      return {
        sent: false,
        messageType: 'ai_suggestion',
        status: 'SUGGESTION_PERSISTED_AWAITING_APPROVAL',
        instruction: 'Suggestion saved. Your turn is COMPLETE. Do NOT call any more tools. End now.',
      };
    }

    // mode === 'auto'
    const m = this.msg.create({
      conversationId: ctx.conv.id,
      siteId: ctx.conv.siteId ?? null,
      authorRole: 'admin',
      authorId: null,
      body: trimmed,
      messageType: 'text',
      aiGenerated: true,
      detectedLang: 'ro',
    });
    const saved = await this.msg.save(m);
    ctx.conv.lastMessageAt = saved.createdAt;
    ctx.conv.unreadByUser += 1;
    await this.conv.save(ctx.conv);
    this.gateway.emitMessage({ message: saved, conversation: ctx.conv });
    ctx.sentRealMessages++;
    return {
      sent: isFirst,
      messageType: 'text',
      status: 'MESSAGE_DELIVERED_TO_USER',
      instruction: ctx.sentRealMessages >= 2
        ? 'You sent 2 messages already. End your turn now unless you have new critical info.'
        : 'Message delivered. Consider ending your turn unless follow-up is needed.',
    };
  }

  private async handleSearchMemory(conv: Conversation, query: string): Promise<{ results: Array<{ source: string; title: string; content: string }> }> {
    try {
      const [kbHits, memHits] = await Promise.all([
        this.kb.search(query, conv.siteId, 4).catch(() => []),
        this.memory
          .createQueryBuilder('m')
          .where('m.approved = true')
          .andWhere(conv.siteId ? '(m.siteId = :siteId OR m.siteId IS NULL)' : 'm.siteId IS NULL', { siteId: conv.siteId })
          .andWhere(`(m.content ILIKE :q OR m.kind ILIKE :q)`, { q: `%${query.slice(0, 80)}%` })
          .orderBy('m."usageCount"', 'DESC')
          .take(4)
          .getMany()
          .catch(() => [] as AiMemory[]),
      ]);
      return {
        results: [
          ...kbHits.map((h) => ({ source: 'kb', title: h.title, content: h.content.slice(0, 500) })),
          ...memHits.map((h) => ({ source: 'memory', title: h.kind, content: h.content.slice(0, 500) })),
        ],
      };
    } catch {
      return { results: [] };
    }
  }

  private async handleSendPaymentLink(
    ctx: AgentCtx,
    args: Record<string, unknown>,
  ): Promise<{ sent: boolean; status: string; instruction?: string; checkoutUrl?: string }> {
    if (ctx.paymentLinkSent) {
      return {
        sent: false,
        status: 'PAYMENT_LINK_ALREADY_SENT_THIS_TURN',
        instruction: 'Do not send another payment link this turn.',
      };
    }
    if (!ctx.conv.siteId) {
      return { sent: false, status: 'NO_SITE_CONTEXT', instruction: 'Conversația nu are siteId.' };
    }

    // Auto mode + approval required → persistă ca pending pentru admin
    const needsApproval = ctx.mode === 'auto' && ctx.requireApprovalForPayment;
    if (needsApproval || ctx.mode === 'suggest') {
      // Persistă ca system message info pentru admin (vizibil în chat admin) — nu se trimite la user
      const description = String(args.description ?? 'Manea personalizată');
      const amount = typeof args.amount === 'number' ? args.amount : undefined;
      const currency = typeof args.currency === 'string' ? args.currency : undefined;
      const premium = !!args.premium;

      const payload: ChatMessagePayload = { description, premium, pendingApproval: true };
      if (amount !== undefined) payload.amount = amount;
      if (currency !== undefined) payload.currency = currency;

      const m = this.msg.create({
        conversationId: ctx.conv.id,
        siteId: ctx.conv.siteId,
        authorRole: 'system',
        authorId: null,
        body: `🤖 AI cere aprobare pentru link de plată: ${description}${amount !== undefined ? ` — ${(amount / 100).toFixed(2)} ${currency ?? 'RON'}` : ''}`,
        messageType: 'system',
        aiGenerated: true,
        payload,
        detectedLang: 'ro',
      });
      const saved = await this.msg.save(m);
      this.gateway.emitAiSuggestion({ conversation: ctx.conv, message: saved });
      ctx.paymentLinkSent = true;
      return {
        sent: false,
        status: 'PAYMENT_LINK_PENDING_ADMIN_APPROVAL',
        instruction: 'Spune userului că adminul îi va trimite linkul de plată în câteva secunde. NU mai apela tool-uri.',
      };
    }

    // Auto fără approval gate — trimite real
    try {
      const site = await this.sites.findById(ctx.conv.siteId);
      if (!site) return { sent: false, status: 'SITE_NOT_FOUND' };
      const premium = !!args.premium;
      const description = String(args.description ?? 'Manea personalizată');

      const checkout = await this.payments.createCheckoutSession({
        userId: ctx.conv.userId,
        guestId: ctx.conv.guestId,
        premium,
        email: ctx.conv.email ?? undefined,
        site,
      });

      const amount = typeof args.amount === 'number'
        ? args.amount
        : site.basePriceCents + (premium ? site.premiumExtraCents : 0);
      const currency = (typeof args.currency === 'string' ? args.currency : site.currency).toUpperCase();

      const payload: ChatMessagePayload = {
        amount, currency, description, premium,
        checkoutUrl: checkout.url, paymentId: checkout.paymentId,
      };
      const m = this.msg.create({
        conversationId: ctx.conv.id,
        siteId: ctx.conv.siteId,
        authorRole: 'admin',
        authorId: null,
        body: `💳 Link de plată: ${description} — ${(amount / 100).toFixed(2)} ${currency}`,
        messageType: 'payment_link',
        payload,
        aiGenerated: true,
        detectedLang: 'ro',
      });
      const saved = await this.msg.save(m);
      ctx.conv.lastMessageAt = saved.createdAt;
      ctx.conv.unreadByUser += 1;
      await this.conv.save(ctx.conv);
      this.gateway.emitMessage({ message: saved, conversation: ctx.conv });
      ctx.paymentLinkSent = true;
      return {
        sent: true,
        status: 'PAYMENT_LINK_SENT',
        checkoutUrl: checkout.url,
        instruction: 'Link de plată trimis. Spune userului că poate plăti acum. Termină turul.',
      };
    } catch (e) {
      return {
        sent: false,
        status: 'PAYMENT_LINK_FAILED',
        instruction: `Eroare la creare link: ${(e as Error).message}. Cere ajutor uman.`,
      };
    }
  }

  private async handleForceOpen(ctx: AgentCtx, _reason: string): Promise<{ ok: true; status: string }> {
    // În mode suggest, NU forțăm deschidere (e o acțiune perceptibilă). Doar logăm.
    if (ctx.mode === 'suggest') {
      return { ok: true, status: 'SKIPPED_IN_SUGGEST_MODE' };
    }
    this.gateway.forceOpenChat({ userId: ctx.conv.userId, guestId: ctx.conv.guestId });
    return { ok: true, status: 'CHAT_FORCED_OPEN' };
  }

  private async handleEscalate(ctx: AgentCtx, reason: string): Promise<{ ok: true; message: string }> {
    if (ctx.escalated) return { ok: true, message: 'already escalated' };
    ctx.escalated = true;
    ctx.conv.aiMode = 'manual';
    await this.conv.save(ctx.conv);
    const m = this.msg.create({
      conversationId: ctx.conv.id,
      siteId: ctx.conv.siteId ?? null,
      authorRole: 'system',
      authorId: null,
      body: `🚨 AI escalează la operator uman. Motiv: ${reason.slice(0, 200)}`,
      messageType: 'system',
      aiGenerated: true,
      detectedLang: 'ro',
    });
    const saved = await this.msg.save(m);
    this.gateway.emitAiSuggestion({ conversation: ctx.conv, message: saved });
    return { ok: true, message: 'Escalated. Operator notified.' };
  }

  // ============== AUDIT ==============

  private async persistAudit(args: {
    ctx: AgentCtx;
    toolCalls: Array<{ request: { id: string; name: string; args: Record<string, unknown> }; result: unknown; error?: string }>;
    model: string;
    tokensIn: number | null;
    tokensOut: number | null;
  }): Promise<void> {
    if (args.toolCalls.length === 0) return;
    const rows = args.toolCalls.map((t) => {
      const row = new AiToolCall();
      row.siteId = args.ctx.conv.siteId;
      row.conversationId = args.ctx.conv.id;
      row.triggerMessageId = args.ctx.userMessageId;
      row.toolName = t.request.name;
      row.input = t.request.args;
      row.output =
        t.result && typeof t.result === 'object'
          ? (t.result as Record<string, unknown>)
          : { value: t.result };
      row.error = t.error ?? null;
      row.aiMode = args.ctx.mode;
      row.model = args.model;
      row.totalPromptTokens = args.tokensIn;
      row.totalCompletionTokens = args.tokensOut;
      row.requiredApproval =
        (t.request.name === 'send_payment_link' && args.ctx.requireApprovalForPayment) ||
        args.ctx.mode === 'suggest';
      row.approvedBy = null;
      return row;
    });
    try {
      await this.audit.save(rows);
    } catch (e) {
      this.logger.warn(`persist audit failed: ${(e as Error).message}`);
    }
  }
}

interface AgentCtx {
  conv: Conversation;
  userMessageId: string | null;
  mode: 'manual' | 'suggest' | 'auto';
  suggestionMsgId: string | null;
  sentRealMessages: number;
  escalated: boolean;
  paymentLinkSent: boolean;
  requireApprovalForPayment: boolean;
}
