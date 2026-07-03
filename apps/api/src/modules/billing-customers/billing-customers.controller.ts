import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/jwt.guard';
import { AdminGuard } from '../../common/admin.guard';
import { CurrentSiteId } from '../../common/decorators';
import {
  BillingCustomersService,
  BillingCustomerPatch,
} from './billing-customers.service';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/billing-customers')
export class BillingCustomersController {
  constructor(private readonly svc: BillingCustomersService) {}

  /** Lista paginată de clienți (agregat din plăți + override-uri salvate). */
  @Get()
  list(
    @CurrentSiteId() siteId: string | null,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('search') search?: string,
  ) {
    return this.svc.listCustomers(siteId, {
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
      search: search ?? null,
    });
  }

  /**
   * Upsert profil client (autosave inline). `siteId` vine explicit din rând
   * (în vederea „toate site-urile" fiecare rând știe cărui site aparține);
   * fallback pe site-ul selectat în header.
   */
  @Put()
  upsert(
    @CurrentSiteId() currentSiteId: string | null,
    @Body()
    body: { siteId?: string | null; email: string } & BillingCustomerPatch,
  ) {
    const { siteId, email, ...patch } = body;
    return this.svc.upsert(siteId ?? currentSiteId, email, patch);
  }

  /** Șterge override-ul (rândul revine la datele derivate din plăți). */
  @Delete(':id')
  reset(@Param('id') id: string) {
    return this.svc.reset(id);
  }
}
