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
    const basePrompt = `Ești Irina — asistenta de vânzări de la ${brand}. Vorbești românește colocvial
(adesea fără diacritice — "doresti", "te ajut" — exact ca un om real care tastează rapid).
Ton: prietenos dar respectuos. Folosești "tu" sau "voi" după cum simți. Emoji moderat: 👋 🎤 🎵 ✨ 💳.

Limba conversației: ${locale}. NICIODATĂ alta. Răspunsuri SCURTE (1-3 fraze, max 240 caractere).
NICIODATĂ markdown (** sau __). Vorbești ca pe WhatsApp, nu ca într-un email formal.

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
11. NU promite voci de artiști reali (Salam, Guță) — sunt fictive.`;

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
        description: 'Salvează unul sau mai multe câmpuri în wizardul de comandă. Folosește după ce userul răspunde la o întrebare. Normalize valorile (ex. „moderna" → „Modernă"). Câmpurile cerute pentru a putea finaliza: style, occasion, recipientName, message, voiceArtist.',
        parameters: {
          type: 'object',
          properties: {
            style: { type: 'string', description: `Unul din: ${STYLES.join(', ')}` },
            occasion: { type: 'string', description: `Una din: ${OCCASIONS.join(', ')}` },
            recipientName: { type: 'string', description: 'Numele persoanei pentru care e manea (1-120 char).' },
            message: { type: 'string', description: 'Mesajul/dedicarea sentimentală pe care vrea s-o transmită (max 600 char).' },
            voiceArtist: { type: 'string', description: 'Preferință voce (ex. „masculină grav", „feminină", „classic").' },
            dedication: { type: 'string', description: 'Opțional: text scurt dedicare audio (max 120 char).' },
            customLyrics: { type: 'string', description: 'Opțional: versuri custom complete furnizate de user.' },
            premium: { type: 'boolean', description: 'Opțional: dacă userul vrea variantă premium (+20 RON).' },
            email: { type: 'string', description: 'Email-ul user-ului (necesar pentru livrare). Doar dacă e guest fără email.' },
          },
        },
      },
      {
        name: 'wizard_finalize',
        description: 'Finalizează comanda: creează generation pending în DB + Stripe Checkout cu generationId + trimite payment_link în chat. Cere ca toate câmpurile minime să fie complete (style, occasion, recipientName, message, voiceArtist) și user-ul să aibă email. Apelează DOAR după ce userul a confirmat datele recapitulate.',
        parameters: { type: 'object', properties: {} },
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
    const linkToSong = audioReady ? `/m/${generation.id}` : null;

    let humanStatus = 'în așteptare plată';
    if (paid && audioReady) humanStatus = 'gata — manea finalizată';
    else if (paid && generation.status === 'failed') humanStatus = 'plată ok, dar generarea a eșuat';
    else if (paid) humanStatus = 'plătit, se generează acum (~90s)';
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
      instruction: audioReady
        ? `Manea e gata. Trimite userului link-ul: ${linkToSong}`
        : paid
          ? 'Plata e ok, melodia se generează acum. Spune-i userului că ajunge în ~30-90 secunde pe email + apare aici în chat când e gata.'
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

    if (typeof args.style === 'string' && args.style.trim()) updates.style = this.normalizeStyle(args.style);
    if (typeof args.occasion === 'string' && args.occasion.trim()) updates.occasion = this.normalizeOccasion(args.occasion);
    if (typeof args.recipientName === 'string' && args.recipientName.trim()) updates.recipientName = args.recipientName.trim().slice(0, 120);
    if (typeof args.message === 'string' && args.message.trim()) updates.message = args.message.trim().slice(0, 600);
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
    if (state.step === 'payment_sent' || state.step === 'paid' || state.step === 'generating') {
      return { error: 'already_finalized', instruction: 'Comanda deja finalizată. NU re-finaliza.' };
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
      // 1. Crează Generation pending
      const generation = await this.generations.createPendingForPayment(
        {
          style: state.data.style!,
          occasion: state.data.occasion!,
          recipientName: state.data.recipientName!,
          message: state.data.message!,
          voiceArtist: state.data.voiceArtist!,
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

      // 2. Crează Stripe Checkout legat de Generation
      const checkout = await this.payments.createCheckoutSession({
        userId: conv.userId,
        guestId: conv.guestId,
        generationId: generation.id,
        premium: !!state.data.premium,
        email: conv.email ?? undefined,
        site,
      });

      // 3. Update state — partial UPDATE pe wizardState (anti race condition).
      state.step = 'payment_sent';
      state.generationId = generation.id;
      state.paymentId = checkout.paymentId;
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
