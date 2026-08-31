import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { RecoveryState, RecoveryStageRecord } from './recovery-state.entity';
import { Payment } from '../payments/payment.entity';
import { Generation } from '../generations/generation.entity';
import { PromoCode } from '../promo/promo-code.entity';
import { PromoService } from '../promo/promo.service';
import { SitesService } from '../sites/sites.service';
import { SettingsService } from '../settings/settings.service';
import { MailerService } from '../../mailer/mailer.module';
import { brandingFromSite } from '../../mailer/branding';
import { recoveryEmailTemplate } from '../../mailer/templates/recovery';

/** Fereastra în care căutăm evenimente de abandon. */
const LOOKBACK_DAYS = 14;
/** Plafonul de emailuri trimise per rulare de cron (anti-burst).
 *  Observat la prima rulare pe prod (2026-06-10), pe vremea Mailgun: providerul
 *  a întors 420 „recipient limit exceeded" după ~29 de mesaje în burst. Pe
 *  PowerMail limita e `maxSendRate` al contului SES, dar motivul de a ține
 *  plafonul jos e același: recovery-ul să NU consume cota în detrimentul
 *  emailurilor tranzacționale (magic link, livrare melodie). Backlog-ul se
 *  drenează oricum — candidații cu eroare sunt reîncercați la fiecare tick de
 *  10 min. */
const MAX_SENDS_PER_RUN = 12;

/** Câte trimiteri eșuate tolerăm per etapă înainte să renunțăm definitiv.
 *  BUG observat 2026-08-23: fără plafon, o eroare PERMANENTĂ (host SMTP greșit
 *  pe chalgapodarok.bg) ținea etapa „scadentă" la nesfârșit — cron-ul de 10 min
 *  a reîncercat-o de 565 de ori în 5 zile și a emis un cod promo NOU la fiecare
 *  încercare (565 coduri orfane). Plafonul închide etapa; erorile tranzitorii
 *  (rețea, rate limit) tot au 5 șanse la interval de 10 min. */
const MAX_STAGE_ATTEMPTS = 5;

/** Lista default de emailuri interne excluse. Override prin setting
 *  `RECOVERY_EXCLUDE_EMAILS` (CSV; intrările care încep cu '@' = match pe sufix). */
const DEFAULT_EXCLUDE_EMAILS =
  '@manelecadou.ro,serban2702@gmail.com,robertsmara1@gmail.com,alexandru.tihon70@gmail.com';

interface RecoveryStageDef {
  /** Cheia din `stagesSent` (stabilă — nu o redenumi după lansare). */
  key: string;
  stage: 1 | 2 | 3 | 4 | 5 | 6;
  /** Scadența relativă la anchorAt. */
  afterMs: number;
  percent: number;
  /** Valabilitatea codului promo emis la această etapă. */
  validHours: number;
}

const HOUR = 3_600_000;

/** Programul escaladat: 1h/4h → 10%, 24h → 20%, 48h/72h/7z → 30%. */
const STAGES: RecoveryStageDef[] = [
  { key: 'h1', stage: 1, afterMs: 1 * HOUR, percent: 10, validHours: 48 },
  { key: 'h4', stage: 2, afterMs: 4 * HOUR, percent: 10, validHours: 48 },
  { key: 'h24', stage: 3, afterMs: 24 * HOUR, percent: 20, validHours: 48 },
  { key: 'h48', stage: 4, afterMs: 48 * HOUR, percent: 30, validHours: 48 },
  { key: 'h72', stage: 5, afterMs: 72 * HOUR, percent: 30, validHours: 48 },
  { key: 'd7', stage: 6, afterMs: 7 * 24 * HOUR, percent: 30, validHours: 72 },
];

/** O etapă e „închisă" doar dacă a fost trimisă, sărită sau abandonată după
 *  plafonul de încercări. Un rând cu doar `failedAttempts` rămâne scadent. */
function isStageSettled(rec?: RecoveryStageRecord): boolean {
  if (!rec) return false;
  return Boolean(rec.sentAt || rec.skippedAt || rec.gaveUpAt);
}

/** Eveniment de abandon extras din payments/generations (SQL raw). */
interface AbandonEvent {
  email: string;
  siteId: string | null;
  userId: string | null;
  guestId: string | null;
  createdAt: Date;
  paymentId?: string | null;
  generationId?: string | null;
}

@Injectable()
export class RecoveryService {
  private readonly logger = new Logger('RecoveryService');

  constructor(
    @InjectRepository(RecoveryState) private readonly states: Repository<RecoveryState>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Generation) private readonly generations: Repository<Generation>,
    @InjectRepository(PromoCode) private readonly promoCodes: Repository<PromoCode>,
    private readonly promo: PromoService,
    private readonly sites: SitesService,
    private readonly settings: SettingsService,
    private readonly mailer: MailerService,
  ) {}

  // ============ Candidați (upsert din payments + generations) ============

  /**
   * Scanează ultimele 14 zile după evenimente de abandon și upsertează
   * `recovery_states` per (siteId, email):
   * - rând nou → token de opt-out propriu, anchorAt = cel mai recent eveniment;
   * - rând existent ne-convertit + eveniment mai nou → mută anchorAt (etapele
   *   deja trimise rămân trimise, cele viitoare se recalculează);
   * - rând convertit + eveniment NOU după convertedAt → resetează ciclul.
   */
  async refreshCandidates(): Promise<{ scanned: number; upserted: number }> {
    const [failedPayments, pendingGenerations] = await Promise.all([
      this.failedPaymentEvents(),
      this.pendingGenerationEvents(),
    ]);
    const events = [...failedPayments, ...pendingGenerations];
    if (events.length === 0) return { scanned: 0, upserted: 0 };

    const exclude = await this.excludeEntries();

    // Grupare per identitate (siteId + email).
    const groups = new Map<string, AbandonEvent[]>();
    for (const ev of events) {
      const email = (ev.email ?? '').trim().toLowerCase();
      if (!email || !email.includes('@')) continue;
      if (this.isExcluded(email, exclude)) continue;
      const key = `${ev.siteId ?? ''}|${email}`;
      const list = groups.get(key);
      if (list) list.push({ ...ev, email });
      else groups.set(key, [{ ...ev, email }]);
    }
    if (groups.size === 0) return { scanned: events.length, upserted: 0 };

    const emails = Array.from(new Set(Array.from(groups.values()).map((g) => g[0].email)));
    const existing = await this.states.find({ where: { email: In(emails) } });
    const byKey = new Map(existing.map((s) => [`${s.siteId ?? ''}|${s.email}`, s]));

    const toSave: RecoveryState[] = [];
    for (const [key, group] of groups) {
      group.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const latest = group[group.length - 1];
      const anchorAt = new Date(latest.createdAt);
      const latestGen = [...group].reverse().find((e) => e.generationId);
      const latestPay = [...group].reverse().find((e) => e.paymentId);

      const current = byKey.get(key);
      if (!current) {
        toSave.push(
          this.states.create({
            siteId: latest.siteId,
            email: latest.email,
            userId: latest.userId ?? null,
            guestId: latest.guestId ?? null,
            generationId: latestGen?.generationId ?? null,
            paymentId: latestPay?.paymentId ?? null,
            anchorAt,
            stagesSent: {},
            optOutToken: randomBytes(24).toString('hex'),
            optedOutAt: null,
            optOutReason: null,
            convertedAt: null,
            lastError: null,
          }),
        );
        continue;
      }

      // Opt-out = permanent: nu mai reactivăm niciodată ciclul pentru emailul ăsta.
      if (current.optedOutAt) continue;
      if (anchorAt.getTime() <= new Date(current.anchorAt).getTime()) continue;

      if (current.convertedAt) {
        // Abandon NOU după conversie → ciclu nou de la zero.
        if (anchorAt.getTime() > new Date(current.convertedAt).getTime()) {
          current.anchorAt = anchorAt;
          current.stagesSent = {};
          current.convertedAt = null;
          current.lastError = null;
          this.applyRefs(current, latest, latestGen, latestPay);
          toSave.push(current);
        }
        continue;
      }

      // Ne-convertit, eveniment mai recent → mutăm doar anchor-ul (etapele
      // trimise rămân marcate; cele scadente se recalculează față de anchor nou).
      current.anchorAt = anchorAt;
      this.applyRefs(current, latest, latestGen, latestPay);
      toSave.push(current);
    }

    if (toSave.length > 0) await this.states.save(toSave);
    return { scanned: events.length, upserted: toSave.length };
  }

  private applyRefs(
    state: RecoveryState,
    latest: AbandonEvent,
    latestGen?: AbandonEvent,
    latestPay?: AbandonEvent,
  ): void {
    state.userId = latest.userId ?? state.userId;
    state.guestId = latest.guestId ?? state.guestId;
    if (latestGen?.generationId) state.generationId = latestGen.generationId;
    if (latestPay?.paymentId) state.paymentId = latestPay.paymentId;
  }

  /** Plăți failed cu sesiune Stripe expirată, cu email rezolvat din user/guest. */
  private async failedPaymentEvents(): Promise<AbandonEvent[]> {
    const rows: Array<{
      paymentId: string;
      siteId: string | null;
      userId: string | null;
      guestId: string | null;
      createdAt: Date;
      email: string;
    }> = await this.payments.query(
      `SELECT p.id AS "paymentId", p."siteId", p."userId", p."guestId", p."createdAt",
              LOWER(COALESCE(u.email, g.email)) AS email
         FROM payments p
         LEFT JOIN users u ON u.id = p."userId"
         LEFT JOIN guest_sessions g ON g.id = p."guestId"
        WHERE p.status = 'failed'
          AND p."failureCode" = 'session_expired'
          AND p."createdAt" >= NOW() - INTERVAL '${LOOKBACK_DAYS} days'
          AND COALESCE(u.email, g.email) IS NOT NULL`,
    );
    return rows.map((r) => ({ ...r, generationId: null }));
  }

  /** Generări 'full' rămase pending și neplătite, cu email rezolvat din owner. */
  private async pendingGenerationEvents(): Promise<AbandonEvent[]> {
    const rows: Array<{
      generationId: string;
      siteId: string | null;
      userId: string | null;
      guestId: string | null;
      createdAt: Date;
      email: string;
    }> = await this.generations.query(
      `SELECT gen.id AS "generationId", gen."siteId",
              gen."ownerUserId" AS "userId", gen."ownerGuestId" AS "guestId", gen."createdAt",
              LOWER(COALESCE(u.email, g.email)) AS email
         FROM generations gen
         LEFT JOIN users u ON u.id = gen."ownerUserId"
         LEFT JOIN guest_sessions g ON g.id = gen."ownerGuestId"
        WHERE gen.type = 'full'
          AND gen.status = 'pending'
          AND gen."paidUnlocked" = false
          AND gen."createdAt" >= NOW() - INTERVAL '${LOOKBACK_DAYS} days'
          AND COALESCE(u.email, g.email) IS NOT NULL`,
    );
    return rows.map((r) => ({ ...r, paymentId: null }));
  }

  // ============ Procesare etape scadente + trimitere ============

  /**
   * Trimite emailurile scadente. Per candidat: re-verifică conversia ÎNAINTE
   * de send, trimite DOAR cea mai avansată etapă scadentă (restul → skipped),
   * creează codul promo personal și persistă rezultatul. Max 40 sends/run.
   */
  async processDue(): Promise<{ candidates: number; sent: number; converted: number; errors: number }> {
    const now = Date.now();
    const candidates = await this.states.find({
      where: { optedOutAt: IsNull(), convertedAt: IsNull() },
      order: { anchorAt: 'ASC' },
    });

    let sent = 0;
    let converted = 0;
    let errors = 0;

    for (const state of candidates) {
      if (sent >= MAX_SENDS_PER_RUN) break;

      const anchorMs = new Date(state.anchorAt).getTime();
      const due = STAGES.filter(
        (s) => anchorMs + s.afterMs <= now && !isStageSettled(state.stagesSent?.[s.key]),
      );
      if (due.length === 0) continue;

      // Ținta se calculează ÎNAINTE de try ca s-o putem marca și pe ramura de
      // eroare (altfel etapa eșuată rămânea nemarcată → reîncercare infinită).
      const target = due[due.length - 1];
      let issuedPromoCode: string | null = null;

      try {
        // Stop condition: plată paid după abandon → converted, nu mai trimitem.
        const paidAt = await this.lastPaidAfter(state.email, new Date(state.anchorAt));
        if (paidAt) {
          state.convertedAt = paidAt;
          state.lastError = null;
          await this.states.save(state);
          converted++;
          continue;
        }

        // Doar cea mai avansată etapă scadentă; restul = skipped (fără spam).
        const nowIso = new Date().toISOString();
        const stagesSent = { ...(state.stagesSent ?? {}) };
        for (const skipped of due.slice(0, -1)) {
          stagesSent[skipped.key] = { skippedAt: nowIso };
        }

        const site = state.siteId ? await this.sites.findById(state.siteId) : null;
        const branding = brandingFromSite(site);
        const siteUrl = branding?.siteUrl || 'https://manelecadou.ro';
        const siteName = site?.name || 'Manele Cadou';

        // Ținta CTA: pagina manelei dacă avem generare, altfel studio.
        let recipientName: string | null = null;
        let genId: string | null = null;
        if (state.generationId) {
          const gen = await this.generations.findOne({ where: { id: state.generationId } });
          if (gen) {
            recipientName = gen.recipientName || null;
            genId = gen.id;
          }
        }

        // Cod promo personal: percent, 1 folosire, restricted pe email.
        // Reutilizăm codul emis la o încercare eșuată anterioară dacă e încă
        // valid — altfel fiecare retry lăsa în urmă un cod orfan.
        const promoCode = await this.resolveStagePromo(state, target, now);
        issuedPromoCode = promoCode.code;

        // CTA cu reducerea pre-aplicată: pe pagina manelei (`/m/<id>`) userul
        // reia plata cu codul aplicat automat, chiar fără sesiunea owner; `off`
        // e doar pentru afișarea „−X%" în pagină (sursa reducerii rămâne codul).
        const promoQs = `promo=${encodeURIComponent(promoCode.code)}&off=${target.percent}`;
        const ctaUrl = genId
          ? `${siteUrl}/m/${genId}?${promoQs}`
          : `${siteUrl}/studio?${promoQs}`;

        const unsubscribeUrl = `${siteUrl}/unsubscribe?token=${state.optOutToken}`;
        const out = recoveryEmailTemplate({
          stage: target.stage,
          percent: target.percent,
          code: promoCode.code,
          validHours: target.validHours,
          recipientName,
          ctaUrl,
          unsubscribeUrl,
          siteName,
          locale: site?.locale ?? 'ro',
          branding,
        });

        await this.mailer.send(
          { to: state.email, subject: out.subject, html: out.html, text: out.text },
          { site: site ?? undefined, kind: 'recovery', userId: state.userId, relatedId: state.id },
        );

        stagesSent[target.key] = { sentAt: nowIso, promoCode: promoCode.code };
        state.stagesSent = stagesSent;
        state.lastError = null;
        await this.states.save(state);
        sent++;
        this.logger.log(
          `recovery stage ${target.stage} (${target.key}) sent to=${state.email} code=${promoCode.code}`,
        );
      } catch (e) {
        errors++;
        const message = (e as Error).message ?? String(e);
        const prev: RecoveryStageRecord = state.stagesSent?.[target.key] ?? {};
        const attempts = (prev.failedAttempts ?? 0) + 1;
        const failedAtIso = new Date().toISOString();
        const gaveUp = attempts >= MAX_STAGE_ATTEMPTS;

        state.stagesSent = {
          ...(state.stagesSent ?? {}),
          [target.key]: {
            ...prev,
            failedAttempts: attempts,
            lastFailedAt: failedAtIso,
            lastError: message.slice(0, 300),
            // Păstrăm codul emis ca să-l reutilizăm la următoarea încercare.
            promoCode: issuedPromoCode ?? prev.promoCode,
            ...(gaveUp ? { gaveUpAt: failedAtIso } : {}),
          },
        };
        state.lastError = message;
        await this.states.save(state).catch(() => {});

        if (gaveUp) {
          this.logger.error(
            `recovery stage ${target.stage} (${target.key}) ABANDONAT pentru ${state.email} după ${attempts} încercări: ${message}`,
          );
        } else {
          this.logger.warn(
            `recovery send failed for ${state.email} (încercarea ${attempts}/${MAX_STAGE_ATTEMPTS}): ${message}`,
          );
        }
      }
    }

    return { candidates: candidates.length, sent, converted, errors };
  }

  /**
   * Codul promo al etapei. Emitem unul nou DOAR dacă nu avem deja unul valid
   * dintr-o încercare eșuată anterioară — fără asta, fiecare retry lăsa în urmă
   * un cod orfan (565 în 5 zile, observat 2026-08-23 pe chalgapodarok.bg).
   */
  private async resolveStagePromo(
    state: RecoveryState,
    target: RecoveryStageDef,
    now: number,
  ): Promise<PromoCode> {
    const prevCode = state.stagesSent?.[target.key]?.promoCode;
    if (prevCode) {
      const existing = await this.promoCodes.findOne({
        where: { code: prevCode, siteId: state.siteId ?? IsNull() },
      });
      const stillUsable =
        existing &&
        existing.active &&
        (existing.usedCount ?? 0) < (existing.maxUses || 1) &&
        (!existing.validUntil || new Date(existing.validUntil).getTime() > now);
      if (existing && stillUsable) return existing;
    }

    const created = await this.promo.create({
      siteId: state.siteId,
      discountType: 'percent',
      discountValue: target.percent,
      validUntil: new Date(now + target.validHours * HOUR),
      maxUses: 1,
      restrictedToEmail: state.email,
      note: `Recovery stage ${target.stage}`,
    });
    created.source = 'recovery';
    return this.promoCodes.save(created);
  }

  /** Cea mai recentă plată 'paid' a emailului DUPĂ momentul dat (orice site —
   *  dacă a plătit oriunde, nu-l mai deranjăm). */
  private async lastPaidAfter(email: string, after: Date): Promise<Date | null> {
    const rows: Array<{ lastPaidAt: Date | null }> = await this.payments.query(
      `SELECT MAX(p."createdAt") AS "lastPaidAt"
         FROM payments p
         LEFT JOIN users u ON u.id = p."userId"
         LEFT JOIN guest_sessions g ON g.id = p."guestId"
        WHERE p.status = 'paid'
          AND p."createdAt" > $1
          AND LOWER(COALESCE(u.email, g.email)) = $2`,
      [after, email],
    );
    const at = rows[0]?.lastPaidAt;
    return at ? new Date(at) : null;
  }

  // ============ Dezabonare (confirmare activă) ============

  /** Info pentru pagina publică /unsubscribe: email mascat + numele site-ului. */
  async getUnsubscribeInfo(token: string): Promise<{
    ok: true;
    emailMasked: string;
    siteName: string;
    alreadyOptedOut: boolean;
  }> {
    const state = await this.findByToken(token);
    const site = state.siteId ? await this.sites.findById(state.siteId) : null;
    return {
      ok: true,
      emailMasked: maskEmail(state.email),
      siteName: site?.name || 'Manele Cadou',
      alreadyOptedOut: !!state.optedOutAt,
    };
  }

  /**
   * Confirmă dezabonarea DOAR dacă emailul tastat == emailul candidatului
   * (case-insensitive). Idempotent: dacă e deja opted-out → ok.
   */
  async confirmUnsubscribe(token: string, typedEmail: string, reason?: string): Promise<{ ok: true }> {
    const state = await this.findByToken(token);
    if (state.optedOutAt) return { ok: true };
    const typed = (typedEmail ?? '').trim().toLowerCase();
    if (!typed || typed !== state.email) {
      throw new BadRequestException(
        'Adresa de email introdusă nu corespunde cu adresa la care a fost trimis emailul.',
      );
    }
    state.optedOutAt = new Date();
    state.optOutReason = reason?.trim().slice(0, 200) || null;
    await this.states.save(state);
    this.logger.log(`recovery opt-out confirmed for ${state.email}`);
    return { ok: true };
  }

  private async findByToken(token: string): Promise<RecoveryState> {
    const clean = (token ?? '').trim();
    if (!clean || clean.length > 64) throw new NotFoundException('Link de dezabonare invalid');
    const state = await this.states.findOne({ where: { optOutToken: clean } });
    if (!state) throw new NotFoundException('Link de dezabonare invalid');
    return state;
  }

  // ============ Excluderi ============

  private async excludeEntries(): Promise<string[]> {
    const raw = (await this.settings.get('RECOVERY_EXCLUDE_EMAILS')).trim() || DEFAULT_EXCLUDE_EMAILS;
    return raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  }

  /** Intrările care încep cu '@' = match pe sufix de domeniu; restul = exact. */
  private isExcluded(email: string, entries: string[]): boolean {
    return entries.some((e) => (e.startsWith('@') ? email.endsWith(e) : email === e));
  }
}

/** Maschează emailul pentru pagina de dezabonare: `serban@x.ro` → `s•••@x.ro`. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '•••';
  return `${email[0]}•••${email.slice(at)}`;
}
