import { Injectable, Logger } from '@nestjs/common';

export interface GeoIpResult {
  country: string | null;
  countryName: string | null;
  region: string | null;
  city: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  isp: string | null;
  org: string | null;
  asn: string | null;
  source: 'ip-api' | 'ipinfo' | 'cache' | 'private' | 'error';
}

interface CacheEntry {
  result: GeoIpResult;
  expires: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 1500;
const MAX_CACHE = 5000;

function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  if (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('::ffff:127.')) return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.')) return true;
  if (ip.startsWith('172.')) {
    const second = parseInt(ip.split('.')[1] ?? '0', 10);
    if (second >= 16 && second <= 31) return true;
  }
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return true;
  return false;
}

function normalizeIp(ip: string): string {
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  return ip;
}

const empty = (source: GeoIpResult['source']): GeoIpResult => ({
  country: null,
  countryName: null,
  region: null,
  city: null,
  postalCode: null,
  latitude: null,
  longitude: null,
  timezone: null,
  isp: null,
  org: null,
  asn: null,
  source,
});

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { signal: ac.signal, headers: { Accept: 'application/json' } });
  } finally {
    clearTimeout(t);
  }
}

@Injectable()
export class GeoIpService {
  private readonly logger = new Logger('GeoIpService');
  private cache = new Map<string, CacheEntry>();
  private inFlight = new Map<string, Promise<GeoIpResult>>();

  async lookup(rawIp: string | null): Promise<GeoIpResult> {
    if (!rawIp) return empty('error');
    const ip = normalizeIp(rawIp.trim());
    if (!ip || isPrivateIp(ip)) return empty('private');

    const cached = this.cache.get(ip);
    if (cached && cached.expires > Date.now()) {
      return { ...cached.result, source: 'cache' };
    }

    const existing = this.inFlight.get(ip);
    if (existing) return existing;

    const promise = this.doLookup(ip).finally(() => {
      this.inFlight.delete(ip);
    });
    this.inFlight.set(ip, promise);
    return promise;
  }

  private async doLookup(ip: string): Promise<GeoIpResult> {
    let result = await this.tryIpApi(ip);
    if (!result) result = await this.tryIpInfo(ip);
    const final = result ?? empty('error');

    if (this.cache.size >= MAX_CACHE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    const ttl = final.country ? CACHE_TTL_MS : NEGATIVE_TTL_MS;
    this.cache.set(ip, { result: final, expires: Date.now() + ttl });
    return final;
  }

  private async tryIpApi(ip: string): Promise<GeoIpResult | null> {
    try {
      const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,regionName,city,zip,lat,lon,timezone,isp,org,as,query`;
      const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
      if (!res.ok) return null;
      const data: {
        status?: string;
        country?: string;
        countryCode?: string;
        regionName?: string;
        city?: string;
        zip?: string;
        lat?: number;
        lon?: number;
        timezone?: string;
        isp?: string;
        org?: string;
        as?: string;
      } = await res.json();
      if (data.status !== 'success') return null;
      // ip-api returnează `as` ca "AS13335 Cloudflare, Inc." — separăm ASN-ul scurt.
      let asn: string | null = null;
      let orgFromAs: string | null = null;
      if (data.as) {
        const m = data.as.match(/^(AS\d+)\s*(.*)$/);
        if (m) {
          asn = m[1];
          orgFromAs = m[2] || null;
        } else {
          asn = data.as.slice(0, 16);
        }
      }
      return {
        country: data.countryCode ?? null,
        countryName: data.country ?? null,
        region: data.regionName ?? null,
        city: data.city ?? null,
        postalCode: data.zip ?? null,
        latitude: data.lat ?? null,
        longitude: data.lon ?? null,
        timezone: data.timezone ?? null,
        isp: data.isp ?? null,
        org: data.org ?? orgFromAs,
        asn,
        source: 'ip-api',
      };
    } catch (err) {
      this.logger.debug(`ip-api lookup failed for ${ip}: ${(err as Error).message}`);
      return null;
    }
  }

  private async tryIpInfo(ip: string): Promise<GeoIpResult | null> {
    try {
      const token = process.env.IPINFO_TOKEN;
      const url = token
        ? `https://ipinfo.io/${encodeURIComponent(ip)}/json?token=${encodeURIComponent(token)}`
        : `https://ipinfo.io/${encodeURIComponent(ip)}/json`;
      const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
      if (!res.ok) return null;
      const data: {
        country?: string;
        region?: string;
        city?: string;
        postal?: string;
        loc?: string;
        timezone?: string;
        org?: string;
      } = await res.json();
      if (!data.country) return null;
      let lat: number | null = null;
      let lon: number | null = null;
      if (data.loc && data.loc.includes(',')) {
        const [a, b] = data.loc.split(',');
        const pa = Number(a);
        const pb = Number(b);
        if (Number.isFinite(pa) && Number.isFinite(pb)) {
          lat = pa;
          lon = pb;
        }
      }
      let asn: string | null = null;
      let org: string | null = data.org ?? null;
      if (data.org && /^AS\d+/.test(data.org)) {
        const m = data.org.match(/^(AS\d+)\s+(.*)$/);
        if (m) {
          asn = m[1];
          org = m[2];
        }
      }
      return {
        country: data.country,
        countryName: null,
        region: data.region ?? null,
        city: data.city ?? null,
        postalCode: data.postal ?? null,
        latitude: lat,
        longitude: lon,
        timezone: data.timezone ?? null,
        isp: org,
        org,
        asn,
        source: 'ipinfo',
      };
    } catch (err) {
      this.logger.debug(`ipinfo lookup failed for ${ip}: ${(err as Error).message}`);
      return null;
    }
  }
}
