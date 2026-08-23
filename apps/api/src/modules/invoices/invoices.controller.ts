import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
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

  /** Pornește emiterea în bloc (async). Întoarce imediat { jobId, total } — nu așteaptă
   *  procesarea (poate dura minute), ca să nu cadă pe timeout-ul HTTP. */
  @Post('emit-bulk')
  emitBulk(
    @Body()
    body: {
      paymentIds: string[];
      overridesByPayment?: Record<string, EmitOverrides>;
    },
  ) {
    return this.svc.startBulkEmit(body.paymentIds ?? [], body.overridesByPayment ?? {});
  }

  /** Starea unui job de emitere în bloc (pentru polling: câte s-au emis / eșuat). */
  @Get('emit-bulk/:jobId')
  emitBulkStatus(@Param('jobId') jobId: string) {
    const job = this.svc.getBulkEmitJob(jobId);
    if (!job) throw new NotFoundException('Job negăsit sau expirat');
    return job;
  }

  /** Marchează o plată ca facturată FĂRĂ emitere reală pe SmartBill (reversibil). */
  @Post('mark-manual')
  markManual(@Body() body: { paymentId: string }) {
    return this.svc.markManual(body.paymentId);
  }

  /** Marchează mai multe plăți ca facturate manual (fără SmartBill). */
  @Post('mark-manual-bulk')
  markManualBulk(@Body() body: { paymentIds: string[] }) {
    return this.svc.markManualBulk(body.paymentIds ?? []);
  }

  /** Descarcă PDF-ul facturii. `getPdfFile` garantează fișierul pe disc (îl
   *  aduce din R2 dacă e nevoie), deci aici doar îl streamăm. */
  @Get(':id/pdf')
  async pdf(@Param('id') id: string, @Res() res: Response) {
    const { path, filename } = await this.svc.getPdfFile(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    const stream = createReadStream(path);
    // Header-ele sunt deja trimise — la eroare de citire închidem conexiunea,
    // ca să nu rămână un stream neprins (crash pe unhandled 'error').
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  /** Șterge mai multe facturi deodată (doar din aplicație, fără storno). */
  @Post('delete-bulk')
  deleteBulk(@Body() body: { ids: string[] }) {
    return this.svc.deleteMany(body?.ids ?? []);
  }

  /** Șterge o factură doar din aplicație (rând DB + PDF). Fără storno SmartBill. */
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.deleteOne(id);
  }
}
