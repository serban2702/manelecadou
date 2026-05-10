import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join } from 'path';
import { SunoProvider, SunoGenerateInput } from '../suno/suno.types';
import { SunoLogService } from '../suno/suno-log.service';
import { LyricsService } from '../lyrics/lyrics.module';
import { SitesService } from './sites.service';
import { Site, SiteSampleEntry, SiteSuno } from './site.entity';

export interface SampleOverrides {
  /** Override pentru voice (default = pentru style: 'adi'; pentru voice: key-ul însuși) */
  voice?: string;
  /** Override lyrics — dacă e setat, sare peste demoLyrics auto. */
  lyrics?: string;
  /** Override style prompt complet — adăugat în SiteSuno.stylePromptMap[key] înainte de send. */
  customStylePrompt?: string;
  /** Numele destinatarului în lyrics (default 'Demo'). */
  recipientName?: string;
}

export const SAMPLE_STYLES = [
  'clasic', 'modern', 'oriental', 'trompeta', 'romantica', 'comerciala',
  'opulenta', 'iubire', 'tallava', 'kuchek', 'trapanele', 'pahar',
] as const;

export const SAMPLE_VOICES = [
  'adi', 'florinel', 'ticu', 'mariana', 'nicu', 'gigi',
] as const;

export type SampleKind = 'style' | 'voice';

interface InFlightKey {
  siteId: string;
  kind: SampleKind;
  key: string;
}

/**
 * Generează și gestionează mostrele audio scurte (~15-20s) afișate pe carduri-le
 * de stil + voce din /studio. Folosește SunoProvider existent — același flux ca
 * generările normale, dar logate cu requestType='sample' și salvate în
 * apps/api/uploads/site-samples/<slug>/<kind>-<key>.mp3 ca să le servim static.
 */
@Injectable()
export class SiteSamplesService {
  private readonly logger = new Logger('SiteSamplesService');
  /** Tracking mostre în curs de generare per site/kind/key. */
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly sites: SitesService,
    private readonly suno: SunoProvider,
    private readonly logs: SunoLogService,
    private readonly config: ConfigService,
    private readonly lyrics: LyricsService,
  ) {}

  private flightKey({ siteId, kind, key }: InFlightKey): string {
    return `${siteId}:${kind}:${key}`;
  }

  isGenerating(siteId: string, kind: SampleKind, key: string): boolean {
    return this.inFlight.has(this.flightKey({ siteId, kind, key }));
  }

  listGenerating(siteId: string): Array<{ kind: SampleKind; key: string }> {
    const prefix = `${siteId}:`;
    const out: Array<{ kind: SampleKind; key: string }> = [];
    for (const k of this.inFlight) {
      if (!k.startsWith(prefix)) continue;
      const rest = k.slice(prefix.length);
      const [kind, ...keyParts] = rest.split(':');
      out.push({ kind: kind as SampleKind, key: keyParts.join(':') });
    }
    return out;
  }

  validateKey(kind: SampleKind, key: string): void {
    const list = kind === 'style' ? SAMPLE_STYLES : SAMPLE_VOICES;
    if (!(list as readonly string[]).includes(key)) {
      throw new BadRequestException(`${kind} key invalid: ${key}`);
    }
  }

  /**
   * Generează (sau regenerează) o mostră. Sincron — așteaptă audio-ul finalizat.
   * Idempotent: dacă mostra există și regenerate=false, întoarce cea veche.
   */
  async generateOne(
    siteId: string,
    kind: SampleKind,
    key: string,
    regenerate: boolean,
    overrides?: SampleOverrides,
  ): Promise<{ entry: SiteSampleEntry; reused: boolean }> {
    this.validateKey(kind, key);
    const site = await this.sites.findById(siteId);
    if (!site) throw new NotFoundException('Site negăsit');

    const existing = readSample(site.suno, kind, key);
    if (existing && !regenerate && !overrides) {
      return { entry: existing, reused: true };
    }

    const flight: InFlightKey = { siteId, kind, key };
    const fk = this.flightKey(flight);
    if (this.inFlight.has(fk)) {
      throw new BadRequestException('Mostra e deja în curs de generare');
    }
    this.inFlight.add(fk);

    try {
      const input = this.buildInput(site, kind, key, overrides);
      this.logger.log(`generate sample siteSlug=${site.slug} ${kind}=${key}`);

      const result = await this.suno.generate(input);
      const track = result.tracks[0];
      if (!track?.audioUrl) {
        throw new Error('Suno nu a întors niciun track audio');
      }

      const audioUrl = await this.downloadAndStore(site, kind, key, track.audioUrl);
      const entry: SiteSampleEntry = {
        audioUrl,
        generatedAt: new Date().toISOString(),
        sunoTaskId: result.providerJobId,
      };

      await this.persist(site, kind, key, entry);
      return { entry, reused: false };
    } finally {
      this.inFlight.delete(fk);
    }
  }

  /**
   * Returnează lista mostrelor lipsă pentru un site (toate stilurile + vocile
   * pentru care nu există încă o intrare în site.suno.styleSamples/voiceSamples).
   */
  listMissing(site: Site): Array<{ kind: SampleKind; key: string }> {
    const missing: Array<{ kind: SampleKind; key: string }> = [];
    for (const k of SAMPLE_STYLES) {
      if (!readSample(site.suno, 'style', k)) missing.push({ kind: 'style', key: k });
    }
    for (const k of SAMPLE_VOICES) {
      if (!readSample(site.suno, 'voice', k)) missing.push({ kind: 'voice', key: k });
    }
    return missing;
  }

  /**
   * Bulk: generează toate mostrele lipsă (sau toate dacă regenerate=true).
   * Rulează SECVENȚIAL în background (nu blocăm requestul HTTP — întoarcem
   * lista de mostre puse la coadă imediat). Erorile individuale sunt logate
   * dar nu opresc restul.
   */
  async generateAll(
    siteId: string,
    regenerate: boolean,
  ): Promise<Array<{ kind: SampleKind; key: string }>> {
    const site = await this.sites.findById(siteId);
    if (!site) throw new NotFoundException('Site negăsit');

    const targets: Array<{ kind: SampleKind; key: string }> = regenerate
      ? [
          ...SAMPLE_STYLES.map((k) => ({ kind: 'style' as const, key: k })),
          ...SAMPLE_VOICES.map((k) => ({ kind: 'voice' as const, key: k })),
        ]
      : this.listMissing(site);

    // Marchează toate ca "in-flight" imediat — UI-ul vede statusul ⏳ chiar
    // dacă procesarea efectivă rulează unul după altul.
    for (const t of targets) {
      this.inFlight.add(this.flightKey({ siteId, ...t }));
    }

    // Fire-and-forget loop — fiecare mostră ~3 min cu Suno real.
    void (async () => {
      for (const t of targets) {
        const fk = this.flightKey({ siteId, ...t });
        try {
          // generateOne re-adăugă fk în set; îl scoatem ca să-i lase logica internă
          this.inFlight.delete(fk);
          await this.generateOne(siteId, t.kind, t.key, regenerate);
        } catch (err) {
          this.logger.warn(`bulk sample ${t.kind}=${t.key}: ${(err as Error).message}`);
          this.inFlight.delete(fk);
        }
      }
    })();

    return targets;
  }

  // ── internals ────────────────────────────────────────────────────────────

  private buildInput(
    site: Site,
    kind: SampleKind,
    key: string,
    overrides?: SampleOverrides,
  ): SunoGenerateInput {
    // Lyrics — override > demo locale-aware. Pentru locale fără demo dedicate, cădem pe RO.
    const lyrics = overrides?.lyrics?.trim() || buildDemoLyrics(site.locale);

    // Voice — override > default per kind. Pentru style: 'adi' (sau ce e setat în voiceMap).
    const voiceKey = overrides?.voice ?? (kind === 'voice' ? key : 'adi');
    const voiceArtist = site.suno?.voiceMap?.[voiceKey] ?? voiceKey;

    // Style prompt — dacă userul a dat override custom, îl injectăm temporar
    // în site.suno.stylePromptMap înainte de a trimite (provider citește de acolo).
    let effectiveSite = site;
    if (overrides?.customStylePrompt && kind === 'style') {
      effectiveSite = {
        ...site,
        suno: {
          ...(site.suno ?? {}),
          stylePromptMap: {
            ...(site.suno?.stylePromptMap ?? {}),
            [key]: overrides.customStylePrompt,
          },
        },
      } as Site;
    }

    const base: SunoGenerateInput = {
      type: 'demo',
      durationSec: 20,
      style: kind === 'style' ? key : 'clasic',
      occasion: 'altul',
      recipientName: overrides?.recipientName?.trim() || 'Demo',
      message: 'demo sample',
      voiceArtist,
      lyrics,
      site: effectiveSite,
      requestType: 'sample',
    };
    return base;
  }

  /**
   * Generează (sau reîncarcă din cache pentru regenerate=false) lyrics demo
   * pentru o mostră — folosind LyricsService cu writerSystemPrompt al site-ului.
   * Returnează DOAR string-ul lyrics; UI-ul îl arată în textarea editabilă, iar
   * utilizatorul îl trimite mai departe la /generate cu override.
   */
  /**
   * Upload manual al unei mostre — utilizatorul are deja un MP3 (ex. generat
   * extern în Suno) și vrea să îl pună direct ca mostră fără să cheltuie credit.
   * Salvează fișierul în uploads/site-samples/<slug>/<kind>-<key>.mp3 și
   * persistă entry-ul în Site.suno.styleSamples / voiceSamples.
   */
  async uploadOne(
    siteId: string,
    kind: SampleKind,
    key: string,
    fileBuffer: Buffer,
    originalName: string,
  ): Promise<{ entry: SiteSampleEntry }> {
    this.validateKey(kind, key);
    const site = await this.sites.findById(siteId);
    if (!site) throw new NotFoundException('Site negăsit');

    // Validare extensie — Suno produce MP3, dar acceptăm și WAV/M4A.
    const ext = (originalName.split('.').pop() ?? 'mp3').toLowerCase();
    if (!['mp3', 'wav', 'm4a', 'ogg'].includes(ext)) {
      throw new BadRequestException(`Extensie audio neacceptată: .${ext} (acceptate: mp3, wav, m4a, ogg)`);
    }
    if (fileBuffer.length === 0) throw new BadRequestException('Fișier gol');
    if (fileBuffer.length > 25 * 1024 * 1024) {
      throw new BadRequestException('Fișier prea mare (max 25 MB)');
    }

    const uploadsDir = this.config.get<string>('UPLOADS_DIR') ?? join(process.cwd(), 'uploads');
    const dir = join(uploadsDir, 'site-samples', site.slug);
    await fs.mkdir(dir, { recursive: true });
    const fileName = `${kind}-${key}.${ext}`;
    const filePath = join(dir, fileName);
    await fs.writeFile(filePath, fileBuffer);

    const apiUrl = this.config.get<string>('API_URL') ?? 'http://localhost:1501';
    const v = Date.now();
    const audioUrl = `${apiUrl}/uploads/site-samples/${site.slug}/${fileName}?v=${v}`;

    const entry: SiteSampleEntry = {
      audioUrl,
      generatedAt: new Date().toISOString(),
      // Marker în loc de sunoTaskId, ca să știm că e upload manual.
      sunoTaskId: `manual-upload:${originalName.slice(0, 80)}`,
    };
    await this.persist(site, kind, key, entry);
    this.logger.log(`upload sample siteSlug=${site.slug} ${kind}=${key} bytes=${fileBuffer.length}`);
    return { entry };
  }

  async previewLyrics(
    siteId: string,
    kind: SampleKind,
    key: string,
    opts?: { recipientName?: string; voiceKey?: string; customStylePrompt?: string },
  ): Promise<{ lyrics: string }> {
    this.validateKey(kind, key);
    const site = await this.sites.findById(siteId);
    if (!site) throw new NotFoundException('Site negăsit');

    const styleId = kind === 'style' ? key : 'clasic';
    const voiceKey = opts?.voiceKey ?? (kind === 'voice' ? key : 'adi');
    const voiceArtist = site.suno?.voiceMap?.[voiceKey] ?? voiceKey;
    // Hint stil: override custom (din UI) > stylePromptMap[key] din site > nimic.
    const styleHint =
      opts?.customStylePrompt?.trim() || site.suno?.stylePromptMap?.[styleId] || undefined;

    const baseInput = {
      style: styleId,
      occasion: 'altul',
      recipientName: opts?.recipientName?.trim() || 'Demo',
      message: 'demo sample',
      voiceArtist,
      locale: site.locale,
      writerSystemPrompt: site.suno?.writerSystemPrompt,
      criticSystemPrompt: site.suno?.criticSystemPrompt,
      styleHint,
    };
    const draft = await this.lyrics.writeDraft(baseInput);
    const refined = await this.lyrics.refineDraft(baseInput, draft);
    return { lyrics: refined };
  }

  private async downloadAndStore(
    site: Site,
    kind: SampleKind,
    key: string,
    sourceUrl: string,
  ): Promise<string> {
    const uploadsDir = this.config.get<string>('UPLOADS_DIR') ?? join(process.cwd(), 'uploads');
    const dir = join(uploadsDir, 'site-samples', site.slug);
    await fs.mkdir(dir, { recursive: true });
    const fileName = `${kind}-${key}.mp3`;
    const filePath = join(dir, fileName);

    const res = await fetch(sourceUrl);
    if (!res.ok) {
      throw new Error(`fetch sample audio failed ${res.status} from ${sourceUrl}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(filePath, buf);

    // URL public servit prin static middleware (vezi main.ts).
    const apiUrl = this.config.get<string>('API_URL') ?? 'http://localhost:1501';
    // Cache-bust ca browser-ul să reîncarce mostra după regenerare.
    const v = Date.now();
    return `${apiUrl}/uploads/site-samples/${site.slug}/${fileName}?v=${v}`;
  }

  private async persist(
    site: Site,
    kind: SampleKind,
    key: string,
    entry: SiteSampleEntry,
  ): Promise<void> {
    const suno: SiteSuno = { ...(site.suno ?? {}) };
    if (kind === 'style') {
      suno.styleSamples = { ...(suno.styleSamples ?? {}), [key]: entry };
    } else {
      suno.voiceSamples = { ...(suno.voiceSamples ?? {}), [key]: entry };
    }
    await this.sites.update(site.id, { suno });
  }
}

function readSample(
  suno: SiteSuno | undefined,
  kind: SampleKind,
  key: string,
): SiteSampleEntry | undefined {
  if (!suno) return undefined;
  return kind === 'style' ? suno.styleSamples?.[key] : suno.voiceSamples?.[key];
}

/** Lyrics scurte (~4 rânduri) pentru o mostră demo de 15-20s, fără destinatar.
 *  Locale-aware: BG → bulgară, RS → sârbă, TR → turcă, etc. Fallback: RO. */
function buildDemoLyrics(locale: string): string {
  const intro = '[Intro: oriental synth taksim, accordion doina]';
  const verse = '[Verse 1]';
  const hook = '[Hook]';
  const outro = '[Outro]';

  const bodies: Record<string, string[]> = {
    ro: [
      'Hai să cânte muzica, să se audă,',
      'Inima dansează, lumea se aprinde,',
      '[Hook]',
      'Of, of, of, ce frumos răsună,',
      'Manea curge, totul se adună.',
    ],
    bg: [
      'Хайде музиката да звучи, да се чува,',
      'Сърцето танцува, светът се запалва,',
      '[Hook]',
      'Ой, ой, ой, колко хубаво звучи,',
      'Чалга тече, всичко се събира.',
    ],
    sr: [
      'Hajde da svira muzika, da se čuje,',
      'Srce igra, svet se pali,',
      '[Hook]',
      'Oj, oj, oj, kako lepo zvoni,',
      'Pesma teče, sve se skuplja.',
    ],
    tr: [
      'Haydi müzik çalsın, duyulsun,',
      'Kalp dans ediyor, dünya alev alıyor,',
      '[Hook]',
      'Of, of, of, ne güzel yankılanıyor,',
      'Şarkı akıyor, her şey birleşiyor.',
    ],
    el: [
      'Έλα να παίξει η μουσική, να ακουστεί,',
      'Η καρδιά χορεύει, ο κόσμος ανάβει,',
      '[Hook]',
      'Ωχ, ωχ, ωχ, τι όμορφα αντηχεί,',
      'Το τραγούδι κυλάει, όλα μαζεύονται.',
    ],
  };

  const body = bodies[locale] ?? bodies.ro;
  return [intro, verse, ...body.slice(0, 2), hook, ...body.slice(3), outro].join('\n');
}
