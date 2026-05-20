import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomBytes, createHash } from 'crypto';

import { MagicLink } from './magic-link.entity';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { GuestSession } from '../guest-sessions/guest-session.entity';
import { Generation } from '../generations/generation.entity';
import { MailerService } from '../../mailer/mailer.module';
import { magicLinkTemplate, adminGdprRequestTemplate } from '../../mailer/templates/templates';
import { brandingFromSite } from '../../mailer/branding';
import { SitesService } from '../sites/sites.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');

  constructor(
    @InjectRepository(MagicLink) private readonly magic: Repository<MagicLink>,
    private readonly users: UsersService,
    private readonly mailer: MailerService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly sites: SitesService,
  ) {}

  async requestMagicLink(
    email: string,
    guestId: string | null,
    locale: string | undefined,
    siteId: string | null,
    requestHost: string | null = null,
  ) {
    const normalizedEmail = email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new BadRequestException('Invalid email');
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    const ttlMin = this.config.get<number>('MAGIC_LINK_TTL_MIN') ?? 15;
    const expiresAt = new Date(Date.now() + ttlMin * 60_000);

    await this.magic.save(
      this.magic.create({
        tokenHash,
        email: normalizedEmail,
        guestIdAtRequest: guestId,
        siteId,
        expiresAt,
      }),
    );

    // Construim link-ul către domeniul site-ului curent (nu APP_URL global) — magic
    // link-ul trebuie consumat pe același site pe care a fost emis.
    // Excepție: dacă request-ul vine de pe Host-ul admin (admin.<domain>),
    // link-ul trebuie să întoarcă userul în admin app, nu pe site-ul public.
    const site = siteId ? await this.sites.findById(siteId) : null;
    const baseUrl = this.computeLoginBaseUrl(site?.domain, requestHost);
    const link = `${baseUrl}/login/verify?token=${token}`;

    // DEV ONLY — log link-ul în consolă ca să poți testa local fără email real
    if (this.config.get<string>('NODE_ENV') !== 'production') {
      this.logger.log(`[DEV] magic link: ${link}`);
    }

    const existingUser = siteId
      ? await this.users.findByEmail(normalizedEmail, siteId)
      : null;
    const userLocale = locale || existingUser?.locale || site?.locale || 'ro';
    const tpl = magicLinkTemplate({
      loginUrl: link,
      ttlMinutes: ttlMin,
      locale: userLocale,
      branding: brandingFromSite(site),
    });
    await this.mailer.send({
      to: normalizedEmail,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      from: site?.fromEmail ?? undefined,
    });

    this.logger.log(`magic link issued for ${normalizedEmail} (site=${siteId ?? 'none'})`);

    return { ok: true };
  }

  async consumeMagicLink(
    token: string,
    currentSiteId: string | null,
  ): Promise<{ accessToken: string; userId: string }> {
    const tokenHash = hashToken(token);
    const record = await this.magic.findOne({ where: { tokenHash } });
    if (!record) throw new UnauthorizedException('Invalid token');
    if (record.consumedAt) throw new UnauthorizedException('Token already used');
    if (record.expiresAt.getTime() < Date.now())
      throw new UnauthorizedException('Token expired');

    // Anti-abuz: link-ul a fost emis pentru un site, trebuie consumat pe ACELAȘI site.
    // Ex: user RO cere link pe manelecadou.ro, încearcă să-l deschidă pe manelecadou.bg
    // → respingem cu eroare clară.
    if (record.siteId && currentSiteId && record.siteId !== currentSiteId) {
      throw new ForbiddenException(
        'Acest link a fost cerut pe alt site. Deschide-l de pe site-ul de unde ai cerut autentificarea.',
      );
    }

    return this.dataSource.transaction(async (mgr) => {
      record.consumedAt = new Date();
      await mgr.save(MagicLink, record);

      const userRepo = mgr.getRepository(User);
      const guestRepo = mgr.getRepository(GuestSession);

      // Userii sunt scoped pe (siteId, email) — același email pe RO și BG = useri diferiți.
      const linkSiteId = record.siteId ?? currentSiteId ?? null;
      let user = await userRepo.findOne({
        where: linkSiteId
          ? { email: record.email, siteId: linkSiteId }
          : { email: record.email },
      });
      if (!user) {
        user = userRepo.create({ email: record.email, siteId: linkSiteId });
        user = await userRepo.save(user);
      }

      const adminEmails = (this.config.get<string>('ADMIN_EMAILS') ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      const shouldBeAdmin = adminEmails.includes(user.email.toLowerCase());
      if (shouldBeAdmin && user.role !== 'admin') {
        user.role = 'admin';
        await userRepo.save(user);
      }

      if (record.guestIdAtRequest) {
        const guest = await guestRepo.findOne({ where: { id: record.guestIdAtRequest } });
        if (guest && !guest.userId) {
          guest.userId = user.id;
          await guestRepo.save(guest);

          await mgr
            .createQueryBuilder()
            .update(Generation)
            .set({ ownerUserId: user.id, ownerGuestId: null })
            .where('"ownerGuestId" = :gid', { gid: guest.id })
            .execute();

          if (guest.freeDemoUsed && !user.freeDemoUsed) {
            user.freeDemoUsed = true;
            await userRepo.save(user);
          }
        }
      }

      const accessToken = this.jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
        siteId: user.siteId,
      });
      return { accessToken, userId: user.id };
    });
  }

  /** URL de bază pentru link-uri trimise prin email (fallback APP_URL pe localhost). */
  private siteAppUrl(domain: string | undefined): string {
    if (!domain || domain.startsWith('localhost') || domain.startsWith('127.')) {
      return this.config.get<string>('APP_URL') ?? `http://${domain ?? 'localhost:1500'}`;
    }
    return `https://${domain}`;
  }

  /**
   * Decide base URL pentru magic link.
   * Dacă request-ul vine de pe admin host (ex. admin.manelecadou.ro) → ADMIN_URL.
   * Altfel → URL-ul site-ului curent (pentru site-uri multi-tenant).
   */
  private computeLoginBaseUrl(
    siteDomain: string | undefined,
    requestHost: string | null,
  ): string {
    const adminUrl = this.config.get<string>('ADMIN_URL');
    if (adminUrl && requestHost) {
      try {
        const adminHost = new URL(adminUrl).host.toLowerCase();
        const reqHost = requestHost.split(':')[0].toLowerCase();
        if (reqHost === adminHost) return adminUrl;
      } catch {
        // ignore — fallback la site URL
      }
    }
    return this.siteAppUrl(siteDomain);
  }

  async submitGdprRequest(
    userId: string,
    type: 'export' | 'delete',
    reason?: string,
  ): Promise<{ ok: true }> {
    const user = await this.users.findById(userId);
    if (!user) throw new Error('User not found');

    const adminEmails = (this.config.get<string>('ADMIN_EMAILS') ?? '')
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    if (adminEmails.length === 0) {
      this.logger.warn('GDPR request submitted but ADMIN_EMAILS is empty');
      return { ok: true };
    }

    const userSite = user.siteId ? await this.sites.findById(user.siteId) : null;
    const tpl = adminGdprRequestTemplate({
      userEmail: user.email,
      userId: user.id,
      type,
      reason,
      locale: 'ro',
      branding: brandingFromSite(userSite),
    });
    for (const adminEmail of adminEmails) {
      await this.mailer.send({
        to: adminEmail,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
      });
    }
    this.logger.log(`GDPR ${type} request from ${user.email} → notified ${adminEmails.length} admins`);
    return { ok: true };
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
