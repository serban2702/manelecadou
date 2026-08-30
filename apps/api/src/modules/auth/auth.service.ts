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
import { isAdminHost } from './admin-host';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { GuestSession } from '../guest-sessions/guest-session.entity';
import { Generation } from '../generations/generation.entity';
import { MailerService } from '../../mailer/mailer.module';
import { magicLinkTemplate, adminGdprRequestTemplate } from '../../mailer/templates/templates';
import { brandingFromSite } from '../../mailer/branding';
import { SitesService } from '../sites/sites.service';
import { isWithinAbsoluteWindow, sessionAnchor } from './session-window';

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

    // Link-ul duce mereu în admin: cererile de pe host-uri publice sunt respinse
    // în controller (`isAdminHost`). `site` rămâne necesar pentru branding-ul
    // emailului și pentru expeditor.
    const site = siteId ? await this.sites.findById(siteId) : null;
    const baseUrl = this.computeLoginBaseUrl(requestHost);
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
    await this.mailer.send(
      {
        to: normalizedEmail,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        from: site?.fromEmail ?? undefined,
      },
      { site, kind: 'magic_link', userId: existingUser?.id ?? null },
    );

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

          // Merge conversațiile chat guest → user. Dacă userul are deja o conv pe
          // același site, mutăm mesajele guest acolo + ștergem conv guest goală.
          // Altfel, doar promovăm conv guest la userId.
          try {
            const guestConvs = await mgr
              .getRepository('conversations')
              .createQueryBuilder('c')
              .where('c."guestId" = :gid', { gid: guest.id })
              .getRawMany<{ c_id: string; c_siteId: string | null; c_unreadByAdmin: number; c_unreadByUser: number; c_lastMessageAt: Date | null }>();

            for (const row of guestConvs) {
              const existingUserConv = await mgr
                .getRepository('conversations')
                .createQueryBuilder('c')
                .where('c."userId" = :uid', { uid: user.id })
                .andWhere(row.c_siteId ? 'c."siteId" = :sid' : 'c."siteId" IS NULL', { sid: row.c_siteId })
                .getRawOne<{ c_id: string }>();

              if (existingUserConv) {
                // Mută toate mesajele din conv guest în conv user existentă
                await mgr
                  .createQueryBuilder()
                  .update('chat_messages')
                  .set({ conversationId: existingUserConv.c_id })
                  .where('"conversationId" = :gcid', { gcid: row.c_id })
                  .execute();
                // Update tool calls audit
                await mgr
                  .createQueryBuilder()
                  .update('ai_tool_calls')
                  .set({ conversationId: existingUserConv.c_id })
                  .where('"conversationId" = :gcid', { gcid: row.c_id })
                  .execute()
                  .catch(() => {});
                // Bump unread counter + lastMessageAt pe conv țintă
                await mgr.getRepository('conversations').update(
                  { id: existingUserConv.c_id },
                  {
                    unreadByAdmin: () => `COALESCE("unreadByAdmin", 0) + ${row.c_unreadByAdmin ?? 0}` as unknown as number,
                    unreadByUser: () => `COALESCE("unreadByUser", 0) + ${row.c_unreadByUser ?? 0}` as unknown as number,
                    lastMessageAt: row.c_lastMessageAt ?? undefined,
                  },
                );
                // Șterge conv guest goală
                await mgr.getRepository('conversations').delete({ id: row.c_id });
              } else {
                // Promovează conv guest la userId
                await mgr.getRepository('conversations').update(
                  { id: row.c_id },
                  { userId: user.id, guestId: null, email: user.email },
                );
              }
            }
          } catch (err) {
            this.logger.warn(`chat merge guest→user failed: ${(err as Error).message}`);
            // Non-fatal — userul oricum se autentifică cu succes
          }

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
        // Momentul autentificării REALE (magic link). Se transportă neschimbat
        // prin toate reînnoirile, ca sesiunea să aibă și o limită absolută —
        // altfel un token furat s-ar putea prelungi la nesfârșit.
        authAt: Math.floor(Date.now() / 1000),
      });
      return { accessToken, userId: user.id };
    });
  }


  /**
   * Prelungește sesiunea („sliding session").
   *
   * Fără asta, tokenul de 7 zile te dă afară în mijlocul lucrului, oricât de
   * activ ai fi — pe producție s-a văzut un interval de exact 7 zile și 4 ore
   * între două autentificări, adică plafonul atins fix.
   *
   * Trei condiții, toate necesare:
   *   1. tokenul curent e încă valid (expirat = te reautentifici, nu există
   *      refresh token separat);
   *   2. autentificarea reală nu e mai veche de ABSOLUTE_SESSION_DAYS;
   *   3. userul încă există, iar rolul se ia din baza de date, NU din token.
   *
   * A treia condiție e și singura formă de revocare pe care o avem: scos din
   * ADMIN_EMAILS și degradat în DB, omul pierde adminul la prima reînnoire, nu
   * după ce expiră tokenul.
   */
  async refreshSession(rawToken: string | null): Promise<{ accessToken: string; expiresAt: string }> {
    if (!rawToken) throw new UnauthorizedException('Missing token');
    let payload: { sub: string; authAt?: number; iat?: number };
    try {
      payload = this.jwt.verify(rawToken);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    const authAt = sessionAnchor(payload);
    if (!isWithinAbsoluteWindow(authAt, Math.floor(Date.now() / 1000))) {
      throw new UnauthorizedException('Session too old, sign in again');
    }

    // `sub` vine din token, deci e input pe care nu-l controlăm noi: un token de
    // serviciu (sau fabricat) cu un `sub` care nu e UUID face Postgres să arunce,
    // iar clientul primea 500 — adică nici nu reînnoia, nici nu-l trimitea la
    // login, fiindcă doar 401 declanșează reautentificarea.
    let user: Awaited<ReturnType<UsersService['findById']>> = null;
    try {
      user = await this.users.findById(payload.sub);
    } catch {
      throw new UnauthorizedException('Invalid token subject');
    }
    if (!user) throw new UnauthorizedException('User not found');

    const accessToken = this.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      siteId: user.siteId,
      authAt,
    });
    const decoded = this.jwt.decode(accessToken) as { exp?: number } | null;
    return {
      accessToken,
      expiresAt: new Date((decoded?.exp ?? 0) * 1000).toISOString(),
    };
  }

  /** URL de bază pentru link-uri trimise prin email (fallback APP_URL pe localhost / dev). */
  private siteAppUrl(domain: string | undefined): string {
    const appUrl = this.config.get<string>('APP_URL');
    const isDev = (this.config.get<string>('NODE_ENV') ?? 'development') !== 'production';
    // 1. Localhost / IP locală — folosește APP_URL (e mereu setat în dev la http://localhost:1500)
    if (!domain || domain.startsWith('localhost') || domain.startsWith('127.') || domain.endsWith('.local')) {
      return appUrl ?? `http://${domain ?? 'localhost:1500'}`;
    }
    // 2. Domeniu fără TLD (ex. „manelecadou", „test") — în dev e bug de seed, folosește APP_URL
    if (!domain.includes('.') && isDev) {
      return appUrl ?? 'http://localhost:1500';
    }
    return `https://${domain}`;
  }

  /** Vezi `admin-host.ts` — regula e acolo, ca să fie testabilă fără Nest. */
  isAdminHost(requestHost: string | null): boolean {
    return isAdminHost(requestHost, this.config.get<string>('ADMIN_URL'));
  }

  /**
   * Base URL pentru magic link. Se apelează doar de pe host-uri de admin
   * (vezi `isAdminHost`), deci întoarce mereu un URL de admin: ADMIN_URL când
   * host-ul e chiar acela, altfel chiar host-ul cerut — `admin.<tenant>` e servit
   * tot de aplicația de admin, iar linkul trebuie să întoarcă omul unde a plecat.
   */
  private computeLoginBaseUrl(requestHost: string | null): string {
    const adminUrl = this.config.get<string>('ADMIN_URL');
    if (adminUrl && requestHost) {
      try {
        if (requestHost.toLowerCase() === new URL(adminUrl).host.toLowerCase()) {
          return adminUrl;
        }
      } catch {
        // ignore — cădem pe host-ul cerut
      }
      const proto = this.config.get<string>('NODE_ENV') === 'production' ? 'https' : 'http';
      return `${proto}://${requestHost}`;
    }
    return adminUrl ?? this.siteAppUrl(undefined);
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
      await this.mailer.send(
        {
          to: adminEmail,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
        },
        { site: userSite, kind: 'gdpr_admin_notify', userId: user.id, relatedId: user.id },
      );
    }
    this.logger.log(`GDPR ${type} request from ${user.email} → notified ${adminEmails.length} admins`);
    return { ok: true };
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
