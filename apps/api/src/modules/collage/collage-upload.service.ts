import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join } from 'path';

import { MAX_IMAGES, MAX_IMAGE_BYTES } from './collage.constants';

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export interface UploadedImage {
  buffer: Buffer;
  originalname: string;
  size: number;
  mimetype: string;
}

export interface SavedCollageImages {
  /** Path-uri absolute pe disc, în ordinea de upload. */
  paths: string[];
  /** Directorul colajului pe disc. */
  dir: string;
}

/**
 * Salvează imaginile încărcate pentru un colaj video în
 * `uploads/collage/<collageId>/img_001.ext ...`. Validează numărul, mărimea și
 * tipul fiecărui fișier înainte de a scrie pe disc.
 */
@Injectable()
export class CollageUploadService {
  private readonly logger = new Logger('CollageUpload');
  private readonly uploadsDir: string;

  constructor(private readonly config: ConfigService) {
    this.uploadsDir =
      this.config.get<string>('UPLOADS_DIR') ?? join(process.cwd(), 'uploads');
  }

  /** Directorul pe disc al unui colaj (folosit și de processor). */
  dirFor(collageId: string): string {
    return join(this.uploadsDir, 'collage', collageId);
  }

  async save(collageId: string, files: UploadedImage[]): Promise<SavedCollageImages> {
    if (!files || files.length === 0) {
      throw new BadRequestException('Trebuie cel puțin o imagine');
    }
    if (files.length > MAX_IMAGES) {
      throw new BadRequestException(`Maxim ${MAX_IMAGES} imagini`);
    }
    for (const f of files) {
      if (!f.buffer || f.buffer.length === 0) {
        throw new BadRequestException('Fișier gol');
      }
      if (f.buffer.length > MAX_IMAGE_BYTES) {
        throw new BadRequestException(
          `Fișier prea mare (max ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB)`,
        );
      }
      const mime = (f.mimetype ?? '').toLowerCase();
      if (!mime.startsWith('image/') || !EXT_BY_MIME[mime]) {
        throw new BadRequestException(`Tip neacceptat: ${mime} (png/jpg/webp/gif)`);
      }
    }

    const dir = this.dirFor(collageId);
    await fs.mkdir(dir, { recursive: true });

    const paths: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const mime = files[i].mimetype.toLowerCase();
      const ext = EXT_BY_MIME[mime] ?? 'jpg';
      const name = `img_${String(i + 1).padStart(3, '0')}.${ext}`;
      const filePath = join(dir, name);
      await fs.writeFile(filePath, files[i].buffer);
      paths.push(filePath);
    }

    this.logger.log(`collage ${collageId.slice(0, 8)} saved ${paths.length} images`);
    return { paths, dir };
  }

  /**
   * Listează imaginile sursă (`img_*`) ale unui colaj de pe disc, ca URL-uri
   * publice `/uploads/collage/<id>/img_NNN.ext`, în ordinea de upload. Folosit de
   * admin ca să vadă exact ce poze a încărcat clientul. Gol dacă dir lipsește.
   */
  async listImageUrls(collageId: string): Promise<string[]> {
    const dir = this.dirFor(collageId);
    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch {
      return [];
    }
    return names
      .filter((n) => /^img_\d+\.(png|jpe?g|webp|gif)$/i.test(n))
      .sort()
      .map((n) => `/uploads/collage/${collageId}/${n}`);
  }

  /**
   * Copiază imaginile `img_*` dintr-un colaj sursă în directorul altui colaj —
   * pentru „regenerează cu aceleași poze, altă variantă". Întoarce câte a copiat.
   */
  async copyImages(srcCollageId: string, destCollageId: string): Promise<number> {
    const srcDir = this.dirFor(srcCollageId);
    const destDir = this.dirFor(destCollageId);
    let names: string[];
    try {
      names = await fs.readdir(srcDir);
    } catch {
      return 0;
    }
    const imgs = names.filter((n) => /^img_\d+\.(png|jpe?g|webp|gif)$/i.test(n)).sort();
    if (imgs.length === 0) return 0;
    await fs.mkdir(destDir, { recursive: true });
    for (const n of imgs) {
      await fs.copyFile(join(srcDir, n), join(destDir, n));
    }
    this.logger.log(
      `collage ${destCollageId.slice(0, 8)} copied ${imgs.length} images from ${srcCollageId.slice(0, 8)}`,
    );
    return imgs.length;
  }
}
