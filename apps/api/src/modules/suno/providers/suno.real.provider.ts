import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../../settings/settings.service';
import {
  SunoGenerateInput,
  SunoGenerateResult,
  SunoProvider,
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
      instrumental: false,
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
    if (input.negativeTags?.trim()) {
      body.negativeTags = input.negativeTags.trim();
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
      body.style = truncate(this.buildStyleTag(cleanInput, !!input.vocalGender), limits.style);
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

    // Polling — max 6 min, la 8s
    const deadline = Date.now() + 6 * 60_000;
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
      errorMessage: `polling timeout after 6 minutes (last status: ${lastStatus || 'none'})`,
    });
    throw new Error(`Suno taskId=${taskId} polling timeout după 6 minute`);
  }

  /**
   * Construiește tag-ul de stil (genre + voice + occasion) pentru Suno.
   * Tag-urile sunt separate prin virgulă, max ~1000 chars.
   *
   * Per-site overrides:
   *   - site.suno.stylePromptMap[style] — override complet pentru un stil
   *   - site.suno.basePrompt            — înlocuiește CORE-ul default
   */
  private buildStyleTag(i: SunoGenerateInput, vocalGenderProvided = false): string {
    const siteSuno = i.site?.suno;
    const ageHint = vocalAgeDescriptor(i.vocalAge);
    const styleOverride = siteSuno?.stylePromptMap?.[i.style];
    if (styleOverride) {
      const occasionHint = i.occasion ? `, themed for ${i.occasion}` : '';
      const ageTag = ageHint ? `, ${ageHint}` : '';
      return `${styleOverride}${ageTag}${occasionHint}`;
    }
    // Bază obligatorie: scări orientale + instrumentație + vocal style autentic manele.
    // IMPORTANT: NU includem nume de artiști reali — Suno respinge tag-urile cu artist names
    // (SENSITIVE_WORD_ERROR: "we don't reference specific artists"). Descriem doar
    // caracteristici sonore.
    //
    // Când vocalGender e setat explicit (parametru direct Suno), scoatem
    // "male vocal" hardcoded ca să nu intre în conflict cu cererea (ex. voce feminină).
    const ageWord = ageHint ? `${ageHint} ` : '';
    const vocalDescriptor = vocalGenderProvided
      ? `ornamented melismatic ${ageWord}vocal with heavy auto-tune, pitch slides and "of/aoleu" interjections`
      : `ornamented melismatic ${ageWord}male vocal with heavy auto-tune, pitch slides and "of/aoleu" interjections`;
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
    const occasionHint = i.occasion ? `, themed for ${i.occasion}` : '';
    const ageTag = ageHint ? `, ${ageHint}` : '';
    return `${CORE}, ${styleText}${ageTag}${occasionHint}`;
  }

  private buildSimplePrompt(i: SunoGenerateInput): string {
    const dedicationOpening = i.dedication
      ? `OPENING (must be sung CLEARLY in the first 5 seconds): "De la ${i.dedication}, pentru ${i.recipientName}".`
      : `OPENING (must be sung CLEARLY in the first 5 seconds): "Pentru ${i.recipientName}".`;
    const ageHint = vocalAgeDescriptor(i.vocalAge);
    const vocalLabel = ageHint
      ? `melismatic auto-tuned ${ageHint} vocal`
      : 'melismatic auto-tuned male vocal';
    const parts = [
      `Authentic Romanian MANELE song (balkan gypsy pop, oriental Hijaz scale, darbuka, accordion, violin, ${vocalLabel}) — subgenre: ${i.style}, occasion: ${i.occasion}.`,
      dedicationOpening,
      i.message ? `Personal message to weave in: "${i.message.slice(0, 180)}"` : '',
      `Romanian language. Must sound like real Romanian manele, NOT pop, NOT EDM, NOT rap.`,
    ];
    return parts.filter(Boolean).join(' ');
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
    if (!i.dedication) return lyrics;

    const recipient = i.recipientName.trim();
    const dedication = i.dedication.trim();
    const messageHook = condenseForOpening(i.message ?? '');

    const openingLines = [
      `De la ${dedication}, pentru ${recipient}, cu drag,`,
      messageHook
        ? `${messageHook}, frate, ascultă-mă.`
        : `Astăzi e o zi mare, vine inima cu mine.`,
    ];

    // Verificăm dacă deschiderea cântată conține deja ambele nume.
    const verseMatch = lyrics.match(/\[Verse\s*1[^\]]*\]([\s\S]{0,400})/i);
    if (verseMatch) {
      const sungOpening = stripBracketContent(verseMatch[1])
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 2)
        .join(' ')
        .toLowerCase();
      if (
        sungOpening.includes(dedication.toLowerCase()) &&
        sungOpening.includes(recipient.toLowerCase())
      ) {
        return lyrics; // already correct
      }
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

function truncate(s: string, max: number): string {
  if (!s) return s;
  return s.length <= max ? s : s.slice(0, max - 3) + '...';
}

/** Mapează `vocalAge` la un descriptor englez folosit în tag-ul de stil Suno.
 *  Returnează gol pentru `adult` (sau lipsă) ca să păstrăm formularea default. */
function vocalAgeDescriptor(age?: 'child' | 'teen' | 'adult' | 'elder'): string {
  switch (age) {
    case 'child':
      return 'child';
    case 'teen':
      return 'teen';
    case 'elder':
      return 'elderly';
    case 'adult':
    default:
      return '';
  }
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
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim();
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
