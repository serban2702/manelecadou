import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Generation } from '../generations/generation.entity';
import { RemoteMediaClient } from './remote-media.client';

/** O schemă cromatică / layout pentru o variantă de imagine socială. */
interface Theme {
  /** Gradient de fundal (2 stop-uri). */
  bgFrom: string;
  bgTo: string;
  /** Culoarea de accent (nume + linii). */
  accent: string;
  /** Culoarea textului principal. */
  text: string;
  /** Culoarea textului secundar (ocazie, etichetă). */
  muted: string;
  /** Culoarea pattern-ului decorativ subtil. */
  pattern: string;
}

const THEMES: Theme[] = [
  // 1. Auriu pe negru (premium / clasic)
  {
    bgFrom: '#0a0606',
    bgTo: '#1a1410',
    accent: '#d4af37',
    text: '#ffffff',
    muted: '#d4af37',
    pattern: '#d4af37',
  },
  // 2. Roz → portocaliu (vibrant)
  {
    bgFrom: '#ff5f6d',
    bgTo: '#ffc371',
    accent: '#ffffff',
    text: '#ffffff',
    muted: '#fff3e6',
    pattern: '#ffffff',
  },
  // 3. Violet (modern / electric)
  {
    bgFrom: '#240b36',
    bgTo: '#7b2ff7',
    accent: '#e0aaff',
    text: '#ffffff',
    muted: '#e0aaff',
    pattern: '#c77dff',
  },
  // 4. Verde (fresh)
  {
    bgFrom: '#0f2027',
    bgTo: '#11998e',
    accent: '#38ef7d',
    text: '#ffffff',
    muted: '#9bffc4',
    pattern: '#38ef7d',
  },
];

const SIZE = 1080;

@Injectable()
export class SocialImageService {
  private readonly logger = new Logger('SocialImage');
  private readonly uploadsDir: string;

  constructor(
    private readonly config: ConfigService,
    private readonly remote: RemoteMediaClient,
  ) {
    this.uploadsDir = this.config.get<string>('UPLOADS_DIR') ?? join(process.cwd(), 'uploads');
  }

  /**
   * Generează 4 variante PNG 1080x1080 „stil Spotify cover" pentru o generation.
   *
   * Dacă microserviciul de media (Hetzner) e configurat → randează acolo și
   * salvează PNG-urile la aceleași căi locale. La orice eșec (sau dacă nu e
   * configurat) → fallback la randarea LOCALĂ cu `@resvg/resvg-js`.
   * Căile de output și URL-urile întoarse sunt IDENTICE indiferent de cale.
   */
  async generateSocialImages(gen: Generation): Promise<string[]> {
    if (this.remote.isEnabled()) {
      try {
        return await this.generateRemote(gen);
      } catch (err) {
        this.logger.warn(
          `social images remote eșuat (gen ${gen.id}), cad pe randare locală: ${(err as Error).message}`,
        );
      }
    }
    return this.generateLocal(gen);
  }

  /**
   * Apelează microserviciul Hetzner pentru cele 4 imagini și le salvează la
   * `/uploads/social/<id>/vN.png` (aceleași căi ca randarea locală).
   */
  private async generateRemote(gen: Generation): Promise<string[]> {
    const recipient = this.clean(gen.recipientName) || 'tine';
    const occasion = this.clean(gen.occasion);

    const images = await this.remote.renderSocialImages({
      recipientName: recipient,
      occasion,
    });
    if (images.length === 0) throw new Error('microserviciul nu a întors imagini');

    const dir = join(this.uploadsDir, 'social', gen.id);
    await mkdir(dir, { recursive: true });

    const urls: string[] = [];
    for (let i = 0; i < images.length; i++) {
      const idx = i + 1;
      const filePath = join(dir, `v${idx}.png`);
      await writeFile(filePath, images[i].buffer);
      urls.push(`/uploads/social/${gen.id}/v${idx}.png`);
    }
    this.logger.log(`social images remote (gen ${gen.id}): ${urls.length} variante`);
    return urls;
  }

  /**
   * Randare LOCALĂ (fallback): 4 variante PNG via `@resvg/resvg-js`.
   * Robust: try/catch per variantă; o variantă care eșuează e omisă. Dacă
   * `@resvg/resvg-js` nu poate fi încărcat deloc → întoarce `[]`.
   */
  private async generateLocal(gen: Generation): Promise<string[]> {
    let Resvg: typeof import('@resvg/resvg-js').Resvg;
    try {
      // import dinamic ca să nu cădem la boot dacă pachetul lipsește în dev.
      ({ Resvg } = await import('@resvg/resvg-js'));
    } catch (err) {
      this.logger.error(`@resvg/resvg-js indisponibil: ${(err as Error).message}`);
      return [];
    }

    const dir = join(this.uploadsDir, 'social', gen.id);
    try {
      await mkdir(dir, { recursive: true });
    } catch (err) {
      this.logger.error(`mkdir social dir failed: ${(err as Error).message}`);
      return [];
    }

    const recipient = this.clean(gen.recipientName) || 'tine';
    const occasion = this.clean(gen.occasion);
    const urls: string[] = [];

    for (let i = 0; i < THEMES.length; i++) {
      const idx = i + 1;
      try {
        const svg = this.buildSvg(THEMES[i], recipient, occasion);
        const resvg = new Resvg(svg, {
          fitTo: { mode: 'width', value: SIZE },
          font: { loadSystemFonts: true },
        });
        const png = resvg.render().asPng();
        const filePath = join(dir, `v${idx}.png`);
        await writeFile(filePath, png);
        urls.push(`/uploads/social/${gen.id}/v${idx}.png`);
      } catch (err) {
        this.logger.warn(`variantă socială v${idx} eșuată (gen ${gen.id}): ${(err as Error).message}`);
      }
    }

    return urls;
  }

  /** Construiește SVG-ul unei variante. Toate textele sunt escape-uite XML. */
  private buildSvg(t: Theme, recipient: string, occasion: string): string {
    const title = `Manea pentru`;
    const name = this.fit(recipient, 14);
    const occ = occasion ? this.fit(occasion.toUpperCase(), 28) : '';
    const nameFont = this.fontSizeFor(name);

    // pattern de bare verticale subtile (echo vizual de „equalizer")
    const bars = this.equalizer(t.pattern);

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${t.bgFrom}"/>
      <stop offset="100%" stop-color="${t.bgTo}"/>
    </linearGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
  ${bars}
  <text x="${SIZE / 2}" y="170" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="34" letter-spacing="6"
        fill="${this.esc(t.muted)}" font-weight="700">PLAYLIST CADOU</text>
  <text x="${SIZE / 2}" y="${SIZE / 2 - 40}" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="52"
        fill="${this.esc(t.text)}" opacity="0.92">${this.esc(title)}</text>
  <text x="${SIZE / 2}" y="${SIZE / 2 + nameFont * 0.35}" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="${nameFont}" font-weight="800"
        fill="${this.esc(t.accent)}">${this.esc(name)}</text>
  ${occ ? `<text x="${SIZE / 2}" y="${SIZE / 2 + 130}" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="40" letter-spacing="4"
        fill="${this.esc(t.muted)}" font-weight="600">${this.esc(occ)}</text>` : ''}
  <rect x="${SIZE / 2 - 60}" y="${SIZE - 150}" width="120" height="6" rx="3" fill="${this.esc(t.accent)}"/>
  <text x="${SIZE / 2}" y="${SIZE - 80}" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="700"
        fill="${this.esc(t.text)}">manelecadou.ro</text>
</svg>`;
  }

  /** Bare verticale „equalizer" decorative jos. */
  private equalizer(color: string): string {
    const heights = [60, 140, 90, 200, 120, 170, 80, 150, 110, 190, 70, 160];
    const barW = 28;
    const gap = 20;
    const totalW = heights.length * (barW + gap) - gap;
    const startX = (SIZE - totalW) / 2;
    const baseY = SIZE - 220;
    let out = `<g opacity="0.12">`;
    heights.forEach((h, i) => {
      const x = startX + i * (barW + gap);
      out += `<rect x="${x.toFixed(1)}" y="${(baseY - h).toFixed(1)}" width="${barW}" height="${h}" rx="6" fill="${this.esc(color)}"/>`;
    });
    out += `</g>`;
    return out;
  }

  /** Alege font-size pentru nume în funcție de lungime ca să încapă pe lățime. */
  private fontSizeFor(name: string): number {
    const len = name.length;
    if (len <= 7) return 150;
    if (len <= 10) return 120;
    if (len <= 13) return 96;
    return 78;
  }

  /** Trunchiază (cu …) la o lungime maximă. */
  private fit(s: string, max: number): string {
    if (s.length <= max) return s;
    return s.slice(0, max - 1).trimEnd() + '…';
  }

  /** Curăță whitespace + control chars. */
  private clean(s: string | null | undefined): string {
    return (s ?? '').replace(/\s+/g, ' ').trim();
  }

  /** XML escape pentru a evita SVG invalid din input user. */
  private esc(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
