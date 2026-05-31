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
  placeholder?: string;
  /** Dacă true, se aplică hot fără restart (gestionat de RuntimeConfig). */
  hotReload?: boolean;
}

export interface SettingCategory {
  id: string;
  title: string;
  description?: string;
  settings: SettingDef[];
}

/**
 * Schema completă a setărilor. Cheile sunt EXACT numele variabilelor din .env
 * pentru a păstra fallback-ul transparent. Valorile salvate în DB au prioritate.
 */
export const SETTINGS_SCHEMA: SettingCategory[] = [
  {
    id: 'general',
    title: 'General',
    description: 'Setări de bază pentru aplicație.',
    settings: [
      { key: 'ADMIN_EMAILS', label: 'Email-uri admin', description: 'Adrese cu acces admin (separate prin virgulă).', kind: 'string', placeholder: 'admin@manelecadou.ro,owner@gmail.com', hotReload: true },
      { key: 'MAGIC_LINK_TTL_MIN', label: 'Magic link TTL (minute)', kind: 'number', hotReload: true },
    ],
  },
  {
    id: 'openai',
    title: 'OpenAI',
    description: 'Cheile și modelele OpenAI folosite pentru lyrics, AI auto-reply și alte funcții.',
    settings: [
      { key: 'OPENAI_API_KEY', label: 'API key', kind: 'secret', encrypted: true, hotReload: true, placeholder: 'sk-...' },
      { key: 'OPENAI_MODEL', label: 'Model default', kind: 'string', hotReload: true, placeholder: 'gpt-4o-mini' },
      { key: 'OPENAI_AUTOREPLY_MODEL', label: 'Model AI auto-reply (opțional)', description: 'Override pentru răspunsurile AI din Inbox. Dacă e gol, se folosește modelul default.', kind: 'string', hotReload: true },
    ],
  },
  {
    id: 'mail-system',
    title: 'Email sistem (transactional)',
    description: 'Folosit pentru magic-link, confirmări, notificări. NU se folosește pentru Inbox Hub.',
    settings: [
      { key: 'MAIL_PROVIDER', label: 'Provider', kind: 'select', options: ['smtp', 'mailgun'], hotReload: true },
      { key: 'MAIL_FROM', label: 'From (email)', kind: 'string', hotReload: true, placeholder: 'no-reply@manelecadou.ro' },
      { key: 'MAIL_FROM_NAME', label: 'From (nume)', kind: 'string', hotReload: true },
      { key: 'SMTP_HOST', label: 'SMTP host', kind: 'string', hotReload: true },
      { key: 'SMTP_PORT', label: 'SMTP port', kind: 'number', hotReload: true },
      { key: 'SMTP_USER', label: 'SMTP user', kind: 'string', hotReload: true },
      { key: 'SMTP_PASS', label: 'SMTP password', kind: 'secret', encrypted: true, hotReload: true },
      { key: 'SMTP_SECURE', label: 'SMTP SSL/TLS', kind: 'bool', hotReload: true },
      { key: 'MAILGUN_API_KEY', label: 'Mailgun API key', kind: 'secret', encrypted: true, hotReload: true },
      { key: 'MAILGUN_DOMAIN', label: 'Mailgun domain', kind: 'string', hotReload: true },
      { key: 'MAILGUN_REGION', label: 'Mailgun region', kind: 'select', options: ['us', 'eu'], hotReload: true },
      { key: 'MAILGUN_API_URL', label: 'Mailgun API URL', kind: 'string', hotReload: true },
      { key: 'MAILGUN_FROM_EMAIL', label: 'Mailgun from email', kind: 'string', hotReload: true },
      { key: 'MAILGUN_WEBHOOK_SIGNING_KEY', label: 'Mailgun webhook signing key', kind: 'secret', encrypted: true, hotReload: true },
    ],
  },
  {
    id: 'mail-hub',
    title: 'Inbox Hub & AI auto-reply',
    description: 'Setări pentru polling-ul IMAP și AI-ul care răspunde la mailuri.',
    settings: [
      { key: 'MAIL_POLL_INTERVAL_MS', label: 'Interval polling IMAP (ms)', description: 'Cât de des verifică serverul mesaje noi pentru fiecare cont.', kind: 'number', requiresRestart: true, placeholder: '60000' },
      { key: 'MAIL_ATTACH_DIR', label: 'Director atașamente', kind: 'string', requiresRestart: true, placeholder: '/tmp/manelecadou-mail-attach' },
    ],
  },
  {
    id: 'suno',
    title: 'Suno (generare audio)',
    description: 'Cheile și endpoint-urile pentru generarea de melodii.',
    settings: [
      { key: 'SUNO_PROVIDER', label: 'Provider', kind: 'select', options: ['mock', 'real'], requiresRestart: true },
      { key: 'SUNO_API_BASE_URL', label: 'API base URL', kind: 'string', hotReload: true },
      { key: 'SUNO_API_KEY', label: 'API key', kind: 'secret', encrypted: true, hotReload: true },
      { key: 'SUNO_MODEL', label: 'Model', kind: 'string', hotReload: true, placeholder: 'V4_5' },
    ],
  },
  {
    id: 'ai-chat',
    title: 'AI Chat',
    description: 'Configurare AI-ul care răspunde în chat-ul cu clienții. Modul implicit, modelul și prompt-ul system.',
    settings: [
      {
        key: 'AI_CHAT_MODE_DEFAULT',
        label: 'Mod implicit AI per conversație nouă',
        description: 'manual = AI nu intervine. suggest = AI propune răspunsuri, adminul aprobă. auto = AI răspunde singur (acțiunile sensibile cer aprobare).',
        kind: 'select',
        options: ['manual', 'suggest', 'auto'],
        hotReload: true,
        placeholder: 'manual',
      },
      {
        key: 'AI_CHAT_MODEL',
        label: 'Model OpenAI pentru chat',
        description: 'Modelul folosit pentru generare răspunsuri și tool calling. Recomandat: gpt-4o sau gpt-4o-mini.',
        kind: 'select',
        options: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-5', 'gpt-5-mini'],
        hotReload: true,
        placeholder: 'gpt-4o-mini',
      },
      {
        key: 'AI_CHAT_TEMPERATURE',
        label: 'Temperature',
        description: 'Cât de creative sunt răspunsurile. 0 = factual, 1 = creativ. Recomandat 0.3-0.5 pentru support.',
        kind: 'number',
        hotReload: true,
        placeholder: '0.4',
      },
      {
        key: 'AI_CHAT_SYSTEM_PROMPT',
        label: 'System prompt (rolul AI-ului)',
        description: 'Instrucțiunile de bază. Brand voice, limite, ton. Lasă gol pentru promptul default per site.',
        kind: 'longtext',
        hotReload: true,
        placeholder: 'Ești asistentul Manele Cadou...',
      },
      {
        key: 'AI_CHAT_PROACTIVE_ENABLED',
        label: 'Proactive engagement (abordare automată)',
        description: 'Dacă activ, AI scanează userii inactivi (>5min pe aceeași pagină fără mesaj) și inițiază conversația. Doar în mod suggest sau auto.',
        kind: 'bool',
        hotReload: true,
      },
      {
        key: 'AI_CHAT_PROACTIVE_IDLE_MIN',
        label: 'Minute idle înainte de abordare proactivă',
        kind: 'number',
        hotReload: true,
        placeholder: '5',
      },
      {
        key: 'AI_CHAT_LEARN_NIGHTLY',
        label: 'Învățare nocturnă din conversații',
        description: 'Cron nightly care scanează conversațiile rezolvate și extrage memory candidates. Adminul aprobă înainte să intre în prompt.',
        kind: 'bool',
        hotReload: true,
      },
      {
        key: 'AI_CHAT_REQUIRE_APPROVAL_FOR_PAYMENT',
        label: 'Aprobare obligatorie pentru link-uri plată',
        description: 'Chiar și în mod auto, AI nu trimite link de plată fără aprobare. Recomandat ON.',
        kind: 'bool',
        hotReload: true,
      },
      {
        key: 'AI_CHAT_REQUIRE_APPROVAL_FOR_GENERATION',
        label: 'Aprobare obligatorie pentru submit generare',
        description: 'Chiar și în mod auto, AI nu lansează generare Suno fără aprobare. Recomandat ON.',
        kind: 'bool',
        hotReload: true,
      },
    ],
  },
  {
    id: 'marketing',
    title: 'Marketing emails',
    description: 'Trimiteri automate de oferte (drip). Campaniile manuale și regulile se gestionează în pagina /marketing.',
    settings: [
      {
        key: 'MARKETING_AUTOMATION_ENABLED',
        label: 'Reguli automate active',
        description: 'Master switch pentru cron-ul nightly (09:00 UTC) care rulează regulile de drip. Fiecare regulă are și propriul on/off.',
        kind: 'bool',
        hotReload: true,
      },
      {
        key: 'MARKETING_RULE_MAX_PER_RUN',
        label: 'Max emailuri per regulă / rulare',
        description: 'Plafon de siguranță pentru fiecare rulare a unei reguli (evită burst-uri când activezi o regulă pe un backlog mare).',
        kind: 'number',
        hotReload: true,
        placeholder: '200',
      },
    ],
  },
  {
    id: 'web-push',
    title: 'Web Push (notificări admin)',
    description: 'VAPID keys pentru notificări push la admin când vine mesaj nou. Generează-le o singură dată cu: npx web-push generate-vapid-keys',
    settings: [
      { key: 'VAPID_PUBLIC_KEY', label: 'VAPID public key', kind: 'string', hotReload: true, placeholder: 'B...' },
      { key: 'VAPID_PRIVATE_KEY', label: 'VAPID private key', kind: 'secret', encrypted: true, hotReload: true },
      { key: 'VAPID_SUBJECT', label: 'VAPID subject (mailto:)', kind: 'string', hotReload: true, placeholder: 'mailto:contact@manelecadou.ro' },
    ],
  },
  {
    id: 'stripe',
    title: 'Stripe (plăți)',
    description: 'Cheile globale Stripe (un singur cont pentru toate site-urile). Prețurile + valuta + descriptorul de extras se configurează per site în /sites.',
    settings: [
      { key: 'STRIPE_SECRET_KEY', label: 'Secret key', kind: 'secret', encrypted: true, hotReload: true, placeholder: 'sk_test_...' },
      { key: 'STRIPE_WEBHOOK_SECRET', label: 'Webhook secret', kind: 'secret', encrypted: true, hotReload: true, placeholder: 'whsec_...' },
    ],
  },
  // NOTĂ: secțiunea „Meta Conversions API" a fost mutată per-site (2026-05-28).
  // Setările META_PIXEL_ID / META_CAPI_ACCESS_TOKEN / META_TEST_EVENT_CODE au fost
  // eliminate din global ca să permitem fiecărui site (manelecadou.ro RO,
  // manelecadou.bg BG, manelecadou.gr GR etc.) să folosească propriul pixel Meta
  // și token de Conversions API. Configurare în /sites → editor site → secțiunea
  // „Analytics" → Meta Pixel + CAPI fields.
];

export const ALL_KEYS: string[] = SETTINGS_SCHEMA.flatMap((c) => c.settings.map((s) => s.key));

export function findDef(key: string): SettingDef | null {
  for (const cat of SETTINGS_SCHEMA) {
    const s = cat.settings.find((x) => x.key === key);
    if (s) return s;
  }
  return null;
}
