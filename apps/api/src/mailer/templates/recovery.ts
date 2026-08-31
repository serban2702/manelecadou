/**
 * Template-uri pentru RECOVERY EMAILS — recuperarea clienților care au început
 * o comandă dar nu au plătit (plată Stripe expirată sau generare 'full' rămasă
 * pending neplătită).
 *
 * 6 etape escaladate (1h → 7 zile), fiecare cu subiect + intro propriu și un cod
 * promo personal afișat mare. Conținutul e TRADUS pe limba site-ului
 * (`recovery-i18n.ts`) — până la 31 aug 2026 pleca în română pe toate site-urile,
 * inclusiv pe cele bulgare și grecești, unde tranzacționalele ajungeau corect.
 *
 * Dezabonarea NU folosește fluxul de marketing — fiecare candidat are propriul
 * token (`recovery_states.optOutToken`) și pagina `/unsubscribe` de pe site
 * cere confirmare activă (tastarea emailului complet).
 */

import { renderBrandedEmail, type EmailBranding } from './templates';
import { recoveryStrings, type StageCopy } from './recovery-i18n';

const COLORS = {
  goldFrom: '#fff5cc',
  goldMid: '#ffe28a',
  goldDeep: '#b07c1e',
  cream: '#fff5dc',
};

export interface RecoveryEmailVars {
  /** Etapa 1..6 din programul escaladat (1h, 4h, 24h, 48h, 72h, 7 zile). */
  stage: 1 | 2 | 3 | 4 | 5 | 6;
  /** Procentul reducerii (10 / 20 / 30). */
  percent: number;
  /** Codul promo personal (unic, restricted pe email). */
  code: string;
  /** Câte ore mai e valabil codul (48 sau 72 la etapa finală). */
  validHours: number;
  /** Numele destinatarului manelei (din generation) — null dacă nu există. */
  recipientName?: string | null;
  /** Link-ul butonului principal: /m/<id> sau /studio. */
  ctaUrl: string;
  /** Link-ul de dezabonare cu token unic per candidat. */
  unsubscribeUrl: string;
  /** Numele site-ului (pentru mențiunea onestă „ai început o comandă pe X"). */
  siteName: string;
  locale?: string;
  branding?: EmailBranding;
}

function escape(s: string | number | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ctaButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto;">
    <tr><td style="border-radius:10px;background: linear-gradient(180deg, ${COLORS.goldFrom} 0%, ${COLORS.goldMid} 30%, #f1c84d 60%, ${COLORS.goldDeep} 100%);box-shadow:0 6px 16px rgba(241,200,77,0.3);">
      <a href="${escape(href)}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:800;color:#2a1a04;text-decoration:none;letter-spacing:0.02em;">${escape(label)}</a>
    </td></tr>
  </table>`;
}

/** Card-ul cu codul promo: cod mare monospace + procent + expirare. */
function promoCard(code: string, percent: number, validHours: number, label: string, valid: string): string {
  return `<div style="text-align:center;background:rgba(241,200,77,0.08);border:2px dashed rgba(241,200,77,0.5);border-radius:12px;padding:22px;margin:18px 0;">
    <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,245,220,0.55);">${escape(label)}</p>
    <p style="margin:0;font-family:'Courier New',monospace;font-size:30px;font-weight:900;color:${COLORS.goldMid};letter-spacing:0.1em;">${escape(code)}</p>
    <p style="margin:8px 0 0;font-size:12px;color:rgba(255,245,220,0.55);">${escape(valid)}</p>
  </div>`;
}

/** Footer cu link de dezabonare (scope: doar recovery, cu confirmare pe pagină). */
function unsubscribeFooter(url: string, question: string, link: string): string {
  return `<p style="margin:22px 0 0;font-size:11px;color:rgba(255,245,220,0.4);text-align:center;line-height:1.5;">
    ${escape(question)}
    <a href="${escape(url)}" style="color:rgba(255,245,220,0.6);text-decoration:underline;">${escape(link)}</a>
  </p>`;
}

export function recoveryEmailTemplate(v: RecoveryEmailVars): { subject: string; html: string; text: string } {
  const s = recoveryStrings(v.locale);
  const t: StageCopy = s.stages[v.stage];
  const songLine = v.recipientName
    ? s.songLineNamed(`<b style="color:${COLORS.goldMid};">${escape(v.recipientName)}</b>`)
    : s.songLineGeneric;
  const songLineText = v.recipientName ? s.songLineNamed(v.recipientName) : s.songLineGeneric;

  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:18px;color:${COLORS.goldMid};font-weight:700;">${escape(s.hello)}</p>
    <h2 style="margin:0 0 12px;font-family:'Times New Roman',serif;color:${COLORS.goldMid};font-size:22px;">${escape(t.headline(v.percent))}</h2>
    <p style="margin:0 0 8px;color:${COLORS.cream};line-height:1.6;">${t.intro(songLine, v.percent)}</p>
    ${promoCard(v.code, v.percent, v.validHours, s.promoLabel(v.percent), s.promoValid(v.validHours))}
    <div style="text-align:center;">${ctaButton(v.ctaUrl, t.cta(v.percent))}</div>
    <p style="margin:14px 0 0;font-size:12px;color:rgba(255,245,220,0.5);text-align:center;line-height:1.5;">
      ${escape(s.whyReceiving(v.siteName))}
    </p>
    ${unsubscribeFooter(v.unsubscribeUrl, s.unsubQuestion, s.unsubLink)}
  `;

  const text = [
    s.hello.replace(/\s*👋\s*$/, ''),
    '',
    t.intro(songLineText, v.percent).replace(/<[^>]+>/g, ''),
    '',
    s.codeLineText(v.percent, v.code),
    s.validTextLine(v.validHours),
    '',
    `${t.cta(v.percent)}: ${v.ctaUrl}`,
    '',
    s.whyReceiving(v.siteName),
    `${s.unsubTextLabel}: ${v.unsubscribeUrl}`,
  ].join('\n');

  return {
    subject: t.subject(v.percent),
    html: renderBrandedEmail({
      subject: t.subject(v.percent),
      preheader: `${t.headline(v.percent)} · cod −${v.percent}%`,
      locale: v.locale ?? 'ro',
      branding: v.branding,
      bodyHtml,
    }),
    text,
  };
}
