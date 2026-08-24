/**
 * Template-uri HTML pentru email-uri.
 * Multilingv prin `apps/api/src/mailer/i18n/strings.ts`.
 * Multi-tenant prin `EmailBranding` (banner, domeniu, contact, datele firmei per site).
 */

import { dict, type EmailLocale } from '../i18n/strings';

/** Branding per email — extras din `Site` la nivel de call-site (vezi `branding.ts`).
 *  Toate câmpurile sunt optionale: dacă lipsesc, layout-ul cade pe defaults Manele Cadou. */
export interface EmailBranding {
  /** Numele afișat în alt-text și fallback header. */
  name?: string;
  /** URL-ul site-ului (ex. `https://doroparaggelia.gr`). Folosit pentru link-uri footer
   *  și header logo. */
  siteUrl?: string;
  /** URL-ul absolut al imaginii banner (600×200 PNG/JPG). */
  bannerUrl?: string;
  /** Adresă de contact / suport. */
  contactEmail?: string;
  /** Telefon afișat în footer (null = nu se afișează). */
  contactPhone?: string | null;
  /** Linie company info (ex. "© 2026 Doro Paraggelia Ltd · VAT EL12345..."). Gol/undefined
   *  = fallback la footer.company din dicționar. */
  companyLine?: string;
}

const DEFAULT_BRAND: Required<Omit<EmailBranding, 'contactPhone'>> & { contactPhone: string } = {
  name: 'Manele Cadou',
  siteUrl: 'https://manelecadou.ro',
  bannerUrl: 'https://manelecadou.ro/email-banner.png',
  contactEmail: 'salut@manelecadou.ro',
  contactPhone: '+40 758 972 277',
  companyLine: '',
};

const COLORS = {
  goldFrom: '#fff5cc',
  goldMid: '#ffe28a',
  goldDeep: '#b07c1e',
  cream: '#fff5dc',
  bgDark: '#0c0707',
  burgundy: '#5a0d18',
};

function resolveBranding(b?: EmailBranding): Required<EmailBranding> {
  return {
    name: b?.name?.trim() || DEFAULT_BRAND.name,
    siteUrl: b?.siteUrl?.trim() || DEFAULT_BRAND.siteUrl,
    bannerUrl: b?.bannerUrl?.trim() || DEFAULT_BRAND.bannerUrl,
    contactEmail: b?.contactEmail?.trim() || DEFAULT_BRAND.contactEmail,
    contactPhone:
      b?.contactPhone === null
        ? null
        : b?.contactPhone?.trim() || DEFAULT_BRAND.contactPhone,
    companyLine: b?.companyLine?.trim() || '',
  };
}

const HTML_LANG: Record<EmailLocale, string> = {
  ro: 'ro', bg: 'bg', sr: 'sr', tr: 'tr', el: 'el', hr: 'hr', sl: 'sl', bs: 'bs',
};

function escape(s: string | number | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(opts: {
  title: string;
  preheader: string;
  bodyHtml: string;
  locale?: string;
  branding?: EmailBranding;
}): string {
  const loc = (opts.locale as EmailLocale) ?? 'ro';
  const d = dict(loc);
  const b = resolveBranding(opts.branding);
  const htmlLang = HTML_LANG[loc] ?? 'ro';
  const received = d.footer.receivedBecause.replace('{contact}', b.contactEmail);
  const companyLine = b.companyLine || d.footer.company;
  const phoneFragment = b.contactPhone
    ? `📞 ${escape(b.contactPhone)} · `
    : '';
  return `<!DOCTYPE html>
<html lang="${htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.bgDark};color:${COLORS.cream};font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
  <span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;font-size:1px;">${escape(opts.preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background: linear-gradient(180deg, ${COLORS.bgDark}, #170a0a); padding: 32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
        <tr><td align="center" style="padding-bottom:20px;">
          <a href="${escape(b.siteUrl)}" style="text-decoration:none;display:inline-block;">
            <img src="${escape(b.bannerUrl)}" alt="${escape(b.name)}" width="600" height="200" style="display:block;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;border-radius:8px;" />
          </a>
        </td></tr>
        <tr><td style="background:rgba(241,200,77,0.04);border:1px solid rgba(241,200,77,0.18);border-radius:14px;padding:28px;">
          ${opts.bodyHtml}
        </td></tr>
        <tr><td align="center" style="padding-top:24px;font-size:11px;color:rgba(255,245,220,0.45);line-height:1.6;">
          <p style="margin:0 0 6px;">${escape(companyLine)}</p>
          <p style="margin:0 0 6px;">${phoneFragment}✉️ <a href="mailto:${escape(b.contactEmail)}" style="color:${COLORS.goldMid};text-decoration:none;">${escape(b.contactEmail)}</a></p>
          <p style="margin:0 0 6px;">
            <a href="${escape(b.siteUrl)}/termeni" style="color:rgba(255,245,220,0.55);text-decoration:none;">${d.footer.termsLink}</a> ·
            <a href="${escape(b.siteUrl)}/confidentialitate" style="color:rgba(255,245,220,0.55);text-decoration:none;">${d.footer.privacyLink}</a> ·
            <a href="${escape(b.siteUrl)}/contact" style="color:rgba(255,245,220,0.55);text-decoration:none;">${d.footer.contactLink}</a>
          </p>
          <p style="margin:0;font-size:10px;">${received}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buttonGold(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
    <tr><td style="border-radius:10px;background: linear-gradient(180deg, ${COLORS.goldFrom} 0%, ${COLORS.goldMid} 30%, #f1c84d 60%, ${COLORS.goldDeep} 100%);box-shadow:0 6px 16px rgba(241,200,77,0.3);">
      <a href="${escape(href)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:800;color:#2a1a04;text-decoration:none;letter-spacing:0.02em;">${escape(label)}</a>
    </td></tr>
  </table>`;
}

// =================== Public branded layout ===================

/**
 * Layout brandat reutilizabil pentru orice email outbound
 * (ex: răspunsuri din Inbox Hub). Folosește același skeleton ca template-urile
 * de magic-link / payment / generation-ready.
 */
export interface BrandedEmailVars {
  subject: string;
  preheader?: string;
  bodyHtml: string;
  signatureHtml?: string | null;
  fromName?: string | null;
  locale?: string;
  branding?: EmailBranding;
}

export function renderBrandedEmail(v: BrandedEmailVars): string {
  const sig = v.signatureHtml
    ? `<div style="margin-top:24px;padding-top:18px;border-top:1px solid rgba(241,200,77,0.18);font-size:13px;color:${COLORS.cream};line-height:1.55;">${v.signatureHtml}</div>`
    : v.fromName
      ? `<p style="margin:24px 0 0;color:${COLORS.cream};">${escape(v.fromName)}</p>`
      : '';
  return layout({
    title: v.subject,
    preheader: v.preheader ?? v.subject,
    locale: v.locale,
    branding: v.branding,
    bodyHtml: `
      <div style="color:${COLORS.cream};font-size:15px;line-height:1.6;">
        ${v.bodyHtml}
      </div>
      ${sig}
    `,
  });
}

// =================== Templates ===================

export interface MagicLinkVars { loginUrl: string; ttlMinutes: number; locale?: string; branding?: EmailBranding }
export function magicLinkTemplate(v: MagicLinkVars): { subject: string; html: string; text: string } {
  const d = dict(v.locale).magicLink;
  return {
    subject: d.subject,
    html: layout({
      title: d.title, locale: v.locale, branding: v.branding,
      preheader: `${d.button} (${v.ttlMinutes} min)`,
      bodyHtml: `
        <h2 style="margin:0 0 12px;font-family:'Times New Roman',serif;color:${COLORS.goldMid};font-size:22px;">${d.title}</h2>
        <p style="margin:0 0 18px;color:${COLORS.cream};line-height:1.55;">${d.intro(v.ttlMinutes)}</p>
        ${buttonGold(v.loginUrl, d.button)}
        <p style="margin:18px 0 0;font-size:12px;color:rgba(255,245,220,0.5);line-height:1.5;">${d.or}<br><a href="${escape(v.loginUrl)}" style="color:${COLORS.goldMid};word-break:break-all;">${escape(v.loginUrl)}</a></p>
        <p style="margin:18px 0 0;font-size:12px;color:rgba(255,245,220,0.4);">${d.fallback}</p>
      `,
    }),
    text: d.text(v.loginUrl, v.ttlMinutes),
  };
}

export interface GenerationReadyVars {
  recipientName: string;
  type: 'demo' | 'full';
  link: string;
  audioUrl?: string | null;
  /** Livrabile extra ale pachetelor plus/premium (când există). */
  socialImageUrl?: string | null;
  instrumentalUrl?: string | null;
  videoUrl?: string | null;
  /** PIN auto pentru deblocarea conținutului privat (poze custom + colaje). */
  unlockPin?: string | null;
  /** Cod de fidelizare „next order" — afișat doar la melodia completă (full/paid). */
  discountCode?: string | null;
  discountPercent?: number | null;
  discountValidHours?: number | null;
  /** URL unde poate plasa o comandă nouă (homepage site). */
  orderUrl?: string | null;
  locale?: string;
  /** Durata reală a piesei livrate (secunde), din generare. */
  durationSec?: number | null;
  branding?: EmailBranding;
}
export function generationReadyTemplate(v: GenerationReadyVars): { subject: string; html: string; text: string } {
  const d = dict(v.locale).generationReady;
  const title = v.type === 'demo' ? d.titleDemo : d.titleFull(songDuration(v.durationSec));
  const brandName = resolveBranding(v.branding).name;
  // Linkuri extra pentru livrabilele pachetelor (afișate doar dacă există).
  const extraLink = (href: string, label: string) =>
    `<a href="${escape(href)}" style="color:${COLORS.goldMid};text-decoration:none;font-weight:700;">${escape(label)}</a>`;
  const extras: string[] = [];
  if (v.socialImageUrl) extras.push(extraLink(v.socialImageUrl, '🖼️ Imagine'));
  if (v.instrumentalUrl) extras.push(extraLink(v.instrumentalUrl, '🎼 Instrumental'));
  if (v.videoUrl) extras.push(extraLink(v.videoUrl, '🎬 Videoclip'));
  const extrasHtml =
    extras.length > 0
      ? `<p style="text-align:center;margin:0 0 18px;font-size:13px;color:rgba(255,245,220,0.7);">${extras.join(' &nbsp;·&nbsp; ')}</p>`
      : '';
  // Bloc parolă privată (cod de partajare) — doar când există un PIN auto.
  const pinHtml = v.unlockPin
    ? `<div style="margin:18px 0;padding:14px 16px;background:rgba(241,200,77,0.08);border:1px solid rgba(241,200,77,0.3);border-radius:10px;text-align:center;">
         <p style="margin:0 0 6px;font-size:13px;color:${COLORS.goldMid};font-weight:700;">🔒 Parola pentru pozele &amp; colajele tale private</p>
         <div style="font-size:26px;font-weight:800;letter-spacing:4px;color:${COLORS.cream};">${escape(v.unlockPin)}</div>
         <p style="margin:6px 0 0;font-size:12px;color:rgba(255,245,220,0.6);line-height:1.5;">Cine are linkul + parola poate vedea pozele tale custom și colajele. O poți schimba oricând din pagina manelei.</p>
       </div>`
    : '';
  // Cod de fidelizare „next order" — DOAR pe emailul de melodie completă (full/paid),
  // ca să nu canibalizeze prima vânzare pe demo (care are deja CTA de upgrade).
  const discountPercent = v.discountPercent ?? 40;
  const discountHours = v.discountValidHours ?? 24;
  const discountHtml =
    v.type === 'full' && v.discountCode
      ? `<div style="margin:24px 0 0;padding:18px;background:rgba(241,200,77,0.1);border:1px solid rgba(241,200,77,0.35);border-radius:12px;text-align:center;">
           <p style="margin:0 0 6px;font-size:15px;color:${COLORS.goldMid};font-weight:800;">${d.discountTitle(discountPercent)}</p>
           <p style="margin:0 0 14px;font-size:13px;color:${COLORS.cream};line-height:1.55;">${d.discountBody(discountPercent, discountHours)}</p>
           <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,245,220,0.6);">${d.discountCodeLabel}</p>
           <div style="font-size:28px;font-weight:800;letter-spacing:5px;color:${COLORS.cream};margin:0 0 14px;font-family:'Courier New',monospace;">${escape(v.discountCode)}</div>
           ${v.orderUrl ? `<div style="margin:0 0 10px;">${buttonGold(v.orderUrl, d.discountCta)}</div>` : ''}
           <p style="margin:6px 0 0;font-size:12px;color:rgba(255,245,220,0.6);">${d.discountExpires(discountHours)}</p>
         </div>`
      : '';
  return {
    subject: d.subject(v.recipientName),
    html: layout({
      title, locale: v.locale, branding: v.branding,
      preheader: `${brandName}: ${v.recipientName}`,
      bodyHtml: `
        <div style="text-align:center;margin-bottom:18px;">
          <div style="font-size:48px;margin-bottom:8px;">🎉</div>
          <h2 style="margin:0;font-family:'Times New Roman',serif;color:${COLORS.goldMid};font-size:24px;">${title}</h2>
          <p style="margin:8px 0 0;color:${COLORS.cream};">${d.forRecipient(escape(v.recipientName))}</p>
        </div>
        <div style="text-align:center;margin: 24px 0;">${buttonGold(v.link, d.listenButton)}</div>
        ${v.audioUrl ? `<p style="text-align:center;margin:0 0 18px;font-size:12px;color:rgba(255,245,220,0.5);">${d.download.replace('{link}', `<a href="${escape(v.audioUrl)}" style="color:${COLORS.goldMid};">MP3</a>`)}</p>` : ''}
        ${extrasHtml}
        ${pinHtml}
        ${discountHtml}
        ${v.type === 'demo' ? `
          <div style="margin-top:24px;padding:16px;background:rgba(255,45,126,0.08);border:1px solid rgba(255,45,126,0.3);border-radius:10px;">
            <p style="margin:0 0 8px;font-size:14px;color:${COLORS.goldMid};font-weight:700;">${d.promoTitle}</p>
            <p style="margin:0;font-size:13px;color:${COLORS.cream};line-height:1.55;">${d.promoBody.replace('{link}', `<a href="${escape(v.link)}" style="color:${COLORS.goldMid};font-weight:700;">${d.promoLink}</a>`)}</p>
          </div>` : ''}
        <p style="margin:24px 0 0;font-size:11px;color:rgba(255,245,220,0.4);text-align:center;">${d.aiNote}</p>
      `,
    }),
    text:
      d.text(v.type, v.recipientName, v.link) +
      (v.type === 'full' && v.discountCode
        ? `\n\n${d.discountText(v.discountCode, discountPercent, discountHours)}`
        : ''),
  };
}

/**
 * Durata piesei, mm:ss. Se ia din generare, nu se scrie în traduceri: variază pe
 * pachet (90s la Standard, 150s la Plus/Premium) și e reconfigurabilă din admin,
 * deci orice cifră scrisă în text devine o promisiune falsă către un client
 * care tocmai a plătit. Fallback pe 150s = pachetul cel mai des vândut.
 */
function songDuration(sec?: number | null): string {
  const total = Math.max(1, Math.round(typeof sec === 'number' && Number.isFinite(sec) && sec > 0 ? sec : 150));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export interface PaymentSuccessVars {
  amountRON: number;
  generationLink: string;
  recipientName: string;
  locale?: string;
  currency?: string;
  /** Durata reală a piesei plătite (secunde). Lipsă → fallback pe 150s. */
  durationSec?: number | null;
  branding?: EmailBranding;
}
export function paymentSuccessTemplate(v: PaymentSuccessVars): { subject: string; html: string; text: string } {
  const d = dict(v.locale).paymentSuccess;
  const currency = v.currency ?? 'lei';
  const amount = v.amountRON.toFixed(2);
  const brandName = resolveBranding(v.branding).name;
  return {
    subject: d.subject(amount, currency),
    html: layout({
      title: d.title, locale: v.locale, branding: v.branding,
      preheader: `${brandName}: ${v.recipientName}`,
      bodyHtml: `
        <h2 style="margin:0 0 12px;font-family:'Times New Roman',serif;color:${COLORS.goldMid};font-size:22px;">${d.title}</h2>
        <p style="margin:0 0 18px;color:${COLORS.cream};">${d.intro(escape(v.recipientName))}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;">
          <tr><td style="padding:8px 0;border-bottom:1px solid rgba(241,200,77,0.18);font-size:13px;color:rgba(255,245,220,0.7);">${d.rowTotal}</td>
              <td style="padding:8px 0;border-bottom:1px solid rgba(241,200,77,0.18);font-size:13px;text-align:right;color:${COLORS.goldMid};font-weight:800;">${amount} ${currency}</td></tr>
          <tr><td style="padding:8px 0;font-size:13px;color:rgba(255,245,220,0.7);">${d.rowSong}</td>
              <td style="padding:8px 0;font-size:13px;text-align:right;color:${COLORS.cream};">${d.songValue(songDuration(v.durationSec))}</td></tr>
        </table>
        <div style="text-align:center;margin: 22px 0;">${buttonGold(v.generationLink, d.listenButton)}</div>
        <p style="margin:18px 0 0;font-size:11px;color:rgba(255,245,220,0.45);">${d.invoiceNote}</p>
      `,
    }),
    text: d.text(amount, currency, v.generationLink),
  };
}

export interface GiftCodeVars {
  code: string;
  redeemUrl: string;
  validUntil: string;
  tier: string;
  locale?: string;
  branding?: EmailBranding;
}
export function giftCodeTemplate(v: GiftCodeVars): { subject: string; html: string; text: string } {
  const d = dict(v.locale).giftCode;
  return {
    subject: d.subject(v.code),
    html: layout({
      title: d.title, locale: v.locale, branding: v.branding,
      preheader: `${v.code} · ${v.validUntil}`,
      bodyHtml: `
        <div style="text-align:center;margin-bottom:18px;">
          <div style="font-size:48px;">🎁</div>
          <h2 style="margin:8px 0;font-family:'Times New Roman',serif;color:${COLORS.goldMid};font-size:22px;">${d.title}</h2>
        </div>
        <div style="text-align:center;background:rgba(241,200,77,0.08);border:2px dashed rgba(241,200,77,0.5);border-radius:12px;padding:24px;margin:16px 0;">
          <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,245,220,0.5);">${d.yourCode}</p>
          <p style="margin:0;font-family:'Courier New',monospace;font-size:32px;font-weight:900;color:${COLORS.goldMid};letter-spacing:0.1em;">${escape(v.code)}</p>
          <p style="margin:8px 0 0;font-size:12px;color:rgba(255,245,220,0.55);">${d.package}: <b>${escape(v.tier)}</b> · ${d.validUntil} ${escape(v.validUntil)}</p>
        </div>
        <p style="margin:0 0 18px;color:${COLORS.cream};line-height:1.55;">${d.body}</p>
        <div style="text-align:center;margin: 22px 0;">${buttonGold(v.redeemUrl, d.button)}</div>
      `,
    }),
    text: d.text(v.code, v.validUntil, v.redeemUrl),
  };
}

export interface AdminGdprRequestVars {
  userEmail: string;
  userId: string;
  type: 'export' | 'delete';
  reason?: string;
  locale?: string;
  branding?: EmailBranding;
}
export function adminGdprRequestTemplate(v: AdminGdprRequestVars): { subject: string; html: string; text: string } {
  const d = dict(v.locale).gdpr;
  const action = v.type === 'export' ? d.actionExport : d.actionDelete;
  return {
    subject: d.subject(action, v.userEmail),
    html: layout({
      title: d.title(action), locale: v.locale, branding: v.branding,
      preheader: `${v.userEmail} · ${action}`,
      bodyHtml: `
        <h2 style="margin:0 0 12px;font-family:'Times New Roman',serif;color:${COLORS.goldMid};font-size:20px;">${d.title(action)}</h2>
        <p style="margin:0 0 12px;color:${COLORS.cream};">${d.intro(action)}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0;font-size:13px;">
          <tr><td style="padding:6px 0;color:rgba(255,245,220,0.6);">${d.email}</td><td style="padding:6px 0;color:${COLORS.cream};"><b>${escape(v.userEmail)}</b></td></tr>
          <tr><td style="padding:6px 0;color:rgba(255,245,220,0.6);">${d.userId}</td><td style="padding:6px 0;font-family:monospace;color:${COLORS.cream};">${escape(v.userId)}</td></tr>
          <tr><td style="padding:6px 0;color:rgba(255,245,220,0.6);">${d.type}</td><td style="padding:6px 0;color:${COLORS.cream};">${escape(v.type)}</td></tr>
          ${v.reason ? `<tr><td style="padding:6px 0;color:rgba(255,245,220,0.6);vertical-align:top;">${d.reason}</td><td style="padding:6px 0;color:${COLORS.cream};">${escape(v.reason)}</td></tr>` : ''}
        </table>
        <p style="margin:14px 0 0;color:rgba(255,245,220,0.55);font-size:13px;line-height:1.55;">${d.note}</p>
      `,
    }),
    text: d.text(action, v.userEmail, v.userId, v.type, v.reason),
  };
}
