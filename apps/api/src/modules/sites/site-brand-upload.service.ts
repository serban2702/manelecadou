import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join } from 'path';
import { SitesService } from './sites.service';
import { SiteBrand } from './site.entity';

export type BrandAssetField = 'logoUrl' | 'ogImageUrl' | 'faviconUrl' | 'emailBannerUrl';

const ALLOWED_FIELDS: BrandAssetField[] = ['logoUrl', 'ogImageUrl', 'faviconUrl', 'emailBannerUrl'];

const ALLOWED_EXT_BY_FIELD: Record<BrandAssetField, readonly string[]> = {
  logoUrl: ['png', 'jpg', 'jpeg', 'webp', 'svg'],
  ogImageUrl: ['png', 'jpg', 'jpeg', 'webp'],
  faviconUrl: ['ico', 'png', 'svg'],
  emailBannerUrl: ['png', 'jpg', 'jpeg', 'webp'],
};

const MAX_BYTES_BY_FIELD: Record<BrandAssetField, number> = {
  logoUrl: 5 * 1024 * 1024,
  ogImageUrl: 5 * 1024 * 1024,
  faviconUrl: 1 * 1024 * 1024,
  emailBannerUrl: 5 * 1024 * 1024,
};

/**
 * Upload pentru asset-urile vizuale ale unui site (logo, OG image, favicon,
 * email banner). Salvează fișierul pe disc în `uploads/site-brand/<slug>/` și
 * persistă URL-ul public în `site.brand[field]`.
 *
 * Fișierul e expus prin `/uploads/*` (vezi `main.ts` `useStaticAssets`), deci
 * URL-ul final e `${API_URL}/uploads/site-brand/<slug>/<field>.<ext>?v=<ts>`.
 * Pe prod, API_URL = same-origin (ex. `https://manelecadou.ro`).
 */
@Injectable()
export class SiteBrandUploadService {
  private readonly logger = new Logger(SiteBrandUploadService.name);

  constructor(
    private readonly sites: SitesService,
    private readonly config: ConfigService,
  ) {}

  static isAllowedField(field: string): field is BrandAssetField {
    return (ALLOWED_FIELDS as readonly string[]).includes(field);
  }

  async uploadAsset(
    siteId: string,
    field: BrandAssetField,
    fileBuffer: Buffer,
    originalName: string,
  ): Promise<{ url: string; brand: SiteBrand }> {
    if (!SiteBrandUploadService.isAllowedField(field)) {
      throw new BadRequestException(`Câmp invalid: ${field}`);
    }
    const site = await this.sites.findById(siteId);
    if (!site) throw new NotFoundException('Site negăsit');

    if (fileBuffer.length === 0) throw new BadRequestException('Fișier gol');
    const max = MAX_BYTES_BY_FIELD[field];
    if (fileBuffer.length > max) {
      throw new BadRequestException(`Fișier prea mare (max ${Math.round(max / 1024 / 1024)} MB)`);
    }

    const ext = (originalName.split('.').pop() ?? '').toLowerCase();
    const allowed = ALLOWED_EXT_BY_FIELD[field];
    if (!allowed.includes(ext)) {
      throw new BadRequestException(
        `Extensie neacceptată: .${ext} (acceptate pentru ${field}: ${allowed.join(', ')})`,
      );
    }

    const uploadsDir = this.config.get<string>('UPLOADS_DIR') ?? join(process.cwd(), 'uploads');
    const dir = join(uploadsDir, 'site-brand', site.slug);
    await fs.mkdir(dir, { recursive: true });

    // Curăță fișiere vechi cu același field dar altă extensie (logoUrl.png → logoUrl.svg).
    try {
      const existing = await fs.readdir(dir);
      await Promise.all(
        existing
          .filter((f) => f.startsWith(`${field}.`))
          .map((f) => fs.unlink(join(dir, f)).catch(() => undefined)),
      );
    } catch {
      // dir might be empty / not exist — ignored
    }

    const fileName = `${field}.${ext}`;
    const filePath = join(dir, fileName);
    await fs.writeFile(filePath, fileBuffer);

    const apiUrl = (this.config.get<string>('API_URL') ?? 'http://localhost:1501').replace(/\/+$/, '');
    const v = Date.now();
    const url = `${apiUrl}/uploads/site-brand/${site.slug}/${fileName}?v=${v}`;

    const newBrand: SiteBrand = { ...(site.brand ?? {}), [field]: url };
    const updated = await this.sites.update(siteId, { brand: newBrand });

    this.logger.log(
      `upload brand asset siteSlug=${site.slug} field=${field} bytes=${fileBuffer.length} url=${url}`,
    );

    return { url, brand: updated.brand ?? newBrand };
  }
}
