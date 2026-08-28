import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';

const INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const DEFAULT_MODEL = 'lyria-3-pro-preview';
/** Versiunea de API cerută de Gemini Interactions API (header `Api-Revision`). */
const API_REVISION = '2026-05-20';
const TIMEOUT_MS = 12 * 60_000;
const POLL_MS = 4_000;
/** Timeout separat pentru descărcarea audio-ului de la `uri`-ul temporar. */
const DOWNLOAD_TIMEOUT_MS = 3 * 60_000;

/** Mesaj unic pentru cheia lipsă — operatorul trebuie să știe EXACT unde o pune. */
const MISSING_KEY_MESSAGE =
  'Cheia Gemini lipsește (GEMINI_API_KEY). Configureaz-o în admin → /settings → Chei → grupul „Gemini / Lyria", ' +
  'apoi reia generarea. Fără ea, motorul Google (Lyria) nu poate genera nimic.';

/**
 * Eroare care NU se rezolvă prin reîncercare (configurare lipsă / greșită).
 * `GenerationsProcessor` o detectează prin `isNonRetryableError()` și oprește
 * auto-retry-ul imediat, în loc să ardă ~50 tentative pe o cheie inexistentă.
 * Dacă apar și alte cazuri non-retryable în afara Lyria, mutăm clasa în `common/`.
 */
export class NonRetryableGenerationError extends Error {
  /** Marker duck-typed — verificat de processor fără import de clasă. */
  readonly nonRetryable = true;

  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableGenerationError';
  }
}

/** True dacă eroarea e marcată explicit ca non-retryable. */
export function isNonRetryableError(err: unknown): boolean {
  return (
    !!err && typeof err === 'object' && (err as { nonRetryable?: unknown }).nonRetryable === true
  );
}

/** Numele englezesc al limbii, pentru prompt-ul Lyria (multi-tenant, 8 limbi). */
const LOCALE_NAME: Record<string, string> = {
  ro: 'Romanian',
  bg: 'Bulgarian',
  sr: 'Serbian',
  tr: 'Turkish',
  el: 'Greek',
  hr: 'Croatian',
  sl: 'Slovenian',
  bs: 'Bosnian',
};

/** `ro` → `Romanian`. Fallback pe română pentru orice cod necunoscut. */
export function lyriaLanguageName(locale?: string | null): string {
  const key = (locale ?? '').trim().toLowerCase().slice(0, 2);
  return LOCALE_NAME[key] ?? 'Romanian';
}

export interface LyriaGenerateInput {
  stylePrompt: string;
  occasionPrompt?: string;
  lyrics: string;
  vocalGender?: 'm' | 'f';
  durationSec: number;
  instrumental?: boolean;
  generationId?: string;
  /** Codul limbii versurilor (ro, bg, sr, tr, el, hr, sl, bs). Default: ro. */
  lyricsLocale?: string;
  /** Override model. Omis → LYRIA_MODEL din settings. */
  model?: string;
  /**
   * Prompt complet, trimis ca `input` la Interactions API.
   * Când e setat, `buildLyriaPrompt` e sărit — playground custom.
   */
  promptOverride?: string;
}

export interface LyriaTrack {
  audio: Buffer;
  mimeType: string;
  lyrics?: string;
  interactionId: string;
}

export interface LyriaGenerateResult {
  tracks: LyriaTrack[];
  providerJobId: string;
}

/** Referință la audio-ul din răspuns: fie base64 inline, fie link temporar. */
interface LyriaAudioRef {
  data?: string;
  uri?: string;
  mimeType?: string;
}

@Injectable()
export class LyriaService {
  private readonly logger = new Logger('LyriaService');

  constructor(private readonly settings: SettingsService) {}

  /** Două variante full-length, în paralel (echivalentul celor 2 piese Suno). */
  async generatePair(input: LyriaGenerateInput): Promise<LyriaGenerateResult> {
    const [a, b] = await Promise.all([
      this.generateOne(input, 1),
      this.generateOne(input, 2),
    ]);
    return {
      tracks: [a, b],
      providerJobId: `lyria:${a.interactionId}+${b.interactionId}`,
    };
  }

  async generateOne(input: LyriaGenerateInput, variant = 1): Promise<LyriaTrack> {
    // O singură cheie: GEMINI_API_KEY (settings → env). Nu mai există fallback
    // pe GOOGLE_AI_API_KEY — cheia aia nu exista nici în schema de settings,
    // nici în env.validation, deci era o cale moartă care ascundea eroarea reală.
    const apiKey = await this.settings.get('GEMINI_API_KEY');
    if (!apiKey) throw new NonRetryableGenerationError(MISSING_KEY_MESSAGE);
    const model = input.model?.trim() || (await this.settings.get('LYRIA_MODEL')) || DEFAULT_MODEL;
    const prompt = input.promptOverride?.trim() || buildLyriaPrompt(input, variant);
    this.logger.log(
      `lyria generate v${variant} gen=${input.generationId?.slice(0, 8) ?? '-'} model=${model} prompt=${prompt.length}c`,
    );

    const created = await this.postInteraction(apiKey, {
      model,
      input: prompt,
    });
    const ready = await this.waitForAudio(apiKey, created);
    const ref = extractAudioRef(ready);
    if (!ref) {
      throw new Error(`Lyria n-a întors audio (interaction ${ready.id ?? '?'})`);
    }

    // Mime-ul preferat: cel din blocul de audio, apoi cel de la nivel de răspuns.
    let mimeType = ref.mimeType || extractAudioMime(ready) || '';
    let audio: Buffer;
    if (ref.data) {
      audio = Buffer.from(ref.data, 'base64');
    } else if (ref.uri) {
      // Răspuns cu link temporar în loc de base64 — îl descărcăm noi.
      const dl = await this.downloadAudio(apiKey, ref.uri);
      audio = dl.buffer;
      if (!mimeType && dl.mimeType) mimeType = dl.mimeType;
    } else {
      throw new Error(`Lyria n-a întors audio (interaction ${ready.id ?? '?'})`);
    }

    if (audio.length < 1000) {
      throw new Error('Lyria audio gol sau prea scurt');
    }
    return {
      audio,
      mimeType: mimeType || 'audio/mpeg',
      lyrics: extractText(ready) || undefined,
      interactionId: String(ready.id ?? `lyria-${Date.now()}`),
    };
  }

  private async postInteraction(apiKey: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await fetch(INTERACTIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
        'Api-Revision': API_REVISION,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const msg = formatGoogleError(json) || `Lyria HTTP ${res.status}`;
      throw new Error(msg);
    }
    return json;
  }

  private async getInteraction(apiKey: string, id: string): Promise<Record<string, unknown>> {
    const res = await fetch(`${INTERACTIONS_URL}/${encodeURIComponent(id)}`, {
      headers: {
        'x-goog-api-key': apiKey,
        'Api-Revision': API_REVISION,
      },
      signal: AbortSignal.timeout(60_000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const msg = formatGoogleError(json) || `Lyria GET HTTP ${res.status}`;
      throw new Error(msg);
    }
    return json;
  }

  /**
   * Descarcă audio-ul de la `uri`-ul temporar întors de API.
   * Cheia se trimite doar pe host-urile Google API — URL-urile pre-semnate
   * (storage) au deja semnătura în query și nu vor header în plus. Dacă prima
   * variantă ia 401/403, reîncercăm o dată cu decizia inversă.
   */
  private async downloadAudio(
    apiKey: string,
    uri: string,
  ): Promise<{ buffer: Buffer; mimeType: string | null }> {
    const attempt = (withKey: boolean): Promise<Response> => {
      const headers: Record<string, string> = { 'Api-Revision': API_REVISION };
      if (withKey) headers['x-goog-api-key'] = apiKey;
      return fetch(uri, { headers, signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    };

    const preferKey = uriNeedsApiKey(uri);
    let res = await attempt(preferKey);
    if (res.status === 401 || res.status === 403) {
      res = await attempt(!preferKey);
    }
    if (!res.ok) {
      throw new Error(`Lyria download audio HTTP ${res.status}`);
    }
    const contentType = res.headers.get('content-type');
    const buffer = Buffer.from(await res.arrayBuffer());
    return {
      buffer,
      mimeType: contentType && contentType.startsWith('audio/') ? contentType : null,
    };
  }

  private async waitForAudio(apiKey: string, initial: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (extractAudioRef(initial)) return initial;
    const id = typeof initial.id === 'string' ? initial.id : '';
    if (!id) return initial;
    const deadline = Date.now() + TIMEOUT_MS;
    let current = initial;
    while (Date.now() < deadline) {
      const status = String(current.status ?? current.state ?? '').toLowerCase();
      if (status.includes('fail') || status.includes('error') || status.includes('cancel')) {
        throw new Error(`Lyria status=${status}`);
      }
      if (extractAudioRef(current) || status === 'completed' || status === 'succeeded') {
        return current;
      }
      await sleep(POLL_MS);
      current = await this.getInteraction(apiKey, id);
    }
    throw new Error('Lyria timeout — audio-ul nu a venit în 12 minute');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function lyricsForLyria(raw: string): string {
  return (raw ?? '')
    .replace(/\[?\s*STROFA\s*(\d+)\s*\]?/gi, '[Verse $1]')
    .replace(/\[?\s*VERS(?:UL)?\s*(\d+)\s*\]?/gi, '[Verse $1]')
    .replace(/\[?\s*REFREN\s*\]?/gi, '[Chorus]')
    .replace(/\[?\s*PUNTE\s*\]?/gi, '[Bridge]')
    .replace(/\[?\s*INTRO\s*\]?/gi, '[Intro]')
    .replace(/\[?\s*OUTRO\s*\]?/gi, '[Outro]')
    .replace(/\[?\s*ADLIB\s*\]?/gi, '[Outro]')
    .trim();
}

export function buildLyriaPrompt(input: LyriaGenerateInput, variant: number): string {
  const minutes = Math.max(1, Math.round((input.durationSec || 120) / 60));
  const language = lyriaLanguageName(input.lyricsLocale);
  // Descrierea genului nu mai e hardcodată pe română: pe celelalte piețe
  // „Romanian manele" ar trage modelul spre limba greșită.
  const genre = language === 'Romanian' ? 'Romanian manele' : 'Balkan manele/chalga';
  const voiceStyle = language === 'Romanian' ? 'Romanian manele' : `${language} Balkan manele`;
  const voice =
    input.vocalGender === 'f'
      ? `female ${voiceStyle} vocal, ornamented, sung (not rapped)`
      : `male ${voiceStyle} vocal, ornamented, sung (not rapped)`;
  const take =
    variant === 2
      ? 'Second take: slightly different arrangement, more instrumental fills between vocal lines.'
      : 'First take: vocal-forward mix, tight groove.';
  const lines = [
    `Create a full-length ${minutes}-minute authentic ${genre} song.`,
    input.stylePrompt.trim(),
    input.occasionPrompt?.trim() ? `Occasion / theme: ${input.occasionPrompt.trim()}.` : '',
    `Lead vocal: ${voice}. Language: ${language}.`,
    input.instrumental
      ? 'Instrumental only, no vocals.'
      : `Sing the lyrics below exactly, in ${language}. Keep [Verse]/[Chorus]/[Bridge] structure.`,
    take,
    input.instrumental ? '' : 'Lyrics:',
    input.instrumental ? '' : lyricsForLyria(input.lyrics),
  ];
  return lines.filter((l) => l !== '').join('\n');
}

/**
 * Găsește audio-ul în răspuns. API-ul poate întoarce fie base64 (`data`), fie un
 * link temporar (`uri` / `file_uri`) — le tratăm pe amândouă și păstrăm mime-ul
 * declarat lângă blocul găsit.
 */
function extractAudioRef(json: Record<string, unknown>): LyriaAudioRef | null {
  const out = (json as {
    output_audio?: { data?: string; uri?: string; mime_type?: string; mimeType?: string };
  }).output_audio;
  if (out) {
    const mime = out.mime_type ?? out.mimeType;
    if (typeof out.data === 'string' && out.data.length > 80) {
      return { data: out.data, mimeType: mime };
    }
    if (typeof out.uri === 'string' && out.uri.startsWith('http')) {
      return { uri: out.uri, mimeType: mime };
    }
  }

  const steps = json.steps;
  if (!Array.isArray(steps)) return null;
  for (const step of steps) {
    const content = (step as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      const b = block as {
        type?: string;
        data?: string;
        uri?: string;
        mime_type?: string;
        mimeType?: string;
        inline_data?: { data?: string; mime_type?: string; mimeType?: string };
        file_data?: { file_uri?: string; uri?: string; mime_type?: string; mimeType?: string };
      };
      const isAudioBlock = b.type === 'audio' || b.type === 'audio_data';
      const blockMime = b.mime_type ?? b.mimeType;

      if (isAudioBlock && typeof b.data === 'string' && b.data.length > 80) {
        return { data: b.data, mimeType: blockMime };
      }
      if (typeof b.inline_data?.data === 'string' && b.inline_data.data.length > 80) {
        return {
          data: b.inline_data.data,
          mimeType: b.inline_data.mime_type ?? b.inline_data.mimeType ?? blockMime,
        };
      }
      const fileUri = b.file_data?.file_uri ?? b.file_data?.uri;
      if (typeof fileUri === 'string' && fileUri.startsWith('http')) {
        return {
          uri: fileUri,
          mimeType: b.file_data?.mime_type ?? b.file_data?.mimeType ?? blockMime,
        };
      }
      if (isAudioBlock && typeof b.uri === 'string' && b.uri.startsWith('http')) {
        return { uri: b.uri, mimeType: blockMime };
      }
    }
  }
  return null;
}

/** Trimitem `x-goog-api-key` doar pe host Google API nesemnat (vezi downloadAudio). */
function uriNeedsApiKey(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (!/(^|\.)googleapis\.com$/i.test(u.hostname)) return false;
    if (u.searchParams.has('X-Goog-Signature') || u.searchParams.has('Signature')) return false;
    return true;
  } catch {
    return false;
  }
}

function extractAudioMime(json: Record<string, unknown>): string | null {
  const out = (json as { output_audio?: { mime_type?: string; mimeType?: string } }).output_audio;
  const mime = out?.mime_type ?? out?.mimeType;
  if (typeof mime === 'string' && mime) return mime;
  return null;
}

function extractText(json: Record<string, unknown>): string | null {
  const t = (json as { output_text?: string }).output_text;
  if (typeof t === 'string' && t.trim()) return t.trim();
  return null;
}

function formatGoogleError(json: Record<string, unknown>): string {
  const err = json.error as { message?: string } | undefined;
  if (err?.message) return err.message;
  if (typeof json.message === 'string') return json.message;
  return '';
}
