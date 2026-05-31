import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { access, mkdir, writeFile, rm } from 'node:fs/promises';
import { constants as FS } from 'node:fs';
import { join } from 'node:path';

import type { Generation } from '../generations/generation.entity';
import { RemoteMediaClient } from './remote-media.client';

/** Opțiuni per-track pentru generateVideo. Permite generarea unui clip pentru
 *  versiunea alternativă a melodiei (ex. bonus.mp3 → clip2.mp4) cu aceleași
 *  imagini sociale. Interfața `IGenerationMediaService.generateVideo(gen)`
 *  rămâne compatibilă deoarece `opts` e opțional. */
export interface GenerateVideoOpts {
  /** Path/URL audio explicit (default: /uploads/audio/<id>/full.mp3). */
  audioPath?: string;
  /** Numele fișierului de output (default: clip.mp4). */
  outName?: string;
  /** Start (sec) al segmentului de audio de folosit (ex. începutul refrenului).
   *  Când e dat împreună cu `durationSec`, audio-ul e trim-uit și clipul devine
   *  scurt (stil TikTok) — slide-uri rapide pe ~20s. */
  startSec?: number;
  /** Durata (sec) a segmentului / a clipului scurt. */
  durationSec?: number;
}

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

// Tranziții xfade variate și „punchy", alese ciclic în funcție de index slide.
// Mix de slide / wipe / circle / zoom / dissolve pentru senzație dinamică.
const XFADE_TRANSITIONS = [
  'slideleft',
  'circleopen',
  'wiperight',
  'zoomin',
  'slideup',
  'diagtl',
  'dissolve',
  'smoothright',
  'circleclose',
  'wipeup',
];

const TRANSITION_DUR = 0.7; // secunde per tranziție xfade (mai scurt = mai punchy)
const MIN_SLIDE_DUR = 1.8; // durată minimă per slide (sec) — slide-uri scurte = dinamic
const MAX_SLIDE_DUR = 4.0; // durată maximă per slide (sec) — forțează schimbări dese
const TARGET_SLIDES = 5; // țintă de slide-uri (4 imagini + repetiție/al 5-lea cadru)
const MAX_SLIDES = 5; // cap pe nr de slide-uri (cost filtergraph)

// Lățimea „sigură" pentru text (marje laterale): ~90% din W.
const TEXT_SAFE_W = Math.floor(W * 0.9);
// Factor empiric lățime/caracter pentru fonturi bold (≈0.58 * fontsize per char).
const CHAR_WIDTH_FACTOR = 0.58;
// Limită inferioară rezonabilă pentru fontsize (texte foarte lungi).
const MIN_FONTSIZE = 34;

type DrawKind = 'name' | 'occasion' | 'brand';

/** Un fișier temporar cu text pentru `textfile=` (safe pe diacritice/apostrof),
 *  + textul original (pentru calculul fontsize) + categoria. */
interface DrawTextFile {
  kind: DrawKind;
  path: string;
  text: string;
}

@Injectable()
export class VideoService {
  private readonly logger = new Logger('VideoService');
  private readonly uploadsDir: string;

  constructor(
    private readonly config: ConfigService,
    private readonly remote: RemoteMediaClient,
  ) {
    this.uploadsDir = this.config.get<string>('UPLOADS_DIR') ?? join(process.cwd(), 'uploads');
  }

  /**
   * Încearcă să randeze clipul pe microserviciul Hetzner. Rezolvă imaginile +
   * audio de pe disc (aceiași helperi ca randarea locală), apelează
   * `/render/clip`, salvează mp4-ul la `/uploads/video/<id>/<outName>` și
   * întoarce URL-ul. La orice eșec întoarce `null` → caller-ul face fallback
   * la randarea LOCALĂ (ffmpeg). Nu aruncă niciodată.
   */
  private async tryRemoteVideo(
    gen: Generation,
    opts: GenerateVideoOpts | undefined,
    outName: string,
  ): Promise<string | null> {
    try {
      const images = await this.resolveImagePaths(gen);
      if (images.length === 0) return null;

      const audioPath = await this.resolveAudioPath(gen, opts?.audioPath);
      if (!audioPath) return null;

      const buffer = await this.remote.renderClip({
        audioPath,
        imagePaths: images,
        recipientName: this.cleanText(gen.recipientName),
        occasion: this.cleanText(gen.occasion),
        startSec: opts?.startSec,
        durationSec: opts?.durationSec,
      });

      const dir = join(this.uploadsDir, 'video', gen.id);
      await mkdir(dir, { recursive: true });
      const outPath = join(dir, outName);
      await writeFile(outPath, buffer);

      this.logger.log(`generateVideo remote (gen ${gen.id}, ${outName})`);
      return `/uploads/video/${gen.id}/${outName}`;
    } catch (err) {
      this.logger.warn(
        `generateVideo remote eșuat (gen ${gen.id}, ${outName}), cad pe randare locală: ${(err as Error).message}`,
      );
      return null;
    }
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
  async generateVideo(gen: Generation, opts?: GenerateVideoOpts): Promise<string | null> {
    let dir: string;
    let outPath: string;
    let audioPath: string | null;
    let images: string[];
    let font: string | null;

    const outName = this.sanitizeOutName(opts?.outName) ?? 'clip.mp4';

    // 0) Dacă microserviciul Hetzner e configurat, randăm acolo (descărcăm CPU
    //    de pe Ionos). La eșec → cad pe randarea LOCALĂ ffmpeg de mai jos.
    if (this.remote.isEnabled()) {
      const remoteUrl = await this.tryRemoteVideo(gen, opts, outName);
      if (remoteUrl) return remoteUrl;
    }

    // Fișiere temporare pentru drawtext (textfile= e mai sigur cu diacritice/apostrof).
    const tmpFiles: string[] = [];

    try {
      images = await this.resolveImagePaths(gen);
      if (images.length === 0) {
        this.logger.warn(`generateVideo: nicio imagine sursă pentru gen ${gen.id}`);
        return null;
      }

      audioPath = await this.resolveAudioPath(gen, opts?.audioPath);
      if (!audioPath) {
        this.logger.warn(`generateVideo: lipsește audio pe disc pentru gen ${gen.id}`);
        return null;
      }

      dir = join(this.uploadsDir, 'video', gen.id);
      await mkdir(dir, { recursive: true });
      outPath = join(dir, outName);
      font = await this.findFont();
    } catch (err) {
      this.logger.error(`generateVideo setup eșuat (gen ${gen.id}): ${(err as Error).message}`);
      return null;
    }

    // Segment „refren" (clip scurt stil TikTok): trim audio la [startSec, +durationSec]
    // și forțăm durata clipului la durationSec (slide-uri rapide pe ~20s).
    const hasSegment =
      typeof opts?.startSec === 'number' &&
      typeof opts?.durationSec === 'number' &&
      opts.durationSec > 0;
    const segStart = hasSegment ? Math.max(0, opts!.startSec!) : 0;
    const segDur = hasSegment ? opts!.durationSec! : 0;

    const probedDur = await this.probeDuration(audioPath);
    // La clip scurt, durata video = durata segmentului; altfel durata audio full.
    const audioDur = hasSegment ? segDur : probedDur;

    try {
      // Expandăm la TARGET_SLIDES (repetăm imagini cu efecte diferite dacă <5).
      const slides = this.expandSlides(images, TARGET_SLIDES);

      // 1) Încearcă varianta complexă (multi-slide + xfade) dacă avem >= 2 slide-uri.
      if (slides.length >= 2 && audioDur && audioDur > 0) {
        try {
          const drawFiles = await this.writeDrawtextFiles(dir, gen, outName);
          tmpFiles.push(...drawFiles.map((d) => d.path));
          const args = this.buildComplexArgs(
            slides,
            audioPath,
            outPath,
            drawFiles,
            font,
            audioDur,
            hasSegment ? { startSec: segStart, durationSec: segDur } : undefined,
          );
          this.logger.log(
            `generateVideo complex (gen ${gen.id}, ${outName}): ${slides.length} slide-uri, ${audioDur.toFixed(1)}s${
              hasSegment ? ` [refren ${segStart.toFixed(1)}s+${segDur.toFixed(1)}s]` : ''
            }`,
          );
          await this.runFfmpeg(args);
          return `/uploads/video/${gen.id}/${outName}`;
        } catch (err) {
          this.logger.warn(
            `generateVideo complex eșuat (gen ${gen.id}, ${outName}), cad pe simplu: ${(err as Error).message}`,
          );
        }
      }

      // 2) Fallback: slideshow simplu (o imagine + Ken Burns) — varianta robustă.
      try {
        const drawFiles = await this.writeDrawtextFiles(dir, gen, `${outName}.simple`);
        tmpFiles.push(...drawFiles.map((d) => d.path));
        const args = this.buildSimpleArgs(
          images[0],
          audioPath,
          outPath,
          drawFiles,
          font,
          hasSegment ? { startSec: segStart, durationSec: segDur } : undefined,
        );
        this.logger.log(`generateVideo simplu (gen ${gen.id}, ${outName})`);
        await this.runFfmpeg(args);
        return `/uploads/video/${gen.id}/${outName}`;
      } catch (err) {
        this.logger.error(
          `generateVideo fallback eșuat (gen ${gen.id}, ${outName}): ${(err as Error).message}`,
        );
        return null;
      }
    } finally {
      // Curăță fișierele temp drawtext (best-effort).
      for (const f of tmpFiles) {
        await rm(f, { force: true }).catch(() => undefined);
      }
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
    drawFiles: DrawTextFile[],
    font: string | null,
    audioDur: number,
    segment?: { startSec: number; durationSec: number },
  ): string[] {
    const n = images.length;
    // slideDur ales astfel încât după înlănțuirea xfade durata totală ≈ audioDur.
    let slideDur = (audioDur + (n - 1) * TRANSITION_DUR) / n;
    // Clamp. Pentru clipul scurt (refren) NU aplicăm clamp-ul MAX/MIN obișnuit —
    // vrem să umplem fix durata segmentului cu slide-uri rapide (~4s fiecare pe 20s).
    if (!segment) {
      if (slideDur < MIN_SLIDE_DUR) slideDur = MIN_SLIDE_DUR;
      if (slideDur > MAX_SLIDE_DUR) slideDur = MAX_SLIDE_DUR;
    } else if (slideDur < 1.2) {
      slideDur = 1.2; // floor pentru a păstra xfade-ul valid
    }
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
    const drawChain = this.buildDrawtextChain(drawFiles, font, totalDur);
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
    // Audio: dacă avem segment (refren), trim-uim cu seek pe input (-ss) + durată (-t).
    if (segment) {
      args.push('-ss', segment.startSec.toFixed(3), '-t', segment.durationSec.toFixed(3));
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

  /** Expresie zoompan (Ken Burns) MAI pronunțată, variată per slide: alternativ
   *  zoom-in / zoom-out + pan amplu în 5 direcții pentru senzația de mișcare. */
  private kenBurns(i: number, frames: number): string {
    const mode = i % 5;
    // zoom max mai mare (1.30) → mișcare mai vizibilă decât 1.18.
    const inc = (0.30 / Math.max(1, frames)).toFixed(6);
    const pan = 220; // amplitudine pan (px) — mai mare = mai dinamic
    switch (mode) {
      case 0:
        // zoom-in cu pan spre dreapta-jos
        return (
          `z='min(zoom+${inc},1.30)':` +
          `x='iw/2-(iw/zoom/2)+(on/${frames})*${pan}':` +
          `y='ih/2-(ih/zoom/2)+(on/${frames})*${pan}'`
        );
      case 1:
        // zoom-out amplu (pornește zoomat) cu pan spre stânga
        return (
          `z='if(eq(on,0),1.30,max(zoom-${inc},1.02))':` +
          `x='iw/2-(iw/zoom/2)-(on/${frames})*${pan}':` +
          `y='ih/2-(ih/zoom/2)'`
        );
      case 2:
        // zoom-in cu pan spre stânga-sus
        return (
          `z='min(zoom+${inc},1.30)':` +
          `x='iw/2-(iw/zoom/2)-(on/${frames})*${pan}':` +
          `y='ih/2-(ih/zoom/2)-(on/${frames})*${pan}'`
        );
      case 3:
        // zoom-in cu pan spre dreapta-sus
        return (
          `z='min(zoom+${inc},1.30)':` +
          `x='iw/2-(iw/zoom/2)+(on/${frames})*${pan}':` +
          `y='ih/2-(ih/zoom/2)-(on/${frames})*${pan}'`
        );
      default:
        // zoom-out cu pan spre dreapta-jos
        return (
          `z='if(eq(on,0),1.30,max(zoom-${inc},1.02))':` +
          `x='iw/2-(iw/zoom/2)+(on/${frames})*${pan}':` +
          `y='ih/2-(ih/zoom/2)+(on/${frames})*${pan}'`
        );
    }
  }

  /**
   * Lanț de drawtext cu fade in/out, poziționate estetic și apărând la momente
   * diferite (nu static tot timpul). Folosește `textfile=` (diacritice/apostrof
   * safe) și fontsize auto-scalat ca textul să încapă mereu în cadru.
   * Întoarce `null` dacă nu avem font sau nimic de afișat.
   */
  private buildDrawtextChain(
    drawFiles: DrawTextFile[],
    font: string | null,
    totalDur: number,
  ): string | null {
    if (!font || drawFiles.length === 0) return null;

    const chain: string[] = [];

    // Helper local pentru un drawtext cu fade in/out + fontsize încadrat în cadru.
    const make = (df: DrawTextFile, baseSize: number, y: string, start: number, end: number): string => {
      const fontsize = this.fitFontSize(df.text, baseSize);
      // alpha animat: fade-in 0.5s la start, fade-out 0.5s la end, opac între.
      const fi = 0.5;
      const fo = 0.5;
      const alpha =
        `if(lt(t,${start.toFixed(2)}),0,` +
        `if(lt(t,${(start + fi).toFixed(2)}),(t-${start.toFixed(2)})/${fi},` +
        `if(lt(t,${(end - fo).toFixed(2)}),1,` +
        `if(lt(t,${end.toFixed(2)}),(${end.toFixed(2)}-t)/${fo},0))))`;
      return (
        `drawtext=fontfile='${this.escPath(font)}':textfile='${this.escPath(df.path)}':` +
        `fontcolor=white:fontsize=${fontsize}:` +
        `borderw=4:bordercolor=black@0.7:` +
        `shadowx=2:shadowy=2:shadowcolor=black@0.6:` +
        // auto-centrat orizontal; expr clamp pe x în caz extrem ca textul să nu iasă.
        `x='max(20,(w-text_w)/2)':y=${y}:` +
        `alpha='${alpha}':` +
        `enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`
      );
    };

    const byKind = (k: DrawKind) => drawFiles.find((d) => d.kind === k);

    // 1) „Pentru <nume>" — apare devreme, sus-centru.
    const nameDf = byKind('name');
    if (nameDf) {
      const start = 0.6;
      const end = Math.min(totalDur - 0.5, 5.0);
      if (end > start + 1) chain.push(make(nameDf, 84, 'h*0.18', start, end));
    }

    // 2) Ocazia — la mijloc, jos-centru.
    const occDf = byKind('occasion');
    if (occDf) {
      const start = Math.min(totalDur * 0.4, totalDur - 4);
      const end = Math.min(totalDur - 0.5, start + 4);
      if (end > start + 1) chain.push(make(occDf, 64, 'h-360', start, end));
    }

    // 3) Brand „manelecadou.ro" — finalul clipului, jos-centru.
    const brandDf = byKind('brand');
    if (brandDf) {
      const end = totalDur - 0.4;
      const start = Math.max(0.5, end - 4);
      if (end > start + 1) chain.push(make(brandDf, 56, 'h-220', start, end));
    }

    if (chain.length === 0) return null;
    return chain.join(',');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VARIANTA SIMPLĂ (FALLBACK)
  // ─────────────────────────────────────────────────────────────────────────

  /** Slideshow simplu: o imagine + Ken Burns + text static încadrat. Robust. */
  private buildSimpleArgs(
    imagePath: string,
    audioPath: string,
    outPath: string,
    drawFiles: DrawTextFile[],
    font: string | null,
    segment?: { startSec: number; durationSec: number },
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

    if (font) {
      const nameDf = drawFiles.find((d) => d.kind === 'name');
      if (nameDf) {
        const fontsize = this.fitFontSize(nameDf.text, 72);
        filters.push(
          `drawtext=fontfile='${this.escPath(font)}':textfile='${this.escPath(nameDf.path)}':` +
            `fontcolor=white:fontsize=${fontsize}:` +
            `box=1:boxcolor=black@0.45:boxborderw=24:` +
            `x='max(20,(w-text_w)/2)':y=h-260`,
        );
      }
      const brandDf = drawFiles.find((d) => d.kind === 'brand');
      if (brandDf) {
        const fontsize = this.fitFontSize(brandDf.text, 52);
        filters.push(
          `drawtext=fontfile='${this.escPath(font)}':textfile='${this.escPath(brandDf.path)}':` +
            `fontcolor=white:fontsize=${fontsize}:` +
            `borderw=3:bordercolor=black@0.7:x='max(20,(w-text_w)/2)':y=h-150`,
        );
      }
    }

    const args = ['-y', '-loop', '1', '-i', imagePath];
    // Audio: trim la segment (refren) dacă e dat.
    if (segment) {
      args.push('-ss', segment.startSec.toFixed(3), '-t', segment.durationSec.toFixed(3));
    }
    args.push(
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
    );
    return args;
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

  /**
   * Audio pe disc. Dacă `override` e dat (ex. al doilea track `bonus.mp3` ca
   * URL `/uploads/audio/<id>/bonus.mp3` sau path absolut), îl folosim prioritar.
   * Altfel: `gen.audioUrl` → `/uploads/audio/<id>/full.mp3`.
   */
  private async resolveAudioPath(gen: Generation, override?: string): Promise<string | null> {
    const candidates: string[] = [];

    if (typeof override === 'string' && override) {
      // Suportă atât URL `/uploads/...` cât și path absolut pe disc.
      const fromUrl = this.localPathFromUrl(override);
      if (fromUrl) candidates.push(fromUrl);
      else candidates.push(override);
    }

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

  /**
   * Calculează un fontsize care garantează încadrarea textului în TEXT_SAFE_W
   * (~90% din 1080px). Pentru texte lungi scade proporțional, cu limită
   * inferioară MIN_FONTSIZE. Formulă: lățime estimată = len*factor*fontsize.
   *   maxFit = TEXT_SAFE_W / (len * CHAR_WIDTH_FACTOR)
   */
  private fitFontSize(text: string, base: number): number {
    const len = Math.max(1, text.length);
    const maxFit = Math.floor(TEXT_SAFE_W / (len * CHAR_WIDTH_FACTOR));
    const size = Math.min(base, maxFit);
    return Math.max(MIN_FONTSIZE, size);
  }

  /**
   * Scrie fișierele temp pentru `textfile=` (drawtext). Conținutul e textul brut
   * (UTF-8) — ffmpeg `textfile` nu cere escape de `:`/`'`, doar `%` și `\` sunt
   * interpretate; le escapăm. Diacriticele trec nealterate (font Noto le acoperă).
   */
  private async writeDrawtextFiles(
    dir: string,
    gen: Generation,
    suffix: string,
  ): Promise<DrawTextFile[]> {
    const safeSuffix = suffix.replace(/[^a-zA-Z0-9._-]/g, '_');
    const out: DrawTextFile[] = [];

    const name = this.cleanText(gen.recipientName);
    const occasion = this.cleanText(gen.occasion);

    const entries: Array<{ kind: DrawKind; text: string }> = [];
    if (name) entries.push({ kind: 'name', text: `Pentru ${name}` });
    if (occasion) entries.push({ kind: 'occasion', text: occasion });
    entries.push({ kind: 'brand', text: 'manelecadou.ro' });

    for (const e of entries) {
      const path = join(dir, `.dt-${e.kind}-${safeSuffix}.txt`);
      await writeFile(path, this.escTextFile(e.text), 'utf8');
      out.push({ kind: e.kind, path, text: e.text });
    }
    return out;
  }

  /** Escape minimal pentru conținut `textfile=` (doar `\` și `%` sunt speciale). */
  private escTextFile(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%');
  }

  /** Escape path-uri folosite în opțiuni drawtext (`fontfile=`, `textfile=`). */
  private escPath(p: string): string {
    return p.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
  }

  /**
   * Expandează lista de imagini la `target` slide-uri repetând ciclic imaginile
   * disponibile (cele 4 v1..v4 + un al 5-lea cadru = repetă v1 cu alt efect KB).
   * Dacă avem deja >= target, păstrăm primele `target`.
   */
  private expandSlides(images: string[], target: number): string[] {
    if (images.length === 0) return [];
    if (images.length >= target) return images.slice(0, target);
    const out: string[] = [];
    for (let i = 0; i < target; i++) {
      out.push(images[i % images.length]);
    }
    return out;
  }

  /** Validează `outName` pentru a evita path traversal; întoarce null dacă invalid. */
  private sanitizeOutName(name?: string): string | null {
    if (!name) return null;
    const base = name.trim();
    if (!base || base.includes('/') || base.includes('\\') || base.includes('..')) return null;
    if (!/^[a-zA-Z0-9._-]+\.mp4$/.test(base)) return null;
    return base;
  }
}
