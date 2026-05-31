import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const DEMO_DURATION_SEC = 30;
const FADE_OUT_SEC = 2;

/** Numele fișierelor pe disc per variantă audio. `instrumental` are propriul
 *  fișier ca să nu suprascrie full.mp3 (track-ul principal cu voce). */
const AUDIO_FILE_NAMES: Record<'full' | 'bonus' | 'instrumental', { full: string; demo: string }> = {
  full: { full: 'full.mp3', demo: 'demo.mp3' },
  bonus: { full: 'bonus.mp3', demo: 'demo-bonus.mp3' },
  instrumental: { full: 'instrumental.mp3', demo: 'demo-instrumental.mp3' },
};

@Injectable()
export class AudioProcessorService {
  private readonly logger = new Logger('AudioProcessor');
  private readonly uploadsDir: string;

  constructor(private readonly config: ConfigService) {
    this.uploadsDir = this.config.get<string>('UPLOADS_DIR') ?? join(process.cwd(), 'uploads');
  }

  /**
   * Descarcă audio-ul de la Suno la noi și generează demo-ul trunchiat (30s + fade-out).
   * Returnează URL-urile publice (`/uploads/audio/<id>/...`) pentru ambele fișiere.
   */
  async downloadAndMakeDemo(
    generationId: string,
    sourceUrl: string,
    variant: 'full' | 'bonus' | 'instrumental' = 'full',
  ): Promise<{ fullUrl: string; demoUrl: string }> {
    const dir = join(this.uploadsDir, 'audio', generationId);
    await mkdir(dir, { recursive: true });

    const fullName = AUDIO_FILE_NAMES[variant].full;
    const demoName = AUDIO_FILE_NAMES[variant].demo;
    const fullPath = join(dir, fullName);
    const demoPath = join(dir, demoName);

    await this.downloadTo(sourceUrl, fullPath);
    try {
      await this.makeDemo(fullPath, demoPath);
    } catch (err) {
      // Dacă ffmpeg eșuează, ștergem fișierul demo parțial și lăsăm să propage.
      await unlink(demoPath).catch(() => {});
      throw err;
    }

    return {
      fullUrl: `/uploads/audio/${generationId}/${fullName}`,
      demoUrl: `/uploads/audio/${generationId}/${demoName}`,
    };
  }

  /**
   * Variantă pentru upload manual din admin: primește buffer-ul fișierului
   * (mp3/wav/etc.) în loc de URL. Îl salvează ca `full.mp3` (sau `bonus.mp3`)
   * și generează demo-ul. ffmpeg re-encode-ează la libmp3lame 128k indiferent
   * de formatul de input, deci acceptă orice container Suno.
   */
  async saveAndMakeDemo(
    generationId: string,
    buffer: Buffer,
    variant: 'full' | 'bonus' | 'instrumental' = 'full',
  ): Promise<{ fullUrl: string; demoUrl: string }> {
    const dir = join(this.uploadsDir, 'audio', generationId);
    await mkdir(dir, { recursive: true });

    const fullName = AUDIO_FILE_NAMES[variant].full;
    const demoName = AUDIO_FILE_NAMES[variant].demo;
    const fullPath = join(dir, fullName);
    const demoPath = join(dir, demoName);

    await writeFile(fullPath, buffer);
    try {
      await this.makeDemo(fullPath, demoPath);
    } catch (err) {
      await unlink(demoPath).catch(() => {});
      throw err;
    }

    return {
      fullUrl: `/uploads/audio/${generationId}/${fullName}`,
      demoUrl: `/uploads/audio/${generationId}/${demoName}`,
    };
  }

  private async downloadTo(url: string, destPath: string): Promise<void> {
    const res = await fetch(url);
    if (!res.ok || !res.body) {
      throw new Error(`download failed (${res.status}) for ${url}`);
    }
    const nodeStream = Readable.fromWeb(res.body as unknown as import('node:stream/web').ReadableStream);
    await pipeline(nodeStream, createWriteStream(destPath));
  }

  /**
   * Generează un fișier demo de 30s cu fade-out 2s la final. Re-encode cu libmp3lame
   * (128k) ca să elimine orice metadata exploatabilă din original.
   */
  private async makeDemo(srcPath: string, destPath: string): Promise<void> {
    const fadeStart = DEMO_DURATION_SEC - FADE_OUT_SEC;
    const args = [
      '-y', // overwrite
      '-i', srcPath,
      '-t', String(DEMO_DURATION_SEC),
      '-af', `afade=t=out:st=${fadeStart}:d=${FADE_OUT_SEC}`,
      '-c:a', 'libmp3lame',
      '-b:a', '128k',
      '-map_metadata', '-1',
      destPath,
    ];

    await new Promise<void>((resolve, reject) => {
      const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      proc.on('error', (err) => reject(err));
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-500)}`));
      });
    });
  }
}
