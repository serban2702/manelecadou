import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import { constants as FS } from 'node:fs';
import { join } from 'node:path';

import type { Generation } from '../generations/generation.entity';

/** Fonturi candidate pentru drawtext, în ordinea preferinței.
 *  font-noto (Dockerfile) → /usr/share/fonts/noto/...
 *  ttf-dejavu (fallback)  → /usr/share/fonts/dejavu/... sau .../truetype/dejavu/... */
const FONT_CANDIDATES = [
  '/usr/share/fonts/noto/NotoSans-Bold.ttf',
  '/usr/share/fonts/noto/NotoSans-Regular.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/TTF/DejaVuSans.ttf',
];

// Format vertical TikTok/Reels.
const W = 1080;
const H = 1920;
const FPS = 30;

@Injectable()
export class VideoService {
  private readonly logger = new Logger('VideoService');
  private readonly uploadsDir: string;

  constructor(private readonly config: ConfigService) {
    this.uploadsDir = this.config.get<string>('UPLOADS_DIR') ?? join(process.cwd(), 'uploads');
  }

  /**
   * Slideshow MP4 vertical (1080x1920) cu efect Ken Burns pe imaginea socială
   * selectată + audio-ul full, plus un text overlay cu numele destinatarului.
   * Robust: try/catch; dacă ffmpeg lipsește/eșuează → `null`.
   */
  async generateVideo(gen: Generation): Promise<string | null> {
    try {
      const imagePath = await this.resolveImagePath(gen);
      if (!imagePath) {
        this.logger.warn(`generateVideo: nicio imagine sursă pentru gen ${gen.id}`);
        return null;
      }

      const audioPath = await this.resolveAudioPath(gen);
      if (!audioPath) {
        this.logger.warn(`generateVideo: lipsește audio full pe disc pentru gen ${gen.id}`);
        return null;
      }

      const dir = join(this.uploadsDir, 'video', gen.id);
      await mkdir(dir, { recursive: true });
      const outPath = join(dir, 'clip.mp4');

      const font = await this.findFont();
      const args = this.buildArgs(imagePath, audioPath, outPath, gen, font);

      await this.runFfmpeg(args);
      return `/uploads/video/${gen.id}/clip.mp4`;
    } catch (err) {
      this.logger.error(`generateVideo eșuat (gen ${gen.id}): ${(err as Error).message}`);
      return null;
    }
  }

  /** Construiește lista de argumente ffmpeg. */
  private buildArgs(
    imagePath: string,
    audioPath: string,
    outPath: string,
    gen: Generation,
    font: string | null,
  ): string[] {
    // Ken Burns: scalăm la dublu, apoi zoompan de la 1.0 la 1.15 pe durata audio.
    // `-shortest` taie video-ul la lungimea audio-ului (loop de imagine 1 frame).
    // Numărăm frame-urile prin durata reală a audio-ului (necunoscută aici), deci
    // folosim un d mare + -shortest. zoompan are nevoie de un d finit → folosim
    // un orizont generos (30 min @ FPS) și lăsăm -shortest să taie.
    const maxFrames = FPS * 60 * 30; // 30 min cap (audio real e mult mai scurt)
    const zoom = `z='min(zoom+0.0008,1.18)'`;
    const center = `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;

    const filters: string[] = [
      // umple cadrul vertical: scale to cover + crop
      `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase`,
      `crop=${W * 2}:${H * 2}`,
      `zoompan=${zoom}:${center}:d=${maxFrames}:s=${W}x${H}:fps=${FPS}`,
      `format=yuv420p`,
    ];

    // text overlay cu numele (doar dacă avem font valid)
    const name = this.cleanText(gen.recipientName);
    if (font && name) {
      const text = this.escDrawtext(`Pentru ${name}`);
      filters.push(
        `drawtext=fontfile='${font}':text='${text}':fontcolor=white:fontsize=72:` +
          `box=1:boxcolor=black@0.45:boxborderw=24:` +
          `x=(w-text_w)/2:y=h-260`,
      );
    }

    return [
      '-y',
      '-loop', '1',
      '-i', imagePath,
      '-i', audioPath,
      '-vf', filters.join(','),
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-tune', 'stillimage',
      '-crf', '20',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      '-movflags', '+faststart',
      outPath,
    ];
  }

  private async runFfmpeg(args: string[]): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      proc.on('error', (err) => reject(err));
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-600)}`));
      });
    });
  }

  /**
   * Rezolvă imaginea sursă pentru video:
   *  1. `socialImageSelected` (URL sau index — citit defensiv, coloana e adăugată de alt agent)
   *  2. prima imagine din `socialImages` dacă există (coloană viitoare)
   *  3. v1.png din directorul social, dacă a fost generat deja
   *  4. `coverUrl` (de la Suno) dacă e găzduit local
   */
  private async resolveImagePath(gen: Generation): Promise<string | null> {
    const loose = gen as unknown as Record<string, unknown>;

    const candidates: string[] = [];
    const selected = loose['socialImageSelected'];
    if (typeof selected === 'string' && selected) {
      candidates.push(selected);
    }
    const images = loose['socialImages'];
    if (Array.isArray(images) && typeof images[0] === 'string') {
      candidates.push(images[0] as string);
    }
    // fallback la varianta default generată de SocialImageService
    candidates.push(`/uploads/social/${gen.id}/v1.png`);
    if (typeof gen.coverUrl === 'string' && gen.coverUrl) {
      candidates.push(gen.coverUrl);
    }

    for (const c of candidates) {
      const p = this.localPathFromUrl(c);
      if (p && (await this.exists(p))) return p;
    }
    return null;
  }

  /** Audio full pe disc: `/uploads/audio/<id>/full.mp3` (sau din `audioUrl`). */
  private async resolveAudioPath(gen: Generation): Promise<string | null> {
    const candidates: string[] = [];
    if (typeof gen.audioUrl === 'string' && gen.audioUrl) {
      const p = this.localPathFromUrl(gen.audioUrl);
      if (p) candidates.push(p);
    }
    candidates.push(join(this.uploadsDir, 'audio', gen.id, 'full.mp3'));

    for (const p of candidates) {
      if (await this.exists(p)) return p;
    }
    return null;
  }

  /** Convertește un URL `/uploads/...` într-un path local sub `uploadsDir`.
   *  URL-urile externe (http...) sunt ignorate (întoarce null). */
  private localPathFromUrl(url: string): string | null {
    if (!url) return null;
    if (url.startsWith('/uploads/')) {
      return join(this.uploadsDir, url.slice('/uploads/'.length));
    }
    // absolute pe disc deja
    if (url.startsWith('/app/uploads/')) {
      return join(this.uploadsDir, url.slice('/app/uploads/'.length));
    }
    return null;
  }

  private async exists(p: string): Promise<boolean> {
    try {
      await access(p, FS.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  private async findFont(): Promise<string | null> {
    for (const f of FONT_CANDIDATES) {
      if (await this.exists(f)) return f;
    }
    this.logger.warn('Niciun font găsit pentru drawtext — video fără text overlay.');
    return null;
  }

  private cleanText(s: string | null | undefined): string {
    return (s ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  }

  /** Escape pentru filtru drawtext ffmpeg (`:`, `'`, `\`, `%`). */
  private escDrawtext(s: string): string {
    return s
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\\\'")
      .replace(/:/g, '\\:')
      .replace(/%/g, '\\%');
  }
}
