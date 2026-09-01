import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';

import { EmailLink } from './email-link.entity';
import { EmailLinkClick } from './email-link-click.entity';
import { SettingsService } from '../settings/settings.service';
import { buildUtmUrl, utmSlug, EMAIL_CLICK_PARAM } from '../analytics/utm-standard';

/** Context minim pentru a decora un email. */
export interface EmailDecorateContext {
  siteId: string | null;
  /** Baza publică a site-ului (`https://manelecadou.ro`) — de aici se compune redirectul. */
  siteUrl: string | null;
  kind: string | null;
  recipientEmail: string;
  userId?: string | null;
  relatedId?: string | null;
  /** `utm_campaign`. Gol → se folosește `kind`. */
  campaign?: string | null;
  /** `utm_term` — audiența, unde o știm (payers / nonpayers / stage). */
  audience?: string | null;
  outboundEmailId?: string | null;
}

export interface EmailDecorateResult {
  html: string;
  /** Câte linkuri au fost rescrise prin redirectul de urmărire. */
  tracked: number;
  /** Câte au primit doar UTM-uri (fără redirect). */
  tagged: number;
}

/**
 * Linkuri care NU se ating niciodată, indiferent de setări.
 *
 * Dezabonarea: un hop în plus între om și butonul „nu-mi mai trimite" e exact
 * genul de lucru pentru care furnizorii de email penalizează. În plus, Gmail
 * apelează `List-Unsubscribe` singur, iar un redirect intermediar l-ar rupe.
 */
const NEVER_TRACK_PATTERNS = [/\/unsubscribe/i, /\/marketing\/unsubscribe/i, /\/dezabonare/i];

/**
 * Categoriile pe care nu le atingem DELOC — nici măcar cu UTM-uri.
 *
 * Trei motive, în ordinea gravității:
 *  - `magic_link`: tokenul de autentificare n-are ce căuta într-un tabel de
 *    clicuri, iar un redirect în plus pe calea de login e suprafață de atac
 *    degeaba. Nici rescrierea query string-ului nu merită riscul.
 *  - alertele interne (`ai_alert`, `suno_*`, `duplicate_payment_alert`,
 *    `gdpr_admin_notify`, `admin_test`): vin la noi, nu la clienți. Le-am
 *    număra clicurile nouă înșine și am polua rapoartele de campanie.
 *  - `inbox_*`: mailuri scrise de un operator, în care un link rescris ar
 *    surprinde exact omul care l-a lipit.
 */
const NEVER_TRACK_KINDS = new Set([
  'magic_link',
  'admin_test',
  'ai_alert',
  'suno_low_credits',
  'suno_api_down',
  'suno_api_recovered',
  'suno_credit_test',
  'duplicate_payment_alert',
  'gdpr_admin_notify',
  'language_unsupported',
  'inbox_compose',
  'inbox_reply',
  'inbox_forward',
]);

/** Roboți de securitate care apasă linkurile înainte ca omul să vadă mailul. */
const SCANNER_UA = /(GoogleImageProxy|YahooMailProxy|Barracuda|Proofpoint|Mimecast|Symantec|MessageLabs|SafeLinks|bitdefender|Microsoft Office|ms-office|Outlook-iOS|Slackbot-LinkExpanding|facebookexternalhit|WhatsApp|TelegramBot|Twitterbot|LinkedInBot|Discordbot|bot|crawler|spider|preview|scan)/i;

/** GIF transparent 1×1 — pixelul de deschidere. */
const PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

@Injectable()
export class EmailTrackingService {
  private readonly logger = new Logger('EmailTracking');

  constructor(
    @InjectRepository(EmailLink) private readonly links: Repository<EmailLink>,
    @InjectRepository(EmailLinkClick) private readonly clicks: Repository<EmailLinkClick>,
    private readonly settings: SettingsService,
  ) {}

  static readonly pixel = PIXEL_GIF;

  // ========================= DECORARE LA TRIMITERE =========================

  /**
   * Rescrie linkurile dintr-un email: UTM-uri standardizate pe toate, plus
   * redirect de urmărire pe cele către site-ul nostru.
   *
   * Nu aruncă NICIODATĂ: dacă ceva se strică aici, mailul trebuie să plece
   * oricum. Un buton fără statistici e o pierdere; un email netrimis e alta,
   * mai mare.
   */
  async decorate(html: string, ctx: EmailDecorateContext): Promise<EmailDecorateResult> {
    const fallback: EmailDecorateResult = { html, tracked: 0, tagged: 0 };
    if (!html || !ctx.siteUrl) return fallback;
    // Categoriile interzise ies ÎNAINTE de orice atingere a HTML-ului: pentru
    // ele nici măcar UTM-urile nu se adaugă (vezi NEVER_TRACK_KINDS).
    if (ctx.kind && NEVER_TRACK_KINDS.has(ctx.kind)) return fallback;
    try {
      const trackingOn = await this.clickTrackingEnabled(ctx.kind);
      const openOn = trackingOn && (await this.openTrackingEnabled());

      const rewritten = rewriteEmailLinks(html, {
        siteUrl: ctx.siteUrl,
        campaign: utmSlug(ctx.campaign || ctx.kind || 'email', 128) || 'email',
        term: ctx.audience ? utmSlug(ctx.audience, 64) : null,
        tracking: trackingOn,
        openPixel: openOn,
        makeToken,
      });

      if (rewritten.links.length > 0) {
        await this.links.save(
          rewritten.links.map((l) =>
            this.links.create({
              token: l.token,
              siteId: ctx.siteId,
              outboundEmailId: ctx.outboundEmailId ?? null,
              kind: ctx.kind ?? null,
              campaign: rewritten.campaign,
              linkKey: l.linkKey,
              recipientEmail: ctx.recipientEmail?.toLowerCase() ?? null,
              userId: ctx.userId ?? null,
              relatedId: ctx.relatedId ?? null,
              targetUrl: l.targetUrl,
              isOpenPixel: l.isOpenPixel,
            }),
          ),
        );
      }
      return { html: rewritten.html, tracked: rewritten.tracked, tagged: rewritten.tagged };
    } catch (e) {
      this.logger.warn(`decorate a eșuat (mailul pleacă nedecorat): ${(e as Error).message}`);
      return fallback;
    }
  }

  // ========================= CLICK & OPEN =========================

  /**
   * Înregistrează un click și întoarce destinația.
   *
   * Fail-open prin design: dacă tokenul nu există (mail vechi, tabel curățat),
   * întoarcem `null` iar controllerul duce omul pe pagina principală. Un client
   * care a apăsat butonul din email nu are ce căuta pe o pagină de eroare.
   */
  async recordClick(
    token: string,
    ctx: { ip: string | null; userAgent: string | null; eventType?: 'click' | 'open' },
  ): Promise<EmailLink | null> {
    const link = await this.links.findOne({ where: { token } });
    if (!link) return null;

    const eventType = ctx.eventType ?? 'click';
    const isBot = SCANNER_UA.test(ctx.userAgent ?? '');
    const now = new Date();

    // Contoarele NU cresc pentru roboții de securitate: altfel fiecare campanie
    // ar raporta rată de click aproape 100%, iar cifra ar deveni inutilă.
    if (!isBot && eventType === 'click') {
      link.clickCount += 1;
      if (!link.firstClickAt) link.firstClickAt = now;
      link.lastClickAt = now;
      await this.links.save(link).catch(() => undefined);
    } else if (!isBot && eventType === 'open') {
      if (!link.firstClickAt) link.firstClickAt = now;
      link.lastClickAt = now;
      await this.links.save(link).catch(() => undefined);
    }

    await this.clicks
      .save(
        this.clicks.create({
          linkId: link.id,
          token: link.token,
          siteId: link.siteId,
          kind: link.kind,
          campaign: link.campaign,
          linkKey: link.linkKey,
          recipientEmail: link.recipientEmail,
          userId: link.userId,
          eventType,
          sequence: link.clickCount || 1,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          device: detectDevice(ctx.userAgent),
          isBot,
        }),
      )
      .catch((e) => {
        this.logger.warn(`insert click eșuat pentru ${token}: ${(e as Error).message}`);
        return undefined;
      });

    return link;
  }

  // ========================= SETĂRI =========================

  private async clickTrackingEnabled(kind: string | null): Promise<boolean> {
    if (kind && NEVER_TRACK_KINDS.has(kind)) return false;
    const flag = (await this.settings.get('EMAIL_CLICK_TRACKING')) ?? '';
    if (flag === 'false' || flag === '0') return false;
    const excluded = ((await this.settings.get('EMAIL_TRACKING_EXCLUDE_KINDS')) ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (kind && excluded.includes(kind.toLowerCase())) return false;
    return true;
  }

  private async openTrackingEnabled(): Promise<boolean> {
    const flag = (await this.settings.get('EMAIL_OPEN_TRACKING')) ?? '';
    return flag !== 'false' && flag !== '0';
  }
}

// ============================== rescrierea linkurilor ==============================

export interface RewriteOptions {
  siteUrl: string;
  campaign: string;
  term: string | null;
  /** Rescrie prin redirect (și produce tokenuri) sau doar adaugă UTM-uri. */
  tracking: boolean;
  openPixel: boolean;
  makeToken: () => string;
}

export interface RewrittenLink {
  token: string;
  linkKey: string;
  targetUrl: string;
  isOpenPixel: boolean;
}

export interface RewriteResult {
  html: string;
  campaign: string;
  links: RewrittenLink[];
  tracked: number;
  tagged: number;
}

/**
 * Partea pură a decorării: primește HTML și întoarce HTML + linkurile de
 * persistat. Separată de serviciu ca să poată fi testată fără bază de date —
 * e cod cu regex peste HTML scris de om, adică exact locul unde o greșeală nu
 * dă eroare, ci un buton mort într-un email deja plecat.
 */
export function rewriteEmailLinks(html: string, o: RewriteOptions): RewriteResult {
  const base = o.siteUrl.replace(/\/+$/, '');
  const siteHost = safeHost(base);
  const links: RewrittenLink[] = [];
  const usedKeys = new Map<string, number>();
  let tracked = 0;
  let tagged = 0;

  const out = html.replace(/href\s*=\s*(["'])(.*?)\1/gi, (whole, quote: string, raw: string) => {
    const url = decodeHtmlEntities(raw.trim());
    if (!/^https?:\/\//i.test(url)) return whole;              // mailto:, tel:, #ancore
    if (NEVER_TRACK_PATTERNS.some((re) => re.test(url))) return whole;
    if (url.includes('/api/e/c/')) return whole;                 // deja decorat

    const host = safeHost(url);
    // UTM-urile se pun DOAR pe linkurile noastre. Pe un link extern ar fi
    // zgomot în analitica altcuiva și n-am câștiga nimic.
    const isOurs = Boolean(siteHost && host && (host === siteHost || host.endsWith(`.${siteHost}`)));
    if (!isOurs) return whole;

    const linkKey = uniqueLinkKey(url, usedKeys);
    const token = o.tracking ? o.makeToken() : null;
    const finalUrl = buildUtmUrl({
      baseUrl: url,
      source: 'email',
      medium: 'email',
      campaign: o.campaign,
      content: linkKey,
      term: o.term,
      extra: token ? { [EMAIL_CLICK_PARAM]: token } : undefined,
    });

    if (!token) {
      tagged += 1;
      return `href=${quote}${escapeHtmlAttr(finalUrl)}${quote}`;
    }
    links.push({ token, linkKey, targetUrl: finalUrl, isOpenPixel: false });
    tracked += 1;
    return `href=${quote}${escapeHtmlAttr(`${base}/api/e/c/${token}`)}${quote}`;
  });

  // Pixelul are sens doar dacă mailul chiar e urmărit: altfel am ști că a fost
  // deschis, dar n-am putea lega deschiderea de nimic.
  let finalHtml = out;
  if (o.openPixel && tracked > 0) {
    const pixelToken = o.makeToken();
    links.push({ token: pixelToken, linkKey: 'open', targetUrl: base, isOpenPixel: true });
    const img = `<img src="${base}/api/e/o/${pixelToken}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0" />`;
    finalHtml = /<\/body>/i.test(out) ? out.replace(/<\/body>/i, `${img}</body>`) : out + img;
  }

  return { html: finalHtml, campaign: o.campaign, links, tracked, tagged };
}

// ============================== helperi ==============================

function makeToken(): string {
  return randomBytes(11).toString('hex'); // 22 caractere
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Cheia semantică a linkului, folosită ca `utm_content` — „ce buton a apăsat".
 *
 * Se deduce din calea URL-ului, ca să nu fie nevoie să adnotăm fiecare șablon.
 * Linkurile identice repetate în același mail primesc sufix (`song-2`): fără el,
 * butonul din antet și cel din subsol s-ar aduna în același rând.
 */
function uniqueLinkKey(url: string, used: Map<string, number>): string {
  let base = 'link';
  try {
    const p = new URL(url).pathname.replace(/\/+$/, '');
    if (!p || p === '') base = 'home';
    else if (/^\/m\//.test(p)) base = 'song';
    else if (/^\/studio/.test(p)) base = 'studio';
    else if (/^\/top/.test(p)) base = 'top';
    else if (/^\/contact/.test(p)) base = 'contact';
    else base = utmSlug(p.replace(/^\//, '').split('/')[0], 32) || 'link';
  } catch {
    /* URL invalid — rămâne 'link' */
  }
  const n = (used.get(base) ?? 0) + 1;
  used.set(base, n);
  return n === 1 ? base : `${base}-${n}`;
}

function detectDevice(ua: string | null): string | null {
  if (!ua) return null;
  const s = ua.toLowerCase();
  if (/ipad|tablet/.test(s)) return 'tablet';
  if (/mobile|iphone|ipod|android/.test(s)) return 'mobile';
  return 'desktop';
}

/** Șabloanele scriu `&amp;` în `href` (corect în HTML) — URL-ul real n-are. */
function decodeHtmlEntities(v: string): string {
  return v
    .replace(/&amp;/g, '&')
    .replace(/&#38;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function escapeHtmlAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
