import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { AppSetting } from './app-setting.entity';
import { SETTINGS_SCHEMA, SettingCategory, SettingDef, ALL_KEYS, findDef } from './settings-schema';
import { decryptSecret, encryptSecret, maskSecret } from '../../common/crypto.util';

export interface SettingView {
  key: string;
  label: string;
  description?: string;
  kind: SettingDef['kind'];
  options?: string[];
  optionLabels?: Record<string, string>;
  encrypted: boolean;
  hotReload: boolean;
  requiresRestart: boolean;
  placeholder?: string;
  group?: string;
  helpWhat?: string;
  helpWhere?: string;
  helpUrl?: string;
  /** Valoare curentă: pentru `secret` returnăm doar `••••` dacă există. */
  value: string;
  /** Sursă: 'db' = override custom, 'env' = vine din .env, 'unset' = nesetat. */
  source: 'db' | 'env' | 'unset';
  hasDbValue: boolean;
}

export interface SettingCategoryView {
  id: string;
  title: string;
  description?: string;
  settings: SettingView[];
}

/** Notificat după fiecare `update()`, cu cheile efectiv scrise/șterse. */
export type SettingsChangeListener = (keys: string[]) => void;

@Injectable()
export class SettingsService {
  private readonly logger = new Logger('SettingsService');

  /** Cache simplu: cheie → { value, expiresAt }. */
  private cache = new Map<string, { value: string; expiresAt: number }>();
  private readonly TTL_MS = 30_000;

  /** Abonați la salvările din admin (ex. StorageService reface clientul R2). */
  private readonly listeners = new Set<SettingsChangeListener>();

  constructor(
    @InjectRepository(AppSetting) private readonly repo: Repository<AppSetting>,
    private readonly env: ConfigService,
  ) {}

  /** Invalidează cache-ul (după un PATCH). */
  invalidate(): void {
    this.cache.clear();
  }

  /**
   * Abonare la salvările din admin, pentru setările care trebuie reaplicate la
   * cald (nu doar la restart). Întoarce funcția de dezabonare.
   */
  onChange(listener: SettingsChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Best-effort: un abonat care crapă nu are voie să rupă PATCH-ul de settings. */
  private emitChange(keys: string[]): void {
    if (keys.length === 0) return;
    for (const listener of this.listeners) {
      try {
        listener(keys);
      } catch (e) {
        this.logger.warn(`settings listener failed: ${(e as Error).message}`);
      }
    }
  }

  /**
   * Citește valoarea efectivă pentru o cheie:
   * - dacă există în DB → folosește (decriptat dacă e cazul)
   * - altfel → valoarea din ConfigService (env)
   */
  async get(key: string): Promise<string> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    let value = '';
    const row = await this.repo.findOne({ where: { key } });
    if (row && row.value) {
      try {
        value = row.encrypted ? decryptSecret(row.value) : row.value;
      } catch (e) {
        this.logger.warn(`decrypt failed for key=${key}: ${(e as Error).message}`);
        value = (this.env.get<string>(key) ?? '').toString();
      }
    } else {
      value = (this.env.get<string>(key) ?? '').toString();
    }
    this.cache.set(key, { value, expiresAt: Date.now() + this.TTL_MS });
    return value;
  }

  /** Variantă sincronă pentru consumeri care nu pot await — citește din cache, fallback env. */
  getSync(key: string): string {
    const cached = this.cache.get(key);
    if (cached) return cached.value;
    return (this.env.get<string>(key) ?? '').toString();
  }

  /** Bulk-prefill cache pentru toate cheile (apelat la boot). */
  async warmup(): Promise<void> {
    const rows = await this.repo.find();
    const byKey = new Map(rows.map((r) => [r.key, r]));
    for (const key of ALL_KEYS) {
      const row = byKey.get(key);
      let value = '';
      if (row && row.value) {
        try {
          value = row.encrypted ? decryptSecret(row.value) : row.value;
        } catch {
          value = (this.env.get<string>(key) ?? '').toString();
        }
      } else {
        value = (this.env.get<string>(key) ?? '').toString();
      }
      this.cache.set(key, { value, expiresAt: Date.now() + this.TTL_MS });
    }
  }

  /** Listează toate setările pe categorii pentru UI. */
  async listForAdmin(): Promise<SettingCategoryView[]> {
    const dbRows = await this.repo.find();
    const dbMap = new Map(dbRows.map((r) => [r.key, r]));

    return SETTINGS_SCHEMA.map((cat: SettingCategory) => ({
      id: cat.id,
      title: cat.title,
      description: cat.description,
      settings: cat.settings.map((def): SettingView => {
        const row = dbMap.get(def.key);
        const envVal = (this.env.get<string>(def.key) ?? '').toString();
        const hasDbValue = !!(row && row.value);
        let plain = '';
        if (hasDbValue) {
          try {
            plain = row!.encrypted ? decryptSecret(row!.value) : row!.value;
          } catch {
            plain = '';
          }
        } else {
          plain = envVal;
        }
        const isSecret = def.kind === 'secret';
        const view: SettingView = {
          key: def.key,
          label: def.label,
          description: def.description,
          kind: def.kind,
          options: def.options,
          optionLabels: def.optionLabels,
          encrypted: !!def.encrypted,
          hotReload: !!def.hotReload,
          requiresRestart: !!def.requiresRestart,
          placeholder: def.placeholder,
          group: def.group,
          helpWhat: def.helpWhat,
          helpWhere: def.helpWhere,
          helpUrl: def.helpUrl,
          value: isSecret ? (plain ? maskSecret(plain) : '') : plain,
          source: hasDbValue ? 'db' : envVal ? 'env' : 'unset',
          hasDbValue,
        };
        return view;
      }),
    }));
  }

  /** Actualizează un set de setări. Pentru secrete, dacă valoarea e goală, NU se modifică. */
  async update(updates: Array<{ key: string; value: string; clear?: boolean }>): Promise<void> {
    // Doar cheile chiar aplicate — nu cele ignorate (necunoscute / secret gol).
    const changed: string[] = [];
    for (const u of updates) {
      const def = findDef(u.key);
      if (!def) continue; // ignore unknown keys
      const isSecret = def.kind === 'secret';

      if (u.clear) {
        await this.repo.delete({ key: u.key });
        changed.push(u.key);
        continue;
      }

      // Pentru secret: dacă vine empty, nu schimbăm (păstrăm valoarea anterioară).
      if (isSecret && (u.value === undefined || u.value === '')) continue;

      const valueToStore = def.encrypted && u.value ? encryptSecret(u.value) : (u.value ?? '');
      const existing = await this.repo.findOne({ where: { key: u.key } });
      if (existing) {
        existing.value = valueToStore;
        existing.encrypted = !!def.encrypted;
        await this.repo.save(existing);
      } else {
        await this.repo.save(this.repo.create({ key: u.key, value: valueToStore, encrypted: !!def.encrypted }));
      }
      changed.push(u.key);
    }
    this.invalidate();
    this.emitChange(changed);
  }
}
