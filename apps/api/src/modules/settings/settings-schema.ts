import type { SettingKind } from './app-setting.entity';

export interface SettingDef {
  key: string;
  label: string;
  description?: string;
  kind: SettingKind;
  encrypted?: boolean;
  /** Necesită restart API ca să intre în vigoare. */
  requiresRestart?: boolean;
  options?: string[];
  /** Label uman pentru `options` (value rămâne raw). */
  optionLabels?: Record<string, string>;
  placeholder?: string;
  /** Dacă true, se aplică hot fără restart (gestionat de RuntimeConfig). */
  hotReload?: boolean;
  /** Subsecțiune vizuală în UI (ex. OpenAI în Chei). */
  group?: string;
  /** „Ce face” — o frază pentru operator. */
  helpWhat?: string;
  /** „De unde iei cheia” — dashboard / comandă. */
  helpWhere?: string;
  helpUrl?: string;
}

export interface SettingCategory {
  id: string;
  title: string;
  description?: string;
  settings: SettingDef[];
}

const AI_CHAT_MODEL_LABELS: Record<string, string> = {
  'gpt-5.4': 'GPT-5.4',
  'gpt-5.4-mini': 'GPT-5.4 mini (recomandat)',
  'gpt-5': 'GPT-5',
  'gpt-5-mini': 'GPT-5 mini',
  'gpt-4.1': 'GPT-4.1',
  'gpt-4.1-mini': 'GPT-4.1 mini',
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o mini (legacy)',
};

/**
 * Schema completă a setărilor. Cheile sunt EXACT numele variabilelor din .env
 * pentru a păstra fallback-ul transparent. Valorile salvate în DB au prioritate.
 *
 * 6 categorii de UI (nu 10). Aceleași key strings; doar grouping + copy.
 */
export const SETTINGS_SCHEMA: SettingCategory[] = [
  {
    id: 'acces',
    title: 'Acces',
    description: 'Cine intră în admin și cât ține magic link-ul de login.',
    settings: [
      {
        key: 'ADMIN_EMAILS',
        label: 'Email-uri admin',
        kind: 'string',
        placeholder: 'admin@manelecadou.ro,owner@gmail.com',
        // Citit din ConfigService (env) în auth.service.ts + seeder.service.ts,
        // nu prin SettingsService → un override salvat aici nu ajunge nicăieri.
        helpWhat: 'Adresele care primesc acces admin, separate prin virgulă.',
        helpWhere:
          'DOAR CITIRE aici: se ia din `.env` (ADMIN_EMAILS) la pornirea API-ului. Salvarea din admin nu are efect — modifică `.env` și repornește API-ul.',
      },
      {
        key: 'MAGIC_LINK_TTL_MIN',
        label: 'Durată magic link',
        kind: 'number',
        placeholder: '15',
        // Citit din ConfigService (env) în auth.service.ts (default 15).
        helpWhat: 'Câte minute e valabil linkul de login din email. Default 15.',
        helpWhere:
          'DOAR CITIRE aici: se ia din `.env` (MAGIC_LINK_TTL_MIN) la pornirea API-ului. Salvarea din admin nu are efect — modifică `.env` și repornește API-ul.',
      },
    ],
  },
  {
    id: 'keys',
    title: 'Chei',
    description: 'Un singur set de chei pentru toate site-urile. Pixelii Meta/TikTok/GA4 sunt per site, la Operațiuni.',
    settings: [
      {
        key: 'OPENAI_API_KEY',
        label: 'Cheie OpenAI',
        kind: 'secret',
        encrypted: true,
        hotReload: true,
        placeholder: 'sk-…',
        group: 'OpenAI',
        helpWhat: 'Versuri, Irina, traduceri.',
        helpWhere: 'platform.openai.com → API keys. Format sk-…',
        helpUrl: 'https://platform.openai.com/api-keys',
      },
      {
        key: 'OPENAI_MODEL',
        label: 'Model default',
        kind: 'string',
        hotReload: true,
        placeholder: 'gpt-4o-mini',
        group: 'OpenAI',
        helpWhat: 'Modelul folosit la versuri și traduceri dacă nu e alt override.',
      },
      {
        key: 'OPENAI_AUTOREPLY_MODEL',
        label: 'Model auto-reply inbox',
        description: 'Override pentru răspunsurile AI din Inbox. Gol = modelul default.',
        kind: 'string',
        hotReload: true,
        group: 'OpenAI',
        helpWhat: 'Doar pentru auto-reply din Inbox. Gol = modelul default OpenAI.',
      },
      // Grupul „Suno" trebuie să rămână contiguu: UI-ul (settings/_content.tsx →
      // groupRows) unește doar rândurile CONSECUTIVE cu același `group`, altfel
      // apare de două ori în pagină.
      {
        key: 'SUNO_API_KEY',
        label: 'Cheie Suno',
        kind: 'secret',
        encrypted: true,
        hotReload: true,
        group: 'Suno',
        helpWhat: 'Generare audio Suno pe toate site-urile.',
        helpWhere: 'sunoapi.org → dashboard',
        helpUrl: 'https://sunoapi.org',
      },
      {
        key: 'SUNO_API_BASE_URL',
        label: 'URL API Suno',
        kind: 'string',
        hotReload: true,
        group: 'Suno',
        placeholder: 'https://api.sunoapi.org',
        helpWhat: 'Endpoint-ul sunoapi.org. Lasă default dacă nu știi de ce l-ai schimba.',
      },
      {
        key: 'SUNO_MODEL',
        label: 'Model Suno',
        kind: 'string',
        hotReload: true,
        placeholder: 'V4_5',
        group: 'Suno',
        helpWhat: 'Versiunea modelului audio (ex. V4_5).',
      },
      {
        key: 'SUNO_PROVIDER',
        label: 'Provider Suno',
        kind: 'select',
        options: ['mock', 'real'],
        optionLabels: {
          mock: 'Mock — fără generare reală',
          real: 'Real — sunoapi.org',
        },
        // Citit din ConfigService (env) în suno.module.ts, la construirea
        // providerului → nici restartul nu ia valoarea din DB.
        group: 'Suno',
        helpWhat: 'Mock pentru test local, real pentru producție.',
        helpWhere:
          'DOAR CITIRE aici: se ia din `.env` (SUNO_PROVIDER) la pornirea API-ului. Salvarea din admin nu are efect — modifică `.env` și repornește API-ul.',
      },
      {
        key: 'GEMINI_API_KEY',
        label: 'Cheie Gemini',
        kind: 'secret',
        encrypted: true,
        hotReload: true,
        placeholder: 'AIza…',
        group: 'Gemini / Lyria',
        helpWhat:
          'Singura cheie pentru Lyria 3 Pro, când un site e pe motorul Google. Motorul se alege per site, la Generare. Fără ea, generările pe Google eșuează imediat (fără reîncercări).',
        helpWhere: 'aistudio.google.com/apikey',
        helpUrl: 'https://aistudio.google.com/apikey',
      },
      {
        key: 'LYRIA_MODEL',
        label: 'Model Lyria',
        kind: 'string',
        hotReload: true,
        placeholder: 'lyria-3-pro-preview',
        group: 'Gemini / Lyria',
        helpWhat: 'Numele modelului Google Lyria. Folosit doar pe site-urile cu motor Google.',
      },
      // Cloudflare R2 — citite de StorageService DB-first (fallback env) și
      // reaplicate la cald la salvare (StorageService se abonează la
      // SettingsService.onChange). Dacă STORAGE_DRIVER=r2 dar lipsesc cheile,
      // API-ul NU cade: rămâne pe disc și scrie o eroare în log.
      {
        key: 'STORAGE_DRIVER',
        label: 'Storage fișiere',
        kind: 'select',
        options: ['disk', 'r2'],
        optionLabels: { disk: 'Disc local', r2: 'Cloudflare R2' },
        hotReload: true,
        group: 'Cloudflare R2',
        helpWhat:
          'Unde se salvează audio, logo, video, chat. Pe Coolify pune r2. Se aplică imediat la salvare; dacă lipsește vreo cheie R2, API-ul rămâne pe disc (fișierele nu se pierd) și scrie eroarea în log.',
      },
      {
        key: 'R2_ACCOUNT_ID',
        label: 'R2 Account ID',
        kind: 'string',
        hotReload: true,
        group: 'Cloudflare R2',
        helpWhat: 'Din el se derivă endpointul S3, dacă nu completezi „R2 Endpoint".',
        helpWhere: 'dash.cloudflare.com → R2',
      },
      {
        key: 'R2_ACCESS_KEY_ID',
        label: 'R2 Access Key',
        kind: 'secret',
        encrypted: true,
        hotReload: true,
        group: 'Cloudflare R2',
        helpWhere: 'Cloudflare → R2 → Manage API tokens → S3 credentials (Access Key ID).',
      },
      {
        key: 'R2_SECRET_ACCESS_KEY',
        label: 'R2 Secret Key',
        kind: 'secret',
        encrypted: true,
        hotReload: true,
        group: 'Cloudflare R2',
        helpWhere: 'Aceeași pagină ca Access Key — se arată o singură dată, la creare.',
      },
      {
        key: 'R2_BUCKET',
        label: 'R2 Bucket',
        kind: 'string',
        hotReload: true,
        placeholder: 'manelecadou-uploads',
        group: 'Cloudflare R2',
        helpWhat: 'Numele bucketului în care se scriu fișierele.',
      },
      {
        key: 'R2_ENDPOINT',
        label: 'R2 Endpoint (opțional)',
        kind: 'string',
        hotReload: true,
        placeholder: 'https://<account-id>.r2.cloudflarestorage.com',
        group: 'Cloudflare R2',
        helpWhat:
          'Endpoint S3 custom. Gol = derivat din Account ID. Completează-l doar pentru un endpoint diferit (ex. jurisdicție EU).',
      },
      {
        key: 'R2_PUBLIC_URL',
        label: 'R2 URL public',
        kind: 'string',
        hotReload: true,
        placeholder: 'https://files.manelecadou.ro',
        group: 'Cloudflare R2',
        helpWhat:
          'Custom domain pe bucket (Public access). /uploads redirectează aici. Gol = fișierele se servesc prin API (mai lent, seek limitat în player).',
      },
      {
        key: 'STRIPE_SECRET_KEY',
        label: 'Cheie secretă Stripe',
        kind: 'secret',
        encrypted: true,
        hotReload: true,
        placeholder: 'sk_live_…',
        group: 'Stripe',
        helpWhat: 'Checkout pe toate site-urile (un singur cont).',
        helpWhere: 'dashboard.stripe.com/apikeys',
        helpUrl: 'https://dashboard.stripe.com/apikeys',
      },
      {
        key: 'STRIPE_WEBHOOK_SECRET',
        label: 'Secret webhook Stripe',
        kind: 'secret',
        encrypted: true,
        hotReload: true,
        placeholder: 'whsec_…',
        group: 'Stripe',
        helpWhat: 'Semnătură webhook https://manelecadou.ro/api/payments/webhook',
        helpWhere: 'Stripe → Developers → Webhooks',
        helpUrl: 'https://dashboard.stripe.com/webhooks',
      },
      {
        key: 'MAILGUN_API_KEY',
        label: 'Cheie Mailgun',
        kind: 'secret',
        encrypted: true,
        hotReload: true,
        group: 'Mailgun',
        helpWhat: 'Mail transactional global (magic link, confirmări).',
        helpWhere: 'app.mailgun.com → API keys',
        helpUrl: 'https://app.mailgun.com',
      },
      {
        key: 'MAILGUN_WEBHOOK_SIGNING_KEY',
        label: 'Cheie semnare webhook Mailgun',
        kind: 'secret',
        encrypted: true,
        hotReload: true,
        group: 'Mailgun',
        // Nicăieri consumată în apps/api/src (doar declarată în env.validation.ts).
        helpWhat:
          'NU E ÎNCĂ FOLOSITĂ de API — rezervată pentru verificarea webhook-urilor Mailgun (bounce, deschidere). Salvarea ei nu schimbă nimic deocamdată.',
        helpWhere: 'Mailgun → Sending → Webhooks → HTTP webhook signing key',
        helpUrl: 'https://app.mailgun.com',
      },
      {
        key: 'VAPID_PUBLIC_KEY',
        label: 'Cheie publică VAPID',
        kind: 'string',
        hotReload: true,
        placeholder: 'B…',
        group: 'VAPID',
        helpWhat: 'Jumătatea publică pentru Web Push la admin.',
        helpWhere: 'Aceeași comandă ca la cheia privată — copiază Public Key.',
      },
      {
        key: 'VAPID_PRIVATE_KEY',
        label: 'Cheie privată VAPID',
        kind: 'secret',
        encrypted: true,
        hotReload: true,
        group: 'VAPID',
        helpWhat: 'Push la admin pe mesaj nou în chat.',
        helpWhere: 'npx web-push generate-vapid-keys',
      },
      {
        key: 'VAPID_SUBJECT',
        label: 'Subject VAPID',
        kind: 'string',
        hotReload: true,
        placeholder: 'mailto:serban2702@gmail.com',
        group: 'VAPID',
        helpWhat: 'Contact mailto: cerut de standardul Web Push.',
      },
      {
        key: 'WINGO_API_KEY',
        label: 'Cheie Wingo',
        kind: 'secret',
        encrypted: true,
        hotReload: true,
        placeholder: '64 caractere hex',
        group: 'Wingo',
        helpWhat: 'Alerte credite Suno + API căzut.',
        helpWhere: 'notifications.wingo.ro',
        helpUrl: 'https://notifications.wingo.ro',
      },
      {
        key: 'WINGO_NOTIFY_URL',
        label: 'URL notificare Wingo',
        kind: 'string',
        hotReload: true,
        placeholder: 'https://notifications.wingo.ro/api/v1/notify/send',
        group: 'Wingo',
        helpWhat: 'Endpoint-ul unde se trimit alertele. Lasă default-ul dacă nu ți-a dat Wingo altul.',
      },
    ],
  },
  {
    id: 'mail-system',
    title: 'Email sistem',
    description: 'Magic link, confirmări, recuperare. Nu e Inbox Hub. SMTP sau Mailgun — se arată doar providerul ales.',
    settings: [
      {
        key: 'MAIL_PROVIDER',
        label: 'Provider',
        kind: 'select',
        options: ['smtp', 'mailgun'],
        optionLabels: { smtp: 'SMTP', mailgun: 'Mailgun' },
        hotReload: true,
        helpWhat: 'Pe unde ies mailurile de sistem. Cheile Mailgun stau la Chei.',
      },
      {
        key: 'MAIL_FROM',
        label: 'From (email)',
        kind: 'string',
        hotReload: true,
        placeholder: 'no-reply@manelecadou.ro',
        helpWhat: 'Adresa vizibilă ca expeditor pe magic link și confirmări.',
      },
      {
        key: 'MAIL_FROM_NAME',
        label: 'From (nume)',
        kind: 'string',
        hotReload: true,
        helpWhat: 'Numele de lângă adresă, ex. Manele Cadou.',
      },
      {
        key: 'SMTP_HOST',
        label: 'Host SMTP',
        kind: 'string',
        hotReload: true,
        group: 'SMTP',
        helpWhat: 'Serverul SMTP (doar dacă provider = SMTP).',
      },
      {
        key: 'SMTP_PORT',
        label: 'Port SMTP',
        kind: 'number',
        hotReload: true,
        group: 'SMTP',
        placeholder: '587',
      },
      {
        key: 'SMTP_USER',
        label: 'User SMTP',
        kind: 'string',
        hotReload: true,
        group: 'SMTP',
      },
      {
        key: 'SMTP_PASS',
        label: 'Parolă SMTP',
        kind: 'secret',
        encrypted: true,
        hotReload: true,
        group: 'SMTP',
        helpWhat: 'Parola sau app password a contului SMTP.',
        helpWhere: 'Panoul hostului de mail (nu Mailgun).',
      },
      {
        key: 'SMTP_SECURE',
        label: 'SMTP SSL/TLS',
        kind: 'bool',
        hotReload: true,
        group: 'SMTP',
        helpWhat: 'On pentru port 465. Off de obicei pe 587 (STARTTLS).',
      },
      {
        key: 'MAILGUN_DOMAIN',
        label: 'Domeniu Mailgun',
        kind: 'string',
        hotReload: true,
        group: 'Mailgun',
        placeholder: 'mg.manelecadou.ro',
        helpWhat: 'Domeniul verificat în Mailgun, nu domeniul public al site-ului.',
      },
      {
        key: 'MAILGUN_REGION',
        label: 'Regiune Mailgun',
        kind: 'select',
        options: ['us', 'eu'],
        optionLabels: { us: 'US', eu: 'EU' },
        hotReload: true,
        group: 'Mailgun',
        helpWhat: 'EU dacă domeniul e creat în centrul european.',
      },
      {
        key: 'MAILGUN_API_URL',
        label: 'URL API Mailgun',
        kind: 'string',
        hotReload: true,
        group: 'Mailgun',
        placeholder: 'https://api.eu.mailgun.net',
        helpWhat: 'Override de endpoint. Gol = derivat din regiune.',
      },
      {
        key: 'MAILGUN_FROM_EMAIL',
        label: 'From Mailgun (override)',
        kind: 'string',
        hotReload: true,
        group: 'Mailgun',
        helpWhat: 'Dacă e setat, înlocuiește From-ul global doar pe canalul Mailgun.',
      },
    ],
  },
  {
    id: 'ai-chat',
    title: 'AI Chat',
    description: 'Irina — modul implicit, modelul și limitele. Se aplică la conversațiile noi.',
    settings: [
      {
        key: 'AI_CHAT_MODE_DEFAULT',
        label: 'Mod implicit pe conversație nouă',
        description:
          'manual = AI nu intervine. suggest = AI propune, adminul aprobă. auto = AI răspunde singur (acțiunile sensibile cer aprobare).',
        kind: 'select',
        options: ['manual', 'suggest', 'auto'],
        optionLabels: {
          manual: 'Manual — AI nu intervine',
          suggest: 'Suggest — AI propune, tu aprobi',
          auto: 'Auto — AI răspunde singur',
        },
        hotReload: true,
        placeholder: 'manual',
        helpWhat: 'Doar conversațiile noi. Pe una existentă îl schimbi din chat.',
      },
      {
        key: 'AI_CHAT_MODEL',
        label: 'Model chat',
        description:
          'Recomandat: gpt-5.4-mini. gpt-4o-mini e vechi și se încurcă pe conversații non-liniare.',
        kind: 'select',
        options: ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini'],
        optionLabels: AI_CHAT_MODEL_LABELS,
        hotReload: true,
        placeholder: 'gpt-5.4-mini',
        helpWhat: 'Răspunsuri + tool calling pentru Irina.',
      },
      {
        key: 'AI_CHAT_MAX_TOKENS',
        label: 'Buget tokeni per pas',
        description:
          'La gpt-5 include reasoning-ul intern; prea mic = răspunsuri tăiate. Recomandat 6000.',
        kind: 'number',
        hotReload: true,
        placeholder: '6000',
        helpWhat: 'Plafon per pas al agentului. Nu e costul lunar.',
      },
      {
        key: 'AI_CHAT_TEMPERATURE',
        label: 'Temperature',
        description: '0 = factual, 1 = creativ. Ignorat de gpt-5/o-series.',
        kind: 'number',
        hotReload: true,
        placeholder: '0.4',
        helpWhat: 'Doar modele non-reasoning. Recomandat 0,3–0,5.',
      },
      {
        key: 'AI_CHAT_SYSTEM_PROMPT',
        label: 'System prompt',
        description: 'Brand voice, limite, ton. Gol = promptul default per site.',
        kind: 'longtext',
        hotReload: true,
        placeholder: 'Ești asistentul Manele Cadou…',
        helpWhat: 'Instrucțiuni de bază. Gol = promptul brand-aware din cod.',
      },
      {
        key: 'AI_CHAT_REASONING_EFFORT',
        label: 'Efort de gândire',
        description:
          'Cât „gândește" modelul înainte să aleagă un tool sau să răspundă. Ignorat de modelele non-reasoning (gpt-4o).',
        kind: 'select',
        options: ['minimal', 'low', 'medium', 'high'],
        optionLabels: {
          minimal: 'Minimal — cel mai rapid',
          low: 'Low',
          medium: 'Medium (default)',
          high: 'High — cel mai atent, cel mai lent',
        },
        hotReload: true,
        placeholder: 'medium',
        helpWhat:
          'Default medium (și pentru orice valoare nerecunoscută). Mai mult efort = răspunsuri mai bune, latență și cost mai mari.',
      },
      {
        key: 'AI_FOLLOWUP_ENABLED',
        label: 'Follow-up automat în chat',
        description:
          'Când clientul tace 4+ minute pe o conversație în modul auto, Irina revine cu un mesaj (max 2 per fereastră).',
        kind: 'bool',
        hotReload: true,
        // Consumator: ai-followup.service.ts — cron pe minut, se oprește DOAR pe
        // 'false'/'0'; gol înseamnă ACTIV.
        helpWhat:
          'ACTIV implicit: cât timp e gol/necompletat, follow-up-ul rulează. Se oprește doar punându-l explicit pe „Dezactivat".',
      },
      {
        key: 'AI_ALERT_EMAILS',
        label: 'Emailuri alertă Irina',
        description:
          'Unde pleacă alertele urgente: escaladare la om, cap de mesaje atins, generare blocată, erori tehnice.',
        kind: 'string',
        hotReload: true,
        placeholder: 'serban2702@gmail.com,alexandru.tihon70@gmail.com',
        helpWhat:
          'Listă CSV. Gol = destinatarii default din cod (serban2702@gmail.com, alexandru.tihon70@gmail.com). Se folosește și la alerta de plată dublă, cu fallback pe ADMIN_EMAILS.',
      },
      {
        key: 'AI_CHAT_PROACTIVE_ENABLED',
        label: 'Abordare automată',
        description: 'AI scanează userii inactivi și inițiază conversația. Doar în suggest sau auto.',
        kind: 'bool',
        hotReload: true,
        // Nicăieri consumată în apps/api/src — rezervată.
        helpWhat:
          'NU E ÎNCĂ FOLOSITĂ de API — rezervată. Pentru follow-up-ul care chiar funcționează, vezi „Follow-up automat în chat".',
      },
      {
        key: 'AI_CHAT_PROACTIVE_IDLE_MIN',
        label: 'Minute idle înainte de abordare',
        kind: 'number',
        hotReload: true,
        placeholder: '5',
        // Nicăieri consumată în apps/api/src — rezervată (perechea celei de sus).
        helpWhat:
          'NU E ÎNCĂ FOLOSITĂ de API — rezervată, împreună cu „Abordare automată". Pragul real de follow-up (4 min) e fix în cod.',
      },
      {
        key: 'AI_CHAT_LEARN_NIGHTLY',
        label: 'Învățare nocturnă',
        description: 'Cron care extrage candidați de memorie din conversațiile rezolvate. Tu aprobi.',
        kind: 'bool',
        hotReload: true,
        helpWhat: 'Pornește după ~50 conversații reale. Review-ul e la /ai-memory.',
      },
      {
        key: 'AI_CHAT_REQUIRE_APPROVAL_FOR_PAYMENT',
        label: 'Aprobare pentru link de plată',
        description: 'Chiar și în auto, AI nu trimite link de plată fără tine. Recomandat ON.',
        kind: 'bool',
        hotReload: true,
        helpWhat: 'Nu trece pe off în producție.',
      },
      {
        key: 'AI_CHAT_REQUIRE_APPROVAL_FOR_GENERATION',
        label: 'Aprobare pentru generare',
        description: 'Gate pentru un viitor tool de generare pornită din chat.',
        kind: 'bool',
        hotReload: true,
        // Nicăieri consumată în apps/api/src — rezervată (spre deosebire de
        // AI_CHAT_REQUIRE_APPROVAL_FOR_PAYMENT, care e activ).
        helpWhat:
          'NU E ÎNCĂ FOLOSITĂ de API — rezervată. Gate-ul care chiar funcționează azi e cel pentru linkul de plată.',
      },
    ],
  },
  {
    id: 'marketing',
    title: 'Marketing',
    description: 'Drip de oferte. Campaniile și regulile se editează în /marketing. Pixelii Meta/TikTok/GA4 sunt per site, la Operațiuni.',
    settings: [
      {
        key: 'MARKETING_AUTOMATION_ENABLED',
        label: 'Reguli automate active',
        description: 'Master switch pentru cron-ul nightly (09:00 UTC). Fiecare regulă are și propriul on/off.',
        kind: 'bool',
        hotReload: true,
        helpWhat: 'Oprește tot drip-ul dintr-un click, fără să ștergi regulile.',
      },
      {
        key: 'MARKETING_RULE_MAX_PER_RUN',
        label: 'Max emailuri per regulă / rulare',
        description: 'Plafon când activezi o regulă pe un backlog mare.',
        kind: 'number',
        hotReload: true,
        placeholder: '200',
        helpWhat: 'Siguranță anti-burst, nu limita lunară de la Mailgun.',
      },
      {
        key: 'RECOVERY_EMAIL_ENABLED',
        label: 'Emailuri de recuperare comenzi',
        description:
          'Cron la 10 minute pentru comenzile abandonate: 1h/4h → 10%, 24h → 20%, 48h/72h/7z → 30%.',
        kind: 'bool',
        hotReload: true,
        group: 'Recuperare comenzi',
        // Consumator: recovery-cron.service.ts — se oprește DOAR pe 'false'/'0';
        // gol înseamnă ACTIV.
        helpWhat:
          'ACTIV implicit: cât timp e gol/necompletat, cron-ul rulează. Se oprește doar punându-l explicit pe „Dezactivat".',
      },
      {
        key: 'RECOVERY_EXCLUDE_EMAILS',
        label: 'Emailuri excluse de la recuperare',
        description: 'Adrese interne care nu trebuie să primească emailuri de recuperare.',
        kind: 'string',
        hotReload: true,
        group: 'Recuperare comenzi',
        placeholder: '@manelecadou.ro,serban2702@gmail.com',
        helpWhat:
          'Listă CSV; o intrare care începe cu „@" exclude tot domeniul. Gol = lista default din cod (@manelecadou.ro + adresele interne).',
      },
    ],
  },
  {
    id: 'advanced',
    title: 'Avansat',
    description: 'Polling IMAP, director atașamente, alerte credite Suno. Nu umbla dacă nu știi de ce.',
    settings: [
      {
        key: 'MAIL_POLL_INTERVAL_MS',
        label: 'Interval polling IMAP',
        description: 'Cât de des verifică serverul mesaje noi, în milisecunde.',
        kind: 'number',
        placeholder: '60000',
        // Citit din `process.env` la încărcarea modulului (imap-sync.processor.ts)
        // → nici restartul nu ia valoarea din DB.
        helpWhat: 'Inbox Hub. 60000 = un minut.',
        helpWhere:
          'DOAR CITIRE aici: se ia din `.env` (MAIL_POLL_INTERVAL_MS) la pornirea API-ului. Salvarea din admin nu are efect — modifică `.env` și repornește API-ul.',
      },
      {
        key: 'MAIL_ATTACH_DIR',
        label: 'Director atașamente (vechi)',
        kind: 'string',
        placeholder: '/tmp/manelecadou-mail-attach',
        // Citit din `process.env` la încărcarea modulelor de mail. Fișierele NOI
        // se scriu prin StorageService, în uploads (`mail-attach/...`) + R2;
        // directorul ăsta rămâne doar ca sursă de citire pentru rândurile vechi.
        helpWhat:
          'Volumul vechi de atașamente. Fișierele noi merg în uploads/mail-attach (deci și pe R2); aici se mai caută doar atașamentele de dinainte de migrare.',
        helpWhere:
          'DOAR CITIRE aici: se ia din `.env` (MAIL_ATTACH_DIR) la pornirea API-ului. Salvarea din admin nu are efect — modifică `.env` și repornește API-ul.',
      },
      {
        key: 'SUNO_CREDIT_MONITOR_ENABLED',
        label: 'Monitor credite Suno',
        description: 'Cron la fiecare minut. Default ON; oprește cu off.',
        kind: 'bool',
        hotReload: true,
        helpWhat: 'Citește soldul Suno și alertează pe Wingo la prag sau API căzut.',
      },
      {
        key: 'IDENTITY_GUEST_ADOPTION',
        label: 'Recuperare sesiune guest',
        description:
          'Când serverul are voie să dea înapoi un guest pe care browserul nu-l mai are (localStorage șters).',
        kind: 'select',
        options: ['visitor', 'off'],
        optionLabels: {
          visitor: 'Doar pe același browser (default)',
          off: 'Oprit — nimeni nu primește un guest înapoi',
        },
        hotReload: true,
        // Consumator: identity.service.ts → maybeAdoptGuest. Gol = 'visitor'.
        helpWhat:
          'Default „doar pe același browser": se dă înapoi exclusiv guest-ul legat de aceeași amprentă de vizitator, confirmat de cheia de dispozitiv. NU se mai adoptă pe cheie de dispozitiv + IP (se ciocnesc între iPhone-uri diferite din același /24 de operator, deci un om ajungea în comenzile altuia). „Oprit" e frâna de urgență dacă apar iar rapoarte ciudate — clienții cu storage șters pornesc pur și simplu o sesiune nouă.',
      },
      {
        key: 'SUNO_CREDIT_ALERT_THRESHOLD',
        label: 'Prag alertă credite',
        description: 'Sub această valoare, o alertă Wingo (apoi doar dacă scade iar).',
        kind: 'number',
        hotReload: true,
        placeholder: '100',
        helpWhat: 'Default 100 credite. Alerta nu se repetă la același sold.',
      },
    ],
  },
];

export const ALL_KEYS: string[] = SETTINGS_SCHEMA.flatMap((c) => c.settings.map((s) => s.key));

export function findDef(key: string): SettingDef | null {
  for (const cat of SETTINGS_SCHEMA) {
    const s = cat.settings.find((x) => x.key === key);
    if (s) return s;
  }
  return null;
}
