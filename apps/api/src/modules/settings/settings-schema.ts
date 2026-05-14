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
    id: 'stripe',
    title: 'Stripe (plăți)',
    description: 'Cheile globale Stripe (un singur cont pentru toate site-urile). Prețurile + valuta + descriptorul de extras se configurează per site în /sites.',
    settings: [
      { key: 'STRIPE_SECRET_KEY', label: 'Secret key', kind: 'secret', encrypted: true, hotReload: true, placeholder: 'sk_test_...' },
      { key: 'STRIPE_WEBHOOK_SECRET', label: 'Webhook secret', kind: 'secret', encrypted: true, hotReload: true, placeholder: 'whsec_...' },
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
