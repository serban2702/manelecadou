import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../modules/users/user.entity';
import { GuestSession } from '../../modules/guest-sessions/guest-session.entity';
import { Generation } from '../../modules/generations/generation.entity';
import { Conversation } from '../../modules/chat/conversation.entity';
import { ChatMessage } from '../../modules/chat/message.entity';
import { Site } from '../../modules/sites/site.entity';
import { AppSetting } from '../../modules/settings/app-setting.entity';
import { ALL_KEYS, findDef } from '../../modules/settings/settings-schema';
import { SettingsService } from '../../modules/settings/settings.service';
import { encryptSecret } from '../../common/crypto.util';

@Injectable()
export class SeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger('SeederService');

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(GuestSession) private readonly guests: Repository<GuestSession>,
    @InjectRepository(Generation) private readonly generations: Repository<Generation>,
    @InjectRepository(Conversation) private readonly conversations: Repository<Conversation>,
    @InjectRepository(ChatMessage) private readonly messages: Repository<ChatMessage>,
    @InjectRepository(Site) private readonly sites: Repository<Site>,
    @InjectRepository(AppSetting) private readonly settings: Repository<AppSetting>,
    private readonly settingsService: SettingsService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.get<string>('SEEDER_DISABLE') === 'true') return;

    // 1. Settings sync din env → DB (rulează MEREU, în prod și dev).
    //    Idempotent: NU suprascrie valori existente, doar populează cele lipsă.
    //    Asta permite ca pe un fresh deploy, .env-ul să bootstrap-eze DB-ul,
    //    apoi adminul să modifice oricând prin UI fără să mai atingă fișiere.
    await this.seedSettingsFromEnv();

    // 2. Demo data — doar în non-prod (test users, generations, conversații).
    if (this.config.get<string>('NODE_ENV') === 'production') return;
    const demoExists = await this.users.findOne({ where: { email: 'demo@manelecadou.ro' } });
    if (demoExists) {
      this.logger.log('Skip demo seeder — demo user există deja.');
      return;
    }
    this.logger.log('Pornesc demo seeder-ul (demo user lipsește)...');
    await this.run();
  }

  /**
   * Sincronizează setările din .env în DB. Pentru fiecare cheie definită în
   * `settings-schema.SETTINGS_SCHEMA`:
   *  - dacă există rând în DB → skip (DB rămâne sursă de adevăr)
   *  - dacă env-ul are valoare non-empty → insert (criptat dacă def.encrypted)
   *  - dacă env-ul e gol → skip (cheia rămâne nesetată; UI-ul o va afișa „unset")
   *
   * Rezultatul: după primul boot pe un deploy nou, toate cheile non-empty
   * din .env sunt în DB. După aceea, `.env` poate fi curățat — DB-ul rămâne
   * source-of-truth, modificările se fac prin admin `/settings` UI.
   */
  async seedSettingsFromEnv(): Promise<{ inserted: number; skipped: number }> {
    const stats = { inserted: 0, skipped: 0 };
    const existing = await this.settings.find();
    const existingKeys = new Set(existing.map((r) => r.key));

    for (const key of ALL_KEYS) {
      if (existingKeys.has(key)) {
        stats.skipped++;
        continue;
      }
      const envValue = (this.config.get<string>(key) ?? '').toString();
      if (!envValue) {
        stats.skipped++;
        continue;
      }
      const def = findDef(key);
      if (!def) {
        stats.skipped++;
        continue;
      }
      const valueToStore = def.encrypted ? encryptSecret(envValue) : envValue;
      try {
        await this.settings.save(this.settings.create({
          key,
          value: valueToStore,
          encrypted: !!def.encrypted,
        }));
        stats.inserted++;
        this.logger.log(`Settings sync: ${key} ← .env (${def.encrypted ? 'encrypted' : 'plain'})`);
      } catch (err) {
        this.logger.warn(`Failed to seed ${key}: ${(err as Error).message}`);
      }
    }
    if (stats.inserted > 0) {
      this.logger.log(`Settings sync done: +${stats.inserted} new, ${stats.skipped} skipped.`);
      // Invalidăm cache-ul + re-warmup ca primul request să citească valorile noi.
      this.settingsService.invalidate();
      await this.settingsService.warmup();
    }
    return stats;
  }

  async run(): Promise<{ users: number; generations: number; conversations: number }> {
    const stats = { users: 0, generations: 0, conversations: 0 };

    // 0) Default site — luat sau bootstrap (creat oricum în SitesService.onModuleInit)
    let defaultSite = await this.sites.findOne({ where: { isDefault: true } });
    if (!defaultSite) defaultSite = await this.sites.findOne({ where: {} });
    const defaultSiteId = defaultSite?.id ?? null;

    // 0.1) Backfill siteId pe orice tabel cu rânduri existente fără siteId
    if (defaultSiteId) {
      await this.users.createQueryBuilder().update().set({ siteId: defaultSiteId }).where('siteId IS NULL').execute();
      await this.generations.createQueryBuilder().update().set({ siteId: defaultSiteId }).where('siteId IS NULL').execute();
      await this.conversations.createQueryBuilder().update().set({ siteId: defaultSiteId }).where('siteId IS NULL').execute();
      await this.messages.createQueryBuilder().update().set({ siteId: defaultSiteId }).where('siteId IS NULL').execute();
      await this.guests.createQueryBuilder().update().set({ siteId: defaultSiteId }).where('siteId IS NULL').execute();
    }

    // 1) Admin user
    const adminEmails = (this.config.get<string>('ADMIN_EMAILS') ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const primaryAdmin = adminEmails[0] ?? 'admin@manelecadou.ro';
    let admin = await this.users.findOne({ where: { email: primaryAdmin } });
    if (!admin) {
      admin = await this.users.save(
        this.users.create({
          email: primaryAdmin,
          name: 'Admin',
          role: 'admin',
          freeDemoUsed: false,
          siteId: defaultSiteId,
        }),
      );
      stats.users++;
    } else if (admin.role !== 'admin') {
      admin.role = 'admin';
      await this.users.save(admin);
    }

    // 2) Demo user
    const demoEmail = 'demo@manelecadou.ro';
    let demoUser = await this.users.findOne({ where: { email: demoEmail } });
    if (!demoUser) {
      demoUser = await this.users.save(
        this.users.create({ email: demoEmail, name: 'Demo User', role: 'user' }),
      );
      stats.users++;
    }

    // 3) Conversație de test cu mesaj inițial
    const existingConv = await this.conversations.findOne({ where: { userId: demoUser.id } });
    if (!existingConv) {
      const conv = await this.conversations.save(
        this.conversations.create({
          userId: demoUser.id,
          email: demoUser.email,
          subject: 'Conversație demo',
          unreadByAdmin: 1,
          unreadByUser: 0,
          status: 'open',
          lastMessageAt: new Date(),
        }),
      );
      await this.messages.save(
        this.messages.create({
          conversationId: conv.id,
          authorRole: 'user',
          authorId: demoUser.id,
          body: 'Salut! Sunt mesaj de test pentru chat. Răspunde-mi când ai timp 🎤',
        }),
      );
      stats.conversations++;
    }

    this.logger.log(
      `Seeder done: ${stats.users} users, ${stats.generations} generations, ${stats.conversations} conversations`,
    );
    return stats;
  }
}
