import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export interface SavedSocialImage {
  url: string;
  filename: string;
  mime: string;
  size: number;
}

/**
 * Upload pentru imaginea socială proprie a unei generation (pachet plus/premium).
 * Salvează în `uploads/social/<generationId>/` și întoarce URL-ul public
 * (`${API_URL}/uploads/social/<id>/<file>`). Same-origin pe prod.
 */
@Injectable()
export class SocialImageUploadService {
  private readonly logger = new Logger('SocialImageUpload');

  constructor(private readonly config: ConfigService) {}

  async save(args: {
    generationId: string;
    fileBuffer: Buffer;
    originalName: string;
    mime: string;
  }): Promise<SavedSocialImage> {
    if (!args.fileBuffer || args.fileBuffer.length === 0) {
      throw new BadRequestException('Fișier gol');
    }
    if (args.fileBuffer.length > MAX_BYTES) {
      throw new BadRequestException(
        `Fișier prea mare (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB)`,
      );
    }
    const mime = (args.mime ?? '').toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
      throw new BadRequestException(`Tip neacceptat: ${mime} (png/jpg/webp)`);
    }
    const ext = EXT_BY_MIME[mime] ?? 'png';

    const uploadsDir = this.config.get<string>('UPLOADS_DIR') ?? join(process.cwd(), 'uploads');
    const dir = join(uploadsDir, 'social', args.generationId);
    await fs.mkdir(dir, { recursive: true });

    const filename = `upload-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
    const filePath = join(dir, filename);
    await fs.writeFile(filePath, args.fileBuffer);

    const apiUrl = (this.config.get<string>('API_URL') ?? 'http://localhost:1501').replace(/\/+$/, '');
    const url = `${apiUrl}/uploads/social/${args.generationId}/${filename}`;

    this.logger.log(
      `social image uploaded gen=${args.generationId.slice(0, 8)} bytes=${args.fileBuffer.length} mime=${mime}`,
    );

    return { url, filename, mime, size: args.fileBuffer.length };
  }
}
