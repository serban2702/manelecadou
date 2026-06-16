import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SettingsService } from '../settings/settings.service';
import { SunoProvider } from './suno.types';
import { SunoCreditMonitorState } from './suno-credit-monitor.entity';
import { WingoNotifyService } from './wingo-notify.service';

/**
 * Câte verificări consecutive eșuate până declarăm API-ul Suno „căzut".
 * Filtrează blip-urile pur tranzitorii (o singură verificare ratată din minut).
 */
const FAILS_BEFORE_DOWN = 2;

/** Pragul implicit de alertă pentru credite scăzute (overridable din /settings). */
const DEFAULT_THRESHOLD = 100;

export interface CreditCheckResult {
  ok: boolean;
  credits: number | null;
  threshold: number;
  apiDown: boolean;
  consecutiveFailures: number;
  /** Ce alertă (dacă vreuna) a fost trimisă în această verificare. */
  alert: 'none' | 'low_credits' | 'api_down' | 'api_recovered';
}

/**
 * Monitor de credite Suno. Cron la fiecare minut → citește soldul (GET
 * /api/v1/generate/credit) și trimite alerte pe Wingo, fără spam:
 *
 *  1. Credite scăzute (sub prag): o alertă la intrarea sub prag; re-alertă DOAR
 *     când suma scade și mai mult. Revenirea peste prag resetează ciclul.
 *  2. API căzut (răspuns invalid / fără răspuns): o alertă după
 *     `FAILS_BEFORE_DOWN` eșecuri consecutive; o alertă de „revenit" la recovery.
 *
 * Starea persistă în `suno_credit_monitor_state` (supraviețuiește restart-urilor,
 * deci un deploy nu re-declanșează alertele deja trimise).
 */
@Injectable()
export class SunoCreditMonitorService {
  private readonly logger = new Logger('SunoCreditMonitor');
  private running = false;

  constructor(
    @InjectRepository(SunoCreditMonitorState)
    private readonly repo: Repository<SunoCreditMonitorState>,
    private readonly settings: SettingsService,
    private readonly provider: SunoProvider,
    private readonly wingo: WingoNotifyService,
  ) {}

  @Cron('* * * * *', { name: 'suno-credit-monitor', timeZone: 'UTC' })
  async tick(): Promise<void> {
    if (this.running) return; // anti-suprapunere
    const enabled = (await this.settings.get('SUNO_CREDIT_MONITOR_ENABLED')).trim().toLowerCase();
    if (enabled === 'false' || enabled === '0') return; // default ON
    try {
      await this.runCheck();
    } catch (e) {
      this.logger.warn(`tick eșuat: ${(e as Error).message}`);
    }
  }

  /** Rulează o verificare completă acum (folosit de cron + endpoint-ul admin). */
  async runCheck(): Promise<CreditCheckResult> {
    const threshold = await this.threshold();
    if (this.running) {
      const st = await this.loadState();
      return {
        ok: false,
        credits: st.lastCredits,
        threshold,
        apiDown: st.apiDown,
        consecutiveFailures: st.consecutiveFailures,
        alert: 'none',
      };
    }
    this.running = true;
    try {
      const state = await this.loadState();
      const now = new Date();
      state.lastCheckedAt = now;

      const credits = await this.safeGetCredits();

      // ── API căzut / nu răspunde ──────────────────────────────────────────
      if (credits === null) {
        state.consecutiveFailures += 1;
        let alert: CreditCheckResult['alert'] = 'none';
        if (!state.apiDown && state.consecutiveFailures >= FAILS_BEFORE_DOWN) {
          state.apiDown = true;
          state.apiDownSince = now;
          state.apiDownAlertAt = now;
          alert = 'api_down';
          await this.wingo.send({
            title: '🔴 Suno API nu răspunde',
            body:
              `Endpoint-ul de credite Suno nu a răspuns corect la ultimele ` +
              `${state.consecutiveFailures} verificări (una pe minut). Generările ` +
              `de melodii pot fi afectate — verifică sunoapi.org / status Suno.`,
            priority: 'high',
            data: { kind: 'suno_api_down', failures: state.consecutiveFailures },
          });
          this.logger.warn(`ALERTĂ: Suno API căzut (${state.consecutiveFailures} eșecuri)`);
        }
        await this.repo.save(state);
        return {
          ok: false,
          credits: state.lastCredits,
          threshold,
          apiDown: state.apiDown,
          consecutiveFailures: state.consecutiveFailures,
          alert,
        };
      }

      // ── Răspuns valid ────────────────────────────────────────────────────
      state.lastOkAt = now;
      state.lastCredits = credits;
      let alert: CreditCheckResult['alert'] = 'none';

      // Revenire API după o cădere → mesaj „revenit" + reset.
      if (state.apiDown) {
        alert = 'api_recovered';
        await this.wingo.send({
          title: '✅ Suno API a revenit',
          body: `Endpoint-ul de credite Suno răspunde din nou. Credite curente: ${fmt(credits)}.`,
          priority: 'normal',
          data: { kind: 'suno_api_recovered', credits },
        });
        this.logger.log('Suno API a revenit');
      }
      state.apiDown = false;
      state.apiDownSince = null;
      state.consecutiveFailures = 0;

      // ── Credite scăzute (anti-spam) ──────────────────────────────────────
      if (credits < threshold) {
        const firstTime = !state.lowAlertActive;
        const decreased = state.lowAlertCredits != null && credits < state.lowAlertCredits;
        if (firstTime || decreased) {
          state.lowAlertActive = true;
          state.lowAlertCredits = credits;
          state.lowAlertAt = now;
          if (alert === 'none') alert = 'low_credits';
          await this.wingo.send({
            title: `⚠️ Credite Suno scăzute: ${fmt(credits)}`,
            body:
              `Au mai rămas ${fmt(credits)} credite Suno (prag de alertă ${threshold}). ` +
              `Reîncarcă contul pe sunoapi.org ca să nu se oprească generările de melodii.`,
            priority: 'high',
            data: { kind: 'suno_low_credits', credits, threshold },
          });
          this.logger.warn(`ALERTĂ: credite Suno scăzute = ${fmt(credits)} (prag ${threshold})`);
        }
      } else {
        // Sold peste prag → resetăm, ca o viitoare scădere să poată re-alerta.
        state.lowAlertActive = false;
        state.lowAlertCredits = null;
      }

      await this.repo.save(state);
      this.logger.debug(`credite=${fmt(credits)} prag=${threshold} alert=${alert}`);
      return { ok: true, credits, threshold, apiDown: false, consecutiveFailures: 0, alert };
    } finally {
      this.running = false;
    }
  }

  /** Starea curentă a monitorului (pentru UI admin / debugging). */
  async getState(): Promise<SunoCreditMonitorState> {
    return this.loadState();
  }

  private async threshold(): Promise<number> {
    const raw = (await this.settings.get('SUNO_CREDIT_ALERT_THRESHOLD')).trim();
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_THRESHOLD;
  }

  /** `provider.getCredits()` întoarce deja null la eșec; try/catch e defensiv. */
  private async safeGetCredits(): Promise<number | null> {
    try {
      return await this.provider.getCredits();
    } catch (e) {
      this.logger.warn(`getCredits a aruncat: ${(e as Error).message}`);
      return null;
    }
  }

  /** Încarcă rândul singleton; îl creează dacă nu există încă. */
  private async loadState(): Promise<SunoCreditMonitorState> {
    const rows = await this.repo.find({ order: { createdAt: 'ASC' }, take: 1 });
    if (rows[0]) return rows[0];
    return this.repo.save(this.repo.create({}));
  }
}

/** Format prietenos: întreg fără zecimale, altfel o zecimală. */
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
