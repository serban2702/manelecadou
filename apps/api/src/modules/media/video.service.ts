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

// Tranziții xfade variate, alese ciclic în funcție de index slide.
const XFADE_TRANSITIONS = [
  'fade',
  'slideleft',
  'wiperight',
  'circleopen',
  'slideup',
  'smoothleft',
  'fadeblack',
  'diagtl',
];

const TRANSITION_DUR = 1.0; // secunde per tranziție xfade
const MIN_SLIDE_DUR = 2.5; // durată minimă per slide (sec)
const MAX_SLIDES = 5; // cap pe nr de slide-uri (cost filtergraph)

@Injectable()
export class VideoService {
  private readonly logger = new Logger('VideoService');
  private readonly uploadsDir: string;

  constructor(private readonly config: ConfigService) {
    this.uploadsDir = this.config.get<string>('UPLOADS_DIR') ?? join(process.cwd(), 'uploads');
  }

  /**
   * Videoclip MP4 vertical (1080x1920) premium: mai multe slide-uri (variantele
   * sociale v1..v4 + fallback) legate cu tranziții xfade, Ken Burns pe fiecare,
   * text overlays elegante (nume, ocazie, brand) cu fade in/out, sincronizate pe
   * durata audio-ului full.
   *
   * Robust: dacă varianta complexă eșuează → fallback la slideshow simplu (o
   * imagine + Ken Burns). `null` doar dacă și fallback-ul eșuează.
   */
  async generateVideo(gen: Generation): Promise<string | null> {
    let dir: string;
    let outPath: string;
    let audioPath: string | null;
    let images: string[];
    let font: string | null;

    try {
      images = await this.resolveImagePaths(gen);
      if (images.length === 0) {
        this.logger.warn(`generateVideo: nicio imagine sursă pentru gen ${gen.id}`);
        return null;
      }

      audioPath = await this.resolveAudioPath(gen);
      if (!audioPath) {
        this.logger.warn(`generateVideo: lipsește audio full pe disc pentru gen ${gen.id}`);
        return null;
      }

      dir = join(this.uploadsDir, 'video', gen.id);
      await mkdir(dir, { recursive: true });
      outPath = join(dir, 'clip.mp4');
      font = await this.findFont();
    } catch (err) {
      this.logger.error(`generateVideo setup eșuat (gen ${gen.id}): ${(err as Error).message}`);
      return null;
    }

    const audioDur = await this.probeDuration(audioPath);

    // 1) Încearcă varianta complexă (multi-slide + xfade) dacă avem >= 2 imagini.
    if (images.length >= 2 && audioDur && audioDur > 0) {
      try {
        const args = this.buildComplexArgs(images, audioPath, outPath, gen, font, audioDur);
        this.logger.log(`generateVideo complex (gen ${gen.id}): ${images.length} slide-uri, ${audioDur.toFixed(1)}s`);
        await this.runFfmpeg(args);
        return `/uploads/video/${gen.id}/clip.mp4`;
      } catch (err) {
        this.logger.warn(
          `generateVideo complex eșuat (gen ${gen.id}), cad pe simplu: ${(err as Error).message}`,
        );
      }
    }

    // 2) Fallback: slideshow simplu (o imagine + Ken Burns) — varianta robustă.
    try {
      const args = this.buildSimpleArgs(images[0], audioPath, outPath, gen, font);
      this.logger.log(`generateVideo simplu (gen ${gen.id})`);
      await this.runFfmpeg(args);
      return `/uploads/video/${gen.id}/clip.mp4`;
    } catch (err) {
      this.logger.error(`generateVideo fallback eșuat (gen ${gen.id}): ${(err as Error).message}`);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VARIANTA COMPLEXĂ
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Construiește filtergraph-ul complex:
   *  - fiecare imagine: scale-to-cover + crop + zoompan (Ken Burns) → slide [vN]
   *  - slide-urile legate prin xfade cu offset cumulativ
   *  - text overlays (nume / ocazie / brand) cu fade in/out
   *
   * Durata totală video ≈ audioDur. Cu N slide-uri și (N-1) tranziții de
   * TRANSITION_DUR fiecare, durata vizibilă a unei imagini per slide e:
   *   slideDur = (audioDur + (N-1)*TRANSITION_DUR) / N
   * (xfade „mănâncă" TRANSITION_DUR din coada slide-ului precedent.)
   */
  private buildComplexArgs(
    images: string[],
    audioPath: string,
    outPath: string,
    gen: Generation,
    font: string | null,
    audioDur: number,
  ): string[] {
    const n = images.length;
    // slideDur ales astfel încât după înlănțuirea xfade durata totală ≈ audioDur.
    let slideDur = (audioDur + (n - 1) * TRANSITION_DUR) / n;
    if (slideDur < MIN_SLIDE_DUR) slideDur = MIN_SLIDE_DUR;
    const slideFrames = Math.max(1, Math.round(slideDur * FPS));

    // Ken Burns: alternăm zoom-in / zoom-out + pan ușor per slide pentru varietate.
    const filterParts: string[] = [];
    for (let i = 0; i < n; i++) {
      const kb = this.kenBurns(i, slideFrames);
      // scale dublu (pentru pan headroom) → crop la dublu → zoompan la W×H.
      filterParts.push(
        `[${i}:v]` +
          `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,` +
          `crop=${W * 2}:${H * 2},` +
          `zoompan=${kb}:d=${slideFrames}:s=${W}x${H}:fps=${FPS},` +
          `setsar=1,format=yuv420p[v${i}]`,
      );
    }

    // Înlănțuire xfade. offset_k = k*(slideDur - TRANSITION_DUR), k=1..n-1.
    // Primul lanț pleacă din [v0]; rezultatul intermediar e [x{k}].
    let lastLabel = 'v0';
    for (let k = 1; k < n; k++) {
      const trans = XFADE_TRANSITIONS[(k - 1) % XFADE_TRANSITIONS.length];
      const offset = (k * (slideDur - TRANSITION_DUR)).toFixed(3);
      const out = k === n - 1 ? 'vbase' : `x${k}`;
      filterParts.push(
        `[${lastLabel}][v${k}]xfade=transition=${trans}:duration=${TRANSITION_DUR}:offset=${offset}[${out}]`,
      );
      lastLabel = out;
    }
    if (n === 1) lastLabel = 'v0'; // nu ajunge aici (complex doar la n>=2), dar safety

    // Durata totală a lanțului xfade.
    const totalDur = slideDur + (n - 1) * (slideDur - TRANSITION_DUR);

    // Text overlays peste rezultatul xfade.
    let videoLabel = lastLabel;
    const drawChain = this.buildDrawtextChain(gen, font, totalDur);
    if (drawChain) {
      filterParts.push(`[${lastLabel}]${drawChain}[vout]`);
      videoLabel = 'vout';
    }

    const filterComplex = filterParts.join(';');

    const args: string[] = ['-y'];
    // Inputuri imagini (loop ca să dureze cât slide-ul) + audio.
    for (const img of images) {
      args.push('-loop', '1', '-t', slideDur.toFixed(3), '-i', img);
    }
    args.push('-i', audioPath);
    const audioIdx = images.length;

    args.push(
      '-filter_complex', filterComplex,
      '-map', `[${videoLabel}]`,
      '-map', `${audioIdx}:a`,
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '20',
      '-pix_fmt', 'yuv420p',
      '-r', String(FPS),
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      '-movflags', '+faststart',
      outPath,
    );
    return args;
  }

  /** Expresie zoompan (Ken Burns) variată per slide: alternativ zoom-in / out + pan. */
  private kenBurns(i: number, frames: number): string {
    const mode = i % 4;
    // increment per frame ca să ajungem la ~1.18 zoom până la finalul slide-ului.
    const inc = (0.18 / Math.max(1, frames)).toFixed(6);
    switch (mode) {
      case 0:
        // zoom-in centrat
        return (
          `z='min(zoom+${inc},1.18)':` +
          `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`
        );
      case 1:
        // zoom-in cu pan spre dreapta-jos
        return (
          `z='min(zoom+${inc},1.18)':` +
          `x='iw/2-(iw/zoom/2)+(on/${frames})*120':` +
          `y='ih/2-(ih/zoom/2)+(on/${frames})*120'`
        );
      case 2:
        // zoom-out lent (pornește zoomat)
        return (
          `z='if(eq(on,0),1.18,max(zoom-${inc},1.0))':` +
          `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`
        );
      default:
        // zoom-in cu pan spre stânga-sus
        return (
          `z='min(zoom+${inc},1.18)':` +
          `x='iw/2-(iw/zoom/2)-(on/${frames})*120':` +
          `y='ih/2-(ih/zoom/2)-(on/${frames})*120'`
        );
    }
  }

  /**
   * Lanț de drawtext cu fade in/out, poziționate estetic și apărând la momente
   * diferite (nu static tot timpul). Întoarce `null` dacă nu avem font.
   */
  private buildDrawtextChain(gen: Generation, font: string | null, totalDur: number): string | null {
    if (!font) return null;

    const name = this.cleanText(gen.recipientName);
    const occasion = this.cleanText(gen.occasion);
    const chain: string[] = [];

    // Helper local pentru a construi un drawtext cu fade in/out pe interval.
    const make = (
      text: string,
      fontsize: number,
      y: string,
      start: number,
      end: number,
    ): string => {
      const esc = this.escDrawtext(text);
      // alpha animat: fade-in 0.5s la start, fade-out 0.5s la end, opac între.
      const fi = 0.5;
      const fo = 0.5;
      const alpha =
        `if(lt(t,${start.toFixed(2)}),0,` +
        `if(lt(t,${(start + fi).toFixed(2)}),(t-${start.toFixed(2)})/${fi},` +
        `if(lt(t,${(end - fo).toFixed(2)}),1,` +
        `if(lt(t,${end.toFixed(2)}),(${end.toFixed(2)}-t)/${fo},0))))`;
      return (
        `drawtext=fontfile='${font}':text='${esc}':` +
        `fontcolor=white:fontsize=${fontsize}:` +
        `borderw=4:bordercolor=black@0.7:` +
        `shadowx=2:shadowy=2:shadowcolor=black@0.6:` +
        `x=(w-text_w)/2:y=${y}:` +
        `alpha='${alpha}':` +
        `enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`
      );
    };

    // 1) „Pentru <nume>" — apare devreme, sus-centru.
    if (name) {
      const start = 0.6;
      const end = Math.min(totalDur - 0.5, 5.0);
      if (end > start + 1) {
        chain.push(make(`Pentru ${name}`, 84, 'h*0.18', start, end));
      }
    }

    // 2) Ocazia — la mijloc, jos-centru.
    if (occasion) {
      const start = Math.min(totalDur * 0.4, totalDur - 4);
      const end = Math.min(totalDur - 0.5, start + 4);
      if (end > start + 1) {
        chain.push(make(occasion, 64, 'h-360', start, end));
      }
    }

    // 3) Brand „manelecadou.ro" — finalul clipului, jos-centru.
    {
      const end = totalDur - 0.4;
      const start = Math.max(0.5, end - 4);
      if (end > start + 1) {
        chain.push(make('manelecadou.ro', 56, 'h-220', start, end));
      }
    }

    if (chain.length === 0) return null;
    return chain.join(',');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VARIANTA SIMPLĂ (FALLBACK)
  // ─────────────────────────────────────────────────────────────────────────

  /** Slideshow simplu: o imagine + Ken Burns + text static. Robust, vechi-stabil. */
  private buildSimpleArgs(
    imagePath: string,
    audioPath: string,
    outPath: string,
    gen: Generation,
    font: string | null,
  ): string[] {
    const maxFrames = FPS * 60 * 30; // 30 min cap (audio real e mult mai scurt)
    const zoom = `z='min(zoom+0.0008,1.18)'`;
    const center = `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;

    const filters: string[] = [
      `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase`,
      `crop=${W * 2}:${H * 2}`,
      `zoompan=${zoom}:${center}:d=${maxFrames}:s=${W}x${H}:fps=${FPS}`,
      `setsar=1`,
      `format=yuv420p`,
    ];

    const name = this.cleanText(gen.recipientName);
    if (font && name) {
      const text = this.escDrawtext(`Pentru ${name}`);
      filters.push(
        `drawtext=fontfile='${font}':text='${text}':fontcolor=white:fontsize=72:` +
          `box=1:boxcolor=black@0.45:boxborderw=24:` +
          `x=(w-text_w)/2:y=h-260`,
      );
    }
    if (font) {
      const brand = this.escDrawtext('manelecadou.ro');
      filters.push(
        `drawtext=fontfile='${font}':text='${brand}':fontcolor=white:fontsize=52:` +
          `borderw=3:bordercolor=black@0.7:x=(w-text_w)/2:y=h-150`,
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

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERE
  // ─────────────────────────────────────────────────────────────────────────

  private async runFfmpeg(args: string[]): Promise<void> {
    this.logger.debug(`ffmpeg ${args.join(' ')}`);
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      proc.on('error', (err) => reject(err));
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-800)}`));
      });
    });
  }

  /** Durata în secunde a unui fișier media via ffprobe; `null` la eșec. */
  private async probeDuration(path: string): Promise<number | null> {
    try {
      const out = await new Promise<string>((resolve, reject) => {
        const proc = spawn(
          'ffprobe',
          [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            path,
          ],
          { stdio: ['ignore', 'pipe', 'pipe'] },
        );
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (c: Buffer) => (stdout += c.toString()));
        proc.stderr.on('data', (c: Buffer) => (stderr += c.toString()));
        proc.on('error', (err) => reject(err));
        proc.on('close', (code) => {
          if (code === 0) resolve(stdout.trim());
          else reject(new Error(`ffprobe exit ${code}: ${stderr.slice(-300)}`));
        });
      });
      const dur = Number.parseFloat(out);
      return Number.isFinite(dur) && dur > 0 ? dur : null;
    } catch (err) {
      this.logger.warn(`probeDuration eșuat (${path}): ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Rezolvă lista de imagini sursă (slide-uri) pentru video, în ordine:
   *  1. variantele sociale v1..v4 pe disc (`/uploads/social/<id>/vN.png`)
   *  2. `socialImageSelected` (URL sau path — coloană adăugată de alt agent)
   *  3. prima imagine din `socialImages` (coloană viitoare)
   *  4. `coverUrl` (de la Suno) dacă e găzduit local
   * Deduplichează și păstrează max MAX_SLIDES.
   */
  private async resolveImagePaths(gen: Generation): Promise<string[]> {
    const loose = gen as unknown as Record<string, unknown>;
    const candidates: string[] = [];

    // 1) variantele sociale generate v1..v4
    for (let idx = 1; idx <= 4; idx++) {
      candidates.push(`/uploads/social/${gen.id}/v${idx}.png`);
    }

    // 2) selecția explicită (dacă există) — o punem și prima ca prioritate vizuală
    const selected = loose['socialImageSelected'];
    if (typeof selected === 'string' && selected) candidates.unshift(selected);

    // 3) array socialImages
    const images = loose['socialImages'];
    if (Array.isArray(images)) {
      for (const im of images) {
        if (typeof im === 'string' && im) candidates.push(im);
      }
    }

    // 4) cover
    if (typeof gen.coverUrl === 'string' && gen.coverUrl) candidates.push(gen.coverUrl);

    const resolved: string[] = [];
    const seen = new Set<string>();
    for (const c of candidates) {
      const p = this.localPathFromUrl(c);
      if (!p || seen.has(p)) continue;
      if (await this.exists(p)) {
        seen.add(p);
        resolved.push(p);
        if (resolved.length >= MAX_SLIDES) break;
      }
    }
    return resolved;
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
