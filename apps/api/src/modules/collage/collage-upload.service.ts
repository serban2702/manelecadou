import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService } from '../../storage/storage.service';
import { promises as fs } from 'fs';
import { basename, join } from 'path';

import { MAX_IMAGES, MAX_IMAGE_BYTES } from './collage.constants';

/** Numele fișierelor sursă ale unui colaj (ordinea de upload e dată de index). */
const IMG_NAME_RE = /^img_\d+\.(png|jpe?g|webp|gif)$/i;

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

  constructor(
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {
    this.uploadsDir = this.storage.localRoot;
  }

  /** Directorul pe disc al unui colaj (folosit și de processor). */
  dirFor(collageId: string): string {
    return join(this.uploadsDir, 'collage', collageId);
  }

  /** Prefixul de storage al unui colaj (`collage/<id>`), fără slash final. */
  keyFor(collageId: string): string {
    return `collage/${collageId}`;
  }

  /**
   * Cheile de storage ale imaginilor sursă (`collage/<id>/img_NNN.ext`), sortate
   * în ordinea de upload. Reunește discul local și R2 — pe un container nou
   * fișierele există doar în bucket.
   */
  async listImageKeys(collageId: string): Promise<string[]> {
    const keys = await this.storage.list(this.keyFor(collageId));
    return keys.filter((k) => IMG_NAME_RE.test(basename(k))).sort();
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
      await this.storage.syncFile(filePath);
      paths.push(filePath);
    }

    this.logger.log(`collage ${collageId.slice(0, 8)} saved ${paths.length} images`);
    return { paths, dir };
  }

  /**
   * Listează imaginile sursă (`img_*`) ale unui colaj, ca URL-uri publice
   * `/uploads/collage/<id>/img_NNN.ext`, în ordinea de upload. Folosit de admin
   * ca să vadă exact ce poze a încărcat clientul. Gol dacă nu există niciuna.
   */
  async listImageUrls(collageId: string): Promise<string[]> {
    const keys = await this.listImageKeys(collageId).catch(() => [] as string[]);
    return keys.map((k) => this.storage.publicPath(k));
  }

  /**
   * Copiază imaginile `img_*` dintr-un colaj sursă în directorul altui colaj —
   * pentru „regenerează cu aceleași poze, altă variantă". Întoarce câte a copiat.
   * Citirea trece prin storage (R2 fallback), scrierea ajunge și local, și în
   * bucket — altfel copia ar exista doar pe containerul curent.
   */
  async copyImages(srcCollageId: string, destCollageId: string): Promise<number> {
    const imgs = await this.listImageKeys(srcCollageId).catch(() => [] as string[]);
    if (imgs.length === 0) return 0;
    for (const key of imgs) {
      const buf = await this.storage.readBuffer(key);
      await this.storage.saveBuffer(`${this.keyFor(destCollageId)}/${basename(key)}`, buf);
    }
    this.logger.log(
      `collage ${destCollageId.slice(0, 8)} copied ${imgs.length} images from ${srcCollageId.slice(0, 8)}`,
    );
    return imgs.length;
  }
}
