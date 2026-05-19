import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join } from 'path';
import { SunoProvider, SunoGenerateInput } from '../suno/suno.types';
import { SunoLogService } from '../suno/suno-log.service';
import { LyricsService } from '../lyrics/lyrics.module';
import { SettingsService } from '../settings/settings.service';
import { SitesService } from './sites.service';
import { Site, SiteSampleEntry, SiteSuno, SiteVoiceEntry } from './site.entity';

export interface SampleOverrides {
  /** Override pentru voice (default = pentru style: 'adi'; pentru voice: key-ul însuși) */
  voice?: string;
  /** Override lyrics — dacă e setat, sare peste demoLyrics auto. */
  lyrics?: string;
  /** Override style prompt complet — adăugat în SiteSuno.stylePromptMap[key] înainte de send. */
  customStylePrompt?: string;
  /** Numele destinatarului în lyrics (default 'Demo'). */
  recipientName?: string;
  /** Numele expeditorului — apare în primele 2 rânduri cântate („De la X, pentru Y..."). */
  dedication?: string;
  /** Cheia stilului — folosit la mostre de tip 'voice' ca să auzi vocea pe stilul ales
   *  (default = primul stil din site.styles, fallback 'clasic'). */
  style?: string;
  /** Cheia ocaziei — ajunge ca „themed for X" în tag-ul Suno și `{{occasion}}` în lyrics. */
  occasion?: string;
  /** Mesaj personal de la expeditor pentru destinatar (text liber, max ~180 chars). */
  message?: string;
  /** Suma dedicată (în moneda site-ului) — ajunge ca `{{tipAmount}}` la lyrics writer. */
  tipAmount?: number;
  /** Toggle Premium — afectează durata și calitatea în generarea normală. */
  premium?: boolean;
  /** Override sex vocal pentru această mostră (independent de voiceCfg.gender persistat). */
  vocalGender?: 'm' | 'f';
}

export const SAMPLE_STYLES = [
  'clasic', 'modern', 'oriental', 'trompeta', 'romantica', 'comerciala',
  'opulenta', 'iubire', 'tallava', 'kuchek', 'trapanele', 'pahar',
] as const;

export const SAMPLE_VOICES = [
  'adi', 'florinel', 'ticu', 'mariana', 'nicu', 'gigi',
] as const;

export type SampleKind = 'style' | 'voice';

/** Un candidat Suno (Suno generează 2 piese per task). Userul alege una
 *  în UI-ul admin prin SampleChooserDialog → POST /samples/commit. */
export interface SampleCandidate {
  audioUrl: string;
  audioId?: string;
  durationSec?: number;
  coverUrl?: string;
}

export type GenerateOneResult =
  | { reused: true; entry: SiteSampleEntry; candidates?: undefined; sunoTaskId?: undefined }
  | { reused: false; entry?: undefined; candidates: SampleCandidate[]; sunoTaskId: string };

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
    private readonly settings: SettingsService,
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
    // Acceptăm orice slug rezonabil (lowercase letters/numbers/dash). Cheile
    // efective sunt definite per-site în site.styles/voices, plus listele
    // default (SAMPLE_STYLES/SAMPLE_VOICES) pentru compatibilitate.
    if (!key || !/^[a-z0-9][a-z0-9-]{0,31}$/.test(key)) {
      throw new BadRequestException(`${kind} key invalid: "${key}" (lowercase a-z, 0-9, dash, max 32)`);
    }
  }

  /**
   * Generează (sau regenerează) o mostră. Sincron — așteaptă audio-ul finalizat.
   * Idempotent: dacă mostra există și regenerate=false, întoarce cea veche.
   *
   * IMPORTANT (refactor 2026-05): nu mai persistă entry-ul automat. Suno
   * întoarce DOUĂ track-uri per task; userul alege una prin UI-ul admin
   * (SampleChooserDialog) și apoi cheamă `commitChoice` care descarcă track-ul
   * ales pe disc și-l persistă atomic. Astfel:
   *   - userul ascultă ambele variante înainte să decidă,
   *   - generările simultane nu se mai pot suprascrie (commit-ul folosește
   *     UPDATE JSONB atomic, vezi SitesService.setSampleEntry).
   */
  async generateOne(
    siteId: string,
    kind: SampleKind,
    key: string,
    regenerate: boolean,
    overrides?: SampleOverrides,
  ): Promise<GenerateOneResult> {
    this.validateKey(kind, key);
    const site = await this.sites.findById(siteId);
    if (!site) throw new NotFoundException('Site negăsit');

    const existing = readSample(site.suno, kind, key);
    if (existing && !regenerate && !overrides) {
      return { reused: true, entry: existing };
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
      const tracks = (result.tracks ?? []).filter((t) => !!t.audioUrl);
      if (tracks.length === 0) {
        throw new Error('Suno nu a întors niciun track audio');
      }

      const candidates: SampleCandidate[] = tracks.map((t) => ({
        audioUrl: t.audioUrl,
        audioId: t.audioId,
        durationSec: t.durationSec,
        coverUrl: t.coverUrl,
      }));

      return { reused: false, candidates, sunoTaskId: result.providerJobId };
    } finally {
      this.inFlight.delete(fk);
    }
  }

  /**
   * Finalizează o mostră generată anterior: userul a ales un candidate din
   * dialogul de selecție → descărcăm acel track de pe Suno pe discul nostru
   * și-l persistăm atomic în `site.suno.styleSamples[key]` / `voiceSamples[key]`.
   *
   * Persistarea folosește un singur UPDATE Postgres cu merge JSONB — sigur
   * pentru cazul în care două commit-uri pe chei diferite vin în paralel.
   */
  async commitChoice(
    siteId: string,
    kind: SampleKind,
    key: string,
    choice: { audioUrl: string; audioId?: string; sunoTaskId: string; durationSec?: number },
  ): Promise<{ entry: SiteSampleEntry }> {
    this.validateKey(kind, key);
    if (!choice?.audioUrl?.trim()) {
      throw new BadRequestException('audioUrl lipsă');
    }
    if (!choice?.sunoTaskId?.trim()) {
      throw new BadRequestException('sunoTaskId lipsă');
    }
    const site = await this.sites.findById(siteId);
    if (!site) throw new NotFoundException('Site negăsit');

    const localUrl = await this.downloadAndStore(site, kind, key, choice.audioUrl);
    const entry: SiteSampleEntry = {
      audioUrl: localUrl,
      generatedAt: new Date().toISOString(),
      sunoTaskId: choice.sunoTaskId,
      sunoAudioId: choice.audioId,
    };
    await this.sites.setSampleEntry(siteId, kind, key, entry);
    this.logger.log(
      `commit sample siteSlug=${site.slug} ${kind}=${key} audioId=${choice.audioId ?? '—'}`,
    );
    return { entry };
  }

  /**
   * Helper intern pentru bulk-generate: generează + auto-commit pe primul
   * candidat. Folosit doar din `generateAll` (nu vrem să blocăm flux-ul bulk
   * pe alegerea userului — operațiunea „Generează toate mostrele lipsă" e
   * tip „fill in the gaps" și userul poate regenera ulterior orice mostră
   * cu alegere manuală).
   */
  private async generateAndAutoCommit(
    siteId: string,
    kind: SampleKind,
    key: string,
    regenerate: boolean,
    overrides?: SampleOverrides,
  ): Promise<void> {
    const r = await this.generateOne(siteId, kind, key, regenerate, overrides);
    if (r.reused) return;
    const pick = r.candidates[0];
    await this.commitChoice(siteId, kind, key, {
      audioUrl: pick.audioUrl,
      audioId: pick.audioId,
      sunoTaskId: r.sunoTaskId,
      durationSec: pick.durationSec,
    });
  }

  /**
   * Returnează lista mostrelor lipsă pentru un site. Folosește cheile din
   * site.styles/voices dacă există, altfel default-urile (SAMPLE_STYLES/VOICES).
   */
  listMissing(site: Site): Array<{ kind: SampleKind; key: string }> {
    const missing: Array<{ kind: SampleKind; key: string }> = [];
    const styleKeys = site.styles?.length ? site.styles.map((s) => s.id) : (SAMPLE_STYLES as readonly string[]);
    const voiceKeys = site.voices?.length ? site.voices.map((v) => v.id) : (SAMPLE_VOICES as readonly string[]);
    for (const k of styleKeys) {
      if (!readSample(site.suno, 'style', k)) missing.push({ kind: 'style', key: k });
    }
    for (const k of voiceKeys) {
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

    const styleKeys = site.styles?.length ? site.styles.map((s) => s.id) : (SAMPLE_STYLES as readonly string[]);
    const voiceKeys = site.voices?.length ? site.voices.map((v) => v.id) : (SAMPLE_VOICES as readonly string[]);
    const targets: Array<{ kind: SampleKind; key: string }> = regenerate
      ? [
          ...styleKeys.map((k) => ({ kind: 'style' as const, key: k })),
          ...voiceKeys.map((k) => ({ kind: 'voice' as const, key: k })),
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
          // generateAndAutoCommit re-adăugă fk în set; îl scoatem ca să-i lase logica internă
          this.inFlight.delete(fk);
          await this.generateAndAutoCommit(siteId, t.kind, t.key, regenerate);
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

    // Voice mapping: site.voices[].sunoVoice > suno.voiceMap > id-ul cheii.
    // Pentru style sample, vocea default e 'adi' (sau prima din site.voices).
    const fallbackVoice = site.voices?.[0]?.id ?? 'adi';
    const voiceKey = overrides?.voice ?? (kind === 'voice' ? key : fallbackVoice);
    const voiceFromConfig = site.voices?.find((v) => v.id === voiceKey)?.sunoVoice;
    const voiceArtist = voiceFromConfig ?? site.suno?.voiceMap?.[voiceKey] ?? voiceKey;

    // Style prompt: prefer override din form > site.styles[].sunoPrompt > suno.stylePromptMap.
    // Suprasciem temporar site.suno.stylePromptMap[key] ca provider-ul Suno
    // să-l citească de acolo (nu schimbăm nimic în DB).
    let effectivePrompt = site.suno?.stylePromptMap?.[key];
    if (kind === 'style') {
      const styleConfig = site.styles?.find((s) => s.id === key);
      if (styleConfig?.sunoPrompt) effectivePrompt = styleConfig.sunoPrompt;
    }
    if (overrides?.customStylePrompt && kind === 'style') {
      effectivePrompt = overrides.customStylePrompt;
    }
    const effectiveSite = effectivePrompt
      ? ({
          ...site,
          suno: {
            ...(site.suno ?? {}),
            stylePromptMap: {
              ...(site.suno?.stylePromptMap ?? {}),
              [key]: effectivePrompt,
            },
          },
        } as Site)
      : site;

    const fallbackStyle = site.styles?.[0]?.id ?? 'clasic';
    // Pentru mostra de voce, userul poate alege și stilul (default = primul din site).
    const effectiveStyle = kind === 'style'
      ? key
      : (overrides?.style?.trim() || fallbackStyle);
    // Sex vocal — override per-mostră > config voce persistată > undefined.
    // Override-ul e necesar fiindcă schimbările din editor pe gender nu se
    // auto-salvează — userul ar putea seta „Femeie" în UI dar baza de date încă
    // să aibă valoarea veche când mostra e generată. Override-ul rezolvă asta.
    const voiceCfg = site.voices?.find((v) => v.id === voiceKey);
    const vocalGender = overrides?.vocalGender ?? voiceCfg?.gender ?? undefined;
    // Premium = 'full' (~60-90s) vs demo (~20s). Mostra de admin rămâne scurtă
    // pentru cost, dar respectă flag-ul dacă userul vrea audio mai bun.
    const premium = !!overrides?.premium;
    const base: SunoGenerateInput = {
      type: premium ? 'full' : 'demo',
      durationSec: premium ? 60 : 20,
      style: effectiveStyle,
      occasion: overrides?.occasion?.trim() || 'altul',
      recipientName: overrides?.recipientName?.trim() || '',
      dedication: overrides?.dedication?.trim() || undefined,
      message: overrides?.message?.trim() || '',
      voiceArtist,
      vocalGender,
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
    await this.sites.setSampleEntry(siteId, kind, key, entry);
    this.logger.log(`upload sample siteSlug=${site.slug} ${kind}=${key} bytes=${fileBuffer.length}`);
    return { entry };
  }

  async previewLyrics(
    siteId: string,
    kind: SampleKind,
    key: string,
    opts?: {
      recipientName?: string;
      voiceKey?: string;
      customStylePrompt?: string;
      dedication?: string;
      style?: string;
      occasion?: string;
      message?: string;
      tipAmount?: number;
    },
  ): Promise<{ lyrics: string }> {
    this.validateKey(kind, key);
    const site = await this.sites.findById(siteId);
    if (!site) throw new NotFoundException('Site negăsit');

    const fallbackStyle = site.styles?.[0]?.id ?? 'clasic';
    const styleId = kind === 'style' ? key : (opts?.style?.trim() || fallbackStyle);
    const voiceKey = opts?.voiceKey ?? (kind === 'voice' ? key : (site.voices?.[0]?.id ?? 'adi'));
    const voiceArtist = site.suno?.voiceMap?.[voiceKey] ?? voiceKey;
    // Hint stil: override custom (din UI) > stylePromptMap[key] din site > nimic.
    const styleHint =
      opts?.customStylePrompt?.trim() || site.suno?.stylePromptMap?.[styleId] || undefined;

    const baseInput = {
      style: styleId,
      occasion: opts?.occasion?.trim() || 'altul',
      recipientName: opts?.recipientName?.trim() || '',
      dedication: opts?.dedication?.trim() || undefined,
      tipAmount: typeof opts?.tipAmount === 'number' && opts.tipAmount > 0 ? opts.tipAmount : undefined,
      message: opts?.message?.trim() || '',
      voiceArtist,
      locale: site.locale,
      writerSystemPrompt: site.suno?.writerSystemPrompt,
      writerUserTemplate: site.suno?.writerUserTemplate,
      criticSystemPrompt: site.suno?.criticSystemPrompt,
      criticUserTemplate: site.suno?.criticUserTemplate,
      styleHint,
      currency: site.currency,
      siteId: site.id,
      generationId: null,
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

  /**
   * Șterge toate mostrele audio ale site-ului: fișierele MP3 din uploads/site-samples/<slug>/
   * și intrările styleSamples / voiceSamples din suno config.
   */
  async clearAllSamples(siteId: string): Promise<{ deleted: number }> {
    const site = await this.sites.findById(siteId);
    if (!site) throw new NotFoundException('Site negăsit');

    const uploadsDir = this.config.get<string>('UPLOADS_DIR') ?? join(process.cwd(), 'uploads');
    const dir = join(uploadsDir, 'site-samples', site.slug);

    let deleted = 0;
    try {
      const files = await fs.readdir(dir);
      await Promise.all(
        files
          .filter((f) => /\.(mp3|wav|m4a|ogg)$/i.test(f))
          .map(async (f) => {
            await fs.unlink(join(dir, f));
            deleted++;
          }),
      );
    } catch {
      // directorul poate să nu existe — ignorăm ENOENT
    }

    const suno = { ...(site.suno ?? {}) };
    delete suno.styleSamples;
    delete suno.voiceSamples;
    await this.sites.update(site.id, { suno });

    this.logger.log(`clearAllSamples siteSlug=${site.slug} deleted=${deleted}`);
    return { deleted };
  }

  /**
   * Generează un Persona Suno din mostra audio a unei voci și salvează ID-ul
   * pe `SiteVoiceEntry.sunoPersonaId`. Necesar ca vocea respectivă să aibă
   * deja o mostră generată CU `sunoAudioId` populat (mostre vechi nu au).
   *
   * Suno cere taskId + audioId + name + description. Răspunde 200 cu data.personaId.
   * Constrângeri: un audioId poate genera un singur persona; modele V4+; segment
   * vocal 10-30 secunde (default 0..30).
   */
  async generatePersona(
    siteId: string,
    voiceId: string,
    opts?: { name?: string; description?: string; vocalStart?: number; vocalEnd?: number; style?: string },
  ): Promise<{ voice: SiteVoiceEntry }> {
    const site = await this.sites.findById(siteId);
    if (!site) throw new NotFoundException('Site negăsit');

    const voice = site.voices?.find((v) => v.id === voiceId);
    if (!voice) throw new NotFoundException(`Vocea „${voiceId}" nu există pe site.`);

    const sample = site.suno?.voiceSamples?.[voiceId];
    if (!sample?.sunoTaskId || !sample?.sunoAudioId) {
      throw new BadRequestException(
        'Mostra audio nu are taskId/audioId Suno. Regenerează mostra pentru această voce.',
      );
    }

    const baseUrl = (await this.settings.get('SUNO_API_BASE_URL')) || 'https://api.sunoapi.org';
    const apiKey = await this.settings.get('SUNO_API_KEY');
    if (!apiKey) throw new BadRequestException('SUNO_API_KEY nu e setat în Settings.');

    const personaName = opts?.name?.trim() || voice.nm || voiceId;
    const personaDescription =
      opts?.description?.trim() ||
      `Authentic manele singer in the ${voice.gender === 'f' ? 'female' : 'male'} register — derived from sample of "${voice.nm ?? voiceId}".`;

    const body: Record<string, unknown> = {
      taskId: sample.sunoTaskId,
      audioId: sample.sunoAudioId,
      name: personaName.slice(0, 80),
      description: personaDescription.slice(0, 500),
    };
    if (typeof opts?.vocalStart === 'number') body.vocalStart = opts.vocalStart;
    if (typeof opts?.vocalEnd === 'number') body.vocalEnd = opts.vocalEnd;
    if (opts?.style) body.style = opts.style;

    this.logger.log(
      `generate-persona siteSlug=${site.slug} voiceId=${voiceId} taskId=${sample.sunoTaskId} audioId=${sample.sunoAudioId}`,
    );

    const res = await fetch(`${baseUrl}/api/v1/generate/generate-persona`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new BadRequestException(`Suno generate-persona ${res.status}: ${text.slice(0, 400)}`);
    }
    let parsed: { code?: number; msg?: string; data?: { personaId?: string; name?: string } };
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new BadRequestException('Răspuns invalid de la Suno generate-persona.');
    }
    const personaId = parsed?.data?.personaId;
    if (parsed?.code !== 200 || !personaId) {
      throw new BadRequestException(
        `Suno generate-persona: ${parsed?.msg ?? 'fără personaId în răspuns'}`,
      );
    }

    // Persist pe voice entry.
    const voices = (site.voices ?? []).map((v) =>
      v.id === voiceId
        ? {
            ...v,
            sunoPersonaId: personaId,
            sunoPersonaName: parsed.data?.name ?? personaName,
            sunoPersonaSourceTaskId: sample.sunoTaskId,
            sunoPersonaSourceAudioId: sample.sunoAudioId,
            sunoPersonaCreatedAt: new Date().toISOString(),
          }
        : v,
    );
    await this.sites.update(site.id, { voices });

    const updated = voices.find((v) => v.id === voiceId)!;
    return { voice: updated };
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
