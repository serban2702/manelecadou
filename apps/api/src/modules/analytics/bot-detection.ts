/**
 * Sistem de detectare a botilor — multi-signal scoring.
 * Scor 0-100. >=70 bot, 40-69 suspicious, <40 uman.
 */

import type { Request } from 'express';
import type { ParsedUa } from './ua-parser';
import type { TrackEventDto } from './dto';
import type { GeoIpResult } from './geoip.service';

export type BotCategory = 'human' | 'suspicious' | 'datacenter' | 'headless' | 'known_bot';

export interface BotReason {
  rule: string;
  weight: number;
  detail?: string;
}

export interface BotEvaluation {
  score: number;
  category: BotCategory;
  reasons: BotReason[];
}

/**
 * ASN-uri cunoscute pentru cloud/datacenter — traffic legitim al utilizatorilor
 * NU vine din aceste rețele decât prin VPN/proxy. Curat manual din top providers.
 */
const DATACENTER_ASN = new Set<string>([
  // Cloudflare
  'AS13335',
  // Amazon AWS
  'AS16509', 'AS14618', 'AS8987', 'AS39111', 'AS9059',
  // Google Cloud
  'AS15169', 'AS396982', 'AS19527', 'AS36492',
  // Microsoft Azure
  'AS8075', 'AS8068', 'AS8074',
  // DigitalOcean
  'AS14061', 'AS393406', 'AS133165',
  // Hetzner
  'AS24940', 'AS213230',
  // OVH
  'AS16276', 'AS35540',
  // Linode (Akamai)
  'AS63949', 'AS20940', 'AS16625',
  // Vultr
  'AS20473',
  // Oracle Cloud
  'AS31898', 'AS19551',
  // Alibaba
  'AS37963', 'AS45102', 'AS134963',
  // Tencent
  'AS132203', 'AS133478', 'AS45090',
  // IBM Cloud
  'AS36351',
  // Other commonly abused
  'AS49981', // WorldStream
  'AS9009',  // M247
  'AS62240', // Clouvider
  'AS46844', // Sharktech
  'AS207990', // HostRoyale
]);

interface BotDetectionInput {
  ua: ParsedUa;
  userAgent: string | null;
  geo: GeoIpResult;
  dto: TrackEventDto;
  req: Request | null;
}

export function evaluateBot(input: BotDetectionInput): BotEvaluation {
  const reasons: BotReason[] = [];
  const { ua, userAgent, geo, dto, req } = input;

  // --- 1. UA-based (cele mai sigure) ---
  if (ua.isBot) {
    reasons.push({ rule: 'ua_bot_pattern', weight: 90, detail: 'User-Agent matches bot regex' });
  }
  if (!userAgent || userAgent.length < 20) {
    reasons.push({ rule: 'ua_missing_or_short', weight: 60 });
  }

  // --- 2. Datacenter ASN ---
  if (geo.asn && DATACENTER_ASN.has(geo.asn)) {
    reasons.push({
      rule: 'datacenter_asn',
      weight: 50,
      detail: `${geo.asn} (${geo.org ?? 'cloud provider'})`,
    });
  }

  // --- 3. Headless / automation signals ---
  const props = (dto.props ?? {}) as Record<string, unknown>;
  if (props.webdriver === true) {
    reasons.push({ rule: 'navigator_webdriver', weight: 80, detail: 'navigator.webdriver=true' });
  }
  if (typeof props.pluginsLength === 'number' && props.pluginsLength === 0 && ua.browserName === 'Chrome') {
    // Chrome real are de obicei plugin-uri (PDF viewer); 0 = headless suspect
    reasons.push({ rule: 'chrome_zero_plugins', weight: 25 });
  }
  if (typeof props.hardwareConcurrency === 'number' && props.hardwareConcurrency <= 1) {
    reasons.push({ rule: 'low_hw_concurrency', weight: 15, detail: `cores=${props.hardwareConcurrency}` });
  }
  if (typeof props.languagesCount === 'number' && props.languagesCount === 0) {
    reasons.push({ rule: 'empty_languages', weight: 30 });
  }

  // --- 4. Mobile UA dar fără touch ---
  if (ua.device === 'mobile' && dto.touchCapable === false) {
    reasons.push({ rule: 'mobile_no_touch', weight: 25, detail: 'mobile UA + touch=false' });
  }

  // --- 5. Headers anomalies ---
  if (req) {
    const headers = req.headers;
    if (!headers['accept-language']) {
      reasons.push({ rule: 'missing_accept_language', weight: 20 });
    }
    if (!headers['accept']) {
      reasons.push({ rule: 'missing_accept', weight: 30 });
    }
    const acc = (headers['accept'] as string | undefined) ?? '';
    if (acc === '*/*' && !ua.isBot) {
      reasons.push({ rule: 'generic_accept_only', weight: 25 });
    }
    // sec-ch-ua e prezent la Chrome modern; absența pe Chrome e suspect (deși nu pe Firefox/Safari)
    if (ua.browserName === 'Chrome' && !headers['sec-ch-ua']) {
      reasons.push({ rule: 'chrome_missing_sec_ch_ua', weight: 20 });
    }
  }

  // --- 6. Geo / TZ inconsistency ---
  if (
    geo.timezone &&
    dto.timezone &&
    typeof dto.timezone === 'string' &&
    !timezoneMatchesGeo(dto.timezone, geo.timezone)
  ) {
    reasons.push({
      rule: 'tz_geo_mismatch',
      weight: 10,
      detail: `client=${dto.timezone} vs ip=${geo.timezone}`,
    });
  }

  // --- 7. Viewport anomalies ---
  if (typeof dto.viewportWidth === 'number' && dto.viewportWidth < 100) {
    reasons.push({ rule: 'viewport_too_small', weight: 30 });
  }

  // --- Aggregate ---
  // Combinăm aditiv dar capăm la 100; ponderare de tip max(weights) NU reflectă
  // bine combinatii (ex: datacenter + missing accept-language). Limitez fiecare
  // regulă să nu depășească 90, iar suma e plafonată.
  let score = 0;
  for (const r of reasons) score += r.weight;
  score = Math.min(100, score);

  // --- Categorisation ---
  let category: BotCategory = 'human';
  if (ua.isBot) category = 'known_bot';
  else if (reasons.some((r) => r.rule === 'navigator_webdriver' || r.rule === 'chrome_zero_plugins')) category = 'headless';
  else if (reasons.some((r) => r.rule === 'datacenter_asn') && score >= 60) category = 'datacenter';
  else if (score >= 70) category = 'datacenter';
  else if (score >= 40) category = 'suspicious';

  return { score, category, reasons };
}

/** Verifică dacă timezone-ul clientului e compatibil cu cel derivat din IP. */
function timezoneMatchesGeo(clientTz: string, geoTz: string): boolean {
  if (clientTz === geoTz) return true;
  // ex: client="America/Toronto" geo="America/Toronto" — exact
  // ex: client="Europe/Bucharest" geo="Europe/Athens" — same UTC offset, accept
  // Pentru a evita rezolvare full, comparăm doar regiunea (continent).
  const cR = clientTz.split('/')[0];
  const gR = geoTz.split('/')[0];
  return cR === gR;
}
