import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FxRate } from './fx-rate.entity';

const BNR_LATEST = 'https://www.bnr.ro/nbrfxrates.xml';
const BNR_10DAYS = 'https://www.bnr.ro/nbrfxrates10days.xml';
const BNR_YEAR = (year: number) =>
  `https://curs.bnr.ro/files/xml/years/nbrfxrates${year}.xml`;

/**
 * Cursuri de referință BNR pentru conversia plăților în valută (EUR pe
 * chalgapodarok.bg / doroparaggelia.gr) la RON, pentru raportare + facturi.
 *
 * Regula de business (cerință Șerban): folosim „ultimul curs de dinainte de
 * data plății" — adică cel mai recent Cube BNR cu data STRICT < data plății
 * (în timezone România). Weekend/sărbători (BNR nu publică) se rezolvă natural:
 * nu există Cube, deci se ia ultima zi lucrătoare anterioară. Aliniat și cu
 * practica ANAF pentru facturi în valută (curs din ziua bancară precedentă).
 */
@Injectable()
export class FxRateService implements OnModuleInit {
  private readonly logger = new Logger(FxRateService.name);

  constructor(
    @InjectRepository(FxRate)
    private readonly repo: Repository<FxRate>,
  ) {}

  async onModuleInit(): Promise<void> {
    // La boot: asigură istoricul anului curent (idempotent — upsert).
    // Plățile în valută au început în mai 2026; importăm anul curent și, la
    // nevoie, ani anteriori se pot importa manual via importYear().
    try {
      const count = await this.repo.count();
      if (count < 50) {
        const year = new Date().getFullYear();
        await this.importYear(year);
      }
      // Împrospătează și ziua curentă (dacă procesul pornește după 13:00 EET).
      await this.refreshLatest();
    } catch (err) {
      this.logger.warn(`onModuleInit FX bootstrap: ${(err as Error).message}`);
    }
  }

  /** Zilnic 12:30 UTC (≈15:30 EET vara / 14:30 iarna) — după publicarea BNR (13:00 EET). */
  @Cron('30 12 * * *', { name: 'fx-refresh', timeZone: 'UTC' })
  async dailyRefresh(): Promise<void> {
    try {
      await this.refreshLatest();
      await this.refresh10Days();
    } catch (err) {
      this.logger.warn(`dailyRefresh: ${(err as Error).message}`);
    }
  }

  async refreshLatest(): Promise<number> {
    return this.fetchAndStore(BNR_LATEST);
  }

  async refresh10Days(): Promise<number> {
    return this.fetchAndStore(BNR_10DAYS);
  }

  async importYear(year: number): Promise<number> {
    return this.fetchAndStore(BNR_YEAR(year));
  }

  /**
   * Cursul RON pentru 1 unitate din `currency`, valabil la `when` conform
   * regulii „ultimul curs de dinainte de data plății". RON → 1.
   * Returnează null dacă nu găsim niciun curs (nici măcar mai vechi).
   */
  async getRateToRon(currency: string, when: Date | string): Promise<number | null> {
    const cur = (currency || 'RON').toUpperCase();
    if (cur === 'RON') return 1;
    const dateStr = this.toRoDateStr(when);

    // Ultimul Cube cu data STRICT < data plății (în timezone RO).
    const row = await this.repo
      .createQueryBuilder('fx')
      .where('fx.currency = :cur', { cur })
      .andWhere('fx.date < :d', { d: dateStr })
      .orderBy('fx.date', 'DESC')
      .limit(1)
      .getOne();
    if (row) return Number(row.rateToRon);

    // Fallback: cel mai vechi curs disponibil (plată dinainte de istoricul importat).
    const oldest = await this.repo
      .createQueryBuilder('fx')
      .where('fx.currency = :cur', { cur })
      .orderBy('fx.date', 'ASC')
      .limit(1)
      .getOne();
    if (oldest) {
      this.logger.warn(
        `getRateToRon(${cur}, ${dateStr}): fără curs < dată; folosesc cel mai vechi (${oldest.date}=${oldest.rateToRon})`,
      );
      return Number(oldest.rateToRon);
    }
    this.logger.warn(`getRateToRon(${cur}, ${dateStr}): niciun curs în DB`);
    return null;
  }

  /** Suma în RON cents pentru `amountCents` în `currency`, la cursul de dinainte de `when`. */
  async toRonCents(
    amountCents: number,
    currency: string,
    when: Date | string,
  ): Promise<{ amountRonCents: number; rate: number } | null> {
    const cur = (currency || 'RON').toUpperCase();
    if (cur === 'RON') return { amountRonCents: amountCents, rate: 1 };
    const rate = await this.getRateToRon(cur, when);
    if (rate == null) return null;
    return { amountRonCents: Math.round(amountCents * rate), rate };
  }

  /** Data calendaristică (yyyy-mm-dd) în timezone România pentru un moment dat. */
  private toRoDateStr(when: Date | string): string {
    const d = typeof when === 'string' ? new Date(when) : when;
    // en-CA → format ISO yyyy-mm-dd; timeZone RO ca „ziua plății" să fie corectă.
    return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Bucharest' });
  }

  /** Fetch un XML BNR, parsează Cube-urile și upsertează cursurile. Întoarce nr. de rânduri. */
  private async fetchAndStore(url: string): Promise<number> {
    const res = await fetch(url, {
      headers: { Accept: 'application/xml', 'User-Agent': 'manelecadou-fx/1.0' },
    });
    if (!res.ok) {
      throw new Error(`BNR fetch ${url} → HTTP ${res.status}`);
    }
    const xml = await res.text();
    const rows = this.parseCubes(xml);
    if (!rows.length) {
      this.logger.warn(`fetchAndStore ${url}: 0 cursuri parsate`);
      return 0;
    }
    // Upsert în batch pe conflictul (date, currency).
    await this.repo.upsert(rows, {
      conflictPaths: ['date', 'currency'],
      skipUpdateIfNoValuesChanged: true,
    });
    return rows.length;
  }

  /** Parsează toate <Cube date="..."> cu <Rate currency=... multiplier?=...>. */
  private parseCubes(xml: string): Array<Partial<FxRate>> {
    const out: Array<Partial<FxRate>> = [];
    const cubeRe = /<Cube[^>]*\bdate="([0-9]{4}-[0-9]{2}-[0-9]{2})"[^>]*>([\s\S]*?)<\/Cube>/g;
    const rateRe = /<Rate\s+currency="([A-Z]{3})"(?:\s+multiplier="(\d+)")?\s*>([\d.]+)<\/Rate>/g;
    let cm: RegExpExecArray | null;
    while ((cm = cubeRe.exec(xml)) !== null) {
      const date = cm[1];
      const body = cm[2];
      let rm: RegExpExecArray | null;
      rateRe.lastIndex = 0;
      while ((rm = rateRe.exec(body)) !== null) {
        const currency = rm[1];
        const multiplier = rm[2] ? Number(rm[2]) : 1;
        const value = Number(rm[3]);
        if (!Number.isFinite(value) || value <= 0) continue;
        const rateToRon = value / (multiplier > 0 ? multiplier : 1);
        out.push({ date, currency, rateToRon: rateToRon.toFixed(8), source: 'bnr' });
      }
    }
    return out;
  }
}
