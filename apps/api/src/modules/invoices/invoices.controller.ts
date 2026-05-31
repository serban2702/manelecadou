import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { createReadStream } from 'node:fs';
import { JwtAuthGuard } from '../../common/jwt.guard';
import { AdminGuard } from '../../common/admin.guard';
import { CurrentSiteId } from '../../common/decorators';
import { EmitOverrides, InvoicesService } from './invoices.service';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/invoices')
export class InvoicesController {
  constructor(private readonly svc: InvoicesService) {}

  /** Plăți facturabile (paid, > 0, nefacturate). */
  @Get('billable')
  billable(@CurrentSiteId() siteId: string | null) {
    return this.svc.listBillable(siteId);
  }

  /** Facturi emise / eșuate. */
  @Get()
  list(@CurrentSiteId() siteId: string | null) {
    return this.svc.listIssued(siteId);
  }

  /** Datele de preview (editabile) înainte de emitere. */
  @Get('preview/:paymentId')
  preview(@Param('paymentId') paymentId: string) {
    return this.svc.buildPreview(paymentId);
  }

  /** Testează credențialele SmartBill ale unui site (siteId explicit din path,
   *  ca să nu depindă de header-ul x-site-id al selectorului global). */
  @Get('test-connection/:siteId')
  test(@Param('siteId') siteId: string) {
    return this.svc.testConnection(siteId);
  }

  /** Emite o singură factură (cu override-uri din preview). */
  @Post('emit')
  emit(@Body() body: { paymentId: string; overrides?: EmitOverrides }) {
    return this.svc.emit(body.paymentId, body.overrides ?? {});
  }

  /** Emite mai multe facturi (cu override-uri opționale per plată). */
  @Post('emit-bulk')
  emitBulk(
    @Body()
    body: {
      paymentIds: string[];
      overridesByPayment?: Record<string, EmitOverrides>;
    },
  ) {
    return this.svc.emitBulk(body.paymentIds ?? [], body.overridesByPayment ?? {});
  }

  /** Descarcă PDF-ul facturii. */
  @Get(':id/pdf')
  async pdf(@Param('id') id: string, @Res() res: Response) {
    const { path, filename } = await this.svc.getPdfFile(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    createReadStream(path).pipe(res);
  }
}
