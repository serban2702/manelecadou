import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Payment } from '../payments/payment.entity';
import { AnalyticsSession } from './analytics-session.entity';
import { AnalyticsEvent } from './analytics-event.entity';
import { AdSpend } from './ad-spend.entity';
import {
  attributionOrderBySql,
  decodeUtmParam,
  isPlaceholderCampaign,
  normalizeSource,
  utmFromUrl,
} from './attribution-sql';

export type AttributionMatch =
  | 'session_key'
  | 'visitor'
  | 'user'
  | 'guest'
  | 'ip'
  | 'event_url'
  | 'none';

export interface AttributionSnapshot {
  attributionSource: string | null;
  attributionMedium: string | null;
  attributionCampaign: string | null;
  attributionCampaignName: string | null;
  attributionCreative: string | null;
  attributionReferrer: string | null;
  attributionLandingPath: string | null;
  attributionMatch: AttributionMatch;
  attributedAt: Date;
}

export interface PaymentIdentity {
  siteId: string | null;
  createdAt: Date;
  userId?: string | null;
  guestId?: string | null;
  ipAddress?: string | null;
  sessionKey?: string | null;
  visitorId?: string | null;
}

@Injectable()
export class PaymentAttributionService implements OnModuleInit {
  private readonly logger = new Logger('PaymentAttribution');

  constructor(
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(AnalyticsSession) private readonly sessions: Repository<AnalyticsSession>,
    @InjectRepository(AnalyticsEvent) private readonly events: Repository<AnalyticsEvent>,
    @InjectRepository(AdSpend) private readonly spend: Repository<AdSpend>,
  ) {}

  async onModuleInit() {
    try {
      const r = await this.backfill({ onlyMissing: true });
      if (r.updated > 0) {
        this.logger.log(
          `Backfill atribuire: ${r.updated} plăți (${r.withCampaign} cu campanie, ${r.withSource} cu sursă)`,
        );
      }
    } catch (err) {
      this.logger.warn(`Backfill atribuire sărit: ${(err as Error).message}`);
    }
  }

  applySnapshot(target: Payment, snap: AttributionSnapshot): Payment {
    target.attributionSource = snap.attributionSource;
    target.attributionMedium = snap.attributionMedium;
    target.attributionCampaign = snap.attributionCampaign;
    target.attributionCampaignName = snap.attributionCampaignName;
    target.attributionCreative = snap.attributionCreative;
    target.attributionReferrer = snap.attributionReferrer;
    target.attributionLandingPath = snap.attributionLandingPath;
    target.attributionMatch = snap.attributionMatch;
    target.attributedAt = snap.attributedAt;
    return target;
  }

  emptySnapshot(at = new Date()): AttributionSnapshot {
    return {
      attributionSource: null,
      attributionMedium: null,
      attributionCampaign: null,
      attributionCampaignName: null,
      attributionCreative: null,
      attributionReferrer: null,
      attributionLandingPath: null,
      attributionMatch: 'none',
      attributedAt: at,
    };
  }

  /**
   * Ultima sesiune a aceluiași om (user/guest/IP) — ca să copiem sessionKey/visitorId
   * pe checkout-urile create server-side din chat (fără request de browser).
   */
  async findIdentityHint(q: {
    siteId: string | null;
    userId?: string | null;
    guestId?: string | null;
    ip?: string | null;
  }): Promise<{ sessionKey: string | null; visitorId: string | null } | null> {
    if (!q.userId && !q.guestId && !q.ip) return null;
    const rows: Array<{ sessionKey: string; visitorId: string | null }> = await this.sessions.query(
      `
      SELECT s."sessionKey", s."visitorId"
      FROM analytics_sessions s
      WHERE ($1::uuid IS NULL OR s."siteId" = $1)
        AND (
          ($2::uuid IS NOT NULL AND s."userId" = $2)
          OR ($3::uuid IS NOT NULL AND s."guestId" = $3)
          OR ($4::text IS NOT NULL AND s.ip = $4)
        )
        AND s."startedAt" >= NOW() - INTERVAL '60 days'
      ORDER BY
        (CASE WHEN s.campaign IS NOT NULL AND s.campaign <> '' THEN 0 ELSE 1 END),
        (CASE WHEN lower(COALESCE(s.source,'')) LIKE '%facebook%'
                OR lower(s.source) IN ('fb','meta','an')
                OR lower(COALESCE(s.source,'')) LIKE '%instagram%'
              THEN 0 ELSE 1 END),
        s."startedAt" DESC
      LIMIT 1
      `,
      [q.siteId, q.userId ?? null, q.guestId ?? null, q.ip ?? null],
    );
    return rows[0] ?? null;
  }

  async resolve(p: PaymentIdentity): Promise<AttributionSnapshot> {
    const at = new Date();
    const empty = this.emptySnapshot(at);
    const row = await this.pickSession(p);
    if (!row) return empty;

    let campaign = decodeUtmParam(row.campaign);
    let creative = decodeUtmParam(row.utmContent);
    let sourceRaw = row.source;
    let medium = decodeUtmParam(row.medium);
    let match = row.match;
    let landingPath = row.landingPath;
    let referrer = row.referrer;

    if (isPlaceholderCampaign(campaign)) campaign = null;
    if (isPlaceholderCampaign(creative)) creative = null;

    // UTM pierdut pe sesiune dar prezent în URL-ul de page_view.
    if (!campaign) {
      const fromUrl = await this.campaignFromEventUrl(p);
      if (fromUrl?.campaign) {
        campaign = fromUrl.campaign;
        if (!creative && fromUrl.content) creative = fromUrl.content;
        if (!sourceRaw && fromUrl.source) sourceRaw = fromUrl.source;
        if (!medium && fromUrl.medium) medium = fromUrl.medium;
        match = 'event_url';
      }
    }

    const campaignName = campaign ? await this.resolveCampaignName(campaign) : null;
    const creativeName = creative ? await this.resolveAdName(creative) : creative;

    return {
      attributionSource: normalizeSource(sourceRaw),
      attributionMedium: medium,
      attributionCampaign: campaign,
      attributionCampaignName: campaignName,
      attributionCreative: creativeName,
      attributionReferrer: referrer,
      attributionLandingPath: landingPath,
      attributionMatch: match,
      attributedAt: at,
    };
  }

  async snapshotPayment(payment: Payment): Promise<Payment> {
    const snap = await this.resolve(payment);
    this.applySnapshot(payment, snap);
    return this.payments.save(payment);
  }

  async backfill(opts: { onlyMissing?: boolean; force?: boolean } = {}): Promise<{
    scanned: number;
    updated: number;
    withSource: number;
    withCampaign: number;
  }> {
    const onlyMissing = opts.onlyMissing !== false && !opts.force;
    const qb = this.payments.createQueryBuilder('p').orderBy('p.createdAt', 'ASC');
    if (onlyMissing) qb.andWhere('p.attributedAt IS NULL');
    const all = await qb.getMany();
    let updated = 0;
    let withSource = 0;
    let withCampaign = 0;
    for (const p of all) {
      const snap = await this.resolve(p);
      this.applySnapshot(p, snap);
      await this.payments.save(p);
      updated += 1;
      if (snap.attributionSource) withSource += 1;
      if (snap.attributionCampaignName || snap.attributionCampaign) withCampaign += 1;
    }
    return { scanned: all.length, updated, withSource, withCampaign };
  }

  private async pickSession(p: PaymentIdentity): Promise<{
    source: string | null;
    medium: string | null;
    campaign: string | null;
    utmContent: string | null;
    referrer: string | null;
    landingPath: string | null;
    match: AttributionMatch;
  } | null> {
    const rows: Array<{
      source: string | null;
      medium: string | null;
      campaign: string | null;
      utmContent: string | null;
      referrer: string | null;
      landingPath: string | null;
      match: AttributionMatch;
    }> = await this.sessions.query(
      `
      SELECT a.source, a.medium, a.campaign, a."utmContent", a.referrer, a."landingPath",
        CASE
          WHEN $6::text IS NOT NULL AND a."sessionKey" = $6 THEN 'session_key'
          WHEN $7::text IS NOT NULL AND a."visitorId" = $7 THEN 'visitor'
          WHEN $3::uuid IS NOT NULL AND a."userId" = $3 THEN 'user'
          WHEN $4::uuid IS NOT NULL AND a."guestId" = $4 THEN 'guest'
          WHEN $5::text IS NOT NULL AND a.ip = $5 THEN 'ip'
          ELSE 'none'
        END AS match
      FROM analytics_sessions a
      WHERE ($2::uuid IS NULL OR a."siteId" = $2)
        AND a."startedAt" <= $1
        AND a."startedAt" >= $1 - INTERVAL '60 days'
        AND a.source IS NOT NULL
        AND a.source NOT ILIKE 'stripe%'
        AND a.source NOT ILIKE 'checkout.stripe%'
        AND (
          ($6::text IS NOT NULL AND a."sessionKey" = $6)
          OR ($7::text IS NOT NULL AND a."visitorId" = $7)
          OR ($3::uuid IS NOT NULL AND a."userId" = $3)
          OR ($4::uuid IS NOT NULL AND a."guestId" = $4)
          OR ($5::text IS NOT NULL AND a.ip = $5)
        )
      ORDER BY ${attributionOrderBySql('a.source', 'a."startedAt"', '$1::timestamptz')}
      LIMIT 1
      `,
      [
        p.createdAt,
        p.siteId ?? null,
        p.userId ?? null,
        p.guestId ?? null,
        p.ipAddress ?? null,
        p.sessionKey ?? null,
        p.visitorId ?? null,
      ],
    );
    return rows[0] ?? null;
  }

  private async campaignFromEventUrl(p: PaymentIdentity): Promise<{
    source: string | null;
    medium: string | null;
    campaign: string | null;
    content: string | null;
  } | null> {
    if (!p.sessionKey && !p.visitorId) return null;
    const rows: Array<{ url: string }> = await this.events.query(
      `
      SELECT e.url
      FROM analytics_events e
      WHERE e.type = 'page_view'
        AND e.url ILIKE '%utm_campaign=%'
        AND e."createdAt" <= $1
        AND e."createdAt" >= $1 - INTERVAL '7 days'
        AND (
          ($2::text IS NOT NULL AND e."sessionKey" = $2)
          OR ($3::text IS NOT NULL AND e."visitorId" = $3)
        )
      ORDER BY e."createdAt" DESC
      LIMIT 1
      `,
      [p.createdAt, p.sessionKey ?? null, p.visitorId ?? null],
    );
    if (!rows[0]?.url) return null;
    const utm = utmFromUrl(rows[0].url);
    if (isPlaceholderCampaign(utm.campaign)) return null;
    return utm;
  }

  private async resolveCampaignName(campaign: string): Promise<string> {
    if (isPlaceholderCampaign(campaign)) return campaign;
    if (/^\d{10,}$/.test(campaign)) {
      const hit = await this.spend.findOne({
        where: { campaignId: campaign },
        select: ['campaignName'],
      });
      if (hit?.campaignName) return hit.campaignName;
    }
    const byName = await this.spend.findOne({
      where: { campaignName: campaign },
      select: ['campaignName'],
    });
    return byName?.campaignName ?? campaign;
  }

  private async resolveAdName(content: string): Promise<string> {
    if (isPlaceholderCampaign(content)) return content;
    if (/^\d{10,}$/.test(content)) {
      const hit = await this.spend.findOne({
        where: { adId: content },
        select: ['adName'],
      });
      if (hit?.adName) return hit.adName;
    }
    return content;
  }
}
