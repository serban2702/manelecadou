import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { StorageService } from '../../storage/storage.service';
import {
  SITE_DEMO_CATEGORIES,
  SiteDemo,
  SiteDemoCategory,
} from './site-demo.entity';

const MAX_AUDIO_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_THUMB_BYTES = 2 * 1024 * 1024; // 2 MB
const FEATURED_HOME_LIMIT = 5;
const PUBLIC_LIMIT = 20;

const AUDIO_MIME_EXT: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
};

const THUMB_MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export interface SiteDemoInput {
  title: string;
  fromName?: string | null;
  toName?: string | null;
  category?: SiteDemoCategory;
  lyrics?: string | null;
  previewStartSec?: number;
  sortOrder?: number;
  active?: boolean;
  featuredOnHome?: boolean;
  audioDurationSec?: number | null;
}

@Injectable()
export class SiteDemosService {
  private readonly logger = new Logger('SiteDemos');
  private readonly uploadsDir: string;

  constructor(
    @InjectRepository(SiteDemo)
    private readonly repo: Repository<SiteDemo>,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {
    this.uploadsDir = this.storage.localRoot;
  }

  // ---- Listing -----------------------------------------------------------

  async listForSite(siteId: string): Promise<SiteDemo[]> {
    return this.repo.find({
      where: { siteId, active: true },
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
      take: PUBLIC_LIMIT,
    });
  }

  async listFeatured(siteId: string): Promise<SiteDemo[]> {
    return this.repo.find({
      where: { siteId, active: true, featuredOnHome: true },
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
      take: FEATURED_HOME_LIMIT,
    });
  }

  async listAdmin(siteId?: string): Promise<SiteDemo[]> {
    const where = siteId ? { siteId } : {};
    return this.repo.find({
      where,
      order: { siteId: 'ASC', sortOrder: 'ASC', createdAt: 'DESC' },
    });
  }

  async getOne(id: string): Promise<SiteDemo> {
    const demo = await this.repo.findOne({ where: { id } });
    if (!demo) throw new NotFoundException('Demo inexistent');
    return demo;
  }

  // ---- Create / update --------------------------------------------------

  async create(args: {
    siteId: string;
    input: SiteDemoInput;
    audioBuffer: Buffer;
    audioMime: string;
    audioOriginalName: string;
    thumbBuffer?: Buffer | null;
    thumbMime?: string | null;
  }): Promise<SiteDemo> {
    if (!args.input.title || args.input.title.trim().length === 0) {
      throw new BadRequestException('Titlul e obligatoriu');
    }
    if (!args.audioBuffer || args.audioBuffer.length === 0) {
      throw new BadRequestException('Fișier audio gol');
    }
    if (args.audioBuffer.length > MAX_AUDIO_BYTES) {
      throw new BadRequestException(
        `Fișier audio prea mare (max ${Math.round(
          MAX_AUDIO_BYTES / 1024 / 1024,
        )} MB)`,
      );
    }

    const demoId = randomUUID();
    const audioUrl = await this.writeAudio(
      demoId,
      args.audioBuffer,
      args.audioMime,
      args.audioOriginalName,
    );
    let thumbUrl: string | null = null;
    if (args.thumbBuffer && args.thumbBuffer.length > 0) {
      thumbUrl = await this.writeThumb(
        demoId,
        args.thumbBuffer,
        args.thumbMime ?? 'image/jpeg',
      );
    }

    const demo = this.repo.create({
      id: demoId,
      siteId: args.siteId,
      title: args.input.title.trim(),
      fromName: nullable(args.input.fromName),
      toName: nullable(args.input.toName),
      category: normalizeCategory(args.input.category),
      lyrics: nullable(args.input.lyrics),
      audioUrl,
      audioDurationSec:
        typeof args.input.audioDurationSec === 'number'
          ? Math.max(0, Math.round(args.input.audioDurationSec))
          : null,
      previewStartSec: Math.max(
        0,
        Math.round(args.input.previewStartSec ?? 0),
      ),
      thumbnailUrl: thumbUrl,
      sortOrder: Math.round(args.input.sortOrder ?? 0),
      active: args.input.active ?? true,
      featuredOnHome: args.input.featuredOnHome ?? false,
    });
    const saved = await this.repo.save(demo);
    this.logger.log(
      `created demo=${saved.id.slice(0, 8)} site=${args.siteId.slice(0, 8)} title="${saved.title}"`,
    );
    return saved;
  }

  async update(
    id: string,
    patch: Partial<SiteDemoInput>,
    files?: {
      audioBuffer?: Buffer;
      audioMime?: string;
      audioOriginalName?: string;
      thumbBuffer?: Buffer;
      thumbMime?: string;
    },
  ): Promise<SiteDemo> {
    const demo = await this.getOne(id);
    if (patch.title !== undefined) demo.title = patch.title.trim();
    if (patch.fromName !== undefined) demo.fromName = nullable(patch.fromName);
    if (patch.toName !== undefined) demo.toName = nullable(patch.toName);
    if (patch.category !== undefined)
      demo.category = normalizeCategory(patch.category);
    if (patch.lyrics !== undefined) demo.lyrics = nullable(patch.lyrics);
    if (patch.previewStartSec !== undefined)
      demo.previewStartSec = Math.max(0, Math.round(patch.previewStartSec));
    if (patch.sortOrder !== undefined)
      demo.sortOrder = Math.round(patch.sortOrder);
    if (patch.active !== undefined) demo.active = !!patch.active;
    if (patch.featuredOnHome !== undefined)
      demo.featuredOnHome = !!patch.featuredOnHome;
    if (patch.audioDurationSec !== undefined)
      demo.audioDurationSec =
        typeof patch.audioDurationSec === 'number'
          ? Math.max(0, Math.round(patch.audioDurationSec))
          : null;

    if (files?.audioBuffer && files.audioBuffer.length > 0) {
      if (files.audioBuffer.length > MAX_AUDIO_BYTES) {
        throw new BadRequestException('Fișier audio prea mare');
      }
      demo.audioUrl = await this.writeAudio(
        demo.id,
        files.audioBuffer,
        files.audioMime ?? 'audio/mpeg',
        files.audioOriginalName ?? 'full.mp3',
      );
    }
    if (files?.thumbBuffer && files.thumbBuffer.length > 0) {
      demo.thumbnailUrl = await this.writeThumb(
        demo.id,
        files.thumbBuffer,
        files.thumbMime ?? 'image/jpeg',
      );
    }

    return this.repo.save(demo);
  }

  async remove(id: string): Promise<void> {
    const demo = await this.getOne(id);
    await this.repo.delete({ id });
    // Best-effort cleanup — dacă eșuează, log + continuă (nu mai e referință în
    // DB, fișierele rămân orfan dar nu deranjează). Întâi obiectele din storage
    // (disc + R2, listate din ambele), apoi directorul local rămas gol.
    const relDir = `demos/${demo.id}`;
    try {
      const keys = await this.storage.list(relDir);
      await Promise.all(keys.map((k) => this.storage.delete(k)));
    } catch (err) {
      this.logger.warn(
        `cleanup demos storage failed id=${demo.id.slice(0, 8)}: ${(err as Error)?.message}`,
      );
    }
    const dir = join(this.uploadsDir, 'demos', demo.id);
    await fs.rm(dir, { recursive: true, force: true }).catch((err) => {
      this.logger.warn(
        `cleanup demos dir failed id=${demo.id.slice(0, 8)}: ${err?.message}`,
      );
    });
  }

  // ---- File helpers ------------------------------------------------------

  private async writeAudio(
    demoId: string,
    buffer: Buffer,
    mime: string,
    originalName: string,
  ): Promise<string> {
    const mimeLow = mime.toLowerCase();
    const ext =
      AUDIO_MIME_EXT[mimeLow] ??
      originalName.split('.').pop()?.toLowerCase() ??
      'mp3';
    if (!Object.values(AUDIO_MIME_EXT).includes(ext)) {
      throw new BadRequestException(
        `Format audio neacceptat: ${mimeLow}. Acceptate: mp3, wav, ogg, m4a`,
      );
    }
    const dir = join(this.uploadsDir, 'demos', demoId);
    await fs.mkdir(dir, { recursive: true });
    const filename = `full.${ext}`;
    const dest = join(dir, filename);
    await fs.writeFile(dest, buffer);
    await this.storage.syncFile(dest);
    return `/uploads/demos/${demoId}/${filename}`;
  }

  private async writeThumb(
    demoId: string,
    buffer: Buffer,
    mime: string,
  ): Promise<string> {
    if (buffer.length > MAX_THUMB_BYTES) {
      throw new BadRequestException('Thumbnail prea mare (max 2 MB)');
    }
    const mimeLow = mime.toLowerCase();
    const ext = THUMB_MIME_EXT[mimeLow];
    if (!ext) {
      throw new BadRequestException(
        `Format thumbnail neacceptat: ${mimeLow}. Acceptate: png, jpg, webp`,
      );
    }
    const dir = join(this.uploadsDir, 'demos', demoId);
    await fs.mkdir(dir, { recursive: true });
    const filename = `cover.${ext}`;
    const dest = join(dir, filename);
    await fs.writeFile(dest, buffer);
    await this.storage.syncFile(dest);
    return `/uploads/demos/${demoId}/${filename}`;
  }
}

function nullable(v: string | null | undefined): string | null {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

function normalizeCategory(c: string | undefined | null): SiteDemoCategory {
  if (!c) return 'altele';
  return (SITE_DEMO_CATEGORIES as readonly string[]).includes(c)
    ? (c as SiteDemoCategory)
    : 'altele';
}
