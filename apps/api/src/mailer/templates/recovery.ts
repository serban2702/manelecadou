/**
 * Template-uri pentru RECOVERY EMAILS — recuperarea clienților care au început
 * o comandă dar nu au plătit (plată Stripe expirată sau generare 'full' rămasă
 * pending neplătită).
 *
 * 6 etape escaladate (1h → 7 zile), fiecare cu subiect + intro propriu și un cod
 * promo personal afișat mare. Conținut 100% română (toate site-urile primesc RO
 * pentru recovery — decizie owner: brand „Manele Cadou", ton prietenos).
 *
 * Dezabonarea NU folosește fluxul de marketing — fiecare candidat are propriul
 * token (`recovery_states.optOutToken`) și pagina `/unsubscribe` de pe site
 * cere confirmare activă (tastarea emailului complet).
 */

import { renderBrandedEmail, type EmailBranding } from './templates';

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
function promoCard(code: string, percent: number, validHours: number): string {
  return `<div style="text-align:center;background:rgba(241,200,77,0.08);border:2px dashed rgba(241,200,77,0.5);border-radius:12px;padding:22px;margin:18px 0;">
    <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,245,220,0.55);">Codul tău · −${percent}%</p>
    <p style="margin:0;font-family:'Courier New',monospace;font-size:30px;font-weight:900;color:${COLORS.goldMid};letter-spacing:0.1em;">${escape(code)}</p>
    <p style="margin:8px 0 0;font-size:12px;color:rgba(255,245,220,0.55);">Valabil ${validHours} de ore de la primirea acestui email</p>
  </div>`;
}

/** Footer cu link de dezabonare (scope: doar recovery, cu confirmare pe pagină). */
function unsubscribeFooter(url: string): string {
  return `<p style="margin:22px 0 0;font-size:11px;color:rgba(255,245,220,0.4);text-align:center;line-height:1.5;">
    Nu mai vrei să primești emailuri despre comanda ta neterminată?
    <a href="${escape(url)}" style="color:rgba(255,245,220,0.6);text-decoration:underline;">Dezabonează-te</a>
  </p>`;
}

interface StageCopy {
  subject: string;
  headline: string;
  /** Intro — primește fraza despre manea (cu sau fără nume destinatar). */
  intro: (songLine: string) => string;
  cta: string;
}

/** Copy per etapă: 10% → curiozitate; 20% → beneficiu; 30% → ultimă șansă
 *  (onest, fără urgență falsă agresivă). */
const STAGE_COPY: Record<1 | 2 | 3 | 4 | 5 | 6, StageCopy> = {
  1: {
    subject: '🎁 Ai uitat ceva? Maneaua ta te așteaptă (cu o surpriză)',
    headline: 'Comanda ta e la un pas distanță',
    intro: (song) =>
      `${song} Ca să-ți fie mai ușor să o termini, ți-am pregătit un cod de reducere de 10% — e doar al tău.`,
    cta: 'Continuă comanda',
  },
  2: {
    subject: '🎶 Mai e un singur pas până la maneaua ta',
    headline: 'Tot ce ai completat e salvat',
    intro: (song) =>
      `${song} Nu trebuie să o iei de la capăt — reiei exact de unde ai rămas. Codul tău de 10% e încă valabil mai jos.`,
    cta: 'Reia comanda',
  },
  3: {
    subject: '🎁 Reducerea ta a crescut: 20% pentru maneaua ta',
    headline: 'Am mărit reducerea pentru tine',
    intro: (song) =>
      `${song} O manea personalizată e genul de cadou despre care se vorbește ani de zile la mese — și acum te costă cu 20% mai puțin.`,
    cta: 'Folosește reducerea de 20%',
  },
  4: {
    subject: '⭐ 30% reducere — cea mai mare pe care o putem oferi',
    headline: '30% — mai mult de atât nu putem',
    intro: (song) =>
      `${song} Ți-am pregătit reducerea maximă: 30%. E cea mai bună ofertă pe care o facem vreodată, păstrată pentru cei care au fost atât de aproape.`,
    cta: 'Deblochează cu −30%',
  },
  5: {
    subject: '🎵 Imaginează-ți fața lui când își aude numele în manea',
    headline: 'Momentul ăla merită trăit',
    intro: (song) =>
      `${song} Gândește-te la momentul în care pornește melodia și toată lumea aude numele lui în versuri. Reducerea ta de 30% e încă activă mai jos.`,
    cta: 'Termină maneaua acum',
  },
  6: {
    subject: '✉️ Ultimul nostru email — codul tău de 30% expiră curând',
    headline: 'Nu te mai deranjăm după acesta',
    intro: (song) =>
      `${song} Acesta e ultimul email pe care ți-l trimitem despre comanda ta — promitem. Dacă vrei să o termini, codul de 30% de mai jos e valabil încă 72 de ore. Dacă nu, nicio problemă — poate altă dată.`,
    cta: 'Folosește ultima reducere',
  },
};

export function recoveryEmailTemplate(v: RecoveryEmailVars): { subject: string; html: string; text: string } {
  const t = STAGE_COPY[v.stage];
  const songLine = v.recipientName
    ? `Maneaua pentru <b style="color:${COLORS.goldMid};">${escape(v.recipientName)}</b> e gata de configurat și deblocat.`
    : 'Ai început să-ți creezi o manea personalizată, dar comanda a rămas neterminată.';
  const songLineText = v.recipientName
    ? `Maneaua pentru ${v.recipientName} e gata de configurat și deblocat.`
    : 'Ai început să-ți creezi o manea personalizată, dar comanda a rămas neterminată.';

  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:18px;color:${COLORS.goldMid};font-weight:700;">Salut! 👋</p>
    <h2 style="margin:0 0 12px;font-family:'Times New Roman',serif;color:${COLORS.goldMid};font-size:22px;">${escape(t.headline)}</h2>
    <p style="margin:0 0 8px;color:${COLORS.cream};line-height:1.6;">${t.intro(songLine)}</p>
    ${promoCard(v.code, v.percent, v.validHours)}
    <div style="text-align:center;">${ctaButton(v.ctaUrl, t.cta)}</div>
    <p style="margin:14px 0 0;font-size:12px;color:rgba(255,245,220,0.5);text-align:center;line-height:1.5;">
      Primești acest email pentru că ai început o comandă pe ${escape(v.siteName)}.
    </p>
    ${unsubscribeFooter(v.unsubscribeUrl)}
  `;

  const text = [
    'Salut!',
    '',
    t.intro(songLineText).replace(/<[^>]+>/g, ''),
    '',
    `Codul tău (−${v.percent}%): ${v.code}`,
    `Valabil ${v.validHours} de ore de la primirea acestui email.`,
    '',
    `${t.cta}: ${v.ctaUrl}`,
    '',
    `Primești acest email pentru că ai început o comandă pe ${v.siteName}.`,
    `Dezabonare: ${v.unsubscribeUrl}`,
  ].join('\n');

  return {
    subject: t.subject,
    html: renderBrandedEmail({
      subject: t.subject,
      preheader: `${t.headline} · cod −${v.percent}%`,
      locale: v.locale ?? 'ro',
      branding: v.branding,
      bodyHtml,
    }),
    text,
  };
}
