import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../../settings/settings.service';
import {
  SunoAlignedWord,
  SunoCoverInput,
  SunoExtendInput,
  SunoGenerateInput,
  SunoGenerateResult,
  SunoProvider,
  SunoReplaceSectionInput,
  SunoSeparateResult,
  SunoTimestampedLyrics,
} from '../suno.types';
import { SunoLogService } from '../suno-log.service';

/**
 * Wrapper pentru sunoapi.org (https://docs.sunoapi.org).
 *
 * Flux:
 *   1. POST /api/v1/generate           → primim taskId
 *   2. GET  /api/v1/generate/record-info?taskId=... → polling până status = SUCCESS
 *   3. Răspunsul conține `sunoData[]` cu 2 piese (audioUrl + streamAudioUrl).
 *
 * Per documentație: stream URL-ul e gata în 30-40s, audio finalizat în 2-3 min.
 * Polling-ul aici așteaptă audio-ul finalizat (audioUrl).
 */
@Injectable()
export class SunoRealProvider extends SunoProvider {
  private readonly logger = new Logger('SunoRealProvider');

  constructor(
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
    private readonly logs: SunoLogService,
  ) {
    super();
  }

  async generate(input: SunoGenerateInput): Promise<SunoGenerateResult> {
    // SUNO_* citite din DB (admin /settings UI). API_URL rămâne din env (infra).
    const baseUrl = (await this.settings.get('SUNO_API_BASE_URL')) || 'https://api.sunoapi.org';
    const apiKey = await this.settings.get('SUNO_API_KEY');
    const model = (await this.settings.get('SUNO_MODEL')) || 'V4_5';
    const apiUrl = this.config.get<string>('API_URL') ?? 'http://localhost:1501';

    if (!apiKey) {
      throw new Error('SUNO_API_KEY not configured');
    }

    const customMode = !!input.lyrics;
    const limits = modelLimits(model);

    const body: Record<string, unknown> = {
      customMode,
      // Instrumental (fără voce) pentru pachetele plus/premium — parametrizabil.
      instrumental: !!input.instrumental,
      model,
      callBackUrl: `${apiUrl}/api/suno/callback`,
    };

    // Parametri Suno opționali — îi adăugăm doar dacă sunt setați, ca să nu
    // trimitem null-uri pe care API-ul Suno le-ar putea respinge.
    if (input.vocalGender === 'm' || input.vocalGender === 'f') {
      body.vocalGender = input.vocalGender;
    }
    if (customMode && input.personaId) {
      body.personaId = input.personaId;
      // voice_persona doar pe V5+ — fallback la style_persona altfel.
      const modelMajor = /^V(\d)/.exec(model)?.[1] ?? '4';
      const safeModel =
        input.personaModel === 'voice_persona' && parseInt(modelMajor, 10) >= 5
          ? 'voice_persona'
          : 'style_persona';
      body.personaModel = safeModel;
    }
    if (typeof input.styleWeight === 'number' && input.styleWeight >= 0 && input.styleWeight <= 1) {
      body.styleWeight = Math.round(input.styleWeight * 100) / 100;
    }
    if (
      typeof input.weirdnessConstraint === 'number' &&
      input.weirdnessConstraint >= 0 &&
      input.weirdnessConstraint <= 1
    ) {
      body.weirdnessConstraint = Math.round(input.weirdnessConstraint * 100) / 100;
    }
    // negativeTags: pe lângă cele configurate per-stil, excludem explicit genul
    // vocal opus — vocalGender singur e doar un hint și pierde în fața textului
    // de style dacă acesta conține descriptori de gen contradictorii.
    const negativeParts: string[] = [];
    if (input.negativeTags?.trim()) negativeParts.push(input.negativeTags.trim());
    if (input.vocalGender === 'f') negativeParts.push('male vocals, male voice, man singer');
    else if (input.vocalGender === 'm') negativeParts.push('female vocals, female voice, woman singer');
    if (negativeParts.length) {
      body.negativeTags = negativeParts.join(', ');
    }

    // Curățăm prefixele duplicate pe care utilizatorii le tastează în câmpurile
    // de dedicație / nume ("De la X" în câmpul dedicație → ar produce "de la De la X").
    const cleanDedication = stripLeadingPrefix(input.dedication, ['de la', 'from']);
    const cleanRecipient = stripLeadingPrefix(input.recipientName, ['pentru', 'for']);
    const cleanInput: SunoGenerateInput = {
      ...input,
      dedication: cleanDedication,
      recipientName: cleanRecipient,
    };

    if (customMode) {
      // versurile noastre AI-generated → Custom Mode (prompt = lyrics literal).
      // Scoatem și nume de artiști reali din lyrics pentru orice eventualitate
      // (Suno respinge dacă apar în prompt sau style).
      const safeLyrics = stripBannedArtistNames(cleanInput.lyrics ?? '');
      body.prompt = truncate(this.ensureDedicationOpening(safeLyrics, cleanInput), limits.prompt);
      body.style = truncate(this.buildStyleTag(cleanInput), limits.style);
      const titleBase = cleanDedication
        ? `Pentru ${cleanRecipient}, de la ${cleanDedication}`
        : `Pentru ${cleanRecipient}`;
      body.title = truncate(titleBase, limits.title);
    } else {
      // Non-custom: Suno generează versurile pe baza prompt-ului. Limita e 500.
      body.prompt = truncate(this.buildSimplePrompt(cleanInput), limits.simplePrompt);
    }

    this.logger.log(
      `submit task model=${model} customMode=${customMode} recipient=${input.recipientName}`,
    );

    const submitEndpoint = `${baseUrl}/api/v1/generate`;
    const log = await this.logs.start({
      generationId: input.generationId ?? null,
      endpoint: submitEndpoint,
      requestBody: body,
      siteId: input.site?.id ?? null,
      requestType: input.requestType ?? 'submit',
    });

    let submitRes: Response;
    try {
      submitRes = await fetch(submitEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      const msg = (err as Error).message;
      await this.logs.finalize(log?.id, {
        outcome: 'http_error',
        errorMessage: `network: ${msg}`,
      });
      throw new Error(`Suno network error: ${msg}`);
    }

    if (!submitRes.ok) {
      const txt = await submitRes.text();
      await this.logs.finalize(log?.id, {
        responseStatus: submitRes.status,
        responseBody: safeParseJson(txt),
        outcome: 'http_error',
        errorMessage: txt.slice(0, 1000),
      });
      throw new Error(`Suno submit failed ${submitRes.status}: ${txt}`);
    }
    const submitJson = (await submitRes.json()) as {
      code: number;
      msg?: string;
      data?: { taskId?: string };
    };
    if (submitJson.code !== 200 || !submitJson.data?.taskId) {
      await this.logs.finalize(log?.id, {
        responseStatus: submitRes.status,
        responseBody: submitJson,
        outcome: 'failed',
        providerStatus: `code:${submitJson.code}`,
        errorMessage: submitJson.msg ?? 'no taskId',
      });
      throw new Error(`Suno submit returned ${submitJson.code}: ${submitJson.msg ?? 'no taskId'}`);
    }
    const taskId = submitJson.data.taskId;
    this.logger.log(`taskId=${taskId}, polling pentru audio finalizat`);

    // Polling — max 8 min, la 8s. Suno trece prin TEXT_SUCCESS → FIRST_SUCCESS
    // → SUCCESS; a doua piesă uneori prinde a treia minute. 6 min era prea
    // strict și pierdea ocazional generări care erau valide pe partea Suno.
    const deadline = Date.now() + 8 * 60_000;
    let lastStatus = '';
    let lastPollJson: unknown = null;
    let lastPollStatus = 200;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 8000));
      const pollRes = await fetch(
        `${baseUrl}/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      if (!pollRes.ok) {
        this.logger.warn(`poll non-200: ${pollRes.status}`);
        lastPollStatus = pollRes.status;
        continue;
      }
      const pollJson = (await pollRes.json()) as {
        code: number;
        data?: {
          status?: string;
          response?: {
            sunoData?: Array<{
              id: string;
              audioUrl?: string;
              streamAudioUrl?: string;
              imageUrl?: string;
              duration?: number;
              prompt?: string;
              title?: string;
            }>;
          };
          errorMessage?: string | null;
        };
      };
      lastPollJson = pollJson;
      lastPollStatus = pollRes.status;

      const status = pollJson.data?.status ?? '';
      if (status !== lastStatus) {
        this.logger.log(`taskId=${taskId} status=${status}`);
        lastStatus = status;
      }

      // Audio gata în orice stare terminală inclusiv CALLBACK_EXCEPTION
      // (generarea a reușit, doar webhook-ul nu ne-a putut atinge — irelevant pentru polling).
      const items = pollJson.data?.response?.sunoData ?? [];
      const ready = items.filter((it) => !!it.audioUrl);
      if (ready.length > 0 && (status === 'SUCCESS' || status === 'CALLBACK_EXCEPTION')) {
        await this.logs.finalize(log?.id, {
          responseStatus: lastPollStatus,
          responseBody: pollJson,
          taskId,
          providerStatus: status,
          outcome: 'success',
        });
        return {
          tracks: ready.map((it) => ({
            audioUrl: it.audioUrl!,
            durationSec: Math.round(it.duration ?? input.durationSec),
            coverUrl: it.imageUrl,
            audioId: it.id,
          })),
          lyrics: items[0]?.prompt,
          providerJobId: taskId,
        };
      }

      if (
        status === 'CREATE_TASK_FAILED' ||
        status === 'GENERATE_AUDIO_FAILED' ||
        status === 'SENSITIVE_WORD_ERROR'
      ) {
        const reason = pollJson.data?.errorMessage ?? '';
        await this.logs.finalize(log?.id, {
          responseStatus: lastPollStatus,
          responseBody: pollJson,
          taskId,
          providerStatus: status,
          outcome: 'failed',
          errorMessage: `${status} — ${reason}`,
        });
        throw new Error(`Suno failed: ${status} — ${reason}`);
      }
    }

    await this.logs.finalize(log?.id, {
      responseStatus: lastPollStatus,
      responseBody: lastPollJson,
      taskId,
      providerStatus: lastStatus || 'TIMEOUT',
      outcome: 'timeout',
      errorMessage: `polling timeout after 8 minutes (last status: ${lastStatus || 'none'})`,
    });
    throw new Error(`Suno taskId=${taskId} polling timeout după 8 minute`);
  }

  /**
   * Versurile aliniate temporal (timestamped lyrics) pentru o piesă a unui task.
   * POST /api/v1/generate/get-timestamped-lyrics cu body { taskId, audioId }.
   * Graceful: întoarce `null` la orice eșec (network, non-200, body invalid).
   */
  async getTimestampedLyrics(
    taskId: string,
    audioId: string,
  ): Promise<SunoTimestampedLyrics | null> {
    if (!taskId || !audioId) return null;
    try {
      const baseUrl =
        (await this.settings.get('SUNO_API_BASE_URL')) || 'https://api.sunoapi.org';
      const apiKey = await this.settings.get('SUNO_API_KEY');
      if (!apiKey) {
        this.logger.warn('getTimestampedLyrics: SUNO_API_KEY lipsește');
        return null;
      }
      const res = await fetch(`${baseUrl}/api/v1/generate/get-timestamped-lyrics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ taskId, audioId }),
      });
      if (!res.ok) {
        this.logger.warn(
          `getTimestampedLyrics non-200 (${res.status}) taskId=${taskId} audioId=${audioId}`,
        );
        return null;
      }
      const json = (await res.json()) as {
        code?: number;
        data?: {
          alignedWords?: Array<{
            word?: string;
            success?: boolean;
            start_s?: number;
            end_s?: number;
            startS?: number;
            endS?: number;
          }>;
        };
      };
      const raw = json.data?.alignedWords;
      if (!Array.isArray(raw) || raw.length === 0) return null;
      const alignedWords: SunoAlignedWord[] = raw.map((w) => ({
        word: String(w.word ?? ''),
        success: !!w.success,
        startS: Number(w.startS ?? w.start_s ?? 0),
        endS: Number(w.endS ?? w.end_s ?? 0),
      }));
      return { alignedWords };
    } catch (err) {
      this.logger.warn(
        `getTimestampedLyrics eșuat (taskId=${taskId}): ${(err as Error).message}`,
      );
      return null;
    }
  }

  // ======================================================================
  //  Unelte Suno suplimentare (extend / cover / wav / karaoke / video / credits)
  //  Toate refolosesc cheia + baseUrl din settings și loghează în suno_logs.
  // ======================================================================

  private async cfg(): Promise<{ baseUrl: string; apiKey: string; model: string; callBackUrl: string }> {
    const baseUrl = (await this.settings.get('SUNO_API_BASE_URL')) || 'https://api.sunoapi.org';
    const apiKey = await this.settings.get('SUNO_API_KEY');
    const model = (await this.settings.get('SUNO_MODEL')) || 'V4_5';
    const apiUrl = this.config.get<string>('API_URL') ?? 'http://localhost:1501';
    if (!apiKey) throw new Error('SUNO_API_KEY not configured');
    return { baseUrl, apiKey, model, callBackUrl: `${apiUrl}/api/suno/callback` };
  }

  /** Prelungește o piesă existentă (POST /api/v1/generate/extend). */
  async extendMusic(input: SunoExtendInput): Promise<SunoGenerateResult> {
    const { baseUrl, callBackUrl, model: cfgModel } = await this.cfg();
    const custom = !!(input.prompt || input.style || input.title || input.continueAt != null);
    const body: Record<string, unknown> = {
      defaultParamFlag: custom,
      audioId: input.audioId,
      model: input.model || cfgModel,
      callBackUrl,
    };
    if (custom) {
      if (input.prompt) body.prompt = input.prompt;
      if (input.style) body.style = input.style;
      if (input.title) body.title = input.title;
      if (typeof input.continueAt === 'number') body.continueAt = input.continueAt;
    }
    if (input.vocalGender === 'm' || input.vocalGender === 'f') body.vocalGender = input.vocalGender;
    if (input.negativeTags?.trim()) body.negativeTags = input.negativeTags.trim();
    if (typeof input.styleWeight === 'number') body.styleWeight = clamp01(input.styleWeight);
    if (typeof input.weirdnessConstraint === 'number')
      body.weirdnessConstraint = clamp01(input.weirdnessConstraint);
    if (typeof input.audioWeight === 'number') body.audioWeight = clamp01(input.audioWeight);

    return this.submitMusicTask(`${baseUrl}/api/v1/generate/extend`, body, {
      generationId: input.generationId ?? null,
      siteId: input.siteId ?? null,
    });
  }

  /** Cover/restyle al unui audio încărcat (POST /api/v1/generate/upload-cover). */
  async coverMusic(input: SunoCoverInput): Promise<SunoGenerateResult> {
    const { baseUrl, callBackUrl, model: cfgModel } = await this.cfg();
    const model = input.model || cfgModel;
    const limits = modelLimits(model);
    const custom = input.customMode ?? !!(input.prompt || input.style);
    const body: Record<string, unknown> = {
      uploadUrl: input.uploadUrl,
      model,
      customMode: custom,
      instrumental: !!input.instrumental,
      callBackUrl,
    };
    if (custom) {
      if (input.style) body.style = truncate(input.style, limits.style);
      if (input.title) body.title = truncate(input.title, limits.title);
      if (!input.instrumental && input.prompt)
        body.prompt = truncate(stripBannedArtistNames(input.prompt), limits.prompt);
    } else if (input.prompt) {
      body.prompt = truncate(input.prompt, limits.simplePrompt);
    }
    if (input.vocalGender === 'm' || input.vocalGender === 'f') body.vocalGender = input.vocalGender;
    if (input.negativeTags?.trim()) body.negativeTags = input.negativeTags.trim();
    if (typeof input.styleWeight === 'number') body.styleWeight = clamp01(input.styleWeight);
    if (typeof input.weirdnessConstraint === 'number')
      body.weirdnessConstraint = clamp01(input.weirdnessConstraint);
    if (typeof input.audioWeight === 'number') body.audioWeight = clamp01(input.audioWeight);

    return this.submitMusicTask(`${baseUrl}/api/v1/generate/upload-cover`, body, {
      generationId: input.generationId ?? null,
      siteId: input.siteId ?? null,
    });
  }

  /** Înlocuiește o secțiune (POST /api/v1/generate/replace-section). */
  async replaceSection(input: SunoReplaceSectionInput): Promise<SunoGenerateResult> {
    const { baseUrl, callBackUrl } = await this.cfg();
    const body: Record<string, unknown> = {
      taskId: input.taskId,
      audioId: input.audioId,
      infillStartS: Math.max(0, Math.round(input.infillStartS * 100) / 100),
      infillEndS: Math.max(0, Math.round(input.infillEndS * 100) / 100),
      callBackUrl,
    };
    if (input.tags?.trim()) body.tags = input.tags.trim();
    if (input.prompt?.trim()) body.prompt = stripBannedArtistNames(input.prompt.trim());
    if (input.title?.trim()) body.title = input.title.trim().slice(0, 80);
    if (input.negativeTags?.trim()) body.negativeTags = input.negativeTags.trim();
    return this.submitMusicTask(`${baseUrl}/api/v1/generate/replace-section`, body, {
      generationId: input.generationId ?? null,
      siteId: input.siteId ?? null,
    });
  }

  /** Convertește o piesă la WAV (POST /api/v1/wav/generate → poll /wav/record-info). */
  async convertToWav(taskId: string, audioId: string): Promise<string | null> {
    const { baseUrl, callBackUrl } = await this.cfg();
    const newTaskId = await this.submitDerivedTask(`${baseUrl}/api/v1/wav/generate`, {
      taskId,
      audioId,
      callBackUrl,
    });
    if (!newTaskId) return null;
    const data = await this.pollDerivedTask(`${baseUrl}/api/v1/wav/record-info`, newTaskId);
    return deepFindUrl(data, ['audioWavUrl', 'audio_wav_url', 'wavUrl', 'wav_url']);
  }

  /** Separă vocea/instrumentalul (POST /api/v1/vocal-removal/generate). */
  async separateVocals(
    taskId: string,
    audioId: string,
    type: 'separate_vocal' | 'split_stem' = 'separate_vocal',
  ): Promise<SunoSeparateResult | null> {
    const { baseUrl, callBackUrl } = await this.cfg();
    const newTaskId = await this.submitDerivedTask(`${baseUrl}/api/v1/vocal-removal/generate`, {
      taskId,
      audioId,
      type,
      callBackUrl,
    });
    if (!newTaskId) return null;
    const data = await this.pollDerivedTask(`${baseUrl}/api/v1/vocal-removal/record-info`, newTaskId);
    if (!data) return null;
    if (type === 'split_stem') {
      const info = deepFindObject(data, ['vocal_removal_info', 'vocalRemovalInfo']) ?? {};
      const stems: Record<string, string> = {};
      for (const [k, v] of Object.entries(info)) {
        if (typeof v === 'string' && /^https?:\/\//.test(v)) {
          stems[k.replace(/_url$/i, '').replace(/Url$/, '')] = v;
        }
      }
      return Object.keys(stems).length ? { stems } : null;
    }
    return {
      vocalUrl: deepFindUrl(data, ['vocal_url', 'vocalUrl']) ?? undefined,
      instrumentalUrl: deepFindUrl(data, ['instrumental_url', 'instrumentalUrl']) ?? undefined,
    };
  }

  /** Generează un videoclip MP4 (POST /api/v1/mp4/generate → poll /mp4/record-info). */
  async createMusicVideo(
    taskId: string,
    audioId: string,
    opts?: { author?: string; domainName?: string },
  ): Promise<string | null> {
    const { baseUrl, callBackUrl } = await this.cfg();
    const body: Record<string, unknown> = { taskId, audioId, callBackUrl };
    if (opts?.author) body.author = opts.author.slice(0, 50);
    if (opts?.domainName) body.domainName = opts.domainName.slice(0, 50);
    const newTaskId = await this.submitDerivedTask(`${baseUrl}/api/v1/mp4/generate`, body);
    if (!newTaskId) return null;
    const data = await this.pollDerivedTask(`${baseUrl}/api/v1/mp4/record-info`, newTaskId);
    return deepFindUrl(data, ['video_url', 'videoUrl']);
  }

  /** Soldul de credite Suno (GET /api/v1/generate/credit). */
  async getCredits(): Promise<number | null> {
    try {
      const { baseUrl, apiKey } = await this.cfg();
      const res = await fetch(`${baseUrl}/api/v1/generate/credit`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { code?: number; data?: unknown };
      const v = typeof json.data === 'number' ? json.data : Number(json.data);
      return Number.isFinite(v) ? v : null;
    } catch (err) {
      this.logger.warn(`getCredits failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Helper comun pentru task-urile care produc MUZICĂ (extend / cover): submit
   * + polling pe `/generate/record-info` (același format ca generate). Loghează
   * în suno_logs pentru cost tracking.
   */
  private async submitMusicTask(
    endpoint: string,
    body: Record<string, unknown>,
    ctx: { generationId: string | null; siteId: string | null },
  ): Promise<SunoGenerateResult> {
    const { baseUrl, apiKey } = await this.cfg();
    const log = await this.logs.start({
      generationId: ctx.generationId,
      endpoint,
      requestBody: body,
      siteId: ctx.siteId,
    });
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
    } catch (err) {
      await this.logs.finalize(log?.id, { outcome: 'http_error', errorMessage: `network: ${(err as Error).message}` });
      throw new Error(`Suno network error: ${(err as Error).message}`);
    }
    if (!res.ok) {
      const txt = await res.text();
      await this.logs.finalize(log?.id, { responseStatus: res.status, responseBody: safeParseJson(txt), outcome: 'http_error', errorMessage: txt.slice(0, 1000) });
      throw new Error(`Suno ${endpoint} failed ${res.status}: ${txt}`);
    }
    const json = (await res.json()) as { code: number; msg?: string; data?: { taskId?: string } };
    if (json.code !== 200 || !json.data?.taskId) {
      await this.logs.finalize(log?.id, { responseStatus: res.status, responseBody: json, outcome: 'failed', providerStatus: `code:${json.code}`, errorMessage: json.msg ?? 'no taskId' });
      throw new Error(`Suno ${endpoint} returned ${json.code}: ${json.msg ?? 'no taskId'}`);
    }
    const taskId = json.data.taskId;

    const deadline = Date.now() + 8 * 60_000;
    let lastStatus = '';
    let lastJson: unknown = null;
    let lastHttp = 200;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 8000));
      const poll = await fetch(`${baseUrl}/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!poll.ok) { lastHttp = poll.status; continue; }
      const pj = (await poll.json()) as {
        code: number;
        data?: { status?: string; response?: { sunoData?: Array<{ id: string; audioUrl?: string; imageUrl?: string; duration?: number; prompt?: string }> }; errorMessage?: string | null };
      };
      lastJson = pj; lastHttp = poll.status;
      const status = pj.data?.status ?? '';
      if (status !== lastStatus) { this.logger.log(`task=${taskId} status=${status}`); lastStatus = status; }
      const items = (pj.data?.response?.sunoData ?? []).filter((it) => !!it.audioUrl);
      if (items.length > 0 && (status === 'SUCCESS' || status === 'CALLBACK_EXCEPTION')) {
        await this.logs.finalize(log?.id, { responseStatus: lastHttp, responseBody: pj, taskId, providerStatus: status, outcome: 'success' });
        return {
          tracks: items.map((it) => ({ audioUrl: it.audioUrl!, durationSec: Math.round(it.duration ?? 0), coverUrl: it.imageUrl, audioId: it.id })),
          lyrics: items[0]?.prompt,
          providerJobId: taskId,
        };
      }
      if (status === 'CREATE_TASK_FAILED' || status === 'GENERATE_AUDIO_FAILED' || status === 'SENSITIVE_WORD_ERROR') {
        await this.logs.finalize(log?.id, { responseStatus: lastHttp, responseBody: pj, taskId, providerStatus: status, outcome: 'failed', errorMessage: `${status} — ${pj.data?.errorMessage ?? ''}` });
        throw new Error(`Suno failed: ${status} — ${pj.data?.errorMessage ?? ''}`);
      }
    }
    await this.logs.finalize(log?.id, { responseStatus: lastHttp, responseBody: lastJson, taskId, providerStatus: lastStatus || 'TIMEOUT', outcome: 'timeout', errorMessage: `polling timeout after 8 minutes` });
    throw new Error(`Suno task=${taskId} polling timeout`);
  }

  /**
   * Submit pentru task-urile DERIVATE (wav / vocal-removal / mp4) — întoarce
   * doar taskId-ul nou. Loghează best-effort. Întoarce null la eșec.
   */
  private async submitDerivedTask(endpoint: string, body: Record<string, unknown>): Promise<string | null> {
    const { apiKey } = await this.cfg();
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        this.logger.warn(`derived task ${endpoint} http ${res.status}: ${(await res.text()).slice(0, 300)}`);
        return null;
      }
      const json = (await res.json()) as { code?: number; msg?: string; data?: { taskId?: string } };
      if (json.code !== 200 || !json.data?.taskId) {
        this.logger.warn(`derived task ${endpoint} code=${json.code} msg=${json.msg}`);
        return null;
      }
      return json.data.taskId;
    } catch (err) {
      this.logger.warn(`derived task ${endpoint} error: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Polling generic pentru task-uri derivate (wav/vocal/mp4). Răspunsul exact e
   * `any` în spec — căutăm un URL de output în orice câmp; oprire pe successFlag
   * de eroare (2/3) sau errorCode 500. Întoarce `data` brut pentru extragere.
   */
  private async pollDerivedTask(recordInfoUrl: string, taskId: string): Promise<unknown | null> {
    const { apiKey } = await this.cfg();
    const deadline = Date.now() + 6 * 60_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 6000));
      let res: Response;
      try {
        res = await fetch(`${recordInfoUrl}?taskId=${encodeURIComponent(taskId)}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
      } catch {
        continue;
      }
      if (!res.ok) continue;
      const json = (await res.json()) as { code?: number; data?: Record<string, unknown> };
      const data = json.data;
      if (!data) continue;
      const successFlag = data.successFlag as number | undefined;
      const errorCode = data.errorCode as number | undefined;
      // Eșec terminal.
      if (successFlag === 2 || successFlag === 3 || errorCode === 500) {
        this.logger.warn(`derived poll ${taskId} failed: ${String(data.errorMessage ?? '')}`);
        return null;
      }
      // Dacă găsim deja un URL http în răspuns → gata.
      if (deepFindUrl(data, ['_url', 'Url', 'url'], true)) return data;
    }
    this.logger.warn(`derived poll ${taskId} timeout`);
    return null;
  }

  /**
   * Construiește tag-ul de stil (genre + voice + occasion) pentru Suno.
   * Tag-urile sunt separate prin virgulă, max ~1000 chars.
   *
   * Per-site overrides:
   *   - site.suno.stylePromptMap[style] — override complet pentru un stil
   *   - site.suno.basePrompt            — înlocuiește CORE-ul default
   */
  private buildStyleTag(i: SunoGenerateInput): string {
    // Prefix explicit de gen la ÎNCEPUTUL tag-ului (nu la final, ca să nu cadă
    // la truncate) + aliniem orice mențiune de gen din restul textului.
    // Sursele (basePrompt per-site din DB, stylePromptMap, styleMap hardcodat)
    // conțin istoric "male vocal" — nealiniate, contrazic parametrul vocalGender
    // și Suno generează voce greșită la comenzile cu voce feminină.
    const genderTag =
      i.vocalGender === 'f'
        ? 'female vocals only, woman singer, '
        : i.vocalGender === 'm'
          ? 'male vocals only, man singer, '
          : '';
    const siteSuno = i.site?.suno;
    const styleOverride = siteSuno?.stylePromptMap?.[i.style];
    if (styleOverride) {
      const occasionHint = occasionStyleHint(i);
      return genderTag + alignVocalGender(`${styleOverride}${occasionHint}`, i.vocalGender);
    }
    // Bază obligatorie: scări orientale + instrumentație + vocal style autentic manele.
    // IMPORTANT: NU includem nume de artiști reali — Suno respinge tag-urile cu artist names
    // (SENSITIVE_WORD_ERROR: "we don't reference specific artists"). Descriem doar
    // caracteristici sonore.
    //
    // Când vocalGender e setat explicit (parametru direct Suno + genderTag), folosim
    // descriptor neutru ca să nu intre în conflict cu cererea (ex. voce feminină).
    const vocalDescriptor = i.vocalGender
      ? 'ornamented melismatic vocal with heavy auto-tune, pitch slides and "of/aoleu" interjections'
      : 'ornamented melismatic male vocal with heavy auto-tune, pitch slides and "of/aoleu" interjections';
    const CORE = siteSuno?.basePrompt ??
      'Romanian MANELE (NOT pop, NOT EDM, NOT generic dance, NOT trap-rap), authentic balkan gypsy pop, classic Romanian wedding-band manele tradition (Pitești / București scene, late 90s through 2010s era), ' +
      `Hijaz Phrygian-dominant oriental scale, ${vocalDescriptor}, ` +
      'darbuka derbeke percussion, finger cymbals, oriental synth lead (Korg Pa keyboard, taksim), ' +
      'accordion runs, violin glissando, clarinet trills, deep dumbek kick, fast hi-hat triplets, Romanian language';

    const styleMap: Record<string, string> = {
      clasic:
        'classic lăutărească manele, traditional gypsy wedding band, live accordion, violin lăutar, ' +
        'cobză strumming, sweet melancholic male voice, 90s Romanian manele sound, mid tempo 95 BPM',
      modern:
        'modern manele 2020s, trap-manea production, oriental synth over 808 sub-bass, ' +
        'auto-tune heavy male vocal, melismatic runs, hi-hat rolls, early-2010s Romanian commercial-manele production sound, 100 BPM',
      oriental:
        'heavy oriental manele, turkish arabic flavor, oud and saz, darbuka groove, ' +
        'maqam Hijaz scale, melismatic crying vocal, ney flute fills, slow 85 BPM',
      trompeta:
        'manele cu trompetă, balkan brass band fanfare style, blasting trumpets and trombones, ' +
        'gypsy fanfara ciocărlia energy, accordion lead, fast 120 BPM dance',
      romantica:
        'manea de dragoste romantica, heartbreak ballad, oriental sad scale, ' +
        'crying male vocal with sobs and falsetto runs, soft accordion, weeping violin, slow 70 BPM',
      comerciala:
        'manele comerciale de club, oriental hook with club-energy chorus, manele DNA stays dominant, ' +
        'auto-tune melismatic male vocal, oriental synth lead, darbuka groove with modern kick, party energy, 105 BPM',
      opulenta:
        'manele de bani, opulent luxury manele, șmecher boss vibe, brass stabs and oriental synth, ' +
        'auto-tune male vocal bragging tone, big money references, 100 BPM',
      iubire:
        'manea de iubire romantica, warm tender male vocal, ornamented melisma, ' +
        'soft accordion, violin counter-melody, oriental scale, mid tempo 90 BPM',
      tallava:
        'Balkan tallava, Albanian Macedonian roma manele fusion, frantic clarinet solos, ' +
        'rapid accordion runs, darbuka and tapan drums, oriental scale, fast 130 BPM dance',
      kuchek:
        'Bulgarian Roma kuchek, 9/8 odd-meter dance, blasting brass band, ' +
        'darbuka and tapan, accordion ornaments, fanfare energy, 130 BPM',
      trapanele:
        'romanian trap-manele where manele DNA dominates the trap beat, oriental Hijaz synth lead carries the melody, ' +
        'darbuka layered over trap 808s, melismatic manele male vocal with auto-tune (sung manele, NOT rap), ' +
        'hi-hat triplets stay subtle so accordion and oriental synth remain front, 130-140 BPM',
      pahar:
        'manea de pahar petrecere, festive drinking song, live wedding band feel, ' +
        'accordion and violin trade solos, hand claps, glasses clinking, celebratory shouts, 100 BPM',
    };

    const styleText = styleMap[i.style] ?? `${i.style} manele subgenre`;
    const occasionHint = occasionStyleHint(i);
    return genderTag + alignVocalGender(`${CORE}, ${styleText}${occasionHint}`, i.vocalGender);
  }

  private buildSimplePrompt(i: SunoGenerateInput): string {
    const dedicationOpening = i.dedication
      ? `OPENING (must be sung CLEARLY in the first 5 seconds): "De la ${i.dedication}, pentru ${i.recipientName}".`
      : `OPENING (must be sung CLEARLY in the first 5 seconds): "Pentru ${i.recipientName}".`;
    const parts = [
      `Authentic Romanian MANELE song (balkan gypsy pop, oriental Hijaz scale, darbuka, accordion, violin, melismatic auto-tuned male vocal) — subgenre: ${i.style}, occasion: ${i.occasion}.`,
      dedicationOpening,
      i.message ? `Personal message to weave in: "${i.message.slice(0, 180)}"` : '',
      `Romanian language. Must sound like real Romanian manele, NOT pop, NOT EDM, NOT rap.`,
    ];
    // Aliniem descriptorul vocal hardcodat ("male vocal") cu genul cerut.
    // Doar replace in-place, fără prefix — limita simplePrompt e 480 chars.
    return alignVocalGender(parts.filter(Boolean).join(' '), i.vocalGender);
  }

  /**
   * Garantează că primele 2 rânduri CÂNTATE (după tag-ul [Verse 1], NU în [Intro])
   * conțin atât expeditorul cât și destinatarul, plus esența mesajului.
   *
   * Suno tratează tot ce e între [paranteze] ca metadată instrumentală — vocea
   * cântă DOAR liniile dintre tag-uri. De aceea injectăm întotdeauna în [Verse 1].
   *
   * Algoritm:
   *  1. Dacă AI-ul a pus deja dedicația+destinatarul în primele 2 rânduri sung
   *     din [Verse 1], lăsăm ca atare.
   *  2. Altfel, găsim tag-ul [Verse 1] și prepend-uim 2 rânduri clare imediat
   *     după el (sau create [Intro] + [Verse 1] dacă lipsesc cu totul).
   */
  private ensureDedicationOpening(lyrics: string, i: SunoGenerateInput): string {
    // Versurile furnizate explicit de client sunt SACRE: se cântă EXACT ce a
    // pus/acceptat userul în chat, fără să injectăm sau să suprascriem
    // deschiderea cu dedicația ("De la X, pentru Y, cu drag" + mesajul).
    if (i.lyricsAreCustom) return lyrics;
    if (!i.dedication) return lyrics;

    const recipient = i.recipientName.trim();
    const dedication = i.dedication.trim();
    const messageHook = condenseForOpening(i.message ?? '');

    const openingLines = [
      `De la ${dedication}, pentru ${recipient}, cu drag,`,
      messageHook ? `${messageHook}.` : `Astăzi e o zi mare, vine inima cu mine.`,
    ];

    // Verificăm dacă deschiderea cântată conține deja numele. Ne uităm la primele
    // rânduri sung din ÎNTREAGA piesă ([Spoken Intro] e și el rostit de voce, nu
    // doar [Verse 1]) și comparăm normalizat: din dedicație ne interesează doar
    // numele expeditorului (userii scriu adesea fraze gen "Mama X pentru familia mea"),
    // iar din destinatar fiecare nume în parte (poate fi listă: "Eva, Sofia și Dani").
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
    const dedicationName = norm(dedication.split(/\s+pentru\s+/i)[0] || dedication);
    // notă: \b nu funcționează cu diacritice în JS regex, deci "și" se separă prin spații
    const recipientNames = recipient
      .split(/[,&]|\s+și\s+|\s+si\s+/i)
      .map(norm)
      .filter(Boolean);
    const sungOpening = norm(
      stripBracketContent(lyrics)
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !/^\(.*\)$/.test(l)) // sărim liniile pur instrumentale "(...)"
        .slice(0, 4)
        .join(' '),
    );
    if (
      sungOpening.includes(dedicationName) &&
      recipientNames.every((n) => sungOpening.includes(n))
    ) {
      return lyrics; // deschiderea acoperă deja expeditorul + destinatarii
    }

    const verseMatch = lyrics.match(/\[Verse\s*1[^\]]*\]([\s\S]{0,400})/i);
    if (verseMatch) {
      // Înlocuim primele rânduri sung cu deschiderea noastră, păstrăm restul versului.
      return lyrics.replace(
        /(\[Verse\s*1[^\]]*\])([\s\S]*?)(?=\n\s*\[)/i,
        (_, tag: string, body: string) => {
          const remaining = body
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
            .slice(2) // sărim peste primele 2 rânduri vechi (le înlocuim)
            .join('\n');
          return `${tag}\n${openingLines.join('\n')}${remaining ? '\n' + remaining : ''}\n`;
        },
      );
    }

    // Lyrics-ul nu are [Verse 1]: construim un schelet minim valid pentru Suno.
    return `[Intro: oriental synth taksim, accordion doina]\n[Verse 1]\n${openingLines.join('\n')}\n\n${lyrics}`;
  }
}

/**
 * Limite de caractere per-model conform docs.sunoapi.org:
 *  - V4:                       prompt 3000, style 200, title 80, simplePrompt 500
 *  - V4_5, V4_5PLUS, V5, V5_5: prompt 5000, style 1000, title 100, simplePrompt 500
 *  - V4_5ALL:                  prompt 5000, style 1000, title 80, simplePrompt 500
 *
 * Lăsăm o marjă mică (50 chars la prompt, 5 la style/title) ca să nu fim
 * exact pe limită.
 */
function modelLimits(model: string): {
  prompt: number;
  style: number;
  title: number;
  simplePrompt: number;
} {
  const m = (model || '').toUpperCase();
  if (m === 'V4') {
    return { prompt: 2950, style: 195, title: 78, simplePrompt: 480 };
  }
  if (m === 'V4_5ALL') {
    return { prompt: 4900, style: 950, title: 78, simplePrompt: 480 };
  }
  // V4_5, V4_5PLUS, V5, V5_5 + default
  // Nota: documentatia spune 100 dar API-ul enforceaza 80 in practica → 75 cu marja.
  return { prompt: 4900, style: 950, title: 75, simplePrompt: 480 };
}

/**
 * Aliniază mențiunile de gen vocal dintr-un text de style/prompt cu genul
 * cerut explicit. `\bmale\b` NU se potrivește în "female" (și invers
 * `\bman\b` nu prinde "woman", nici "Romanian") — word boundary garantează asta.
 * Versurile (lyrics) NU trec niciodată prin această funcție — sunt cântate literal.
 */
function occasionStyleHint(i: SunoGenerateInput): string {
  const extra = i.occasionPrompt?.trim();
  if (extra) return `, ${extra}`;
  return i.occasion ? `, themed for ${i.occasion}` : '';
}

function alignVocalGender(text: string, gender?: 'm' | 'f'): string {
  if (!text || (gender !== 'm' && gender !== 'f')) return text;
  if (gender === 'f') {
    return text.replace(/\bmale\b/gi, 'female').replace(/\bman\b/gi, 'woman');
  }
  return text.replace(/\bfemale\b/gi, 'male').replace(/\bwoman\b/gi, 'man');
}

function truncate(s: string, max: number): string {
  if (!s) return s;
  return s.length <= max ? s : s.slice(0, max - 3) + '...';
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
}

/**
 * Caută recursiv în `obj` prima valoare string care e un URL http(s) și a cărei
 * cheie se potrivește cu una dintre `keys`. Dacă `suffixMatch` e true, `keys`
 * sunt tratate ca SUFIXE de cheie (ex. '_url' prinde 'audio_wav_url').
 */
function deepFindUrl(obj: unknown, keys: string[], suffixMatch = false): string | null {
  const seen = new Set<unknown>();
  const walk = (node: unknown): string | null => {
    if (node == null || typeof node !== 'object' || seen.has(node)) return null;
    seen.add(node);
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const keyHit = suffixMatch
        ? keys.some((s) => k.toLowerCase().endsWith(s.toLowerCase()))
        : keys.some((s) => k.toLowerCase() === s.toLowerCase());
      if (keyHit && typeof v === 'string' && /^https?:\/\//.test(v)) return v;
    }
    for (const v of Object.values(node as Record<string, unknown>)) {
      const found = walk(v);
      if (found) return found;
    }
    return null;
  };
  return walk(obj);
}

/** Caută recursiv primul obiect aflat sub una dintre `keys`. */
function deepFindObject(obj: unknown, keys: string[]): Record<string, unknown> | null {
  const seen = new Set<unknown>();
  const walk = (node: unknown): Record<string, unknown> | null => {
    if (node == null || typeof node !== 'object' || seen.has(node)) return null;
    seen.add(node);
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (keys.some((s) => k.toLowerCase() === s.toLowerCase()) && v && typeof v === 'object') {
        return v as Record<string, unknown>;
      }
    }
    for (const v of Object.values(node as Record<string, unknown>)) {
      const found = walk(v);
      if (found) return found;
    }
    return null;
  };
  return walk(obj);
}

/** Scoate conținutul dintre paranteze pătrate (metadată Suno instrumentală) ca să
 *  putem analiza doar ce ar fi efectiv cântat. */
function stripBracketContent(s: string): string {
  return s.replace(/\[[^\]]*\]/g, ' ');
}

/** Reduce mesajul utilizatorului la o frază scurtă (~10 cuvinte / max 80 chars)
 *  potrivită ca rând cântat în deschiderea piesei. */
function condenseForOpening(msg: string): string {
  const cleaned = msg.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const firstSentence = cleaned.split(/[.!?]/)[0]?.trim() ?? cleaned;
  if (firstSentence.length <= 80) return firstSentence;
  const cut = firstSentence.slice(0, 80);
  const lastSpace = cut.lastIndexOf(' ');
  let out = (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim();
  // Tăierea poate lăsa prepoziții/conjuncții agățate ("...iubitul meu Dani din") —
  // le scoatem ca rândul cântat să se termine natural.
  const dangling =
    /[\s,]+(din|și|si|cu|de|la|pentru|pe|în|in|că|ca|spre|către|catre|al|ai|ale|a|o|un|cel|cea|mai|să|sa|se)$/i;
  while (dangling.test(out)) out = out.replace(dangling, '').trim();
  return out.replace(/[,;:]+$/, '');
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s.slice(0, 4000);
  }
}

/**
 * Elimină prefixele duplicate pe care utilizatorii le tastează adesea în câmpurile
 * de dedicație / nume. Ex: dedication="De la Andrei" → "Andrei", recipientName="Pentru Tudor" → "Tudor".
 * Case-insensitive, păstrează diacriticele și restul textului.
 */
/**
 * Lista numelor de artiști pe care Suno le respinge cu SENSITIVE_WORD_ERROR.
 * Le înlocuim cu un descriptor generic ca să nu pierdem cu totul atmosfera.
 */
const BANNED_ARTIST_NAMES = [
  'florin salam',
  'adi minune',
  'adrian minune',
  'adrian copilul minune',
  'nicolae guță',
  'nicolae guta',
  'vali vijelie',
  'sorinel pustiu',
  'jean de la craiova',
  'liviu pustiu',
  'tzanca uraganu',
  'mr juve',
  'susanu',
];

function stripBannedArtistNames(text: string): string {
  if (!text) return text;
  let out = text;
  for (const name of BANNED_ARTIST_NAMES) {
    const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    out = out.replace(re, 'lăutarul');
  }
  return out;
}

function stripLeadingPrefix<T extends string | undefined>(value: T, prefixes: string[]): T {
  if (!value) return value;
  let v = value.trim();
  // aplicăm repetat ca să prindem și "De la De la X"
  for (let i = 0; i < 3; i++) {
    let changed = false;
    for (const p of prefixes) {
      const re = new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i');
      if (re.test(v)) {
        v = v.replace(re, '').trim();
        changed = true;
      }
    }
    if (!changed) break;
  }
  return (v || value) as T;
}
