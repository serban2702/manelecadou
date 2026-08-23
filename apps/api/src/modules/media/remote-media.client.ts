import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { StorageService } from '../../storage/storage.service';

/** O imagine socială întoarsă de microserviciu (PNG decodat din base64). */
export interface RemoteSocialImage {
  name: string;
  buffer: Buffer;
}

/**
 * Client HTTP către microserviciul de randare media de pe Hetzner
 * (`MEDIA_SERVICE_URL`). Descarcă randarea grea (ffmpeg + resvg) de pe Ionos.
 *
 * Toate metodele aruncă la orice eroare (rețea, status non-2xx, timeout) —
 * caller-ul face fallback la randarea LOCALĂ. `isEnabled()` e gate-ul: dacă
 * `MEDIA_SERVICE_URL` lipsește, microserviciul nu se folosește deloc.
 *
 * Contract microserviciu:
 *  - Auth: header `Authorization: Bearer <MEDIA_SERVICE_TOKEN>`
 *  - POST /render/social-images  JSON → { images: [{name, b64}, ...] }
 *  - POST /render/clip           multipart → video/mp4 binar
 *  - POST /render/collage        multipart → video/mp4 binar
 */
@Injectable()
export class RemoteMediaClient {
  private readonly logger = new Logger('RemoteMedia');
  private readonly baseUrl: string;
  private readonly token: string;

  /** Timeout imagini (rapid). */
  private static readonly IMAGE_TIMEOUT_MS = 60_000;
  /** Timeout video (ffmpeg pe segment poate dura). */
  private static readonly VIDEO_TIMEOUT_MS = 10 * 60_000;

  constructor(
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {
    this.baseUrl = (this.config.get<string>('MEDIA_SERVICE_URL') ?? '').trim().replace(/\/+$/, '');
    this.token = (this.config.get<string>('MEDIA_SERVICE_TOKEN') ?? '').trim();
  }

  /** Microserviciul e configurat? (URL setat). Dacă nu → randare locală. */
  isEnabled(): boolean {
    return this.baseUrl.length > 0;
  }

  /** POST /render/social-images → 4 buffere PNG. */
  async renderSocialImages(args: {
    recipientName: string;
    occasion: string;
    title?: string;
  }): Promise<RemoteSocialImage[]> {
    const body: Record<string, string> = {
      recipientName: args.recipientName,
      occasion: args.occasion,
    };
    if (args.title) body.title = args.title;

    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/render/social-images`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      RemoteMediaClient.IMAGE_TIMEOUT_MS,
    );

    if (!res.ok) {
      throw new Error(`social-images HTTP ${res.status}: ${await this.errBody(res)}`);
    }

    const json = (await res.json()) as { images?: Array<{ name?: string; b64?: string }> };
    const images = json?.images;
    if (!Array.isArray(images) || images.length === 0) {
      throw new Error('social-images: răspuns fără imagini');
    }

    return images
      .filter((im): im is { name: string; b64: string } => !!im?.b64)
      .map((im, i) => ({
        name: im.name || `v${i + 1}.png`,
        buffer: Buffer.from(im.b64, 'base64'),
      }));
  }

  /** POST /render/clip (multipart) → mp4 buffer. */
  async renderClip(args: {
    audioPath: string;
    imagePaths: string[];
    recipientName: string;
    occasion: string;
    startSec?: number;
    durationSec?: number;
    /** Format canvas: '9x16' | '1x1' | '16x9'. Default '9x16'. */
    aspect?: string;
  }): Promise<Buffer> {
    const form = new FormData();
    await this.appendFile(form, 'audio', args.audioPath);
    for (const p of args.imagePaths) {
      await this.appendFile(form, 'images', p);
    }
    form.append('recipientName', args.recipientName ?? '');
    form.append('occasion', args.occasion ?? '');
    if (typeof args.startSec === 'number') form.append('startSec', String(args.startSec));
    if (typeof args.durationSec === 'number') form.append('durationSec', String(args.durationSec));
    if (args.aspect) form.append('aspect', args.aspect);

    return this.postMultipartForVideo(`${this.baseUrl}/render/clip`, form);
  }

  /** POST /render/collage (multipart) → mp4 buffer. */
  async renderCollage(args: {
    audioPath: string;
    imagePaths: string[];
    recipientName?: string;
    /** Format canvas: '9x16' | '1x1' | '16x9'. Default '9x16'. */
    aspect?: string;
  }): Promise<Buffer> {
    const form = new FormData();
    await this.appendFile(form, 'audio', args.audioPath);
    for (const p of args.imagePaths) {
      await this.appendFile(form, 'images', p);
    }
    if (typeof args.recipientName === 'string') {
      form.append('recipientName', args.recipientName);
    }
    if (args.aspect) form.append('aspect', args.aspect);

    return this.postMultipartForVideo(`${this.baseUrl}/render/collage`, form);
  }

  // ───────────────────────────────────────────────────────────────────────

  private async postMultipartForVideo(url: string, form: FormData): Promise<Buffer> {
    const res = await this.fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}` },
        body: form,
      },
      RemoteMediaClient.VIDEO_TIMEOUT_MS,
    );

    if (!res.ok) {
      throw new Error(`${url} HTTP ${res.status}: ${await this.errBody(res)}`);
    }

    const arrayBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    if (buf.length === 0) throw new Error(`${url}: răspuns mp4 gol`);
    return buf;
  }

  /** Citește un fișier (de pe disc sau din R2) și îl atașează ca Blob în FormData. */
  private async appendFile(form: FormData, field: string, path: string): Promise<void> {
    const data = await this.readSource(path);
    // Buffer → Uint8Array pentru Blob (tipuri DOM cer BlobPart).
    const blob = new Blob([new Uint8Array(data)]);
    form.append(field, blob, basename(path));
  }

  /** Conținutul unui fișier sursă: întâi de pe disc, apoi din storage (R2) dacă
   *  nu mai e local. Dacă nu există nicăieri, aruncă eroarea originală de disc. */
  private async readSource(path: string): Promise<Buffer> {
    try {
      return await readFile(path);
    } catch (err) {
      try {
        return await this.storage.readBuffer(path);
      } catch {
        throw err;
      }
    }
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private async errBody(res: Response): Promise<string> {
    try {
      return (await res.text()).slice(0, 300);
    } catch {
      return '<no body>';
    }
  }
}
