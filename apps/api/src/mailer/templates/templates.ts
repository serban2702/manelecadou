/**
 * Template-uri HTML pentru email-uri.
 * Multilingv prin `apps/api/src/mailer/i18n/strings.ts`.
 */

import { dict, type EmailLocale } from '../i18n/strings';

const BRAND = {
  name: 'Manele Cadou',
  url: 'https://manelecadou.ro',
  contact: 'salut@manelecadou.ro',
  phone: '+40 758 972 277',
  goldFrom: '#fff5cc',
  goldMid: '#ffe28a',
  goldDeep: '#b07c1e',
  cream: '#fff5dc',
  bgDark: '#0c0707',
  burgundy: '#5a0d18',
};

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

function layout(opts: { title: string; preheader: string; bodyHtml: string; locale?: string }): string {
  const loc = (opts.locale as EmailLocale) ?? 'ro';
  const d = dict(loc);
  const htmlLang = HTML_LANG[loc] ?? 'ro';
  const received = d.footer.receivedBecause.replace('{contact}', BRAND.contact);
  return `<!DOCTYPE html>
<html lang="${htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bgDark};color:${BRAND.cream};font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
  <span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;font-size:1px;">${escape(opts.preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background: linear-gradient(180deg, ${BRAND.bgDark}, #170a0a); padding: 32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
        <tr><td align="center" style="padding-bottom:20px;">
          <a href="${BRAND.url}" style="text-decoration:none;display:inline-block;">
            <img src="${BRAND.url}/email-banner.png" alt="Manele Cadou" width="600" height="200" style="display:block;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;border-radius:8px;" />
          </a>
        </td></tr>
        <tr><td style="background:rgba(241,200,77,0.04);border:1px solid rgba(241,200,77,0.18);border-radius:14px;padding:28px;">
          ${opts.bodyHtml}
        </td></tr>
        <tr><td align="center" style="padding-top:24px;font-size:11px;color:rgba(255,245,220,0.45);line-height:1.6;">
          <p style="margin:0 0 6px;">${d.footer.company}</p>
          <p style="margin:0 0 6px;">📞 ${BRAND.phone} · ✉️ <a href="mailto:${BRAND.contact}" style="color:${BRAND.goldMid};text-decoration:none;">${BRAND.contact}</a></p>
          <p style="margin:0 0 6px;">
            <a href="${BRAND.url}/termeni" style="color:rgba(255,245,220,0.55);text-decoration:none;">${d.footer.termsLink}</a> ·
            <a href="${BRAND.url}/confidentialitate" style="color:rgba(255,245,220,0.55);text-decoration:none;">${d.footer.privacyLink}</a> ·
            <a href="${BRAND.url}/contact" style="color:rgba(255,245,220,0.55);text-decoration:none;">${d.footer.contactLink}</a>
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
    <tr><td style="border-radius:10px;background: linear-gradient(180deg, ${BRAND.goldFrom} 0%, ${BRAND.goldMid} 30%, #f1c84d 60%, ${BRAND.goldDeep} 100%);box-shadow:0 6px 16px rgba(241,200,77,0.3);">
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
}

export function renderBrandedEmail(v: BrandedEmailVars): string {
  const sig = v.signatureHtml
    ? `<div style="margin-top:24px;padding-top:18px;border-top:1px solid rgba(241,200,77,0.18);font-size:13px;color:${BRAND.cream};line-height:1.55;">${v.signatureHtml}</div>`
    : v.fromName
      ? `<p style="margin:24px 0 0;color:${BRAND.cream};">${escape(v.fromName)}</p>`
      : '';
  return layout({
    title: v.subject,
    preheader: v.preheader ?? v.subject,
    locale: v.locale,
    bodyHtml: `
      <div style="color:${BRAND.cream};font-size:15px;line-height:1.6;">
        ${v.bodyHtml}
      </div>
      ${sig}
    `,
  });
}

// =================== Templates ===================

export interface MagicLinkVars { loginUrl: string; ttlMinutes: number; locale?: string }
export function magicLinkTemplate(v: MagicLinkVars): { subject: string; html: string; text: string } {
  const d = dict(v.locale).magicLink;
  return {
    subject: d.subject,
    html: layout({
      title: d.title, locale: v.locale,
      preheader: `${d.button} (${v.ttlMinutes} min)`,
      bodyHtml: `
        <h2 style="margin:0 0 12px;font-family:'Times New Roman',serif;color:${BRAND.goldMid};font-size:22px;">${d.title}</h2>
        <p style="margin:0 0 18px;color:${BRAND.cream};line-height:1.55;">${d.intro(v.ttlMinutes)}</p>
        ${buttonGold(v.loginUrl, d.button)}
        <p style="margin:18px 0 0;font-size:12px;color:rgba(255,245,220,0.5);line-height:1.5;">${d.or}<br><a href="${escape(v.loginUrl)}" style="color:${BRAND.goldMid};word-break:break-all;">${escape(v.loginUrl)}</a></p>
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
  locale?: string;
}
export function generationReadyTemplate(v: GenerationReadyVars): { subject: string; html: string; text: string } {
  const d = dict(v.locale).generationReady;
  const title = v.type === 'demo' ? d.titleDemo : d.titleFull;
  return {
    subject: d.subject(v.recipientName),
    html: layout({
      title, locale: v.locale,
      preheader: `${BRAND.name}: ${v.recipientName}`,
      bodyHtml: `
        <div style="text-align:center;margin-bottom:18px;">
          <div style="font-size:48px;margin-bottom:8px;">🎉</div>
          <h2 style="margin:0;font-family:'Times New Roman',serif;color:${BRAND.goldMid};font-size:24px;">${title}</h2>
          <p style="margin:8px 0 0;color:${BRAND.cream};">${d.forRecipient(escape(v.recipientName))}</p>
        </div>
        <div style="text-align:center;margin: 24px 0;">${buttonGold(v.link, d.listenButton)}</div>
        ${v.audioUrl ? `<p style="text-align:center;margin:0 0 18px;font-size:12px;color:rgba(255,245,220,0.5);">${d.download.replace('{link}', `<a href="${escape(v.audioUrl)}" style="color:${BRAND.goldMid};">MP3</a>`)}</p>` : ''}
        ${v.type === 'demo' ? `
          <div style="margin-top:24px;padding:16px;background:rgba(255,45,126,0.08);border:1px solid rgba(255,45,126,0.3);border-radius:10px;">
            <p style="margin:0 0 8px;font-size:14px;color:${BRAND.goldMid};font-weight:700;">${d.promoTitle}</p>
            <p style="margin:0;font-size:13px;color:${BRAND.cream};line-height:1.55;">${d.promoBody.replace('{link}', `<a href="${escape(v.link)}" style="color:${BRAND.goldMid};font-weight:700;">${d.promoLink}</a>`)}</p>
          </div>` : ''}
        <p style="margin:24px 0 0;font-size:11px;color:rgba(255,245,220,0.4);text-align:center;">${d.aiNote}</p>
      `,
    }),
    text: d.text(v.type, v.recipientName, v.link),
  };
}

export interface PaymentSuccessVars {
  amountRON: number;
  generationLink: string;
  recipientName: string;
  locale?: string;
  currency?: string;
}
export function paymentSuccessTemplate(v: PaymentSuccessVars): { subject: string; html: string; text: string } {
  const d = dict(v.locale).paymentSuccess;
  const currency = v.currency ?? 'lei';
  const amount = v.amountRON.toFixed(2);
  return {
    subject: d.subject(amount, currency),
    html: layout({
      title: d.title, locale: v.locale,
      preheader: `${BRAND.name}: ${v.recipientName}`,
      bodyHtml: `
        <h2 style="margin:0 0 12px;font-family:'Times New Roman',serif;color:${BRAND.goldMid};font-size:22px;">${d.title}</h2>
        <p style="margin:0 0 18px;color:${BRAND.cream};">${d.intro(escape(v.recipientName))}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;">
          <tr><td style="padding:8px 0;border-bottom:1px solid rgba(241,200,77,0.18);font-size:13px;color:rgba(255,245,220,0.7);">${d.rowTotal}</td>
              <td style="padding:8px 0;border-bottom:1px solid rgba(241,200,77,0.18);font-size:13px;text-align:right;color:${BRAND.goldMid};font-weight:800;">${amount} ${currency}</td></tr>
          <tr><td style="padding:8px 0;font-size:13px;color:rgba(255,245,220,0.7);">${d.rowSong}</td>
              <td style="padding:8px 0;font-size:13px;text-align:right;color:${BRAND.cream};">${d.songValue}</td></tr>
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
}
export function giftCodeTemplate(v: GiftCodeVars): { subject: string; html: string; text: string } {
  const d = dict(v.locale).giftCode;
  return {
    subject: d.subject(v.code),
    html: layout({
      title: d.title, locale: v.locale,
      preheader: `${v.code} · ${v.validUntil}`,
      bodyHtml: `
        <div style="text-align:center;margin-bottom:18px;">
          <div style="font-size:48px;">🎁</div>
          <h2 style="margin:8px 0;font-family:'Times New Roman',serif;color:${BRAND.goldMid};font-size:22px;">${d.title}</h2>
        </div>
        <div style="text-align:center;background:rgba(241,200,77,0.08);border:2px dashed rgba(241,200,77,0.5);border-radius:12px;padding:24px;margin:16px 0;">
          <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,245,220,0.5);">${d.yourCode}</p>
          <p style="margin:0;font-family:'Courier New',monospace;font-size:32px;font-weight:900;color:${BRAND.goldMid};letter-spacing:0.1em;">${escape(v.code)}</p>
          <p style="margin:8px 0 0;font-size:12px;color:rgba(255,245,220,0.55);">${d.package}: <b>${escape(v.tier)}</b> · ${d.validUntil} ${escape(v.validUntil)}</p>
        </div>
        <p style="margin:0 0 18px;color:${BRAND.cream};line-height:1.55;">${d.body}</p>
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
}
export function adminGdprRequestTemplate(v: AdminGdprRequestVars): { subject: string; html: string; text: string } {
  const d = dict(v.locale).gdpr;
  const action = v.type === 'export' ? d.actionExport : d.actionDelete;
  return {
    subject: d.subject(action, v.userEmail),
    html: layout({
      title: d.title(action), locale: v.locale,
      preheader: `${v.userEmail} · ${action}`,
      bodyHtml: `
        <h2 style="margin:0 0 12px;font-family:'Times New Roman',serif;color:${BRAND.goldMid};font-size:20px;">${d.title(action)}</h2>
        <p style="margin:0 0 12px;color:${BRAND.cream};">${d.intro(action)}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0;font-size:13px;">
          <tr><td style="padding:6px 0;color:rgba(255,245,220,0.6);">${d.email}</td><td style="padding:6px 0;color:${BRAND.cream};"><b>${escape(v.userEmail)}</b></td></tr>
          <tr><td style="padding:6px 0;color:rgba(255,245,220,0.6);">${d.userId}</td><td style="padding:6px 0;font-family:monospace;color:${BRAND.cream};">${escape(v.userId)}</td></tr>
          <tr><td style="padding:6px 0;color:rgba(255,245,220,0.6);">${d.type}</td><td style="padding:6px 0;color:${BRAND.cream};">${escape(v.type)}</td></tr>
          ${v.reason ? `<tr><td style="padding:6px 0;color:rgba(255,245,220,0.6);vertical-align:top;">${d.reason}</td><td style="padding:6px 0;color:${BRAND.cream};">${escape(v.reason)}</td></tr>` : ''}
        </table>
        <p style="margin:14px 0 0;color:rgba(255,245,220,0.55);font-size:13px;line-height:1.55;">${d.note}</p>
      `,
    }),
    text: d.text(action, v.userEmail, v.userId, v.type, v.reason),
  };
}
