import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/jwt.guard';
import { AdminGuard } from '../../common/admin.guard';
import { DomainCheckService } from './domain-check.service';
import { SiteRolloutService } from './site-rollout.service';

/**
 * Registru de lansare: ce trebuie setat pe site-urile de producție după
 * lucrările din acest branch (Lyria, Cadou, pachete, etc.).
 *
 * Rute dedicate (nu sub :id) ca să nu se ciocnească de GET /admin/sites/:id.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/rollout')
export class AdminSiteRolloutController {
  constructor(
    private readonly rollout: SiteRolloutService,
    private readonly domains: DomainCheckService,
  ) {}

  @Get()
  overview() {
    return this.rollout.overview();
  }

  /** „Ce e făcut pe domeniul X?" — DNS, certificat, site, configurare.
   *  Declarat înaintea lui `:siteId`, altfel ruta parametrizată îl înghite. */
  @Get('domain-check')
  domainCheck(@Query('domain') domain: string) {
    try {
      return this.domains.check(domain);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  @Get(':siteId')
  forSite(@Param('siteId') siteId: string) {
    return this.rollout.forSite(siteId);
  }

  @Post('apply-all')
  applyAll(@Body() body: { checkIds?: string[] }) {
    return this.rollout.applyAll(body?.checkIds);
  }

  @Post(':siteId/apply')
  apply(@Param('siteId') siteId: string, @Body() body: { checkIds?: string[] }) {
    return this.rollout.apply(siteId, body?.checkIds);
  }
}
