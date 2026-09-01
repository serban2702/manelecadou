import { Controller, Get, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { AdminGuard } from '../../common/admin.guard';
import { CurrentSiteId } from '../../common/decorators';
import { EmailTrackingService } from './email-tracking.service';
import { EmailTrackingStatsService } from './email-tracking-stats.service';

function clientIp(req: Request): string | null {
  const fwd = (req.headers['x-forwarded-for'] as string) || '';
  if (fwd) return fwd.split(',')[0].trim();
  return (req.ip || req.socket?.remoteAddress) ?? null;
}

/**
 * Rutele publice de urmărire a emailurilor: `/api/e/c/<token>` (click) și
 * `/api/e/o/<token>` (pixel de deschidere).
 *
 * Calea e scurtă intenționat — ajunge în linkuri trimise prin email, iar unii
 * clienți de mail rup URL-urile lungi pe două rânduri, ceea ce le face
 * neapăsabile.
 *
 * `SkipThrottle`: o campanie trimisă la mii de oameni produce un vârf de
 * clicuri în primele minute, iar un 429 aici ar însemna un client care a
 * apăsat butonul din email și n-a ajuns nicăieri.
 */
@SkipThrottle()
@Controller('e')
export class EmailTrackingPublicController {
  constructor(private readonly tracking: EmailTrackingService) {}

  @Get('c/:token')
  async click(@Param('token') token: string, @Req() req: Request, @Res() res: Response) {
    const link = await this.tracking
      .recordClick(token, {
        ip: clientIp(req),
        userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
        eventType: 'click',
      })
      .catch(() => null);

    // Fail-open: token necunoscut (mail vechi, tabel curățat) → pagina
    // principală a site-ului de pe care a venit requestul. Un client care a
    // apăsat butonul din email nu are ce căuta pe o pagină de eroare.
    const target = link?.targetUrl || fallbackUrl(req);
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
    return res.redirect(302, target);
  }

  @Get('o/:token')
  async open(@Param('token') token: string, @Req() req: Request, @Res() res: Response) {
    await this.tracking
      .recordClick(token.replace(/\.(gif|png)$/i, ''), {
        ip: clientIp(req),
        userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
        eventType: 'open',
      })
      .catch(() => null);

    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Content-Length', String(EmailTrackingService.pixel.length));
    return res.end(EmailTrackingService.pixel);
  }
}

function fallbackUrl(req: Request): string {
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || '';
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const clean = host.split(',')[0].trim();
  return clean ? `${proto}://${clean}/` : 'https://manelecadou.ro/';
}

/** Rapoartele de email pentru admin. */
@UseGuards(AdminGuard)
@Controller('admin/email-tracking')
export class EmailTrackingAdminController {
  constructor(private readonly stats: EmailTrackingStatsService) {}

  /** Performanță pe categorie de email sau pe campanie. */
  @Get('performance')
  performance(
    @Query() q: { from?: string; to?: string; dimension?: 'kind' | 'campaign' | 'link' | 'day'; includeBots?: string },
    @CurrentSiteId() siteId: string | null,
  ) {
    return this.stats.performance({
      from: q.from,
      to: q.to,
      dimension: q.dimension ?? 'campaign',
      siteId,
      includeBots: q.includeBots === '1' || q.includeBots === 'true',
    });
  }

  /** Cine a apăsat, când și de câte ori — lista de destinatari. */
  @Get('recipients')
  recipients(
    @Query()
    q: { from?: string; to?: string; campaign?: string; kind?: string; email?: string; limit?: string; includeBots?: string },
    @CurrentSiteId() siteId: string | null,
  ) {
    return this.stats.recipients({
      from: q.from,
      to: q.to,
      campaign: q.campaign,
      kind: q.kind,
      email: q.email,
      siteId,
      limit: Math.min(parseInt(q.limit ?? '100', 10) || 100, 500),
      includeBots: q.includeBots === '1' || q.includeBots === 'true',
    });
  }

  /** Clicurile brute ale unui destinatar (fiecare apăsare, cu ora și device-ul). */
  @Get('clicks')
  clicks(
    @Query() q: { email?: string; token?: string; limit?: string },
    @CurrentSiteId() siteId: string | null,
  ) {
    return this.stats.clicks({
      email: q.email,
      token: q.token,
      siteId,
      limit: Math.min(parseInt(q.limit ?? '200', 10) || 200, 1000),
    });
  }
}
