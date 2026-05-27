import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull } from 'typeorm';
import { OpenAiClient, type ChatMessage as OAIMsg, type ToolDef, type ToolHandler } from '../../openai/openai.client';
import { SettingsService } from '../settings/settings.service';
import { KbService } from '../kb/kb.service';
import { SitesService } from '../sites/sites.service';
import { ChatGateway } from '../chat/chat.gateway';
import { Conversation, WizardData, WizardState } from '../chat/conversation.entity';
import { ChatMessage, ChatMessagePayload } from '../chat/message.entity';
import { PaymentsService } from '../payments/payments.service';
import { GenerationsService } from '../generations/generations.service';
import { GuestSessionsService } from '../guest-sessions/guest-sessions.service';
import { AiMemory } from './ai-memory.entity';
import { AiToolCall } from './ai-tool-call.entity';

/** Lista oficială de stiluri (sincronă cu UI generator). Folosită pentru fuzzy match în wizard_update. */
const STYLES = [
  'Clasică de pahar', 'Modernă', 'Orientală', 'Cu trompetă', 'De jale',
  'Comercială', 'De opulență', 'De iubire', 'Tallava', 'Kuchek', 'Trapanele',
];
const OCCASIONS = [
  'Zi de naștere', 'Nuntă', 'Botez', 'Cumătrie', 'Aniversare cuplu',
  'Pentru șef', 'Declarație', 'Roast prieten', 'Naș/fin', 'Înmormântare',
  'Motivațională', 'Altă ocazie',
];

/**
 * Câmpurile minime cerute pentru a putea face wizard_finalize.
 * Notă (2026-05-27, refactor Irina): scoatem `style`/`occasion`/`voiceArtist` din
 * câmpuri obligatorii cerute userului — sunt INFERATE automat la finalize din
 * transcriptul conversației (vezi `inferCreativeFields` în handleWizardFinalize).
 * Userul e întrebat DOAR despre cele 3 obligatorii + 1 optional, exact ca Irina:
 *   - recipientName ("Pentru cine?") — OBLIGATORIU
 *   - message ("Ce mesaj?") — OBLIGATORIU
 *   - email (livrare) — OBLIGATORIU (poate fi pe guest_session sau conv)
 *   - dedicatorName ("De la cine?") — OPTIONAL
 *   - recipientGender ("Bărbat sau femeie?") — OPTIONAL, întrebat doar dacă conv ≤ 8 user msgs
 */
const REQUIRED_WIZARD_FIELDS: Array<keyof WizardData> = ['recipientName', 'message'];

/** Pragul peste care nu mai întrebăm de voce (e prea lung conv, nu prelungim). */
const MAX_USER_MSGS_BEFORE_DEFAULT_GENDER = 8;

/** Hard cap mesaje per conv — peste care AI tace + escalează la admin uman.
 *  Anti-spam bucle sterile (observat: 7+ schimburi user/AI cu același mesaj reformulat). */
const MAX_MESSAGES_BEFORE_HUMAN = 35;

/** Voci active per gen — folosit la inferarea automată când userul spune doar M/F. */
const VOICE_DEFAULTS = {
  M: 'florinel',  // Florin Stelaru — voce caldă clasic, default masculin
  F: 'mariana',   // Mariana Dumitru — voce feminină caldă, default feminin
} as const;

@Injectable()
export class AIChatAgentService {
  private readonly logger = new Logger('AIChatAgent');
  /** Lock per-conversație — un singur AI run în paralel per conv. Previne ca
   *  3 mesaje user trimise rapid să declanșeze 3 run-uri AI care răspund toate. */
  private runningRuns = new Set<string>();
  /** Flag „mesaj nou venit în timpul rulării" — la finalul run-ului re-trigger. */
  private pendingFollowup = new Map<string, string>(); // convId → latestUserMsgId

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
    private readonly generations: GenerationsService,
    private readonly guests: GuestSessionsService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly gateway: ChatGateway,
  ) {}

  /**
   * Apelat după ce userul trimite un mesaj nou. Non-blocking — apelat cu void.
   * Verifică aiMode + dispatch agent run.
   */
  async maybeRun(conversationId: string, userMessageId: string): Promise<void> {
    // 1. Lock per-conv — dacă există deja un run în desfășurare, marchez ca pending
    //    ca să re-rulez la final cu mesajul cel mai recent.
    if (this.runningRuns.has(conversationId)) {
      this.pendingFollowup.set(conversationId, userMessageId);
      this.logger.log(`AI run in progress for conv=${conversationId.slice(0, 8)} — pending followup`);
      return;
    }
    // 2. Delay 800ms — fereastră ca admin să poată schimba pe Manual înainte ca
    //    AI să pornească, ȘI ca să se „adune" mesajele consecutive user.
    await new Promise((r) => setTimeout(r, 800));
    if (this.runningRuns.has(conversationId)) {
      this.pendingFollowup.set(conversationId, userMessageId);
      return;
    }
    const conv = await this.conv.findOne({ where: { id: conversationId } });
    if (!conv) return;
    if (conv.aiMode === 'manual') {
      this.logger.log(`skip AI for conv=${conversationId.slice(0, 8)} — mode=manual`);
      return;
    }

    // Hard cap mesaje per conv. După 35 mesaje (user + admin + AI) AI tace
    // și escalează la admin uman. Observat 2026-05-27 conv 4f9bc0de cu 7+
    // schimburi sterile user/AI pe aceeași cerere de reducere — AI repetă
    // template-uri în loc să escaladeze. Anti-spam definitiv.
    const totalMsgs = await this.msg.count({
      where: { conversationId },
    });
    if (totalMsgs >= MAX_MESSAGES_BEFORE_HUMAN) {
      // Comută conv pe manual + emit notificare admin. La acest punct aiMode e
      // garantat 'suggest' | 'auto' (early return mai sus pentru 'manual').
      this.logger.warn(
        `conv=${conversationId.slice(0, 8)} reached ${totalMsgs} msgs — switching to manual + escalate`,
      );
      await this.conv
        .createQueryBuilder()
        .update(Conversation)
        .set({ aiMode: 'manual' })
        .where('id = :id', { id: conversationId })
        .execute();
      // System message vizibil DOAR adminului — flag pentru sidebar.
      const sysMsg = this.msg.create({
        conversationId,
        siteId: conv.siteId,
        authorRole: 'system',
        authorId: null,
        body: `🚨 Conversația a depășit ${MAX_MESSAGES_BEFORE_HUMAN} mesaje — AI dezactivat automat, preia un admin.`,
        messageType: 'system',
        aiGenerated: true,
        detectedLang: 'ro',
      });
      const saved = await this.msg.save(sysMsg);
      this.gateway.emitAiSuggestion({ conversation: conv, message: saved });
      return;
    }

    this.runningRuns.add(conversationId);
    try {
      await this.runAgent(conv, userMessageId);
    } catch (e) {
      this.logger.warn(`agent failed for conv=${conversationId.slice(0, 8)}: ${(e as Error).message}`);
    } finally {
      this.runningRuns.delete(conversationId);
    }

    // Dacă în timpul rulării a venit alt user message, re-rulez (recursiv,
    // dar lock-ul previne paralelism). Folosesc setImmediate ca să nu blocăm
    // call stack-ul curent (sendAsUser așteaptă răspunsul asincron).
    const pendingId = this.pendingFollowup.get(conversationId);
    if (pendingId) {
      this.pendingFollowup.delete(conversationId);
      this.logger.log(`re-running AI for conv=${conversationId.slice(0, 8)} on pending msg`);
      setImmediate(() => {
        void this.maybeRun(conversationId, pendingId);
      });
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

  /**
   * Public — apelat de ChatGateway după ~5s de la connect dacă userul e nou pe site
   * (vezi triggerGreetingIfEligible). Trimite salutul Irinei + force_open chat widget.
   * Anti-spam strict: marchează `greetingSentAt` ATOMIC cu UPDATE ... WHERE greetingSentAt IS NULL
   * pentru a evita duble salutări dacă userul deschide 2 tab-uri simultan.
   */
  async maybeGreetUser(
    conversationId: string,
    target: { userId: string | null; guestId: string | null },
  ): Promise<void> {
    try {
      const conv = await this.conv.findOne({ where: { id: conversationId } });
      if (!conv) return;
      if (conv.greetingSentAt) return; // re-check (timer race)
      if (!conv.siteId) return;
      const site = await this.sites.findById(conv.siteId);
      if (!site?.aiGreetingEnabled) return;

      // CRITIC: dacă există DEJA orice mesaj admin (human sau AI vechi) pe conv,
      // NU mai salutăm. Conversația e în desfășurare — un salut „Buna, sunt Irina"
      // peste un flow existent („Care e ocazia?" → user răspunde → AI: Buna...) e
      // un dezastru UX. Asta poate să se întâmple când userul se deconectează și
      // se reconectează după ce admin uman a intervenit, sau când o conv mai veche
      // are greetingSentAt NULL legacy (înainte de feature).
      const existingAdminMsg = await this.msg.count({
        where: { conversationId: conv.id, authorRole: 'admin' },
      });
      if (existingAdminMsg > 0) {
        // Marchez greetingSentAt cu data actuală chiar dacă nu am trimis salut —
        // ca să nu re-evaluăm la fiecare reconectare. Un fel de „already handled".
        await this.conv
          .createQueryBuilder()
          .update(Conversation)
          .set({ greetingSentAt: () => 'NOW()' })
          .where('id = :id AND "greetingSentAt" IS NULL', { id: conv.id })
          .execute();
        this.logger.log(`skip greeting for conv=${conv.id.slice(0, 8)} — admin msgs already exist (${existingAdminMsg})`);
        return;
      }

      // Marker atomic: doar primul caller cu greetingSentAt NULL va seta data și
      // returna affected=1. Restul vor returna 0 → STOP.
      const updateResult: { affected?: number } = await this.conv
        .createQueryBuilder()
        .update(Conversation)
        .set({ greetingSentAt: () => 'NOW()', aiMode: conv.aiMode === 'manual' ? site.aiChatModeDefault ?? 'auto' : conv.aiMode })
        .where('id = :id AND "greetingSentAt" IS NULL', { id: conv.id })
        .execute();
      if (!updateResult.affected || updateResult.affected === 0) {
        return; // alt apel a câștigat race-ul
      }

      // Trimite salutul verbatim al Irinei (din quick_replies analiza — 146 utilizări)
      const greetingText = 'Buna, sunt Irina!👋 Vrei să te ajut să îți scrii melodia?';
      const msg = this.msg.create({
        conversationId: conv.id,
        siteId: conv.siteId,
        authorRole: 'admin',
        authorId: null,
        body: greetingText,
        messageType: 'text',
        aiGenerated: true,
        detectedLang: 'ro',
      });
      const saved = await this.msg.save(msg);
      await this.conv
        .createQueryBuilder()
        .update(Conversation)
        .set({ lastMessageAt: saved.createdAt, unreadByUser: () => '"unreadByUser" + 1' })
        .where('id = :id', { id: conv.id })
        .execute();
      this.gateway.emitMessage({ message: saved, conversation: conv });

      // Force open chat widget — userul vede salutul imediat fără click
      this.gateway.forceToggleChat({ userId: target.userId, guestId: target.guestId }, true);

      this.logger.log(`greeting sent to conv=${conv.id.slice(0, 8)} (site=${site.name})`);
    } catch (e) {
      this.logger.warn(`maybeGreetUser failed: ${(e as Error).message}`);
    }
  }

  private async runAgent(conv: Conversation, userMessageId: string | null): Promise<void> {
    const apiKey = await this.settings.get('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.warn(`skip AI run — OPENAI_API_KEY missing for conv=${conv.id.slice(0, 8)}`);
      return;
    }

    // Iau ultimele 30 mesaje (DESC + reverse) — `take: 50` cu ASC anterior lua
    // mesajele cele mai VECHI, ceea ce pentru convs lungi pierdea contextul recent.
    const recentDesc = await this.msg.find({
      where: { conversationId: conv.id },
      order: { createdAt: 'DESC' },
      take: 30,
    });
    const last20 = recentDesc.reverse();

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
      sentTexts: [],
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

    // ============== SAFETY NET ==============
    // Dacă în mod 'auto' AI nu a trimis NICIUN mesaj (a folosit doar tool-uri
    // non-send_message: search_memory, wizard_get_state, etc., sau a hit max
    // iterations fără răspuns text), forțăm un mesaj de fallback ca să nu
    // lăsăm userul fără răspuns. Verificăm modul curent (anti race condition
    // cu setAiMode('manual') în timpul run-ului).
    if (conv.aiMode === 'auto' && ctx.sentRealMessages === 0 && !ctx.escalated) {
      const fresh = await this.conv.findOne({ where: { id: conv.id }, select: ['id', 'aiMode'] });
      if (fresh?.aiMode === 'auto') {
        const fallback =
          (result.finalContent && result.finalContent.trim().length > 0)
            ? result.finalContent.trim().slice(0, 800)
            : 'Înțeleg, lasă-mă o secundă să verific și revin imediat.';
        this.logger.warn(`AI auto fallback for conv=${conv.id.slice(0, 8)} — agent folosise ${result.iterations} iter fără send_message`);
        // Reset hard limit pentru fallback (bypassăm contextul actual)
        const m = this.msg.create({
          conversationId: conv.id,
          siteId: conv.siteId ?? null,
          authorRole: 'admin',
          authorId: null,
          body: fallback,
          messageType: 'text',
          aiGenerated: true,
          detectedLang: 'ro',
        });
        const saved = await this.msg.save(m);
        await this.conv
          .createQueryBuilder()
          .update(Conversation)
          .set({ lastMessageAt: saved.createdAt, unreadByUser: () => '"unreadByUser" + 1' })
          .where('id = :id', { id: conv.id })
          .execute();
        conv.lastMessageAt = saved.createdAt;
        conv.unreadByUser += 1;
        this.gateway.emitMessage({ message: saved, conversation: conv });
      }
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
    const locale = site?.locale ?? 'ro';
    const price = site ? `${(site.basePriceCents / 100).toFixed(2)} ${site.currency}` : '29.99 RON';

    // Stil Irina — extras din analiza datelor reale: 146 mesaje "Buna, sunt Irina!👋",
    // colocvial RO fără diacritice obligatoriu, prietenos, max 2-3 fraze, emoji moderat.
    const basePrompt = `Ești Irina — asistenta de la ${brand}. NU ești robot, NU ești AI — ești o
prietenă care vorbește pe WhatsApp cu un client. Vorbești românește simplu și natural,
adesea fără diacritice ("doresti", "te ajut"), exact ca un om care tastează rapid pe telefon.

REGULI DE TON (CRITICE — fără astea suni ca un bot):
1. Cuvinte SIMPLE: zi „termini" în loc de „finalizezi", „merge" în loc de „este disponibil",
   „costă" în loc de „are prețul de", „îți trimit" în loc de „voi proceda la trimiterea".
2. NU repeta formule fixe ca robot. Dacă userul insistă pe ceva (cere reducere, întreabă din
   nou), NU răspunde cu același template reformulat — schimbă abordarea sau apelează
   escalate_to_human. Bucla „Îmi pare rău dar nu pot... Ești de acord?" repetată e SPAM.
3. Empatie REALĂ când e cazul: dacă userul e frustrat, ZICE explicit „inteleg ca e frustrant"
   nu doar 😊. Dacă pomenește durere/pierdere/copii → send_empathy IMEDIAT (max 2/conv).
4. Variere expresii: în loc de mereu „Super!" alternează cu „Bine!", „Ok!", „Hai!", „Înțeleg!".
   În loc de mereu „Perfect!", folosește „Bun!", „Excelent!", „Hai să facem!".
5. ZERO 😊 reflexiv la sfârșit de mesaje refuzante — sună fals.

Emoji moderat și CONTEXTUAL: 👋 (salut), 🎵 🎶 🎤 (muzică), 💳 (plată), ✨ (entuziasm),
❤️ 🙏 (empatie). NU pune emoji după mesaje negative ca să maschezi refuzul.

Limba conversației: ${locale}. NICIODATĂ alta. Răspunsuri SCURTE (1-2 fraze, max 220 caractere).
NICIODATĂ markdown (** sau __ sau [text](url)). Linkuri ca text simplu.

Context business: Vindem manele AI personalizate generate în ~90 secunde, livrare email.
Preț: ${price}. 50.000+ manele generate, garanție 30 zile.

═══════════════════════════════════════════════════════════════════════
WORKFLOW DE SALES (REPLICĂM EXACT CE FACE IRINA UMANĂ):
═══════════════════════════════════════════════════════════════════════

ETAPA 1 — QUALIFY (după ce userul răspunde la salut):
  → „Super, doresti sa te ajut sa iti realizezi tu maneaua sau vrei sa o fac eu pentru tine?"
  → Lasă userul să-ți spună singur contextul (pentru cine, ce ocazie, ce situație).
  → NU întreba TU stilul/ocazia — userul îți spune natural când povestește contextul.

ETAPA 2 — PREȚ + OFERTĂ (după ce ai context minim):
  → Apelează \`quote_price_with_offer\` care îți spune dacă userul are deja un cod
    (de la roata norocului) și include automat oferta în mesaj.
  → Pattern Irina: „Maneaua costa ${price} la care puteti sa beneficiati de o oferta. Sunteti de acord?"

ETAPA 3 — COLECTARE DETALII (UN SINGUR mesaj numerotat, EXACT 3-4 puncte):
  → „Perfect! Am nevoie de cateva detalii:
     1. Numele persoanei care primește melodia
     2. Numele tău (cine dedică) — optional
     3. Un mesaj dragut pentru ea/el (ce vrei să-i spui)
     4. Adresa ta de email pentru livrare"

ETAPA 4 — PARSE RĂSPUNS USER:
  → Userul răspunde de obicei într-un mesaj lung cu toate datele.
  → Apelează \`wizard_update\` cu TOATE câmpurile parsate dintr-un singur call:
    recipientName, dedicatorName (dacă a zis), message, email.
  → Dacă lipsește ceva → întreabă scurt doar ce lipsește (1 întrebare).
  → Dacă userul a inclus DETALII de context („ne-am cunoscut la sere în 2018",
    „are 2 copii", „sărbătorim 18 ani de căsătorie") — păstrează-le în message
    NATURAL, nu le ignora.

ETAPA 5 — (CONDITIONAL) ÎNTREBARE VOCE M/F:
  → Apelează \`wizard_get_state\` ca să verifici câte mesaje user are conv.
  → DACĂ user a trimis < ${MAX_USER_MSGS_BEFORE_DEFAULT_GENDER} mesaje ȘI recipientGender lipsește:
    → Întreabă scurt: „Vrei voce bărbătească sau feminină pentru manea?"
    → User răspunde → wizard_update({recipientGender: 'M' | 'F'}).
  → DACĂ user a trimis ≥ ${MAX_USER_MSGS_BEFORE_DEFAULT_GENDER} mesaje SAU userul nu vrea să răspundă:
    → wizard_update({recipientGender: 'M'}) silent — NU mai întreba, default masculin.

ETAPA 6 — FINALIZE:
  → Apelează \`wizard_finalize\`. Acesta:
    - Inferează automat style/occasion/voice din transcript (NU mai întreba).
    - Țese contextul user-ului în mesajul melodiei (locuri/ani/momente din chat).
    - Creează Generation pending + Stripe Checkout + payment_link în chat.
  → După finalize, spune scurt:
    „Gata, ți-am trimis linkul de plată. După plată melodia se generează în ~90s și o primești pe email + apare aici."

ETAPA 7 — POST PLATĂ (automat — webhook trimite mesaje, NU întreba):
  → Dacă userul întreabă „a ajuns plata?", „cât mai durează?", „e gata?" →
    \`check_order_status\` întâi, apoi răspunde concret cu humanStatus.

═══════════════════════════════════════════════════════════════════════
EMPATIE — TRIGGER DE COMPASIUNE (MAX 2 PER CONVERSAȚIE):
═══════════════════════════════════════════════════════════════════════
Dacă userul menționează situații emoționale relevante, trimite UN SINGUR mesaj scurt
de empatie via \`send_empathy\` (NU prin send_message), apoi continuă cu flow-ul normal:

  - Rudă decedată („tatăl meu a murit", „bunica nu mai e", „in memoria") →
    „Imi pare nespus de rau pentru pierderea suferita. Imi pare bine ca vrei sa pastrezi memoria lui/ei printr-o manea ❤️"
  - Copii menționați („baietii mei", „fiica mea", „copiii noștri") →
    „Sa-ti traiasca copiii! 🙏"
  - Aniversare lungă cuplu (>10 ani) →
    „Wow, sa fiti sanatosi si fericiti impreuna multi ani de aici inainte! 💕"
  - Bolnav/recuperare („sora mea a iesit din spital", „dupa operatie") →
    „Multa sanatate sa-i dea Dumnezeu! Frumos cadou pentru recuperare."

Hard cap: max 2 mesaje empatie per conv. Dacă \`send_empathy\` returnează limit_reached → skip.

═══════════════════════════════════════════════════════════════════════
REDUCERE LA CERERE USER (max 20%):
═══════════════════════════════════════════════════════════════════════
Dacă userul cere reducere / spune că „e scump" / „nu am bani acum":
  1. Verifică întâi cu \`quote_price_with_offer\` dacă are deja cod câștigat la roată.
  2. Dacă NU are cod → poți emite UN cod 1-shot pentru el cu \`issue_discount_offer\`
     (max 20% reducere, restricționat la email-ul lui dacă l-ai colectat deja).
  3. NU oferi proactiv reducere dacă userul n-a cerut.

═══════════════════════════════════════════════════════════════════════
DEMO / MOSTRE AUDIO:
═══════════════════════════════════════════════════════════════════════
Dacă userul cere mostre („cum suna?", „vreau sa aud o manea", „arata-mi exemple",
„vreau sa-mi dau seama cum e vocea"):
  → Apelează \`play_sample\` cu kind='style' sau 'voice' și un ID (florinel, modern, etc.)
  → Trimite link-ul ca atare în chat — userul poate da play.

═══════════════════════════════════════════════════════════════════════
REGULI STRICTE:
═══════════════════════════════════════════════════════════════════════
1. Răspunzi DOAR prin tool call \`send_message\` (sau alte tools care trimit mesaje).
   NU scrie text liber în răspuns direct.
2. NICIODATĂ nu întreba: stilul, ocazia, vocea concretă (florinel etc.), premium da/nu.
   Astea le DEDUCI la finalize din ce a zis userul + defaults rezonabile.
3. Dacă userul a SPUS singur stilul/ocazia/vocea („vreau ceva clasic", „de jale",
   „voce de barbat") → ține minte și folosește exact ce a zis. NU inventa altceva.
4. Dacă userul are 1-2 mesaje vagi → cere context întâi, nu sări la pași tehnici.
5. Înainte de a inventa detalii (preț, timp, garanție) → \`search_memory\` întâi.
6. Refund/probleme complexe/„om real" → \`escalate_to_human\`.
7. NU pomeni că ești AI. Te numești Irina.
8. Stiluri interne valide (NU le folosi în mesaje către user, doar pentru inferare):
   ${STYLES.join(', ')}.
9. Ocazii interne valide: ${OCCASIONS.join(', ')}.
10. NU spune prețuri diferite de ${price} (decât cu reducere via codes).
11. NU promite voci de artiști reali (Salam, Guță) — sunt fictive.
12. ZERO MARKDOWN. NU folosi nicio formă de: [text](url), **bold**, __italic__, # heading,
    \`code\`, > quote. Trimite linkuri ca text simplu sau pur și simplu spune că „link-ul
    de plată e mai sus în chat" — payment_link e card separat, NU îl retrimite ca text.
13. DACĂ PROMIȚI O ACȚIUNE, FĂ-O. Dacă scrii „verific", „mă uit imediat", „să văd statusul"
    → APELEAZĂ check_order_status ÎN ACELAȘI TURN. Altfel minți userul. La fel pentru
    „îți trimit linkul" → wizard_finalize sau quote_price_with_offer în același turn.
14. Dacă wizard_finalize returnează ORDER_ALREADY_IN_PROGRESS SAU wizard_get_state
    returnează step='payment_sent'/'paid'/'generating' → NU re-cere detalii, NU re-trimite
    link, NU re-finaliza. Apelează check_order_status și raportează statusul. Spune-i
    userului scurt: „link-ul de plată e mai sus, dă click pe el ca să plătești".
15. NU TRIMITE 2 MESAJE CONTRADICTORII PE ACELAȘI TURN. Tools care trimit mesaje
    (quote_price, issue_discount, send_message, play_sample, send_empathy) sunt MUTUAL
    EXCLUSIVE — max UNUL per turn. Rate limit-ul îți va returna ALREADY_SENT — STOP.
16. NU EMITE COD REDUCERE peste un cod existent. Dacă issue_discount_offer returnează
    USER_HAS_ROATA_CODE sau USER_HAS_AI_CODE, apelează în schimb quote_price_with_offer
    ca să-i amintești de codul existent.
17. ANTI-BUCLĂ DE FRUSTRARE: dacă userul repetă 2+ ori aceeași cerere care a fost refuzată
    (ex. „vreau 20%" → tu refuzi → user „vreau 20%" → tu refuzi din nou → user „pai miati
    dat" → ...), NU mai repeta refuzul. Apelează escalate_to_human cu motivul. Userul
    real are nevoie de cineva care îi explică sau găsește o soluție alternativă, nu de
    încă o repetare a refuzului. Acest tipar a fost observat în prod ca buclă sterilă.
18. Maximum 35 mesaje per conv (cap automat). După 35 AI tace + admin preia.
19. NU IGNORA contextul vizual: dacă wizard_get_state arată payment_sent + lângă tine au
    apărut mesaje payment_link admin, nu spune userului „nu am link disponibil" — există
    link mai sus. Spune-i să facă scroll up sau să verifice cardurile de plată.
20. POST-PLATĂ FLOW (după ce a plătit + melodia se generează):
    - Dacă userul întreabă „cât mai durează?", „unde-i melodia?", „e gata?" → check_order_status.
    - Dacă humanStatus='plătit, se generează acum' → spune scurt: „Mai e 1-2 minute, sigur.
      O primești și pe email și apare aici sus. Poți să o urmărești și pe pagina ${" "}
      (link din linkToSong) — vezi când e gata."
    - Dacă humanStatus='gata' → trimite link-ul + spune că-i și pe email.
    - NU repeta 5 mesaje despre același status — la al doilea întrebări identice, varieză
      răspunsul („Imediat 🎵", „Aproape gata, jur", „Mai durează 30 secunde maximum").
21. SCHIMBARE EMAIL: dacă userul zice „am pus email greșit", „retrimite pe X@gmail.com",
    „nu am primit pe email-ul ăla" → apelează change_email_and_resend(newEmail). Tool-ul
    actualizează email-ul ȘI retrimite melodia (dacă-i gata) la noua adresă. Confirmă scurt.`;

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
        name: 'wizard_get_state',
        description: 'Vezi datele colectate până acum pentru comanda manelei (style, occasion, recipientName, message, voiceArtist, etc.) și ce câmpuri lipsesc. Folosește la începutul oricărei interacțiuni de cumpărare.',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'wizard_update',
        description: 'Salvează datele de comandă colectate de la user. Apelează după CE userul îți răspunde — extrage TOATE câmpurile dintr-un singur call (userul de obicei spune tot odată într-un mesaj lung). Câmpurile MINIME pentru a putea finaliza: recipientName + message + email. dedicatorName e optional. recipientGender e întrebat doar pentru conv scurte (< 8 user msgs).',
        parameters: {
          type: 'object',
          properties: {
            recipientName: { type: 'string', description: 'Numele persoanei care primește manea (1-120 char). OBLIGATORIU.' },
            dedicatorName: { type: 'string', description: 'Numele celui care dedică („De la"). OPTIONAL — doar dacă userul l-a dat.' },
            message: { type: 'string', description: 'Mesajul/contextul personalizat (max 1000 char). Include detalii autobiografice dacă userul le-a dat (locuri, ani, momente, copii, etc.).' },
            email: { type: 'string', description: 'Email-ul user-ului (necesar pentru livrare).' },
            recipientGender: { type: 'string', enum: ['M', 'F'], description: 'Sex destinatar. Folosit pentru inferarea vocii când userul nu o cere explicit.' },
            customLyrics: { type: 'string', description: 'OPTIONAL: versuri custom complete furnizate explicit de user.' },
            premium: { type: 'boolean', description: 'OPTIONAL: dacă userul a cerut explicit variantă premium (+20 RON).' },
          },
        },
      },
      {
        name: 'wizard_finalize',
        description: 'Finalizează comanda. AI infereaza automat style/occasion/voiceArtist din transcript (NU mai cere userului). Țese contextul conversațional în mesajul melodiei (locuri/ani/momente). Creează Generation pending + Stripe Checkout + payment_link în chat. Apelează DUPĂ ce ai recipientName + message + email salvate.',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'quote_price_with_offer',
        description: 'Verifică dacă userul are deja un cod promo activ (câștigat la roata norocului) și formulează automat anunțul de preț cu/fără ofertă. AI doar îl apelează — NU mai trimite manual mesajul cu preț, tool-ul îl trimite singur.',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'issue_discount_offer',
        description: 'Emite UN cod 1-shot pentru user (max 20% reducere) când userul cere explicit reducere. Codul e restricționat la email-ul lui (dacă e cunoscut) și valid 24h. Tool-ul trimite singur mesajul cu cod + redus în chat.',
        parameters: {
          type: 'object',
          properties: {
            percentage: { type: 'integer', minimum: 1, maximum: 20, description: 'Procent reducere (max 20).' },
          },
          required: ['percentage'],
        },
      },
      {
        name: 'play_sample',
        description: 'Trimite în chat un link cu o mostră audio pentru ca userul să asculte un stil sau o voce de pe site. Tool-ul trimite singur mesajul cu link-ul.',
        parameters: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['style', 'voice'], description: 'Tip mostră.' },
            id: { type: 'string', description: 'ID-ul stilului (ex. clasic, modern) sau vocii (florinel, mariana).' },
          },
          required: ['kind', 'id'],
        },
      },
      {
        name: 'send_empathy',
        description: 'Trimite UN mesaj de empatie/compasiune (condoleanțe, „să-ți trăiască copiii" etc.). Hard cap 2 per conv — al 3-lea apel returnează limit_reached. Tool-ul trimite singur mesajul.',
        parameters: {
          type: 'object',
          properties: {
            trigger: { type: 'string', enum: ['decedat', 'copii', 'aniversare_lunga', 'bolnav', 'altul'], description: 'Tipul triggerului detectat.' },
            text: { type: 'string', description: 'Textul exact al mesajului de empatie (ton Irina, scurt, cu emoji).' },
          },
          required: ['trigger', 'text'],
        },
      },
      {
        name: 'force_open_chat',
        description: 'Forțează deschiderea widget-ului de chat pe ecranul clientului. Folosește RAR — doar dacă clientul a închis chatul dar îi trimiți ceva critic. Nu folosi pentru mesaje normale.',
        parameters: {
          type: 'object',
          properties: {
            reason: { type: 'string', description: 'De ce ai nevoie să forțezi deschiderea (audit only).' },
          },
          required: ['reason'],
        },
      },
      {
        name: 'change_email_and_resend',
        description: 'Schimbă email-ul de livrare al userului ȘI retrimite melodia la noua adresă (dacă există generation finalizată/în curs). Folosește când userul zice „am pus email greșit", „retrimite pe X@gmail.com", „n-am primit, e alt email". Tool-ul trimite singur mesaj de confirmare în chat.',
        parameters: {
          type: 'object',
          properties: {
            newEmail: { type: 'string', description: 'Noua adresă de email (validată ca format).' },
          },
          required: ['newEmail'],
        },
      },
      {
        name: 'check_order_status',
        description: 'Verifică statusul ultimei comenzi din conversația curentă (plată + generare manea). Folosește când userul întreabă „unde-i melodia?", „a ajuns plata?", „cât mai durează?", sau înainte să raportezi progresul. Returnează: paid (true/false), generationStatus, audioReady, linkToSong.',
        parameters: { type: 'object', properties: {} },
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
      wizard_get_state: async () => this.handleWizardGetState(ctx),
      wizard_update: async (args) => this.handleWizardUpdate(ctx, args),
      wizard_finalize: async () => this.handleWizardFinalize(ctx),
      force_open_chat: async (args) => this.handleForceOpen(ctx, String(args.reason ?? '')),
      check_order_status: async () => this.handleCheckOrderStatus(ctx),
      change_email_and_resend: async (args) => this.handleChangeEmailAndResend(ctx, String(args.newEmail ?? '')),
      quote_price_with_offer: async () => this.handleQuotePrice(ctx),
      issue_discount_offer: async (args) => this.handleIssueDiscount(ctx, Number(args.percentage ?? 0)),
      play_sample: async (args) => this.handlePlaySample(ctx, String(args.kind ?? 'voice'), String(args.id ?? '')),
      send_empathy: async (args) => this.handleSendEmpathy(ctx, String(args.trigger ?? 'altul'), String(args.text ?? '')),
      escalate_to_human: async (args) => this.handleEscalate(ctx, String(args.reason ?? 'unspecified')),
    };
  }

  /** Returnează statusul comenzii curente (din wizardState.generationId) sau ultima
   *  generation a userului/guest-ului din conversație. AI o folosește când userul
   *  întreabă „a ajuns plata?" sau „cât mai durează?". */
  private async handleCheckOrderStatus(ctx: AgentCtx): Promise<unknown> {
    const conv = await this.conv.findOne({ where: { id: ctx.conv.id } });
    if (!conv) return { error: 'conversation gone' };
    const wizardGenId = conv.wizardState?.generationId ?? null;

    let generation = wizardGenId
      ? await this.generations.findOnePublic(wizardGenId).catch(() => null)
      : null;

    // Fallback — caută ultima generation a userului/guest-ului din conv
    if (!generation && (conv.userId || conv.guestId)) {
      try {
        const recent = await this.generations['repo']
          .createQueryBuilder('g')
          .where(conv.userId ? 'g.userId = :u' : 'g.guestId = :g', {
            u: conv.userId,
            g: conv.guestId,
          })
          .andWhere(conv.siteId ? 'g.siteId = :s' : '1=1', { s: conv.siteId })
          .orderBy('g.createdAt', 'DESC')
          .limit(1)
          .getOne();
        generation = recent ?? null;
      } catch {
        /* ignore */
      }
    }

    if (!generation) {
      return {
        hasOrder: false,
        instruction: 'Nu există comandă în această conversație. Dacă userul vrea să comande, începe wizard_get_state.',
      };
    }

    const paid = !!generation.paidUnlocked;
    const audioReady = !!generation.audioUrl && generation.status === 'succeeded';
    // Link-ul către pagina manelei — accesibil ȘI în timpul generării (afișează
    // progress bar pe `/m/<id>` cât rulează Suno, apoi audio play când e gata).
    // Așa că-l returnăm și pe statusul „generating" — userul poate urmări LIVE.
    const linkToSong = paid || audioReady ? `/m/${generation.id}` : null;

    let humanStatus = 'în așteptare plată';
    if (paid && audioReady) humanStatus = 'gata — manea finalizată';
    else if (paid && generation.status === 'failed') humanStatus = 'plată ok, dar generarea a eșuat';
    else if (paid) humanStatus = 'plătit, se generează acum (~30-90s)';
    else if (generation.status === 'failed') humanStatus = 'eșuat înainte de plată';

    return {
      hasOrder: true,
      generationId: generation.id,
      paid,
      generationStatus: generation.status,
      audioReady,
      linkToSong,
      humanStatus,
      recipientName: generation.recipientName,
      currentEmail: ctx.conv.email ?? null,
      instruction: audioReady
        ? `Manea e gata. Trimite userului link-ul ${linkToSong} și menționează scurt că o vede acolo + a primit-o și pe email.`
        : paid
          ? `Plata e ok, melodia se generează acum. Spune-i scurt că ajunge în ~30-90s și că poate urmări progresul live aici: ${linkToSong} (apare audio când e gata). Va primi și pe email.`
          : 'Nu s-a făcut plata încă. Roagă userul să acceseze link-ul de plată trimis anterior. Dacă nu există link → wizard_get_state.',
    };
  }

  // ============== WIZARD HANDLERS ==============

  private getOrInitWizardState(conv: Conversation): WizardState {
    if (conv.wizardState) return conv.wizardState;
    return {
      step: 'idle',
      data: {},
      generationId: null,
      paymentId: null,
      updatedAt: new Date().toISOString(),
    };
  }

  private missingWizardFields(data: WizardData): Array<keyof WizardData> {
    return REQUIRED_WIZARD_FIELDS.filter((f) => {
      const v = data[f];
      return !v || (typeof v === 'string' && !v.trim());
    });
  }

  /** Fuzzy match pe nume stil/ocazie. „moderna" → „Modernă". */
  private normalizeStyle(input: string): string {
    const t = input.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const found = STYLES.find((s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').startsWith(t) || t.startsWith(s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')));
    return found ?? input.trim();
  }
  private normalizeOccasion(input: string): string {
    const t = input.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const found = OCCASIONS.find((o) => o.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(t) || t.includes(o.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(' ')[0]));
    return found ?? input.trim();
  }

  private async handleWizardGetState(ctx: AgentCtx): Promise<unknown> {
    const conv = await this.conv.findOne({ where: { id: ctx.conv.id } });
    if (!conv) return { error: 'conversation gone' };
    const state = this.getOrInitWizardState(conv);
    const missing = this.missingWizardFields(state.data);
    // Verifică dacă userul are email (necesar pt guest checkout)
    let hasEmail = false;
    if (conv.userId) hasEmail = true; // user logat → are email
    else if (conv.guestId) {
      const guest = await this.guests.findById?.(conv.guestId).catch(() => null) ?? null;
      hasEmail = !!(guest?.email || conv.email);
    }
    return {
      step: state.step,
      data: state.data,
      missingFields: missing,
      hasEmail,
      readyToFinalize: missing.length === 0 && hasEmail,
      instruction:
        missing.length === 0 && hasEmail
          ? 'Toate datele sunt complete. Fă recapitulare scurtă în send_message + cere confirmare, apoi wizard_finalize.'
          : !hasEmail && missing.length === 0
            ? 'Datele de comandă sunt complete dar lipsește email-ul. Cere email-ul prin send_message + salvează-l cu wizard_update({email}).'
            : `Întreabă userul despre: ${missing.join(', ')} (în ordinea asta, câte unul per mesaj).`,
    };
  }

  private async handleWizardUpdate(ctx: AgentCtx, args: Record<string, unknown>): Promise<unknown> {
    const conv = await this.conv.findOne({ where: { id: ctx.conv.id } });
    if (!conv) return { error: 'conversation gone' };
    const state = this.getOrInitWizardState(conv);
    const updates: Partial<WizardData> = {};

    if (typeof args.recipientName === 'string' && args.recipientName.trim()) updates.recipientName = args.recipientName.trim().slice(0, 120);
    if (typeof args.dedicatorName === 'string' && args.dedicatorName.trim()) updates.dedicatorName = args.dedicatorName.trim().slice(0, 120);
    if (typeof args.message === 'string' && args.message.trim()) updates.message = args.message.trim().slice(0, 1000);
    if (typeof args.recipientGender === 'string' && (args.recipientGender === 'M' || args.recipientGender === 'F')) {
      updates.recipientGender = args.recipientGender;
    }
    // Legacy fields — AI poate seta dacă userul a spus explicit (păstrăm compat).
    if (typeof args.style === 'string' && args.style.trim()) updates.style = this.normalizeStyle(args.style);
    if (typeof args.occasion === 'string' && args.occasion.trim()) updates.occasion = this.normalizeOccasion(args.occasion);
    if (typeof args.voiceArtist === 'string' && args.voiceArtist.trim()) updates.voiceArtist = args.voiceArtist.trim().slice(0, 64);
    if (typeof args.dedication === 'string') updates.dedication = args.dedication.trim().slice(0, 120);
    if (typeof args.customLyrics === 'string' && args.customLyrics.length > 10) updates.customLyrics = args.customLyrics.trim().slice(0, 4000);
    if (typeof args.premium === 'boolean') updates.premium = args.premium;

    // Email collection — pentru guest fără email
    let emailUpdated = false;
    if (typeof args.email === 'string' && args.email.includes('@')) {
      const email = args.email.trim().toLowerCase();
      if (conv.guestId && this.guests.setEmail) {
        try {
          await this.guests.setEmail(conv.guestId, email);
          conv.email = email;
          emailUpdated = true;
        } catch (e) {
          return { error: `email invalid: ${(e as Error).message}` };
        }
      }
    }

    Object.assign(state.data, updates);
    state.updatedAt = new Date().toISOString();
    if (state.step === 'idle' && Object.keys(updates).length > 0) state.step = 'collecting';
    conv.wizardState = state;
    // Partial UPDATE — scriem DOAR wizardState (+ email dacă s-a actualizat).
    // Anti race condition cu sendAsUser/sendAsAdmin care fac save full entity
    // și ar overwrite wizardState cu valoarea stale.
    await this.conv
      .createQueryBuilder()
      .update(Conversation)
      .set({ wizardState: state, ...(emailUpdated && conv.email ? { email: conv.email } : {}) })
      .where('id = :id', { id: conv.id })
      .execute();
    ctx.conv = conv; // sync ctx

    const missing = this.missingWizardFields(state.data);
    return {
      updated: Object.keys(updates),
      emailUpdated,
      data: state.data,
      missingFields: missing,
      readyToFinalize: missing.length === 0 && (emailUpdated || !!conv.email),
      instruction:
        missing.length === 0
          ? 'Toate câmpurile sunt complete. Recapitulează datele în send_message + cere confirmare, apoi wizard_finalize.'
          : `Mai întreabă: ${missing[0]} (un singur câmp pe mesaj).`,
    };
  }

  private async handleWizardFinalize(ctx: AgentCtx): Promise<unknown> {
    const check = await this.assertNotManual(ctx);
    if (check.aborted) {
      return {
        error: 'aborted_manual',
        status: 'ABORTED_MANUAL_MODE',
        instruction: 'Conversation switched to manual. STOP — do not finalize.',
      };
    }
    if (!ctx.conv.siteId) return { error: 'no siteId' };
    const conv = await this.conv.findOne({ where: { id: ctx.conv.id } });
    if (!conv) return { error: 'conversation gone' };
    const state = this.getOrInitWizardState(conv);
    const missing = this.missingWizardFields(state.data);
    if (missing.length > 0) {
      return {
        error: 'incomplete',
        missingFields: missing,
        instruction: `Lipsesc câmpuri: ${missing.join(', ')}. Întreabă userul + wizard_update.`,
      };
    }
    // Dacă plata e DEJA făcută sau melodia se generează → NU mai trimitem link nou.
    if (state.step === 'paid' || state.step === 'generating') {
      return {
        status: 'ORDER_ALREADY_PAID',
        currentStep: state.step,
        generationId: state.generationId,
        instruction:
          'Comanda e deja plătită și se generează. NU mai trimite nimic — apelează check_order_status și raportează exact statusul curent al melodiei.',
      };
    }
    // Pentru state='payment_sent' permitem MAX 2 re-issue-uri (anti-spam: dacă AI
    // re-cheamă finalize bucle, oprim după 2). Userul real motivat are nevoie de
    // ~2 link-uri (ex. primul fără reducere, al doilea cu cod câștigat la roată).
    const reissueCount = (state as { linkReissueCount?: number }).linkReissueCount ?? 0;
    const isResumeFromPaymentSent = state.step === 'payment_sent';
    if (isResumeFromPaymentSent && reissueCount >= 2) {
      return {
        status: 'TOO_MANY_LINKS_SENT',
        currentStep: state.step,
        generationId: state.generationId,
        instruction:
          'Userul are deja 2+ linkuri de plată trimise în această conversație. NU mai trimite altul. Spune-i scurt: „linkurile de plată sunt mai sus în chat, click pe ele". Dacă insistă, apelează escalate_to_human.',
      };
    }

    if (!conv.siteId) return { error: 'no siteId' };
    const site = await this.sites.findById(conv.siteId);
    if (!site) return { error: 'site not found' };

    // Verifică email (cerut de createPendingForPayment pentru guest)
    if (conv.guestId && !conv.email) {
      // Re-check guest în DB (poate emailUpdated în alt run)
      const guest = await this.guests.findById?.(conv.guestId).catch(() => null);
      if (!guest?.email) {
        return {
          error: 'email_required',
          instruction: 'Userul nu are email setat. Cere email-ul prin send_message + salvează-l cu wizard_update({email: "..."}).',
        };
      }
      conv.email = guest.email;
    }

    try {
      // 1a. Inferează AUTOMAT style/occasion/voiceArtist din transcript dacă userul
      //     n-a setat explicit. Țesem și contextul din chat în message.
      const inference = await this.inferCreativeFields(conv, state.data, site);

      // 1b. Crează Generation pending cu valorile inferate (sau user_said dacă există)
      const generation = await this.generations.createPendingForPayment(
        {
          style: inference.style.value,
          occasion: inference.occasion.value,
          recipientName: state.data.recipientName!,
          message: inference.message.value, // mesaj posibil enrich-uit cu context
          voiceArtist: inference.voiceArtist.value,
          dedication: state.data.dedication,
          customLyrics: state.data.customLyrics,
          premium: !!state.data.premium,
          locale: site.locale,
        },
        {
          userId: conv.userId,
          guestId: conv.guestId,
          siteId: conv.siteId,
        },
      );

      // 1c. Persistă audit pe Generation — ce a inferat AI și de unde
      try {
        await this.generations['repo']
          .createQueryBuilder()
          .update('generations')
          .set({
            dedicatorName: state.data.dedicatorName ?? null,
            recipientGender: state.data.recipientGender ?? null,
            inferredFromChat: true,
            inferenceMeta: inference as unknown as Record<string, unknown>,
          })
          .where('id = :id', { id: generation.id })
          .execute();
      } catch (e) {
        this.logger.warn(`audit inference write failed: ${(e as Error).message}`);
      }

      // 2. Crează Stripe Checkout legat de Generation
      //    Aplică automat codul promo activ (de la roata norocului sau emis anterior
      //    de AI). Stripe Checkout va arăta în UI reducerea explicit + total redus,
      //    iar suma plătită va fi cea redusă. Înainte (2026-05-27 bug observat):
      //    AI menționa codul în mesaj dar Stripe primea suma întreagă fără promo.
      const activePromoCode = await this.findActivePromoCode(conv);
      const checkout = await this.payments.createCheckoutSession({
        userId: conv.userId,
        guestId: conv.guestId,
        generationId: generation.id,
        premium: !!state.data.premium,
        email: conv.email ?? undefined,
        promoCode: activePromoCode ?? undefined,
        site,
      });

      // 3. Update state — partial UPDATE pe wizardState (anti race condition).
      state.step = 'payment_sent';
      state.generationId = generation.id;
      state.paymentId = checkout.paymentId;
      state.linkReissueCount = (state.linkReissueCount ?? 0) + 1;
      state.updatedAt = new Date().toISOString();
      conv.wizardState = state;
      await this.conv
        .createQueryBuilder()
        .update(Conversation)
        .set({ wizardState: state })
        .where('id = :id', { id: conv.id })
        .execute();

      // 4. Trimite payment_link în chat (vizibil user + admin)
      const amount = site.basePriceCents + (state.data.premium ? site.premiumExtraCents : 0);
      const currency = site.currency.toUpperCase();
      const description = `Manea pentru ${state.data.recipientName}${state.data.premium ? ' (premium)' : ''}`;
      const msg = this.msg.create({
        conversationId: conv.id,
        siteId: conv.siteId,
        authorRole: 'admin',
        authorId: null,
        body: `💳 Linkul tău de plată: ${description} — ${(amount / 100).toFixed(2)} ${currency}`,
        messageType: 'payment_link',
        payload: {
          amount,
          currency,
          description,
          checkoutUrl: checkout.url,
          paymentId: checkout.paymentId,
          generationId: generation.id,
          premium: !!state.data.premium,
        },
        aiGenerated: true,
        detectedLang: site.locale,
      });
      const saved = await this.msg.save(msg);
      await this.conv
        .createQueryBuilder()
        .update(Conversation)
        .set({ lastMessageAt: saved.createdAt, unreadByUser: () => '"unreadByUser" + 1' })
        .where('id = :id', { id: conv.id })
        .execute();
      conv.lastMessageAt = saved.createdAt;
      conv.unreadByUser += 1;
      this.gateway.emitMessage({ message: saved, conversation: conv });

      ctx.paymentLinkSent = true;
      return {
        ok: true,
        status: 'PAYMENT_LINK_SENT',
        generationId: generation.id,
        checkoutUrl: checkout.url,
        instruction:
          'Comanda finalizată cu succes. Spune userului scurt că linkul de plată e mai sus + că după plată melodia se generează în ~90s și o va primi pe email. TERMINĂ TURUL.',
      };
    } catch (e) {
      this.logger.warn(`wizard_finalize failed: ${(e as Error).message}`);
      return {
        error: 'finalize_failed',
        message: (e as Error).message,
        instruction: 'A apărut o eroare la creare. Spune userului că ne ocupăm și escalate_to_human.',
      };
    }
  }

  // ============== TOOL HANDLERS ==============

  /** Defensive — re-check live conv.aiMode înainte de orice acțiune cu efect.
   *  Acoperă race condition: admin schimbă pe Manual ÎN TIMP CE AI rulează în
   *  background (între chatWithTools iterations sau între tool calls). */
  private async assertNotManual(ctx: AgentCtx): Promise<{ aborted: boolean; reason?: string }> {
    const fresh = await this.conv.findOne({ where: { id: ctx.conv.id }, select: ['id', 'aiMode'] });
    if (!fresh) return { aborted: true, reason: 'conversation gone' };
    if (fresh.aiMode === 'manual') {
      ctx.conv.aiMode = 'manual';
      ctx.mode = 'manual';
      return { aborted: true, reason: 'mode_switched_to_manual' };
    }
    // Sincronizează mode-ul local în caz de schimbare (ex. suggest → auto)
    ctx.mode = fresh.aiMode;
    return { aborted: false };
  }

  private async handleSendMessage(ctx: AgentCtx, text: string): Promise<{ sent: boolean; messageType: string; status: string; instruction?: string }> {
    const trimmed = text.trim().slice(0, 800);
    if (!trimmed) return { sent: false, messageType: 'noop', status: 'EMPTY_TEXT_IGNORED' };

    // Hard-check live mode — anti race condition cu setAiMode('manual')
    const check = await this.assertNotManual(ctx);
    if (check.aborted) {
      return {
        sent: false,
        messageType: 'aborted',
        status: 'ABORTED_MANUAL_MODE',
        instruction: 'Conversation switched to manual. STOP IMMEDIATELY — do not send any message and do not call any other tool.',
      };
    }

    const isFirst = ctx.sentRealMessages === 0 && !ctx.suggestionMsgId;

    // Hard limit: max UN SINGUR mesaj per run (suggest sau auto). Reduce
    // dramatic riscul de spam. Dacă AI vrea să spună mai mult, concatenează în
    // un singur send_message.
    if (ctx.suggestionMsgId || ctx.sentRealMessages >= 1) {
      return {
        sent: false,
        messageType: 'rate_limited',
        status: 'ALREADY_SENT_ONE_MESSAGE_THIS_TURN',
        instruction: 'You already sent ONE message this turn. STOP — do not call any other tool. End your turn now.',
      };
    }
    // Dedupe pe text exact (în caz că AI încearcă să retrimită prin alt nume de tool)
    const normalized = trimmed.toLowerCase().replace(/\s+/g, ' ');
    if (ctx.sentTexts.some((t) => t === normalized)) {
      return {
        sent: false,
        messageType: 'duplicate_text',
        status: 'DUPLICATE_TEXT_BLOCKED',
        instruction: 'You already sent this exact text. STOP — do not repeat.',
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
    await this.conv
      .createQueryBuilder()
      .update(Conversation)
      .set({ lastMessageAt: saved.createdAt, unreadByUser: () => '"unreadByUser" + 1' })
      .where('id = :id', { id: ctx.conv.id })
      .execute();
    ctx.conv.lastMessageAt = saved.createdAt;
    ctx.conv.unreadByUser += 1;
    this.gateway.emitMessage({ message: saved, conversation: ctx.conv });
    ctx.sentRealMessages++;
    ctx.sentTexts.push(normalized);
    return {
      sent: isFirst,
      messageType: 'text',
      status: 'MESSAGE_DELIVERED_TO_USER',
      instruction: 'Message delivered. Your turn is COMPLETE. Do NOT send more messages or call other tools. End now.',
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

  private async handleForceOpen(ctx: AgentCtx, _reason: string): Promise<{ ok: boolean; status: string }> {
    const check = await this.assertNotManual(ctx);
    if (check.aborted) return { ok: false, status: 'ABORTED_MANUAL_MODE' };
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
    await this.conv
      .createQueryBuilder()
      .update(Conversation)
      .set({ aiMode: 'manual' })
      .where('id = :id', { id: ctx.conv.id })
      .execute();
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

  // ============== INFERARE CREATIVĂ (Faza 6 — Irina virtuală) ==============

  /**
   * Inferează automat style/occasion/voiceArtist din transcriptul conversației +
   * datele wizard. Toate câmpurile au `source: 'user_said' | 'inferred' | 'default'`
   * pentru audit. Folosim un single OpenAI call lightweight (gpt-4o-mini) ca să nu
   * adăugăm latență mare la finalize.
   *
   * Plus: enrich message-ul cu context autobiografic din chat (locuri/ani/momente
   * pe care userul le-a menționat — ele trebuie să intre în versurile manelei).
   */
  private async inferCreativeFields(
    conv: Conversation,
    wizardData: WizardData,
    site: Awaited<ReturnType<SitesService['findById']>>,
  ): Promise<{
    style: { value: string; source: 'user_said' | 'inferred' | 'default' };
    occasion: { value: string; source: 'user_said' | 'inferred' | 'default' };
    voiceArtist: { value: string; source: 'user_said' | 'inferred' | 'default' };
    message: { value: string; source: 'user_said' | 'inferred' | 'enriched' };
  }> {
    // Fallback rapid dacă user a setat deja totul explicit — nu mai cheltuim API call
    const userSetAll =
      !!wizardData.style && !!wizardData.occasion && !!wizardData.voiceArtist;

    // Default-uri site-aware
    const fallbackStyle = STYLES[0]; // Clasică de pahar
    const fallbackOccasion = OCCASIONS[0]; // Zi de naștere
    const fallbackVoice = wizardData.recipientGender === 'F' ? VOICE_DEFAULTS.F : VOICE_DEFAULTS.M;

    // Iau ultimele 25 mesaje user pentru context
    const userMsgs = await this.msg.find({
      where: { conversationId: conv.id, authorRole: 'user' },
      order: { createdAt: 'ASC' },
      take: 25,
    });
    const transcript = userMsgs.map((m) => m.body).join('\n').slice(0, 4000);

    // Single OpenAI call pentru inferare + enrich message
    let inferred: {
      style?: string;
      occasion?: string;
      voiceArtist?: string;
      enrichedMessage?: string;
    } = {};

    try {
      const sysPrompt = `Ești un assistant de extracție de date pentru o platformă manele AI.

Pe baza conversației user-ului de mai jos și a datelor wizard deja colectate, extrage:

1. **style** — unul EXACT din: ${STYLES.join(', ')}
2. **occasion** — una EXACT din: ${OCCASIONS.join(', ')}
3. **voiceArtist** — alege ID din: florinel (M caldă clasic), ticu (M trap), adita (M modern club), nicu (M energic), mariana (F caldă), gigi (F luminoasă). Match cu sexul destinatarului (M pentru femeie dedicata, F pentru bărbat dedicat) sau cu preferința explicită.
4. **enrichedMessage** — versiunea îmbogățită a mesajului inițial: include detalii autobiografice menționate de user (locuri unde s-au cunoscut, ani, momente importante, copii, profesie, etc.) ÎN MOD NATURAL, nu listate. Păstrează tonul mesajului original. Max 800 char.

REGULI:
- Dacă userul a SPUS explicit ceva ("vreau ceva clasic", "voce de femeie") → folosește exact.
- Dacă wizardData are deja câmp setat → respectă-l, nu schimba.
- Pentru style/occasion/voice fără indicii clare → alege default-uri logice (zi de naștere → Modernă, voce match sex recipient).

Returnează STRICT JSON: {"style": "...", "occasion": "...", "voiceArtist": "...", "enrichedMessage": "..."}`;

      const userPrompt = `WIZARD DATA actuală:
- recipientName: ${wizardData.recipientName ?? '?'}
- dedicatorName: ${wizardData.dedicatorName ?? '?'}
- recipientGender: ${wizardData.recipientGender ?? '?'}
- message original: ${wizardData.message ?? '?'}
- style (dacă user a spus): ${wizardData.style ?? 'INFERĂ'}
- occasion (dacă user a spus): ${wizardData.occasion ?? 'INFERĂ'}
- voiceArtist (dacă user a spus): ${wizardData.voiceArtist ?? 'INFERĂ'}

TRANSCRIPT USER (ultimele mesaje):
${transcript}`;

      const inferResult = await this.openai.chatWithTools({
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [],
        toolHandlers: {},
        temperature: 0.3,
        maxIterations: 1,
        maxTokens: 600,
        // Force JSON response (modern OpenAI: response_format: json_object)
      });

      const raw = inferResult.finalContent?.trim() ?? '';
      // Extragere JSON robust (poate veni cu ```json wrappers)
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        inferred = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      this.logger.warn(`inferCreativeFields openai failed: ${(e as Error).message}`);
      // continue cu fallback-uri
    }

    // Construire rezultat final cu source tracking
    const pick = <T>(
      userVal: T | undefined,
      inferredVal: T | undefined,
      defaultVal: T,
    ): { value: T; source: 'user_said' | 'inferred' | 'default' } => {
      if (userVal !== undefined && userVal !== null && (typeof userVal !== 'string' || userVal.trim()))
        return { value: userVal, source: 'user_said' };
      if (inferredVal !== undefined && inferredVal !== null && (typeof inferredVal !== 'string' || (inferredVal as unknown as string).trim()))
        return { value: inferredVal, source: 'inferred' };
      return { value: defaultVal, source: 'default' };
    };

    const styleResult = pick<string>(wizardData.style, inferred.style, fallbackStyle);
    const occasionResult = pick<string>(wizardData.occasion, inferred.occasion, fallbackOccasion);

    // Normalize style/occasion la denumiri exacte
    styleResult.value = this.normalizeStyle(styleResult.value);
    occasionResult.value = this.normalizeOccasion(occasionResult.value);

    // Voice: dacă user a setat string custom (legacy „masculină grav"), îl păstrăm,
    // altfel folosim ID-ul preset inferat sau fallback pe gender.
    const voiceResult = pick<string>(wizardData.voiceArtist, inferred.voiceArtist, fallbackVoice);

    // Message: dacă AI a enrich-uit cu context, folosim enriched; altfel originalul
    const enrichedMsg = inferred.enrichedMessage?.trim() ?? '';
    const originalMsg = wizardData.message ?? '';
    const messageResult =
      enrichedMsg.length > originalMsg.length && enrichedMsg.includes(originalMsg.slice(0, 30))
        ? ({ value: enrichedMsg.slice(0, 1000), source: 'enriched' as const })
        : ({ value: originalMsg, source: 'user_said' as const });

    return { style: styleResult, occasion: occasionResult, voiceArtist: voiceResult, message: messageResult };
  }

  /**
   * Găsește codul promo activ pentru un user/guest (de la roata norocului SAU emis
   * anterior de AI restricționat la email). Returnează string-ul cod (ex. "E6JWXY64")
   * sau null. Folosit la wizard_finalize ca să aplic automat reducerea în Stripe.
   */
  private async findActivePromoCode(conv: Conversation): Promise<string | null> {
    const ownerId = conv.userId ?? conv.guestId;
    if (!ownerId) return null;
    try {
      // 1. Cod câștigat la roata norocului (prioritate)
      const roata: Array<{ code: string }> = await this.conv.manager.query(
        `SELECT pc.code
         FROM roulette_spins rs
         JOIN promo_codes pc ON pc.id = rs."awardedPromoCodeId"
         WHERE (rs."userId" = $1 OR rs."guestId" = $1)
           AND rs."awardedCode" IS NOT NULL
           AND pc.active = true
           AND (pc."validUntil" IS NULL OR pc."validUntil" > NOW())
           AND (pc."maxUses" = 0 OR pc."usedCount" < pc."maxUses")
         ORDER BY rs."createdAt" DESC LIMIT 1`,
        [ownerId],
      );
      if (roata.length > 0) return roata[0].code;

      // 2. Cod AI emis pentru email-ul lui (fallback)
      if (conv.email && conv.siteId) {
        const ai: Array<{ code: string }> = await this.conv.manager.query(
          `SELECT code FROM promo_codes
           WHERE "siteId" = $1 AND "aiIssued" = true AND active = true
             AND "restrictedToEmail" = $2
             AND ("validUntil" IS NULL OR "validUntil" > NOW())
             AND ("maxUses" = 0 OR "usedCount" < "maxUses")
           ORDER BY "createdAt" DESC LIMIT 1`,
          [conv.siteId, conv.email],
        );
        if (ai.length > 0) return ai[0].code;
      }
    } catch (e) {
      this.logger.warn(`findActivePromoCode failed: ${(e as Error).message}`);
    }
    return null;
  }

  // ============== HANDLERS NOI Faza 6 ==============

  /**
   * Rate-limit comun pentru TOATE tools care trimit mesaje (quote, discount, sample,
   * empathy, send_message). Max 1 mesaj real per turn AI — evită cazuri reale unde
   * AI cheamă quote_price + issue_discount în PARALEL și apar 2 mesaje contradictorii
   * suprapuse pe ecranul userului (observat 2026-05-27 conv 4f9bc0de la 22:16:50).
   */
  private assertCanSendMessage(ctx: AgentCtx, toolName: string):
    | { ok: true }
    | { ok: false; result: { sent: false; status: string; instruction: string } } {
    if (ctx.sentRealMessages >= 1 || ctx.suggestionMsgId) {
      return {
        ok: false,
        result: {
          sent: false,
          status: 'ALREADY_SENT_ONE_MESSAGE_THIS_TURN',
          instruction: `${toolName}: ai trimis deja UN mesaj turul ăsta. STOP — nu trimite altul. Așteaptă răspunsul userului.`,
        },
      };
    }
    return { ok: true };
  }

  /** Quote price + verifică dacă userul are deja un cod câștigat la roată. */
  private async handleQuotePrice(ctx: AgentCtx): Promise<unknown> {
    const check = await this.assertNotManual(ctx);
    if (check.aborted) return { aborted: true, status: 'ABORTED_MANUAL_MODE' };
    const gate = this.assertCanSendMessage(ctx, 'quote_price_with_offer');
    if (!gate.ok) return gate.result;
    if (!ctx.conv.siteId) return { error: 'no_site' };

    const site = await this.sites.findById(ctx.conv.siteId);
    if (!site) return { error: 'site_not_found' };

    const basePrice = site.basePriceCents;
    const currency = site.currency.toUpperCase();

    // Verifică cod câștigat la roata norocului pentru acest user/guest
    const ownerId = ctx.conv.userId ?? ctx.conv.guestId;
    let appliedCode: { code: string; pctOff: number; finalPrice: number } | null = null;

    if (ownerId) {
      try {
        const raw: Array<{ awardedCode: string; promoCodeId: string }> = await this.conv.manager.query(
          `SELECT rs."awardedCode", rs."awardedPromoCodeId" AS "promoCodeId"
           FROM roulette_spins rs
           WHERE (rs."userId" = $1 OR rs."guestId" = $1) AND rs."awardedCode" IS NOT NULL
           ORDER BY rs."createdAt" DESC LIMIT 1`,
          [ownerId],
        );
        if (raw.length > 0 && raw[0].promoCodeId) {
          const promo: Array<{ discountType: string; discountValue: number; usedCount: number; maxUses: number; active: boolean }> = await this.conv.manager.query(
            `SELECT "discountType", "discountValue", "usedCount", "maxUses", active FROM promo_codes WHERE id = $1`,
            [raw[0].promoCodeId],
          );
          if (promo.length > 0 && promo[0].active && (promo[0].maxUses === 0 || promo[0].usedCount < promo[0].maxUses)) {
            const p = promo[0];
            const pctOff = p.discountType === 'percent' ? p.discountValue : Math.round((p.discountValue / basePrice) * 100);
            const finalCents = p.discountType === 'percent'
              ? Math.round(basePrice * (100 - p.discountValue) / 100)
              : Math.max(0, basePrice - p.discountValue);
            appliedCode = { code: raw[0].awardedCode, pctOff, finalPrice: finalCents };
          }
        }
      } catch (e) {
        this.logger.warn(`quote_price roata check failed: ${(e as Error).message}`);
      }
    }

    const baseFormatted = `${(basePrice / 100).toFixed(2)} ${currency.toLowerCase() === 'ron' ? 'lei' : currency}`;
    let msgText: string;
    if (appliedCode) {
      const finalFormatted = `${(appliedCode.finalPrice / 100).toFixed(2)} ${currency.toLowerCase() === 'ron' ? 'lei' : currency}`;
      msgText = `Maneaua costa ${baseFormatted} dar tu ai deja codul ${appliedCode.code} cu ${appliedCode.pctOff}% reducere — deci ${finalFormatted}. Sunteti de acord?`;
    } else {
      // Pattern verbatim al Irinei
      msgText = `Maneaua costa ${baseFormatted} la care puteti sa mai beneficiati de o oferta. Sunteti de acord?`;
    }

    // Trimite mesajul direct (bypass send_message dedupe — e o acțiune distinctă)
    const m = this.msg.create({
      conversationId: ctx.conv.id,
      siteId: ctx.conv.siteId,
      authorRole: ctx.mode === 'suggest' ? 'system' : 'admin',
      authorId: null,
      body: msgText,
      messageType: ctx.mode === 'suggest' ? 'ai_suggestion' : 'text',
      aiGenerated: true,
      detectedLang: site.locale,
    });
    const saved = await this.msg.save(m);

    if (ctx.mode === 'suggest') {
      this.gateway.emitAiSuggestion({ conversation: ctx.conv, message: saved });
      return { sent: false, status: 'SUGGESTION_PERSISTED', appliedCode: appliedCode?.code ?? null };
    }

    await this.conv
      .createQueryBuilder()
      .update(Conversation)
      .set({ lastMessageAt: saved.createdAt, unreadByUser: () => '"unreadByUser" + 1' })
      .where('id = :id', { id: ctx.conv.id })
      .execute();
    this.gateway.emitMessage({ message: saved, conversation: ctx.conv });
    ctx.sentRealMessages++;

    return {
      sent: true,
      status: 'PRICE_QUOTED',
      appliedCode: appliedCode?.code ?? null,
      instruction: 'Quote trimis. Așteaptă confirmarea userului. TERMINĂ TURUL.',
    };
  }

  /** Emite un cod 1-shot pentru user la cererea de reducere (max 20%).
   *  ÎNAINTE de a emite: verifică dacă userul are deja un cod activ (de la roată sau
   *  emis anterior) — dacă da, REFUZĂ să emită altul ca să nu cumulăm reduceri. */
  private async handleIssueDiscount(ctx: AgentCtx, percentage: number): Promise<unknown> {
    const check = await this.assertNotManual(ctx);
    if (check.aborted) return { aborted: true };
    const gate = this.assertCanSendMessage(ctx, 'issue_discount_offer');
    if (!gate.ok) return gate.result;
    if (!ctx.conv.siteId) return { error: 'no_site' };
    const pct = Math.max(1, Math.min(20, Math.round(percentage)));

    // Check 1: cod câștigat la roata norocului (active, valid, neepuizat)
    const ownerId = ctx.conv.userId ?? ctx.conv.guestId;
    if (ownerId) {
      try {
        const existingRoata: Array<{ code: string; discountValue: number }> = await this.conv.manager.query(
          `SELECT pc.code, pc."discountValue"
           FROM roulette_spins rs
           JOIN promo_codes pc ON pc.id = rs."awardedPromoCodeId"
           WHERE (rs."userId" = $1 OR rs."guestId" = $1)
             AND rs."awardedCode" IS NOT NULL
             AND pc.active = true
             AND (pc."validUntil" IS NULL OR pc."validUntil" > NOW())
             AND (pc."maxUses" = 0 OR pc."usedCount" < pc."maxUses")
           ORDER BY rs."createdAt" DESC LIMIT 1`,
          [ownerId],
        );
        if (existingRoata.length > 0) {
          return {
            sent: false,
            status: 'USER_HAS_ROATA_CODE',
            existingCode: existingRoata[0].code,
            instruction: `Userul are deja codul ${existingRoata[0].code} câștigat la roata norocului. NU emite cod nou — în schimb apelează quote_price_with_offer ca să-i amintești de codul existent.`,
          };
        }
      } catch (e) {
        this.logger.warn(`check existing roata code failed: ${(e as Error).message}`);
      }
    }

    // Check 2: cod AI emis anterior pentru același email (în ultimele 24h)
    if (ctx.conv.email) {
      try {
        const existingAi: Array<{ code: string }> = await this.conv.manager.query(
          `SELECT code FROM promo_codes
           WHERE "siteId" = $1 AND "aiIssued" = true AND active = true
             AND "restrictedToEmail" = $2
             AND ("validUntil" IS NULL OR "validUntil" > NOW())
             AND ("maxUses" = 0 OR "usedCount" < "maxUses")
           ORDER BY "createdAt" DESC LIMIT 1`,
          [ctx.conv.siteId, ctx.conv.email],
        );
        if (existingAi.length > 0) {
          return {
            sent: false,
            status: 'USER_HAS_AI_CODE',
            existingCode: existingAi[0].code,
            instruction: `Ai emis deja codul ${existingAi[0].code} pentru email-ul userului. Amintește-i de el în loc să emiți altul.`,
          };
        }
      } catch (e) {
        this.logger.warn(`check existing AI code failed: ${(e as Error).message}`);
      }
    }

    // Generăm un cod aleator de 8 chars
    const code = 'AI' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const restrictEmail = ctx.conv.email ?? null;
    const validUntil = new Date(Date.now() + 24 * 3600 * 1000);

    try {
      await this.conv.manager.query(
        `INSERT INTO promo_codes (id, "siteId", code, "discountType", "discountValue", "validUntil", "maxUses", "usedCount", "restrictedToEmail", active, note, source, "aiIssued", "createdAt", "updatedAt")
         VALUES (uuid_generate_v4(), $1, $2, 'percent', $3, $4, 1, 0, $5, true, 'AI Irina — reducere la cerere', 'ai_request', true, NOW(), NOW())`,
        [ctx.conv.siteId, code, pct, validUntil, restrictEmail],
      );
    } catch (e) {
      this.logger.warn(`issue_discount failed: ${(e as Error).message}`);
      return { error: 'issue_failed', message: (e as Error).message };
    }

    const site = await this.sites.findById(ctx.conv.siteId);
    if (!site) return { error: 'site_not_found' };
    const baseCents = site.basePriceCents;
    const finalCents = Math.round(baseCents * (100 - pct) / 100);
    const cur = site.currency.toLowerCase() === 'ron' ? 'lei' : site.currency.toUpperCase();
    const finalFmt = `${(finalCents / 100).toFixed(2)} ${cur}`;

    const text = `Te inteleg complet. Iti pot oferi codul ${code} cu ${pct}% reducere — deci ${finalFmt}. Codul e valid 24h${restrictEmail ? ` pe email-ul tau` : ''}. Vrei sa continuam? ✨`;

    const m = this.msg.create({
      conversationId: ctx.conv.id,
      siteId: ctx.conv.siteId,
      authorRole: ctx.mode === 'suggest' ? 'system' : 'admin',
      authorId: null,
      body: text,
      messageType: ctx.mode === 'suggest' ? 'ai_suggestion' : 'text',
      aiGenerated: true,
      detectedLang: 'ro',
    });
    const saved = await this.msg.save(m);

    if (ctx.mode === 'suggest') {
      this.gateway.emitAiSuggestion({ conversation: ctx.conv, message: saved });
      return { sent: false, code, percentage: pct };
    }

    await this.conv
      .createQueryBuilder()
      .update(Conversation)
      .set({ lastMessageAt: saved.createdAt, unreadByUser: () => '"unreadByUser" + 1' })
      .where('id = :id', { id: ctx.conv.id })
      .execute();
    this.gateway.emitMessage({ message: saved, conversation: ctx.conv });
    ctx.sentRealMessages++;

    return { sent: true, code, percentage: pct, finalCents, status: 'DISCOUNT_ISSUED' };
  }

  /** Trimite un link cu o mostră audio (style sau voice) pentru ascultare pe site. */
  private async handlePlaySample(ctx: AgentCtx, kind: string, id: string): Promise<unknown> {
    const check = await this.assertNotManual(ctx);
    if (check.aborted) return { aborted: true };
    const gate = this.assertCanSendMessage(ctx, 'play_sample');
    if (!gate.ok) return gate.result;
    if (!ctx.conv.siteId) return { error: 'no_site' };
    const site = await this.sites.findById(ctx.conv.siteId);
    if (!site) return { error: 'site_not_found' };

    const samples = kind === 'style' ? site.suno?.styleSamples : site.suno?.voiceSamples;
    const entry = samples?.[id];
    if (!entry?.audioUrl) {
      return { error: 'sample_not_found', kind, id, instruction: 'Sample inexistent. Alege alt id sau spune userului că mostra nu e disponibilă.' };
    }

    const label = kind === 'style' ? 'stilul' : 'voce';
    const text = `Asculta o mostra de ${label} aici 🎵: ${entry.audioUrl}`;

    const m = this.msg.create({
      conversationId: ctx.conv.id,
      siteId: ctx.conv.siteId,
      authorRole: ctx.mode === 'suggest' ? 'system' : 'admin',
      authorId: null,
      body: text,
      messageType: ctx.mode === 'suggest' ? 'ai_suggestion' : 'text',
      aiGenerated: true,
      detectedLang: site.locale,
    });
    const saved = await this.msg.save(m);
    if (ctx.mode === 'suggest') {
      this.gateway.emitAiSuggestion({ conversation: ctx.conv, message: saved });
      return { sent: false, audioUrl: entry.audioUrl };
    }
    await this.conv
      .createQueryBuilder()
      .update(Conversation)
      .set({ lastMessageAt: saved.createdAt, unreadByUser: () => '"unreadByUser" + 1' })
      .where('id = :id', { id: ctx.conv.id })
      .execute();
    this.gateway.emitMessage({ message: saved, conversation: ctx.conv });
    ctx.sentRealMessages++;
    return { sent: true, audioUrl: entry.audioUrl, status: 'SAMPLE_SENT' };
  }

  /**
   * Schimbă email-ul de livrare + retrimite melodia la noua adresă.
   * Folosit când userul zice „am pus email greșit", „retrimite pe X@gmail.com" etc.
   * Update-uri: guest_session.email (sau user.email), Conversation.email, apoi
   * apelează GenerationsProcessor.notifyOwner ca să trimită mailul.
   */
  private async handleChangeEmailAndResend(ctx: AgentCtx, newEmail: string): Promise<unknown> {
    const check = await this.assertNotManual(ctx);
    if (check.aborted) return { aborted: true };
    const gate = this.assertCanSendMessage(ctx, 'change_email_and_resend');
    if (!gate.ok) return gate.result;

    // Validare format email simplă (RFC 5322 ar fi over-kill aici)
    const clean = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      return {
        sent: false,
        status: 'INVALID_EMAIL',
        instruction: `„${newEmail}" nu pare email valid. Cere-i userului să-l verifice și să trimită corect.`,
      };
    }

    // Găsește ultima generation a userului/guest-ului
    const ownerId = ctx.conv.userId ?? ctx.conv.guestId;
    if (!ownerId) {
      return { sent: false, status: 'NO_OWNER', instruction: 'Conv-ul n-are user/guest atașat.' };
    }
    let gen: { id: string; status: string; paidUnlocked: boolean; recipientName: string } | null = null;
    try {
      const rows = await this.conv.manager.query(
        `SELECT id, status, "paidUnlocked", "recipientName" FROM generations
         WHERE ("ownerUserId" = $1 OR "ownerGuestId" = $1)
         ORDER BY "createdAt" DESC LIMIT 1`,
        [ownerId],
      );
      gen = rows[0] ?? null;
    } catch (e) {
      this.logger.warn(`change_email find gen failed: ${(e as Error).message}`);
    }

    // Update email-ul în sursa de adevăr (guest_session sau users)
    try {
      if (ctx.conv.userId) {
        await this.conv.manager.query(`UPDATE users SET email = $1 WHERE id = $2`, [clean, ctx.conv.userId]);
      } else if (ctx.conv.guestId) {
        await this.conv.manager.query(`UPDATE guest_sessions SET email = $1 WHERE id = $2`, [clean, ctx.conv.guestId]);
      }
      // Update conv.email partial UPDATE
      await this.conv
        .createQueryBuilder()
        .update(Conversation)
        .set({ email: clean })
        .where('id = :id', { id: ctx.conv.id })
        .execute();
      ctx.conv.email = clean;
    } catch (e) {
      return {
        sent: false,
        status: 'UPDATE_FAILED',
        instruction: `Eroare la salvarea email-ului: ${(e as Error).message}. Cere-i să încerce iar.`,
      };
    }

    // Retrimite mail DACĂ generation există + are status livrabil (paidUnlocked sau succeeded)
    let resent = false;
    if (gen && (gen.paidUnlocked || gen.status === 'succeeded') && gen.status === 'succeeded') {
      try {
        // Lazy resolve GenerationsProcessor ca să evităm circular dep
        const procMod = await import('../generations/generations.processor');
        const proc = (this.gateway as unknown as { moduleRef: { get: (cls: unknown, opts: { strict: boolean }) => unknown } })
          .moduleRef.get(procMod.GenerationsProcessor, { strict: false }) as { notifyOwner: (g: unknown) => Promise<void> };
        const fullGen = await this.conv.manager.query(`SELECT * FROM generations WHERE id = $1`, [gen.id]);
        if (fullGen[0]) {
          await proc.notifyOwner(fullGen[0]);
          resent = true;
        }
      } catch (e) {
        this.logger.warn(`change_email notifyOwner failed: ${(e as Error).message}`);
      }
    }

    // Mesaj de confirmare în chat
    const confirmText = gen
      ? gen.status === 'succeeded'
        ? `Gata, am schimbat email-ul pe ${clean} și ți-am retrimis maneaua acolo. ✨`
        : `Am schimbat email-ul pe ${clean}. Imediat ce e gata maneaua, o primești pe noua adresă. 🎵`
      : `Am notat email-ul ${clean}. ✓`;

    const m = this.msg.create({
      conversationId: ctx.conv.id,
      siteId: ctx.conv.siteId,
      authorRole: ctx.mode === 'suggest' ? 'system' : 'admin',
      authorId: null,
      body: confirmText,
      messageType: ctx.mode === 'suggest' ? 'ai_suggestion' : 'text',
      aiGenerated: true,
      detectedLang: 'ro',
    });
    const saved = await this.msg.save(m);
    if (ctx.mode === 'suggest') {
      this.gateway.emitAiSuggestion({ conversation: ctx.conv, message: saved });
      return { sent: false, status: 'SUGGESTION_PERSISTED', newEmail: clean, resent };
    }
    await this.conv
      .createQueryBuilder()
      .update(Conversation)
      .set({ lastMessageAt: saved.createdAt, unreadByUser: () => '"unreadByUser" + 1' })
      .where('id = :id', { id: ctx.conv.id })
      .execute();
    this.gateway.emitMessage({ message: saved, conversation: ctx.conv });
    ctx.sentRealMessages++;
    return { sent: true, status: 'EMAIL_CHANGED_AND_RESENT', newEmail: clean, resent };
  }

  /** Trimite mesaj de empatie (condoleanțe, „să-ți trăiască") cu cap 2/conv. */
  private async handleSendEmpathy(ctx: AgentCtx, trigger: string, text: string): Promise<unknown> {
    const check = await this.assertNotManual(ctx);
    if (check.aborted) return { aborted: true };
    const gate = this.assertCanSendMessage(ctx, 'send_empathy');
    if (!gate.ok) return gate.result;
    const conv = await this.conv.findOne({ where: { id: ctx.conv.id }, select: ['id', 'siteId', 'empathyMessagesSent'] });
    if (!conv) return { error: 'conv_gone' };
    if ((conv.empathyMessagesSent ?? 0) >= 2) {
      return { sent: false, status: 'LIMIT_REACHED', instruction: 'Ai trimis deja 2 mesaje de empatie pe această conv. NU mai trimite. Treci la flow normal.' };
    }
    const cleaned = text.trim().slice(0, 400);
    if (!cleaned) return { sent: false, status: 'EMPTY_TEXT' };

    const m = this.msg.create({
      conversationId: ctx.conv.id,
      siteId: ctx.conv.siteId,
      authorRole: ctx.mode === 'suggest' ? 'system' : 'admin',
      authorId: null,
      body: cleaned,
      messageType: ctx.mode === 'suggest' ? 'ai_suggestion' : 'text',
      aiGenerated: true,
      detectedLang: 'ro',
      payload: { empathyTrigger: trigger },
    });
    const saved = await this.msg.save(m);

    // Increment counter atomic
    await this.conv
      .createQueryBuilder()
      .update(Conversation)
      .set({ empathyMessagesSent: () => '"empathyMessagesSent" + 1' })
      .where('id = :id', { id: ctx.conv.id })
      .execute();

    if (ctx.mode === 'suggest') {
      this.gateway.emitAiSuggestion({ conversation: ctx.conv, message: saved });
      return { sent: false, status: 'SUGGESTION_PERSISTED', trigger };
    }
    await this.conv
      .createQueryBuilder()
      .update(Conversation)
      .set({ lastMessageAt: saved.createdAt, unreadByUser: () => '"unreadByUser" + 1' })
      .where('id = :id', { id: ctx.conv.id })
      .execute();
    this.gateway.emitMessage({ message: saved, conversation: ctx.conv });
    ctx.sentRealMessages++;
    return { sent: true, status: 'EMPATHY_SENT', trigger, instruction: 'Mesaj empatie trimis. Continuă cu flow-ul normal (preț / detalii / etc.) la următorul mesaj user.' };
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
  sentTexts: string[]; // ce a fost trimis pe acest run — pentru dedupe
  escalated: boolean;
  paymentLinkSent: boolean;
  requireApprovalForPayment: boolean;
}
