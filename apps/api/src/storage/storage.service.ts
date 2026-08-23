import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { SettingsService } from '../modules/settings/settings.service';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createReadStream } from 'fs';
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'fs/promises';
import { dirname, extname, join, relative, sep } from 'path';
import { Readable } from 'stream';

const MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

/** Cheile care descriu storage-ul. Sunt EXACT numele din `.env` și din schema de
 *  settings — se citesc DB-first cu fallback pe env, prin `SettingsService.get`. */
const STORAGE_KEYS = [
  'STORAGE_DRIVER',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'R2_ENDPOINT',
  'R2_PUBLIC_URL',
] as const;

type StorageKey = (typeof STORAGE_KEYS)[number];
type StorageConfig = Record<StorageKey, string>;

/** Cât așteptăm baza pentru configul de storage înainte să cădem pe env. Boot-ul
 *  API-ului nu are voie să atârne de un SELECT care nu mai răspunde. */
const SETTINGS_READ_TIMEOUT_MS = 5_000;

/**
 * Disc local (dev) sau Cloudflare R2 (prod Coolify).
 * Cheile sunt relative la uploads/, fără slash inițial: `audio/<id>/full.mp3`.
 * URL-urile din DB rămân `/uploads/...` — GET /uploads redirectează spre R2.
 *
 * Configul vine DB-first (admin → Setări → Chei → Cloudflare R2) cu fallback pe
 * env, exact ca `SettingsService.get`. Se reaplică la cald la fiecare salvare din
 * admin, deci nu cere restart. Dacă baza nu e gata sau `SettingsService` lipsește,
 * cădem pe env și logăm — storage-ul nu are voie să blocheze boot-ul API-ului.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger('Storage');
  readonly localRoot: string;
  private driver: 'disk' | 'r2';
  private publicBase: string;
  private s3: S3Client | null = null;
  private bucket = '';
  /** Ultima (re)inițializare — orice operație pe fișiere o așteaptă. */
  private initPromise: Promise<void> | null = null;

  constructor(
    private readonly config: ConfigService,
    // Lazy, ca să nu legăm StorageModule (global, inițializat devreme) de
    // SettingsModule — evită și un ciclu de module, și dependența de ordinea
    // de init. Dacă lipsește, `settingsService()` întoarce null și mergem pe env.
    private readonly moduleRef: ModuleRef,
  ) {
    // Atenție: `UPLOADS_DIR` are default `''` în schema de env, iar `''` nu e
    // nullish — fără `.trim() ||` am ajunge cu localRoot gol și am scrie în
    // `/app/audio` în loc de `/app/uploads` (adică în afara volumului).
    // Rămâne DOAR din env: e un path în container, citit sincron la bootstrap
    // (main.ts → useStaticAssets), deci n-are ce căuta în UI-ul de settings.
    const configuredRoot = (this.config.get<string>('UPLOADS_DIR') ?? '').trim();
    this.localRoot = configuredRoot || join(process.cwd(), 'uploads');
    // Baseline sincron din env, ca orice consumator care citește înainte de
    // `onModuleInit` să vadă exact comportamentul de dinainte.
    const env = this.readEnvConfig();
    this.driver = env.STORAGE_DRIVER.trim().toLowerCase() === 'r2' ? 'r2' : 'disk';
    this.publicBase = env.R2_PUBLIC_URL.trim().replace(/\/+$/, '');
  }

  get usesR2(): boolean {
    return this.driver === 'r2';
  }

  async onModuleInit(): Promise<void> {
    await this.reload('boot');
    // Salvările din admin se aplică la cald. Fără abonare, valorile scrise în DB
    // ar rămâne moarte (StorageService citea doar env, iar SettingsService nu
    // scrie niciodată în process.env — nici restartul nu le-ar fi luat).
    const settings = this.settingsService();
    if (!settings) return;
    settings.onChange((keys) => {
      if (!keys.some((k) => (STORAGE_KEYS as readonly string[]).includes(k))) return;
      void this.reload('settings');
    });
  }

  /** SettingsService rezolvat lazy din containerul global; null dacă nu există încă. */
  private settingsService(): SettingsService | null {
    try {
      return this.moduleRef.get(SettingsService, { strict: false });
    } catch {
      return null;
    }
  }

  private readEnvConfig(): StorageConfig {
    const out = {} as StorageConfig;
    for (const key of STORAGE_KEYS) out[key] = (this.config.get<string>(key) ?? '').toString();
    return out;
  }

  /** DB-first prin SettingsService; pe orice hopă (DB indisponibil, serviciu lipsă) → env. */
  private async resolveConfig(): Promise<{ cfg: StorageConfig; source: 'db' | 'env' }> {
    const settings = this.settingsService();
    if (!settings) {
      this.logger.warn('SettingsService indisponibil — configul de storage se citește din env.');
      return { cfg: this.readEnvConfig(), source: 'env' };
    }
    let timer: NodeJS.Timeout | undefined;
    try {
      const read = Promise.all(STORAGE_KEYS.map((k) => settings.get(k)));
      const guard = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout la citirea setărilor')), SETTINGS_READ_TIMEOUT_MS);
        // Un timer în așteptare nu trebuie să țină procesul viu degeaba.
        timer.unref?.();
      });
      const values = await Promise.race([read, guard]);
      const cfg = {} as StorageConfig;
      STORAGE_KEYS.forEach((k, i) => (cfg[k] = (values[i] ?? '').toString()));
      return { cfg, source: 'db' };
    } catch (e) {
      // Tipic: baza încă nu răspunde la boot. Nu e fatal — env-ul e sursa de rezervă.
      this.logger.warn(
        `citirea setărilor de storage a eșuat (${(e as Error).message}) — se folosește env-ul.`,
      );
      return { cfg: this.readEnvConfig(), source: 'env' };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** (Re)aplică configul. Nu aruncă niciodată: la boot ar opri tot API-ul. */
  private reload(reason: 'boot' | 'settings'): Promise<void> {
    const p = this.applyConfig(reason).catch((e) => {
      this.logger.error(`init storage eșuat (${reason}): ${(e as Error).message} — rămân pe disc.`);
      this.useDisk();
    });
    this.initPromise = p;
    return p;
  }

  private useDisk(): void {
    this.driver = 'disk';
    this.s3?.destroy();
    this.s3 = null;
    this.bucket = '';
  }

  private async applyConfig(reason: 'boot' | 'settings'): Promise<void> {
    const { cfg, source } = await this.resolveConfig();
    const account = cfg.R2_ACCOUNT_ID.trim();
    const key = cfg.R2_ACCESS_KEY_ID.trim();
    const secret = cfg.R2_SECRET_ACCESS_KEY.trim();
    const bucket = cfg.R2_BUCKET.trim();
    const endpoint =
      cfg.R2_ENDPOINT.trim() || (account ? `https://${account}.r2.cloudflarestorage.com` : '');
    this.publicBase = cfg.R2_PUBLIC_URL.trim().replace(/\/+$/, '');

    if (cfg.STORAGE_DRIVER.trim().toLowerCase() !== 'r2') {
      this.useDisk();
      this.logger.log(`storage=disk root=${this.localRoot} (config=${source}, ${reason})`);
      return;
    }

    if (!endpoint || !key || !secret || !bucket) {
      // Degradare controlată, nu `throw`: o setare de storage greșită nu are voie
      // să oprească API-ul. Fișierele rămân pe volumul local — nu se pierde nimic,
      // doar nu ajung în bucket până completezi cheile.
      this.useDisk();
      this.logger.error(
        `STORAGE_DRIVER=r2 (config=${source}) dar lipsesc ` +
          `${[!endpoint && 'R2_ACCOUNT_ID sau R2_ENDPOINT', !key && 'R2_ACCESS_KEY_ID', !secret && 'R2_SECRET_ACCESS_KEY', !bucket && 'R2_BUCKET'].filter(Boolean).join(', ')}` +
          ` — rămân pe disc (${this.localRoot}). Completează-le în admin → Setări → Chei → Cloudflare R2.`,
      );
      return;
    }

    this.s3?.destroy();
    this.bucket = bucket;
    this.s3 = new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId: key, secretAccessKey: secret },
    });
    this.driver = 'r2';
    this.logger.log(
      `storage=r2 bucket=${this.bucket} public=${this.publicBase || '(proxy /uploads)'} (config=${source}, ${reason})`,
    );
    if (!this.publicBase) {
      // Fără domeniu public, /uploads streamează prin API. Merge, dar fără
      // Range → scrubbing rupt în <audio> și iOS Safari refuză redarea.
      this.logger.warn(
        'R2_PUBLIC_URL lipsește: /uploads se servește prin API (mai lent, seek limitat). ' +
          'Pune un custom domain pe bucket (ex. files.<domeniu>) în producție.',
      );
    }
  }

  /** Așteaptă (re)inițializarea în curs, ca o operație să nu prindă configul vechi. */
  private async ready(): Promise<void> {
    if (this.initPromise) await this.initPromise;
  }

  toRel(absOrRel: string): string {
    const n = absOrRel.replace(/\\/g, '/');
    if (n.startsWith('/uploads/')) return n.slice('/uploads/'.length);
    if (n.startsWith('uploads/')) return n.slice('uploads/'.length);
    const abs = n.startsWith('/') || /^[A-Za-z]:/.test(n) ? n : join(this.localRoot, n);
    const rel = relative(this.localRoot, abs).replace(/\\/g, '/');
    if (rel.startsWith('..')) return n.replace(/^\/+/, '');
    return rel;
  }

  localAbs(rel: string): string {
    return join(this.localRoot, this.toRel(rel).split('/').join(sep));
  }

  publicPath(rel: string): string {
    return `/uploads/${this.toRel(rel)}`;
  }

  /** URL de CDN dacă e setat R2_PUBLIC_URL, altfel path same-origin. */
  publicUrl(rel: string): string {
    const key = this.toRel(rel);
    if (this.publicBase) return `${this.publicBase}/${key}`;
    return `/uploads/${key}`;
  }

  guessMime(rel: string): string {
    return MIME[extname(rel).toLowerCase()] ?? 'application/octet-stream';
  }

  async saveBuffer(rel: string, buf: Buffer, contentType?: string): Promise<string> {
    await this.ready();
    const key = this.toRel(rel);
    const abs = this.localAbs(key);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, buf);
    if (this.usesR2) await this.putR2(key, buf, contentType ?? this.guessMime(key));
    return this.publicPath(key);
  }

  /** După ffmpeg/write local: urcă pe R2 (no-op pe disk). */
  async syncFile(absPath: string, contentType?: string): Promise<void> {
    await this.ready();
    if (!this.usesR2) return;
    const key = this.toRel(absPath);
    const buf = await readFile(absPath);
    await this.putR2(key, buf, contentType ?? this.guessMime(key));
  }

  async readBuffer(rel: string): Promise<Buffer> {
    await this.ready();
    const key = this.toRel(rel);
    const abs = this.localAbs(key);
    try {
      return await readFile(abs);
    } catch {
      if (!this.usesR2 || !this.s3) throw new Error(`missing ${key}`);
      const out = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return Buffer.from(await out.Body!.transformToByteArray());
    }
  }

  /** Pentru ffmpeg: asigură fișierul pe disc (download din R2 dacă trebuie). */
  async ensureLocal(rel: string): Promise<string> {
    const key = this.toRel(rel);
    const abs = this.localAbs(key);
    try {
      await readFile(abs);
      return abs;
    } catch {
      const buf = await this.readBuffer(key);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, buf);
      return abs;
    }
  }

  /** Șterge din ambele locuri (local + R2). Erorile de „nu există" sunt ignorate. */
  async delete(rel: string): Promise<void> {
    await this.ready();
    const key = this.toRel(rel);
    await unlink(this.localAbs(key)).catch(() => undefined);
    if (this.usesR2 && this.s3) {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })).catch(() => undefined);
    }
  }

  /** Există fișierul (local sau în bucket)? */
  async exists(rel: string): Promise<boolean> {
    await this.ready();
    const key = this.toRel(rel);
    try {
      await stat(this.localAbs(key));
      return true;
    } catch {
      /* poate e doar în R2 */
    }
    if (!this.usesR2 || !this.s3) return false;
    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Listează cheile dintr-un „folder" (prefix), reunind discul local și R2.
   * Necesar pentru colaje: pozele clientului sunt listate din director, nu din DB.
   */
  async list(prefixRel: string): Promise<string[]> {
    await this.ready();
    const prefix = this.toRel(prefixRel).replace(/\/+$/, '');
    const found = new Set<string>();
    try {
      const names = await readdir(this.localAbs(prefix), { withFileTypes: true });
      for (const n of names) if (n.isFile()) found.add(`${prefix}/${n.name}`);
    } catch {
      /* directorul poate exista doar în R2 */
    }
    if (this.usesR2 && this.s3) {
      let token: string | undefined;
      do {
        const out = await this.s3
          .send(
            new ListObjectsV2Command({
              Bucket: this.bucket,
              Prefix: `${prefix}/`,
              ContinuationToken: token,
            }),
          )
          .catch(() => null);
        if (!out) break;
        for (const obj of out.Contents ?? []) {
          // Doar fișierele direct în folder, ca la readdir.
          const key = obj.Key ?? '';
          if (key && !key.slice(prefix.length + 1).includes('/')) found.add(key);
        }
        token = out.IsTruncated ? out.NextContinuationToken : undefined;
      } while (token);
    }
    return [...found].sort();
  }

  /** Stream pentru servit prin API. `range` = header-ul HTTP Range, dacă e dat. */
  async getObjectStream(
    rel: string,
    range?: string,
  ): Promise<{
    stream: Readable;
    mime: string;
    contentLength?: number;
    contentRange?: string;
  } | null> {
    await this.ready();
    const key = this.toRel(rel);
    if (this.usesR2 && this.s3) {
      try {
        const out = await this.s3.send(
          new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: range }),
        );
        const body = out.Body;
        if (!body) return null;
        const stream = body instanceof Readable ? body : Readable.fromWeb(body as never);
        return {
          stream,
          mime: out.ContentType ?? this.guessMime(key),
          contentLength: out.ContentLength,
          contentRange: out.ContentRange,
        };
      } catch {
        return null;
      }
    }
    try {
      const abs = this.localAbs(key);
      return { stream: createReadStream(abs), mime: this.guessMime(key) };
    } catch {
      return null;
    }
  }

  private async putR2(key: string, buf: Buffer, contentType: string): Promise<void> {
    if (!this.s3) return;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buf,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  }
}
