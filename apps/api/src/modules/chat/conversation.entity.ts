import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AiChatMode = 'manual' | 'suggest' | 'auto';

/**
 * Wizard state pentru AI sales concierge — colectează pas cu pas datele
 * necesare pentru a comanda o manea în chat, apoi creează Generation + Checkout.
 *
 *  collecting → review → payment_sent → paid → generating → completed
 */
export type WizardStep =
  | 'idle'           // userul n-a manifestat încă intenție de cumpărare
  | 'collecting'     // AI întreabă pas cu pas
  | 'review'         // toate datele complete, AI cere confirmare
  | 'payment_sent'   // wizard_finalize executat, payment_link trimis, așteptăm plata
  | 'paid'           // webhook Stripe confirmat
  | 'generating'     // Suno în lucru
  | 'completed';     // audio livrat

export interface WizardData {
  style?: string;
  occasion?: string;
  recipientName?: string;
  /** „De la" — cine dedică (optional, conform structurii Irinei). */
  dedicatorName?: string;
  message?: string;
  voiceArtist?: string;
  /** Sex destinatar (M/F) folosit pt inferarea automată a vocii când userul nu o alege. */
  recipientGender?: 'M' | 'F';
  dedication?: string;
  customLyrics?: string;
  /** Indiciu de stil liber („stil Dani Mocanu") — intră în inferarea creativă. */
  styleHint?: string;
  /** Limba cerută EXPLICIT de user pentru versuri, când diferă de limba site-ului
   *  (ex. „ucraineană", „rusă"). Text liber. Forțează generate_lyrics să scrie în
   *  acea limbă → salvate ca customLyrics (cântate verbatim). Gol = limba site-ului. */
  languageHint?: string;
  /** @deprecated înlocuit de packageTier (model 3 pachete). Păstrat pt compat. */
  premium?: boolean;
  /** Pachetul ales de user în chat: basic | plus | premium. Default basic. */
  packageTier?: 'basic' | 'plus' | 'premium';
}

/**
 * Snapshot al formularului public de comandă (Generator-ul de pe site) — NU
 * wizard-ul din chat. Trimis de client prin WS `presence:form_state` la
 * schimbarea pasului / datelor. Injectat în system prompt-ul Irinei ca să
 * ghideze userul să finalizeze formularul PE SITE în loc să preia comanda în chat.
 */
export interface GeneratorFormState {
  /** Index 0-based al pasului curent din Generator. */
  step: number;
  /** Numele localizat al pasului, exact cum îl vede userul (ex. „Detalii"). */
  stepName?: string;
  totalSteps?: number;
  /** Subset din câmpurile completate (style, occ, name, voice, packageTier...). */
  data?: Record<string, string | number | boolean>;
  /**
   * Opțiunile valide per-site pentru selecții (trimise de client), ca adminul să
   * poată schimba stil/ocazie/voce din chat cu ID-uri corecte indiferent de site.
   */
  options?: {
    styles?: Array<{ id: string; nm: string; em?: string }>;
    occasions?: Array<{ id: string; nm: string; em?: string }>;
    voices?: Array<{ id: string; nm: string }>;
  };
  /** Generation deja creată din formular (după submit demo / pay-first). */
  generationId?: string | null;
  updatedAt: string; // ISO — momentul ultimei modificări reale pe client
}

export interface WizardState {
  step: WizardStep;
  data: WizardData;
  generationId?: string | null;
  paymentId?: string | null;
  /** Câte RE-emiteri de link de plată au avut loc după primul (cap 1 — anti-spam).
   *  Emisia inițială NU contează — doar reluările din step='payment_sent'. */
  linkReissueCount?: number;
  /** De câte ori s-a trimis deja mesajul de cotare a prețului — guard anti-buclă.
   *  După prima cotare, quote_price_with_offer nu mai retrimite mesajul ci redirecționează AI-ul spre finalize. */
  priceQuotedCount?: number;
  /** Codul promo activ pe ACEASTĂ comandă — fie emis de AI (issue_discount_offer),
   *  fie introdus de user și validat (apply_user_code). Sursa de adevăr la finalize:
   *  se aplică pe checkout-ul Stripe. Leagă codul de conversație, nu doar de email —
   *  fix bug 2026-06-13 (cod emis înainte de colectarea email-ului nu se mai aplica). */
  appliedPromoCode?: string | null;
  /** Câte drafturi de versuri a generat AI-ul în chat (cap 3 — control cost). */
  lyricsDraftCount?: number;
  /** Userul a cerut versurile (sau AI i le-a promis) dar încă NU le-a primit, pentru
   *  că lipseau destinatarul/mesajul la momentul apelului `generate_lyrics`. Rămâne
   *  setat până când draftul chiar pleacă în chat — vezi bug conv 1e1319a9 (2026-07-30),
   *  unde Irina a promis versurile de 3 ori, apoi a trecut la email/pachete/plată și
   *  nu le-a trimis niciodată. ISO timestamp = promisiune neonorată. */
  lyricsPromisedAt?: string | null;
  /** Snapshot al `message`-ului din care s-a scris ULTIMUL draft de versuri (AI) —
   *  ca să detectăm când draftul devine stale (userul a mai dat poveste DUPĂ ce a
   *  fost generat). Non-null ⇒ `customLyrics` curent e draft AI (nu versuri lipite
   *  de user). Vezi bug conv 59b40eb5 (2026-07-06). */
  lyricsBasedOnMessage?: string;
  /** Schimbările aplicate de refacerea GRATUITĂ (request_modification cu isOurError /
   *  isRetentionOffer) — guard „nu încasa pentru o schimbare deja aplicată"
   *  (CHANGE_ALREADY_APPLIED_BY_REMAKE în ai-chat-agent.service.ts). */
  lastFreeRemakeChanges?: string | null;
  /** Numele destinatarului cu care a plecat ULTIMA refacere gratuită. Dacă clientul revine
   *  cerând ACELAȘI nume scris altfel (doar diacritice/majuscule diferite), înseamnă că
   *  refacerea n-a prins corectura lui ortografică → reparația e gratuită, nu contra cost.
   *  Vezi conv e28efea6 (2026-08-11). */
  lastFreeRemakeRecipientName?: string | null;
  /** ISO timestamp al refacerii gratuite de REPARAȚIE — acordată o singură dată când
   *  gratuitul inițial a fost consumat de AI pe o descriere vagă (fără cererea concretă
   *  a clientului), deci clientul nu a primit niciodată corectura pe care o cerea.
   *  Vezi conv 486bb25f (2026-08-08). */
  freeRemakeRepairAt?: string | null;
  /** Semnătura datelor comenzii (destinatar|dedicator|mesaj|email) la ULTIMA
   *  recapitulare trimisă userului. Dacă AI vrea să recapituleze din nou cu EXACT
   *  aceleași date, e o repetare robotică → RECAP_SAME_DATA_BLOCKED. Vezi conv
   *  fe06d874 (2026-08-05): a 3-a recapitulare identică a trecut de gărzile
   *  existente pentru că userul răspunsese între timp „Standar" (alegerea
   *  pachetului), nu un „da" simplu. */
  lastRecapSig?: string | null;
  /** Momentul (ISO) la care `start_new_order` a resetat ultima oară wizard-ul pentru o
   *  comandă NOUĂ. Un al doilea reset la câteva secunde distanță ar șterge exact datele
   *  colectate între timp pentru comanda nouă → NO_OP. Vezi conv 52c47f2f (2026-08-08). */
  newOrderStartedAt?: string | null;
  /** Modificare contra cost în așteptarea plății (request_modification). */
  modification?: {
    generationId: string;
    changes: string;
    scope: 'small' | 'large';
    paymentId?: string;
    /** Numele corectat al destinatarului, dacă modificarea îl schimbă. */
    newRecipientName?: string | null;
  } | null;
  /** Generări pentru care s-a trimis deja alertă email către admini (dedupe tech_error). */
  alertedGenerationIds?: string[];
  /** Finalize a fost blocat o dată pentru că lipsea pasul de upsell pachet (ETAPA 5.5).
   *  Blocăm O SINGURĂ dată — a doua oară lăsăm comanda să treacă pe basic, ca să nu
   *  ținem clientul captiv. Vezi guard-ul UPSELL_STEP_MISSING. */
  upsellGateUsed?: boolean;
  /** Finalize a fost blocat o dată pentru că brief-ul comenzii era gol de substanță
   *  personală (destinatar fără nume propriu / poveste inexistentă, inventată de AI).
   *  Blocăm O SINGURĂ dată — dacă userul chiar nu vrea să dea detalii, comanda trece.
   *  Vezi guard-ul THIN_BRIEF_MISSING_DETAILS. */
  thinBriefGateUsed?: boolean;
  updatedAt: string; // ISO
}

@Entity({ name: 'conversations' })
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  siteId!: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  guestId!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 200, default: 'Conversație' })
  subject!: string;

  @Column({ type: 'integer', default: 0 })
  unreadByAdmin!: number;

  @Column({ type: 'integer', default: 0 })
  unreadByUser!: number;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status!: 'open' | 'closed';

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastMessageAt!: Date | null;

  // ============== Faza 1: AI Mode + presence snapshot ==============

  /**
   * Modul AI pentru această conversație:
   *  - manual: AI-ul nu intervine
   *  - suggest: AI generează sugestii, adminul aprobă înainte de send
   *  - auto: AI răspunde singur (cu guardrails pentru acțiuni sensibile)
   * Default per site se setează în settings (AI_CHAT_MODE_DEFAULT).
   */
  @Column({ type: 'varchar', length: 16, default: 'manual' })
  aiMode!: AiChatMode;

  /** Ultima stare cunoscută a widget-ului (deschis/închis). Updated live prin WS. */
  @Column({ type: 'boolean', default: false })
  chatOpenOnClient!: boolean;

  /** Ultima rută pe care a fost văzut clientul (ex. /generator, /cadou/success). */
  @Column({ type: 'varchar', length: 500, nullable: true })
  lastClientPath!: string | null;

  /** Snapshot device (type, os, browser, viewport). Pentru sidebar admin. */
  @Column({ type: 'jsonb', nullable: true })
  lastDevice!: {
    type?: 'mobile' | 'tablet' | 'desktop';
    os?: string;
    browser?: string;
    viewport?: { w: number; h: number };
    userAgent?: string;
  } | null;

  /** Momentul ultimei conectări WS (start timer "este pe site de X minute"). */
  @Column({ type: 'timestamptz', nullable: true })
  connectedAt!: Date | null;

  /** Momentul ultimei deconectări (după debounce de 5s). */
  @Column({ type: 'timestamptz', nullable: true })
  disconnectedAt!: Date | null;

  /** Conversație arhivată — nu apare în lista default (doar la filtru explicit). */
  @Column({ type: 'timestamptz', nullable: true })
  archivedAt!: Date | null;

  /**
   * State machine pentru AI sales wizard. Persistă datele colectate de AI prin
   * întrebări succesive (stil, ocazie, beneficiar, mesaj, voce). La finalize:
   * creează Generation pending + Stripe checkout + trimite payment_link.
   * NULL = userul n-a intrat încă în flow-ul de comandă.
   */
  @Column({ type: 'jsonb', nullable: true })
  wizardState!: WizardState | null;

  /**
   * Ultima stare cunoscută a formularului Generator de pe site (vine prin WS
   * `presence:form_state`). Fallback DB pentru AI când presence-ul in-memory
   * din gateway s-a pierdut (restart API / user offline). NULL = userul n-a
   * început formularul în sesiunea curentă.
   */
  @Column({ type: 'jsonb', nullable: true })
  lastFormState!: GeneratorFormState | null;

  /**
   * Admin user-ul care s-a auto-atribuit la această conversație (claim).
   * Folosit ca să vadă echipa cine se ocupă activ de un client și să evite
   * dubla intervenție. NULL = neclaimed (oricine poate prelua).
   */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  assignedAdminId!: string | null;

  /** Email-ul admin-ului asignat (denormalizat pentru afișare rapidă în UI). */
  @Column({ type: 'varchar', length: 320, nullable: true })
  assignedAdminEmail!: string | null;

  /** Momentul claim-ului. */
  @Column({ type: 'timestamptz', nullable: true })
  assignedAt!: Date | null;

  /** Marcată ca favorită de admin (pentru filtru rapid în sidebar). */
  @Column({ type: 'boolean', default: false })
  @Index()
  isFavorite!: boolean;

  /** Notă privată a adminului — pentru when reviens la conversație (TODO, status...). */
  @Column({ type: 'text', nullable: true })
  adminNote!: string | null;

  // ============== AI Sales Agent (Faza 6) — Irina virtuală ==============

  /**
   * Momentul în care AI-ul a trimis primul salut proactiv pe această conversație.
   * Anti-spam: dacă != null, NU mai salutăm a doua oară (chiar dacă userul revine
   * după ore/zile pe site cu același guestId).
   */
  @Column({ type: 'timestamptz', nullable: true })
  greetingSentAt!: Date | null;

  /**
   * Câte mesaje de empatie a trimis AI-ul în această conv (condoleanțe / „să-ți
   * trăiască" etc.). Hard cap 2 per conv pentru a nu suna fals/spam.
   */
  @Column({ type: 'integer', default: 0 })
  empathyMessagesSent!: number;

  /**
   * Ultimul IP cunoscut al user-ului/guest-ului. Persistat la fiecare WS connect.
   * Sursă fallback robustă când analytics_sessions n-are date (user nou care n-a
   * trimis încă pageview) sau când gateway memory s-a curățat (API restart).
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  lastIp!: string | null;

  /**
   * Câte mesaje de follow-up („mai ești aici?") a trimis AI-ul de la ultimul
   * mesaj al userului. Resetat la 0 când userul scrie. Cap 2 per fereastră de tăcere.
   */
  @Column({ type: 'integer', default: 0 })
  aiFollowupCount!: number;

  /**
   * Contorul limitei de mesaje AI numără doar mesajele de DUPĂ acest moment.
   * Setat la fiecare plată reușită și la re-activarea AI de către admin — astfel
   * un client fidel care cumpără a 2-a/a 3-a oară nu moștenește bugetul consumat.
   */
  @Column({ type: 'timestamptz', nullable: true })
  aiCapResetAt!: Date | null;
}
