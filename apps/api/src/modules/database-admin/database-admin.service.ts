import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { spawn } from 'node:child_process';
import { createReadStream, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { SeederService } from '../../database/seeder/seeder.service';
import { SettingsService } from '../settings/settings.service';

export interface BackupFile {
  name: string;
  sizeBytes: number;
  createdAt: string;
}

const BACKUPS_DIR = process.env.BACKUPS_DIR || '/app/backups';
const FILENAME_RE = /^[A-Za-z0-9_.\-]+\.sql$/;

@Injectable()
export class DatabaseAdminService implements OnModuleInit {
  private readonly logger = new Logger('DatabaseAdminService');

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly seeder: SeederService,
    private readonly settingsService: SettingsService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await fs.mkdir(BACKUPS_DIR, { recursive: true });
    } catch (e) {
      this.logger.warn(`Cannot create backups dir ${BACKUPS_DIR}: ${(e as Error).message}`);
    }
  }

  private pgEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      PGPASSWORD: this.config.get<string>('POSTGRES_PASSWORD') ?? '',
    };
  }

  private pgArgs(): string[] {
    return [
      '-h', this.config.get<string>('POSTGRES_HOST') ?? 'postgres',
      '-p', String(this.config.get<number>('POSTGRES_PORT') ?? 5432),
      '-U', this.config.get<string>('POSTGRES_USER') ?? 'manelecadou',
      '-d', this.config.get<string>('POSTGRES_DB') ?? 'manelecadou',
    ];
  }

  private resolveBackupPath(name: string): string {
    if (!FILENAME_RE.test(name)) {
      throw new BadRequestException('Nume de fișier invalid');
    }
    const full = path.join(BACKUPS_DIR, name);
    // path-traversal guard
    if (!full.startsWith(BACKUPS_DIR + path.sep)) {
      throw new BadRequestException('Cale invalidă');
    }
    return full;
  }

  async listBackups(): Promise<BackupFile[]> {
    let names: string[] = [];
    try {
      names = await fs.readdir(BACKUPS_DIR);
    } catch {
      return [];
    }
    const out: BackupFile[] = [];
    for (const n of names) {
      if (!n.endsWith('.sql')) continue;
      try {
        const st = await fs.stat(path.join(BACKUPS_DIR, n));
        if (!st.isFile()) continue;
        out.push({ name: n, sizeBytes: st.size, createdAt: st.mtime.toISOString() });
      } catch { /* skip */ }
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createBackup(label?: string): Promise<BackupFile> {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const safeLabel = (label ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
    const fileName = `backup-${ts}${safeLabel ? `-${safeLabel}` : ''}.sql`;
    const fullPath = path.join(BACKUPS_DIR, fileName);

    await this.runProcess(
      'pg_dump',
      [...this.pgArgs(), '--no-owner', '--no-acl', '--clean', '--if-exists', '-f', fullPath],
      this.pgEnv(),
    );

    const st = await fs.stat(fullPath);
    this.logger.log(`Backup created: ${fileName} (${st.size} bytes)`);
    return { name: fileName, sizeBytes: st.size, createdAt: st.mtime.toISOString() };
  }

  async deleteBackup(name: string): Promise<void> {
    const full = this.resolveBackupPath(name);
    try {
      await fs.unlink(full);
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') throw new NotFoundException('Backup inexistent');
      throw e;
    }
  }

  async backupStream(name: string): Promise<{ stream: NodeJS.ReadableStream; size: number }> {
    const full = this.resolveBackupPath(name);
    let st;
    try {
      st = await fs.stat(full);
    } catch {
      throw new NotFoundException('Backup inexistent');
    }
    return { stream: createReadStream(full), size: st.size };
  }

  /**
   * Restore: drop schema public + cascade -> psql -f backup.sql -> typeorm.synchronize
   * (în dev). Permis și pe prod, dar UI-ul cere confirmare.
   */
  async restoreBackup(name: string): Promise<{ ok: true; bytesApplied: number }> {
    const full = this.resolveBackupPath(name);
    const st = await fs.stat(full).catch(() => null);
    if (!st) throw new NotFoundException('Backup inexistent');

    await this.dropAndRecreateSchema();
    await this.runProcess(
      'psql',
      [...this.pgArgs(), '-v', 'ON_ERROR_STOP=1', '-f', full],
      this.pgEnv(),
    );

    // În dev, sincronizăm schema ca entitățile TypeORM să fie aliniate cu dump-ul.
    if (this.config.get<string>('NODE_ENV') !== 'production') {
      await this.dataSource.synchronize();
    }
    this.settingsService.invalidate();
    await this.settingsService.warmup();
    this.logger.log(`Backup restored: ${name}`);
    return { ok: true, bytesApplied: st.size };
  }

  /**
   * Reset complet: DROP SCHEMA public CASCADE + CREATE SCHEMA + TypeORM
   * synchronize + seeder. STRICT non-prod (returnăm 403 pe production).
   */
  async resetAndReseed(): Promise<{ ok: true; seeder: { users: number; generations: number; conversations: number } }> {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new ForbiddenException('Reset interzis pe production');
    }
    await this.dropAndRecreateSchema();
    await this.dataSource.synchronize();
    await this.seeder.seedSettingsFromEnv();
    const seederStats = await this.seeder.run();
    this.logger.warn(`Database reset + reseed executat (non-prod)`);
    return { ok: true, seeder: seederStats };
  }

  private async dropAndRecreateSchema(): Promise<void> {
    // Folosim runner-ul TypeORM ca să nu spawn-ăm încă un psql doar pentru asta.
    const runner = this.dataSource.createQueryRunner();
    try {
      await runner.connect();
      await runner.query('DROP SCHEMA IF EXISTS public CASCADE');
      await runner.query('CREATE SCHEMA public');
      await runner.query('GRANT ALL ON SCHEMA public TO public');
      // Extensiile vechi din public au fost dropate odată cu schema —
      // le recreăm pe cele de care depind entitățile (uuid_generate_v4, etc.).
      await runner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
      await runner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    } finally {
      await runner.release();
    }
  }

  private runProcess(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { env });
      let stderr = '';
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      child.on('error', (err) => reject(new Error(`${cmd} spawn failed: ${err.message}`)));
      child.on('close', (code) => {
        if (code === 0) return resolve();
        reject(new Error(`${cmd} exit ${code}: ${stderr.trim().slice(0, 4000)}`));
      });
    });
  }
}
