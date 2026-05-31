import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

import { VideoCollage, CollageTrack } from './video-collage.entity';
import { CollageUploadService } from './collage-upload.service';
import {
  COLLAGE_QUEUE,
  SLIDE_DURATION_SEC,
  TRANSITION_SEC,
  TRANSITIONS,
  ASPECT_DIMS,
  normalizeAspect,
} from './collage.constants';
import { Generation } from '../generations/generation.entity';
import { GuestSession } from '../guest-sessions/guest-session.entity';
import { User } from '../users/user.entity';
import { SitesService } from '../sites/sites.service';
import { RemoteMediaClient } from '../media/remote-media.client';
import { MailerService } from '../../mailer/mailer.module';
import { renderBrandedEmail } from '../../mailer/templates/templates';
import { brandingFromSite } from '../../mailer/branding';

/**
 * Filtru ffmpeg de tip LETTERBOX: scalează imaginea ca să încapă ÎNTREAGĂ în
 * canvas-ul w×h (fără crop, păstrează raportul original) și umple restul cu
 * negru. Înlocuiește vechiul scale+crop (cover) care tăia din imagine.
 */
function letterbox(w: number, h: number): string {
  return (
    `scale=${w}:${h}:force_original_aspect_ratio=decrease,` +
    `pad=${w}:${h}:-1:-1:color=black,setsar=1,fps=30,format=yuv420p`
  );
}

/**
 * Worker care montează colajul video. concurrency: 1 — ffmpeg cu xfade pe multe
 * inputuri e CPU-heavy; nu vrem să rulăm mai multe simultan pe VPS-ul mic.
 */
@Processor(COLLAGE_QUEUE, { concurrency: 1 })
export class CollageProcessor extends WorkerHost {
  private readonly logger = new Logger('CollageProcessor');
  private readonly uploadsDir: string;

  constructor(
    @InjectRepository(VideoCollage) private readonly repo: Repository<VideoCollage>,
    @InjectRepository(Generation) private readonly generations: Repository<Generation>,
    @InjectRepository(GuestSession) private readonly guests: Repository<GuestSession>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly upload: CollageUploadService,
    private readonly sites: SitesService,
    private readonly remote: RemoteMediaClient,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {
    super();
    this.uploadsDir =
      this.config.get<string>('UPLOADS_DIR') ?? join(process.cwd(), 'uploads');
  }

  async process(job: Job<{ collageId: string }>): Promise<void> {
    const { collageId } = job.data;
    const collage = await this.repo.findOne({ where: { id: collageId } });
    if (!collage) {
      this.logger.warn(`collage ${collageId} not found`);
      return;
    }
    if (collage.status === 'succeeded') {
      this.logger.log(`collage ${collageId} already done; skipping`);
      return;
    }

    try {
      await this.repo.update({ id: collageId }, { status: 'processing' });

      const gen = await this.generations.findOne({ where: { id: collage.generationId } });
      if (!gen) throw new Error('generation not found');

      const audioPath = this.audioPathFor(gen, collage.track);
      const audioExists = await this.fileExists(audioPath);
      if (!audioExists) throw new Error(`audio file missing: ${audioPath}`);

      const dir = this.upload.dirFor(collageId);
      const aspect = normalizeAspect(collage.aspect);
      const { w, h } = ASPECT_DIMS[aspect];

      const audioDuration = await this.probeDuration(audioPath);
      if (!audioDuration || audioDuration <= 0) {
        throw new Error('could not probe audio duration');
      }

      const outPath = join(dir, 'collage.mp4');

      // ── image_video: o SINGURĂ imagine statică (poza de share aleasă) pe toată
      //    durata melodiei, letterbox. Randare locală (cost mic). ───────────────
      if (collage.kind === 'image_video') {
        await fs.mkdir(dir, { recursive: true });
        const imgPath = await this.resolveSourceImage(collage, dir);
        if (!imgPath) throw new Error('source image missing for image_video');
        await this.renderStaticImage(imgPath, audioPath, audioDuration, outPath, w, h);
      } else {
        // ── collage: slideshow din imaginile uploadate ──────────────────────────
        const images = await this.listImages(dir);
        if (images.length === 0) throw new Error('no images on disk');

        // Ordinea: pasul 1 = toate în ordine; pașii următori = shuffle nou de
        // fiecare dată. Repetăm până acoperim audio-ul.
        const sequence = this.buildSequence(images, audioDuration);

        // 0) Microserviciul Hetzner (descarcă ffmpeg-ul de pe Ionos). La eșec →
        //    fallback la randarea LOCALĂ ffmpeg (xfade → simple concat).
        let renderedRemote = false;
        if (this.remote.isEnabled()) {
          renderedRemote = await this.tryRemoteCollage(gen, audioPath, images, outPath, collageId, aspect);
        }

        if (!renderedRemote) {
          try {
            await this.renderXfade(sequence, audioPath, audioDuration, outPath, w, h);
          } catch (xfadeErr) {
            this.logger.warn(
              `collage ${collageId.slice(0, 8)} xfade failed (${(xfadeErr as Error).message.slice(0, 200)}); falling back to simple concat`,
            );
            await this.renderSimple(sequence, audioPath, audioDuration, outPath, w, h);
          }
        }
      }

      const videoUrl = `/uploads/collage/${collageId}/collage.mp4`;
      await this.repo.update(
        { id: collageId },
        { status: 'succeeded', videoUrl, completedAt: new Date(), error: null },
      );

      await this.notifyOwner(collage, gen).catch((e) =>
        this.logger.warn(`collage ${collageId.slice(0, 8)} email failed: ${(e as Error).message}`),
      );

      this.logger.log(
        `collage ${collageId.slice(0, 8)} done: kind=${collage.kind} aspect=${aspect} over ${Math.round(audioDuration)}s`,
      );
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      this.logger.error(`collage ${collageId.slice(0, 8)} failed: ${msg}`);
      // Graceful: marcăm failed, NU re-aruncăm (job-ul are attempts:1 oricum).
      await this.repo
        .update(
          { id: collageId },
          { status: 'failed', error: msg.slice(0, 2000), completedAt: new Date() },
        )
        .catch(() => {});
    }
  }

  // ============== Helpers ==============

  private audioPathFor(gen: Generation, track: CollageTrack): string {
    const name = track === 'bonus' ? 'bonus.mp3' : 'full.mp3';
    return join(this.uploadsDir, 'audio', gen.id, name);
  }

  /**
   * Încearcă să randeze colajul pe microserviciul Hetzner (`/render/collage`) și
   * scrie mp4-ul la `outPath`. Întoarce `true` la succes, `false` la orice eșec
   * (caller-ul cade pe ffmpeg local). Nu aruncă niciodată.
   */
  private async tryRemoteCollage(
    gen: Generation,
    audioPath: string,
    imagePaths: string[],
    outPath: string,
    collageId: string,
    aspect: string,
  ): Promise<boolean> {
    try {
      const buffer = await this.remote.renderCollage({
        audioPath,
        imagePaths,
        recipientName: gen.recipientName || undefined,
        aspect,
      });
      await fs.writeFile(outPath, buffer);
      this.logger.log(`collage ${collageId.slice(0, 8)} rendered remote (Hetzner)`);
      return true;
    } catch (err) {
      this.logger.warn(
        `collage ${collageId.slice(0, 8)} remote failed (${(err as Error).message.slice(0, 200)}); falling back to local ffmpeg`,
      );
      return false;
    }
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  /** Listează img_*.* din directorul colajului, sortat (ordinea de upload). */
  private async listImages(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir);
    return entries
      .filter((f) => /^img_\d+\.(png|jpe?g|webp|gif)$/i.test(f))
      .sort()
      .map((f) => join(dir, f));
  }

  /**
   * Pentru kind='image_video': rezolvă imaginea sursă (poza de share aleasă) de
   * pe disc. `sourceImageUrl` e un URL `/uploads/...`; îl mapăm la path local.
   * Fallback: dacă a fost copiată în dir-ul colajului ca img_001, o folosim.
   */
  private async resolveSourceImage(collage: VideoCollage, dir: string): Promise<string | null> {
    const url = collage.sourceImageUrl ?? '';
    const fromUrl = this.localPathFromUrl(url);
    if (fromUrl && (await this.fileExists(fromUrl))) return fromUrl;
    // Fallback: prima imagine copiată în dir-ul colajului.
    const imgs = await this.listImages(dir).catch(() => [] as string[]);
    return imgs[0] ?? null;
  }

  /** URL `/uploads/...` (sau `/app/uploads/...`) → path absolut sub uploadsDir. */
  private localPathFromUrl(url: string): string | null {
    if (!url) return null;
    if (url.startsWith('/uploads/')) return join(this.uploadsDir, url.slice('/uploads/'.length));
    if (url.startsWith('/app/uploads/')) return join(this.uploadsDir, url.slice('/app/uploads/'.length));
    return null;
  }

  /**
   * Randare image_video: o singură imagine statică, letterbox, pe toată durata
   * melodiei. Cost mic (o imagine + audio copy) → mereu local, fără Hetzner.
   */
  private async renderStaticImage(
    imagePath: string,
    audioPath: string,
    audioDuration: number,
    outPath: string,
    w: number,
    h: number,
  ): Promise<void> {
    const args = [
      '-y',
      '-loop', '1',
      '-i', imagePath,
      '-i', audioPath,
      '-filter_complex', `[0:v]${letterbox(w, h)}[v]`,
      '-map', '[v]',
      '-map', '1:a',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'veryfast',
      '-tune', 'stillimage',
      '-r', '30',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      '-t', audioDuration.toFixed(3),
      '-shortest',
      outPath,
    ];
    await this.runFfmpeg(args);
  }

  /**
   * Construiește secvența de afișare:
   *  - Pasul 1: imaginile în ordinea de upload.
   *  - Pașii următori: shuffle Fisher-Yates NOU de fiecare dată.
   *  Repetă până când timpul acoperit (slide_dur × nr slides) ≥ durata audio.
   */
  private buildSequence(images: string[], audioDuration: number): string[] {
    const needed = Math.max(images.length, Math.ceil(audioDuration / SLIDE_DURATION_SEC) + 1);
    const seq: string[] = [...images];
    while (seq.length < needed) {
      const shuffled = [...images];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      seq.push(...shuffled);
    }
    return seq.slice(0, needed);
  }

  /**
   * Render cu lanț xfade: fiecare imagine devine un clip de SLIDE_DURATION_SEC,
   * scalat la 1080x1920 (cover + crop, fundal negru), apoi le înlănțuim cu xfade
   * (5 tipuri ciclice, durata TRANSITION_SEC). Audio map separat, -shortest la
   * durata melodiei.
   */
  private async renderXfade(
    sequence: string[],
    audioPath: string,
    audioDuration: number,
    outPath: string,
    w: number,
    h: number,
  ): Promise<void> {
    const n = sequence.length;
    const args: string[] = ['-y'];

    // Fiecare imagine ca input loopat de SLIDE_DURATION_SEC.
    for (const img of sequence) {
      args.push('-loop', '1', '-t', String(SLIDE_DURATION_SEC), '-i', img);
    }
    // Audio = ultimul input.
    args.push('-i', audioPath);
    const audioIdx = n;

    // Letterbox fiecare imagine la canvas-ul w×h (păstrează originalul, negru în jur).
    const filters: string[] = [];
    for (let i = 0; i < n; i++) {
      filters.push(`[${i}:v]${letterbox(w, h)}[v${i}]`);
    }

    // Lanț xfade. Offset cumulativ: fiecare tranziție începe cu TRANSITION_SEC
    // înainte de finalul slide-ului curent (suprapunere).
    // După k xfade-uri timeline-ul = (k+1)*SLIDE - k*TRANSITION.
    let lastLabel = `v0`;
    let offset = SLIDE_DURATION_SEC - TRANSITION_SEC;
    for (let i = 1; i < n; i++) {
      const trans = TRANSITIONS[(i - 1) % TRANSITIONS.length];
      const out = i === n - 1 ? 'vout' : `x${i}`;
      filters.push(
        `[${lastLabel}][v${i}]xfade=transition=${trans}:duration=${TRANSITION_SEC}:offset=${offset.toFixed(3)}[${out}]`,
      );
      lastLabel = out;
      offset += SLIDE_DURATION_SEC - TRANSITION_SEC;
    }

    const videoLabel = n === 1 ? 'v0' : 'vout';

    args.push(
      '-filter_complex',
      filters.join(';'),
      '-map',
      `[${videoLabel}]`,
      '-map',
      `${audioIdx}:a`,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-preset',
      'veryfast',
      '-r',
      '30',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      '-t',
      audioDuration.toFixed(3),
      '-shortest',
      outPath,
    );

    await this.runFfmpeg(args);
  }

  /**
   * Fallback robust: concatenare simplă cu fade in/out pe fiecare slide (fără
   * xfade complex). Folosește concat demuxer pe clipuri pre-randate ar fi mai
   * scump; aici facem un singur ffmpeg cu concat filter + fade individual.
   */
  private async renderSimple(
    sequence: string[],
    audioPath: string,
    audioDuration: number,
    outPath: string,
    w: number,
    h: number,
  ): Promise<void> {
    const n = sequence.length;
    const args: string[] = ['-y'];
    for (const img of sequence) {
      args.push('-loop', '1', '-t', String(SLIDE_DURATION_SEC), '-i', img);
    }
    args.push('-i', audioPath);
    const audioIdx = n;

    const fadeD = 0.5;
    const fadeOutStart = (SLIDE_DURATION_SEC - fadeD).toFixed(3);
    const filters: string[] = [];
    for (let i = 0; i < n; i++) {
      filters.push(
        `[${i}:v]${letterbox(w, h)},` +
          `fade=t=in:st=0:d=${fadeD},fade=t=out:st=${fadeOutStart}:d=${fadeD}[v${i}]`,
      );
    }
    const concatInputs = Array.from({ length: n }, (_, i) => `[v${i}]`).join('');
    filters.push(`${concatInputs}concat=n=${n}:v=1:a=0[vout]`);

    args.push(
      '-filter_complex',
      filters.join(';'),
      '-map',
      '[vout]',
      '-map',
      `${audioIdx}:a`,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-preset',
      'veryfast',
      '-r',
      '30',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      '-t',
      audioDuration.toFixed(3),
      '-shortest',
      outPath,
    );

    await this.runFfmpeg(args);
  }

  private async runFfmpeg(args: string[]): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      proc.stderr.on('data', (c: Buffer) => {
        stderr += c.toString();
        if (stderr.length > 8000) stderr = stderr.slice(-8000);
      });
      proc.on('error', (err) => reject(err));
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-600)}`));
      });
    });
  }

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

  /** Trimite emailul „colajul tău e gata" către owner (best-effort). */
  private async notifyOwner(collage: VideoCollage, gen: Generation): Promise<void> {
    const email = collage.email ?? (await this.ownerEmail(gen));
    if (!email) return;

    const site = gen.siteId ? await this.sites.findById(gen.siteId) : null;
    const branding = brandingFromSite(site);
    const baseUrl =
      branding?.siteUrl ?? this.config.get<string>('APP_URL') ?? 'http://localhost:1500';
    const link = `${baseUrl}/m/${gen.id}`;
    const locale = site?.locale ?? gen.locale ?? 'ro';

    const recipient = gen.recipientName || '';
    const html = renderBrandedEmail({
      subject: 'Colajul tău video e gata! 🎬',
      preheader: 'Videoclipul cu pozele tale e gata de vizionat.',
      locale,
      branding,
      bodyHtml: `
        <div style="text-align:center;margin-bottom:18px;">
          <div style="font-size:48px;margin-bottom:8px;">🎬</div>
          <h2 style="margin:0;font-family:'Times New Roman',serif;font-size:24px;">Colajul tău video e gata!</h2>
          ${recipient ? `<p style="margin:8px 0 0;">Pentru ${escapeHtml(recipient)}</p>` : ''}
        </div>
        <p style="margin:0 0 16px;line-height:1.6;">
          Am montat videoclipul cu pozele tale pe melodie. Deschide pagina maneaua ta ca să-l vezi și să-l descarci.
        </p>
        <div style="text-align:center;margin:24px 0;">
          <a href="${escapeHtml(link)}" style="display:inline-block;padding:14px 28px;border-radius:999px;background:linear-gradient(135deg,#f1c84d,#d4af37);color:#0a0606;text-decoration:none;font-weight:700;">Vezi colajul →</a>
        </div>
      `,
    });

    await this.mailer.send(
      {
        to: email,
        subject: 'Colajul tău video e gata! 🎬',
        html,
        text: `Colajul tău video e gata! Vezi-l aici: ${link}`,
        from: site?.fromEmail ?? undefined,
      },
      {
        site,
        kind: 'collage_ready',
        userId: gen.ownerUserId ?? null,
        relatedId: gen.id,
      },
    );
  }

  private async ownerEmail(gen: Generation): Promise<string | null> {
    if (gen.ownerUserId) {
      const u = await this.users.findOne({ where: { id: gen.ownerUserId } });
      return u?.email ?? null;
    }
    if (gen.ownerGuestId) {
      const g = await this.guests.findOne({ where: { id: gen.ownerGuestId } });
      return g?.email ?? null;
    }
    return null;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
