import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join } from 'path';
import { isKnownExperienceSlug } from '../experiences/catalog';
import { SitesService } from './sites.service';

const ART_EXT = ['png', 'jpg', 'jpeg', 'webp'];
const SAMPLE_EXT = ['mp3', 'wav', 'm4a', 'ogg'];
const REACTION_EXT = ['mp4', 'webm', 'mov'];
const MAX_ART = 6 * 1024 * 1024;
const MAX_SAMPLE = 20 * 1024 * 1024;
const MAX_REACTION = 40 * 1024 * 1024;

@Injectable()
export class ExperienceAssetUploadService {
  private readonly logger = new Logger(ExperienceAssetUploadService.name);

  constructor(
    private readonly sites: SitesService,
    private readonly config: ConfigService,
  ) {}

  async upload(
    siteId: string,
    slug: string,
    kind: 'art' | 'sample' | 'reaction',
    styleId: string,
    fileBuffer: Buffer,
    originalName: string,
  ): Promise<{ url: string }> {
    if (!isKnownExperienceSlug(slug)) throw new BadRequestException(`Interfață necunoscută: ${slug}`);
    const key = (styleId || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!key) throw new BadRequestException('styleId invalid');
    if (!fileBuffer.length) throw new BadRequestException('Fișier gol');

    const ext = (originalName.split('.').pop() ?? '').toLowerCase();
    const allowed = kind === 'art' ? ART_EXT : kind === 'reaction' ? REACTION_EXT : SAMPLE_EXT;
    const max = kind === 'art' ? MAX_ART : kind === 'reaction' ? MAX_REACTION : MAX_SAMPLE;
    if (!allowed.includes(ext)) {
      throw new BadRequestException(`Extensie neacceptată: .${ext} (acceptate: ${allowed.join(', ')})`);
    }
    if (fileBuffer.length > max) {
      throw new BadRequestException(`Fișier prea mare (max ${Math.round(max / 1024 / 1024)} MB)`);
    }

    const site = await this.sites.findById(siteId);
    if (!site) throw new NotFoundException('Site negăsit');

    const uploadsDir = this.config.get<string>('UPLOADS_DIR') ?? join(process.cwd(), 'uploads');
    const dir = join(uploadsDir, 'experience-art', site.slug, slug);
    await fs.mkdir(dir, { recursive: true });

    const prefix = `${kind}-${key}.`;
    try {
      const existing = await fs.readdir(dir);
      await Promise.all(
        existing
          .filter((f) => f.startsWith(prefix))
          .map((f) => fs.unlink(join(dir, f)).catch(() => undefined)),
      );
    } catch {
      /* empty */
    }

    const fileName = `${kind}-${key}.${ext}`;
    await fs.writeFile(join(dir, fileName), fileBuffer);

    const apiUrl = (this.config.get<string>('API_URL') ?? 'http://localhost:1501').replace(/\/+$/, '');
    const url = `${apiUrl}/uploads/experience-art/${site.slug}/${slug}/${fileName}?v=${Date.now()}`;
    this.logger.log(`upload experience ${kind} site=${site.slug} ui=${slug} style=${key} bytes=${fileBuffer.length}`);
    return { url };
  }
}
