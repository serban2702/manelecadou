import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { IsBoolean, IsEmail, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

import { AdminGuard } from '../../common/admin.guard';
import { CurrentSiteId } from '../../common/decorators';
import { MailService, MailAccountInput } from './mail.service';
import { ImapService } from './imap.service';
import { MailSendService } from './mail-send.service';
import { MailSyncService, IMAP_SYNC_QUEUE } from './mail-sync.service';
import { KbService } from '../kb/kb.service';
import { TranslationService } from '../../openai/translation.service';

class AccountDto implements MailAccountInput {
  // Obligatoriu: fiecare cont IMAP trebuie să aparțină unui site (centralizare cross-tenant
  // în „Toate site-urile" + KB/auto-reply scoped corect pe tenant).
  @IsString() siteId!: string;
  @IsString() @MaxLength(120) label!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(200) fromName?: string;

  @IsString() @MaxLength(200) imapHost!: string;
  @IsInt() @Min(1) @Max(65535) imapPort!: number;
  @IsBoolean() imapSecure!: boolean;
  @IsString() imapUser!: string;
  @IsOptional() @IsString() imapPass?: string;

  @IsString() @MaxLength(200) smtpHost!: string;
  @IsInt() @Min(1) @Max(65535) smtpPort!: number;
  @IsBoolean() smtpSecure!: boolean;
  @IsString() smtpUser!: string;
  @IsOptional() @IsString() smtpPass?: string;

  @IsOptional() @IsString() signatureHtml?: string;
  @IsOptional() @IsBoolean() autoReplyEnabled?: boolean;
  @IsOptional() @IsNumber() @Min(0) @Max(1) autoReplyThreshold?: number;
  @IsOptional() @IsBoolean() syncEnabled?: boolean;
}

class AccountPatchDto {
  @IsOptional() @IsString() siteId?: string;
  @IsOptional() @IsString() @MaxLength(120) label?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() fromName?: string;
  @IsOptional() @IsString() @MaxLength(200) imapHost?: string;
  @IsOptional() @IsInt() @Min(1) @Max(65535) imapPort?: number;
  @IsOptional() @IsBoolean() imapSecure?: boolean;
  @IsOptional() @IsString() imapUser?: string;
  @IsOptional() @IsString() imapPass?: string;
  @IsOptional() @IsString() @MaxLength(200) smtpHost?: string;
  @IsOptional() @IsInt() @Min(1) @Max(65535) smtpPort?: number;
  @IsOptional() @IsBoolean() smtpSecure?: boolean;
  @IsOptional() @IsString() smtpUser?: string;
  @IsOptional() @IsString() smtpPass?: string;
  @IsOptional() @IsString() signatureHtml?: string;
  @IsOptional() @IsBoolean() autoReplyEnabled?: boolean;
  @IsOptional() @IsNumber() @Min(0) @Max(1) autoReplyThreshold?: number;
  @IsOptional() @IsBoolean() syncEnabled?: boolean;
}

class ReplyDto {
  @IsString() @MinLength(1) html!: string;
  @IsOptional() to?: string[];
  @IsOptional() cc?: string[];
  @IsOptional() @IsString() subject?: string;
  /**
   * Forțează limba țintă a traducerii. Dacă lipsește, sistemul folosește
   * `detectedLang` al mesajului original. 'ro' = nicio traducere (livrăm așa cum a scris adminul).
   */
  @IsOptional() @IsString() targetLang?: string;
  /** Skip explicit pe traducere chiar dacă originalul e în altă limbă. */
  @IsOptional() skipTranslation?: boolean;
}

class TranslateOutDto {
  @IsString() @MinLength(1) text!: string;
  @IsString() @MinLength(2) targetLang!: string;
}

class FlagsDto {
  @IsOptional() @IsBoolean() seen?: boolean;
  @IsOptional() @IsBoolean() flagged?: boolean;
}

@UseGuards(AdminGuard)
@Controller('admin/mail')
export class MailController {
  constructor(
    private readonly mail: MailService,
    private readonly imap: ImapService,
    private readonly send: MailSendService,
    private readonly sync: MailSyncService,
    private readonly kb: KbService,
    private readonly translation: TranslationService,
    @InjectQueue(IMAP_SYNC_QUEUE) private readonly syncQueue: Queue,
  ) {}

  // ======= ACCOUNTS =======
  @Get('accounts')
  listAccounts(@CurrentSiteId() siteId: string | null) {
    return this.mail.listAccounts(siteId);
  }

  @Post('accounts')
  async createAccount(@Body() dto: AccountDto) {
    if (!dto.imapPass || !dto.smtpPass) {
      throw new BadRequestException('IMAP pass și SMTP pass sunt obligatorii');
    }
    if (!dto.siteId) {
      throw new BadRequestException('Selectează un site pentru contul de email');
    }
    // siteId vine din body (form-ul cere explicit), NU din header — adminul poate
    // crea conturi pentru orice site din modul „Toate".
    const acc = await this.mail.createAccount({ ...dto, siteId: dto.siteId });
    return this.mail.toSafe(acc);
  }

  @Patch('accounts/:id')
  async patchAccount(@Param('id') id: string, @Body() dto: AccountPatchDto) {
    const acc = await this.mail.updateAccount(id, dto);
    return this.mail.toSafe(acc);
  }

  @Delete('accounts/:id')
  async removeAccount(@Param('id') id: string) {
    await this.mail.deleteAccount(id);
    return { ok: true };
  }

  @Post('accounts/test')
  async testCredentials(@Body() dto: AccountDto) {
    if (!dto.imapPass || !dto.smtpPass) throw new BadRequestException('Pass-uri lipsă');
    // Build a transient MailAccount-like object without persisting.
    const acc: any = {
      id: 'transient',
      imapHost: dto.imapHost, imapPort: dto.imapPort, imapSecure: dto.imapSecure, imapUser: dto.imapUser,
      imapPassEnc: encryptOnce(dto.imapPass),
      smtpHost: dto.smtpHost, smtpPort: dto.smtpPort, smtpSecure: dto.smtpSecure, smtpUser: dto.smtpUser,
      smtpPassEnc: encryptOnce(dto.smtpPass),
      email: dto.email, fromName: dto.fromName ?? null,
    };
    return this.imap.testConnection(acc);
  }

  @Post('accounts/:id/test')
  async testStored(@Param('id') id: string) {
    const acc = await this.mail.getAccount(id);
    return this.imap.testConnection(acc);
  }

  @Post('accounts/:id/sync')
  async triggerSync(@Param('id') id: string) {
    await this.mail.getAccount(id);
    await this.syncQueue.add('sync-account', { accountId: id }, { removeOnComplete: 50, removeOnFail: 25 });
    return { ok: true };
  }

  @Get('accounts/:id/folders')
  async folders(@Param('id') id: string) {
    await this.mail.getAccount(id);
    return this.mail.folders.find({ where: { accountId: id }, order: { role: 'ASC', name: 'ASC' } });
  }

  // ======= MESSAGES / THREADS =======
  @Get('messages')
  async messages(
    @CurrentSiteId() siteId: string | null,
    @Query('accountId') accountId?: string,
    @Query('folderId') folderId?: string,
    @Query('q') q?: string,
    @Query('limit') limit = '50',
    @Query('archived') archived?: string,
  ) {
    const qb = this.mail.messages.createQueryBuilder('m').orderBy('COALESCE(m.sentAt, m.receivedAt, m.createdAt)', 'DESC').limit(Math.min(200, parseInt(String(limit)) || 50));
    // Default: ascunde arhivate. ?archived=true → doar arhivate. ?archived=all → tot.
    if (archived === 'true') qb.andWhere('m.archived = true');
    else if (archived !== 'all') qb.andWhere('m.archived = false');
    if (accountId) qb.andWhere('m.accountId = :accountId', { accountId });
    if (folderId) qb.andWhere('m.folderId = :folderId', { folderId });
    if (q) qb.andWhere('(m.subject ILIKE :q OR m.snippet ILIKE :q OR m.fromAddr ILIKE :q)', { q: `%${q}%` });
    if (siteId) qb.andWhere('m."siteId" = :siteId', { siteId });
    return qb.getMany();
  }

  @Get('threads/:threadId')
  async thread(@Param('threadId') threadId: string) {
    return this.mail.messages.find({
      where: [{ threadId }, { messageId: threadId }],
      order: { sentAt: 'ASC' },
    });
  }

  @Get('messages/:id')
  async getMessage(@Param('id') id: string) {
    const msg = await this.mail.messages.findOne({ where: { id } });
    if (!msg) throw new NotFoundException();
    const atts = await this.mail.attachments.find({ where: { messageId: id } });
    const suggestion = msg.direction === 'in'
      ? await this.kb.suggestions.findOne({ where: { messageId: id }, order: { createdAt: 'DESC' } })
      : null;
    return { message: msg, attachments: atts, suggestion };
  }

  @Patch('messages/:id')
  async patchMessage(@Param('id') id: string, @Body() dto: FlagsDto) {
    const msg = await this.mail.messages.findOne({ where: { id } });
    if (!msg) throw new NotFoundException();
    if (dto.seen !== undefined) msg.seen = dto.seen;
    if (dto.flagged !== undefined) msg.flagged = dto.flagged;
    return this.mail.messages.save(msg);
  }

  @Post('messages/:id/reply')
  async reply(@Param('id') id: string, @Body() dto: ReplyDto) {
    let htmlBody = dto.html;
    let translationMeta: { sent: string; original: string; consensus: number; targetLang: string } | null = null;

    if (!dto.skipTranslation) {
      // Determină limba țintă: explicit din DTO sau auto din mesajul original.
      const original = await this.mail.messages.findOne({ where: { id } });
      const target = (dto.targetLang ?? original?.detectedLang ?? 'ro').toLowerCase();
      if (target && target !== 'ro') {
        const result = await this.translation.translateFromRo(htmlBody, target);
        if (result) {
          translationMeta = { sent: result.final, original: htmlBody, consensus: result.consensus, targetLang: target };
          htmlBody = result.final;
        }
      }
    }

    const sent = await this.send.sendReply({
      inReplyToId: id,
      htmlBody,
      to: dto.to,
      cc: dto.cc,
      subject: dto.subject,
    });
    return { ...sent, translation: translationMeta };
  }

  /**
   * Traducere outbound on-demand (fără trimitere) — folosit de panoul AI Assistant
   * ca să arate adminului cum va arăta mesajul în limba țintă înainte să apese „Trimite".
   */
  @Post('translate-out')
  async translateOut(@Body() dto: TranslateOutDto) {
    const r = await this.translation.translateFromRo(dto.text, dto.targetLang);
    if (!r) return { translation: dto.text, consensus: 1, candidates: [dto.text, dto.text], divergences: [], targetLang: dto.targetLang };
    return {
      translation: r.final,
      consensus: r.consensus,
      candidates: r.candidates,
      divergences: r.divergences,
      targetLang: r.targetLang,
    };
  }

  /** Re-rulează traducerea inbound peste un mesaj existent (manual). */
  @Post('messages/:id/translate')
  async retranslate(@Param('id') id: string) {
    const msg = await this.mail.messages.findOne({ where: { id } });
    if (!msg) throw new NotFoundException();
    const source = (msg.bodyText ?? msg.snippet ?? '').trim();
    if (!source) return { ok: false, reason: 'empty' };
    const r = await this.translation.translateToRo(source);
    msg.detectedLang = r?.sourceLang ?? 'ro';
    msg.bodyTextRo = r?.final ?? null;
    msg.translationConsensus = r?.consensus ?? null;
    await this.mail.messages.save(msg);
    return { ok: true, detectedLang: msg.detectedLang, bodyTextRo: msg.bodyTextRo, consensus: msg.translationConsensus };
  }

  @Post('messages/:id/archive')
  archive(@Param('id') id: string) {
    return this.mail.archiveMessage(id);
  }

  @Post('messages/:id/unarchive')
  unarchive(@Param('id') id: string) {
    return this.mail.unarchiveMessage(id);
  }

  @Delete('messages/:id')
  async deleteMessage(@Param('id') id: string) {
    await this.mail.deleteMessage(id);
    return { ok: true };
  }

  // ======= AI SUGGESTIONS =======
  @Post('suggestions/:id/send')
  async sendSuggestion(@Param('id') id: string) {
    const sugg = await this.kb.suggestions.findOne({ where: { id } });
    if (!sugg) throw new NotFoundException();
    if (sugg.status === 'sent' || sugg.status === 'auto_sent') return sugg;
    const out = await this.send.sendReply({
      inReplyToId: sugg.messageId,
      htmlBody: sugg.htmlReply,
      aiGenerated: true,
    });
    sugg.status = 'sent';
    sugg.sentAt = new Date();
    await this.kb.suggestions.save(sugg);
    return { suggestion: sugg, sentMessageId: out.id };
  }

  @Post('suggestions/:id/dismiss')
  async dismissSuggestion(@Param('id') id: string) {
    const sugg = await this.kb.suggestions.findOne({ where: { id } });
    if (!sugg) throw new NotFoundException();
    sugg.status = 'dismissed';
    return this.kb.suggestions.save(sugg);
  }

  // ======= ATTACHMENTS =======
  /**
   * Servește atașamente. Securitate:
   *  - mime + contentDisposition vin din mailul original (control atacator).
   *  - Forțăm `attachment` (niciodată inline) ca browser-ul să descarce, nu să randeze.
   *  - Tipurile periculoase (html/svg/xml/js) sunt servite ca octet-stream.
   *  - `X-Content-Type-Options: nosniff` previne MIME-sniffing.
   *  - CSP minim ca să blocheze execuția de script chiar dacă cineva forțează render.
   */
  @Get('attachments/:id')
  async downloadAttachment(@Param('id') id: string, @Res() res: Response) {
    const a = await this.mail.attachments.findOne({ where: { id } });
    if (!a) throw new NotFoundException();
    try {
      await stat(a.storagePath);
    } catch {
      throw new NotFoundException('Fișier lipsă pe disc');
    }
    const safeMime = sanitizeMimeForDownload(a.mime);
    res.setHeader('Content-Type', safeMime);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(a.filename)}"`,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, no-store');
    createReadStream(a.storagePath).pipe(res);
  }

  // ======= SIDEBAR BADGE =======
  @Get('unread-total')
  async unreadTotal(@CurrentSiteId() siteId: string | null) {
    const qb = this.mail.messages
      .createQueryBuilder('m')
      .where('m.direction = :d', { d: 'in' })
      .andWhere('m.seen = false');
    if (siteId) qb.andWhere('m."siteId" = :siteId', { siteId });
    const r = await qb.getCount();
    return { unread: r };
  }
}

// helper local pentru testCredentials — folosește același util.
import { encryptSecret } from '../../common/crypto.util';
function encryptOnce(plain: string): string { return encryptSecret(plain); }

/**
 * Convertește MIME-ul atașamentului într-o variantă sigură de download.
 * Tipurile periculoase (HTML, SVG, scripturi) sunt forțate la `application/octet-stream`
 * ca browser-ul să descarce binar, nu să randeze conținutul.
 */
function sanitizeMimeForDownload(mime: string): string {
  const m = (mime || '').toLowerCase().trim();
  const dangerous = [
    'text/html',
    'application/xhtml+xml',
    'image/svg+xml',
    'text/xml',
    'application/xml',
    'application/javascript',
    'text/javascript',
    'application/x-javascript',
    'application/x-shockwave-flash',
    'application/x-msdownload',
  ];
  if (dangerous.includes(m)) return 'application/octet-stream';
  // Allow bare basic types; everything else default to octet-stream pentru siguranță.
  if (!m || m === 'application/octet-stream') return 'application/octet-stream';
  if (/^(image|audio|video)\/(?!svg)[a-z0-9.+-]+$/.test(m)) return m;
  if (/^application\/(pdf|zip|x-zip-compressed|json|msword|vnd\.openxmlformats|vnd\.ms-)/.test(m)) return m;
  if (/^text\/(plain|csv)$/.test(m)) return m;
  return 'application/octet-stream';
}
