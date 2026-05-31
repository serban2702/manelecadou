/**
 * Catalogul COMPLET de șabloane de email pentru admin (listare + preview).
 *
 * Combină:
 *  - template-urile de MARKETING (din `marketing.ts`) — pot fi trimise din campanii
 *  - template-urile TRANSACȚIONALE (din `templates.ts`) — read-only, se trimit automat
 *    la evenimente (magic-link, plată, generare gata, cod cadou, GDPR). Le arătăm
 *    aici doar ca preview, ca adminul să vadă „exact toate șabloanele".
 */

import {
  magicLinkTemplate,
  generationReadyTemplate,
  paymentSuccessTemplate,
  giftCodeTemplate,
  adminGdprRequestTemplate,
  type EmailBranding,
} from './templates';
import {
  MARKETING_TEMPLATES,
  findMarketingTemplate,
  type MarketingRenderVars,
} from './marketing';

export type TemplateCategory = 'marketing' | 'transactional';

export interface CatalogTemplateMeta {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  /** Doar marketing-ul e trimisibil din campanii; transacționalele sunt read-only. */
  sendable: boolean;
  supports: {
    promoCode?: boolean;
    recipientName?: boolean;
    customHeadline?: boolean;
    customBody?: boolean;
  };
}

/** Context comun pentru preview (locale + branding al site-ului curent). */
export interface PreviewContext {
  locale?: string;
  branding?: EmailBranding;
}

interface TransactionalDef {
  id: string;
  name: string;
  description: string;
  render: (ctx: PreviewContext) => { subject: string; html: string };
}

const TRANSACTIONAL: TransactionalDef[] = [
  {
    id: 'tx_magic_link',
    name: 'Magic link (login)',
    description: 'Link de autentificare fără parolă. Se trimite la cerere de login.',
    render: (c) => magicLinkTemplate({ loginUrl: 'https://manelecadou.ro/login/verify?token=demo', ttlMinutes: 15, locale: c.locale, branding: c.branding }),
  },
  {
    id: 'tx_generation_ready_demo',
    name: 'Generare gata (demo)',
    description: 'Notificare că demo-ul de 30s e gata, cu CTA spre varianta completă.',
    render: (c) => generationReadyTemplate({ recipientName: 'Andrei', type: 'demo', link: 'https://manelecadou.ro/m/demo/view', audioUrl: 'https://manelecadou.ro/demo.mp3', locale: c.locale, branding: c.branding }),
  },
  {
    id: 'tx_generation_ready_full',
    name: 'Generare gata (completă)',
    description: 'Notificare că maneaua completă e gata, cu livrabilele pachetului.',
    render: (c) => generationReadyTemplate({ recipientName: 'Andrei', type: 'full', link: 'https://manelecadou.ro/m/demo/view', audioUrl: 'https://manelecadou.ro/full.mp3', instrumentalUrl: 'https://manelecadou.ro/instr.mp3', videoUrl: 'https://manelecadou.ro/video.mp4', locale: c.locale, branding: c.branding }),
  },
  {
    id: 'tx_payment_success',
    name: 'Plată confirmată',
    description: 'Chitanță după o plată reușită, cu suma și butonul de ascultare.',
    render: (c) => paymentSuccessTemplate({ amountRON: 99, currency: 'lei', recipientName: 'Andrei', generationLink: 'https://manelecadou.ro/m/demo/view', locale: c.locale, branding: c.branding }),
  },
  {
    id: 'tx_gift_code',
    name: 'Cod cadou',
    description: 'Codul cadou trimis cumpărătorului/destinatarului.',
    render: (c) => giftCodeTemplate({ code: 'CADOU-1234-ABCD', redeemUrl: 'https://manelecadou.ro/cadou/redeem', validUntil: '31.12.2026', tier: 'Pachet 3', locale: c.locale, branding: c.branding }),
  },
  {
    id: 'tx_gdpr_admin',
    name: 'GDPR (notificare admin)',
    description: 'Email intern către admin la o cerere GDPR (export/ștergere).',
    render: (c) => adminGdprRequestTemplate({ userEmail: 'client@example.com', userId: 'demo-user-id', type: 'export', reason: 'Cerere client', locale: c.locale, branding: c.branding }),
  },
];

/** Listă completă pentru admin (marketing întâi, apoi transacționale). */
export function listCatalog(): CatalogTemplateMeta[] {
  const marketing: CatalogTemplateMeta[] = MARKETING_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    category: 'marketing',
    sendable: true,
    supports: t.supports,
  }));
  const transactional: CatalogTemplateMeta[] = TRANSACTIONAL.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    category: 'transactional',
    sendable: false,
    supports: {},
  }));
  return [...marketing, ...transactional];
}

/** Render preview pentru orice id din catalog (marketing sau transacțional). */
export function renderPreview(
  id: string,
  ctx: PreviewContext,
  overrides?: Partial<MarketingRenderVars>,
): { subject: string; html: string } | null {
  const mk = findMarketingTemplate(id);
  if (mk) {
    const vars: MarketingRenderVars = {
      ...mk.sample,
      ...overrides,
      locale: ctx.locale ?? mk.sample.locale,
      branding: ctx.branding,
    };
    const r = mk.render(vars);
    return { subject: r.subject, html: r.html };
  }
  const tx = TRANSACTIONAL.find((t) => t.id === id);
  if (tx) return tx.render(ctx);
  return null;
}
