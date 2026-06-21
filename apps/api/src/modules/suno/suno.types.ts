export interface SunoGenerateInput {
  type: 'demo' | 'full';
  durationSec: number;
  style: string;
  occasion: string;
  recipientName: string;
  message: string;
  dedication?: string;
  voiceArtist: string;
  lyrics?: string;
  /**
   * Versurile sunt furnizate EXPLICIT de client (customLyrics) — sunt SACRE.
   * Când e true, NU injectăm/suprascriem deschiderea cu dedicația ("De la X,
   * pentru Y, cu drag" + mesajul). Se cântă EXACT ce a pus/acceptat userul.
   * Vezi `ensureDedicationOpening` în suno.real.provider.ts.
   */
  lyricsAreCustom?: boolean;
  /** Folosit pentru a corela rândul din suno_logs cu Generation. */
  generationId?: string;
  /** Site-ul care a comandat generarea — folosit pentru prompt overrides per-brand. */
  site?: import('../sites/site.entity').Site;
  /**
   * Marchează această cerere ca mostră audio scurtă pentru carduri-le din /studio.
   * Implicit 'submit' (manea pentru user). Ajunge ca tag în SunoLog.
   */
  requestType?: 'submit' | 'sample';
  /** Sex vocal — Suno acceptă 'm' sau 'f' direct. */
  vocalGender?: 'm' | 'f';
  /** PersonaId pre-existent (din /generate/generate-persona) pentru a forța
   *  consistență vocală cross-piese. Custom Mode only. */
  personaId?: string;
  /** style_persona (default) | voice_persona (V5 only). */
  personaModel?: 'style_persona' | 'voice_persona';
  /** Cât strict urmează tag-urile de style (0..1). */
  styleWeight?: number;
  /** Constrângere de creativitate (0..1). */
  weirdnessConstraint?: number;
  /** Tag-uri de exclus (CSV) — ex. 'pop, EDM, trap-rap'. */
  negativeTags?: string;
  /**
   * Generează varianta instrumentală (fără voce). Trimis la Suno ca
   * `instrumental: true`. Default false. Folosit pentru pachetele plus/premium
   * care includ un track instrumental separat.
   */
  instrumental?: boolean;
}

/** Input pentru prelungirea unei piese existente (POST /api/v1/generate/extend).
 *  `audioId` + `model` trebuie să corespundă piesei sursă. */
export interface SunoExtendInput {
  audioId: string;
  /** Modelul piesei sursă (V4_5 etc.) — extend cere același model. Omis → SUNO_MODEL. */
  model?: string;
  /** Secunda de la care se continuă. Omis → Suno continuă de la final. */
  continueAt?: number;
  /** Parametri custom (defaultParamFlag=true). Dacă lipsesc, Suno refolosește
   *  setările piesei sursă (defaultParamFlag=false). */
  prompt?: string;
  style?: string;
  title?: string;
  negativeTags?: string;
  vocalGender?: 'm' | 'f';
  styleWeight?: number;
  weirdnessConstraint?: number;
  audioWeight?: number;
  generationId?: string;
  siteId?: string | null;
}

/** Input pentru cover/restyle al unui audio încărcat (POST /api/v1/generate/upload-cover).
 *  `uploadUrl` = URL public al audio-ului sursă (full.mp3 găzduit la noi). */
export interface SunoCoverInput {
  uploadUrl: string;
  /** Model Suno. Omis → SUNO_MODEL din settings. */
  model?: string;
  customMode?: boolean;
  instrumental?: boolean;
  prompt?: string;
  style?: string;
  title?: string;
  negativeTags?: string;
  vocalGender?: 'm' | 'f';
  styleWeight?: number;
  weirdnessConstraint?: number;
  audioWeight?: number;
  generationId?: string;
  siteId?: string | null;
}

/** Input pentru înlocuirea unei SECȚIUNI dintr-o piesă (POST /api/v1/generate/replace-section).
 *  Ex: schimbă refrenul (infillStartS..infillEndS) cu alt stil ("pian trist, de jale"). */
export interface SunoReplaceSectionInput {
  taskId: string;
  audioId: string;
  /** Intervalul (secunde) care se înlocuiește. */
  infillStartS: number;
  infillEndS: number;
  /** Stilul noii secțiuni (ex: "sad piano ballad, slow, emotional"). */
  tags?: string;
  /** Versuri pentru secțiune (opțional — gol = păstrează versurile existente). */
  prompt?: string;
  title?: string;
  negativeTags?: string;
  model?: string;
  generationId?: string;
  siteId?: string | null;
}

/** Rezultatul separării vocii (POST /api/v1/vocal-removal/generate). */
export interface SunoSeparateResult {
  /** Vocea izolată (separate_vocal). */
  vocalUrl?: string;
  /** Acompaniamentul instrumental (separate_vocal). */
  instrumentalUrl?: string;
  /** Stem-uri individuale (split_stem): { drums, bass, guitar, keyboard, ... }. */
  stems?: Record<string, string>;
}

export interface SunoTrack {
  audioUrl: string;
  durationSec: number;
  coverUrl?: string;
  /** AudioId Suno — necesar pentru a putea genera Persona ulterior. */
  audioId?: string;
}

export interface SunoGenerateResult {
  tracks: SunoTrack[];
  lyrics?: string;
  providerJobId: string;
}

/** Un cuvânt din versurile aliniate temporal (timestamped lyrics) Suno. */
export interface SunoAlignedWord {
  word: string;
  success: boolean;
  /** Start în secunde (din `startS`). */
  startS: number;
  /** End în secunde (din `endS`). */
  endS: number;
}

export interface SunoTimestampedLyrics {
  alignedWords: SunoAlignedWord[];
}

/** Segment audio (în secunde) pentru clipul scurt din refren. */
export interface ChorusSegment {
  startSec: number;
  durationSec: number;
}

/** Markeri de început de refren în `word` (Chorus / Refren / Hook / Cor). */
const CHORUS_MARKER = /\[(chorus|refren|hook|cor)\]/i;
/** Orice marker de secțiune (folosit pentru a găsi sfârșitul refrenului). */
const SECTION_MARKER =
  /\[(chorus|refren|hook|cor|verse|vers|strofă|strofa|bridge|punte|outro|intro|pre-?chorus|pre-?refren)\]/i;

/**
 * Detectează PRIMUL refren din versurile aliniate temporal.
 * `alignedWords[].word` conține markeri de secțiune (ex. `[Chorus]`, `[Refren]`).
 *  - startSec = startS-ul primului marker de refren
 *  - endSec   = startS-ul următorului marker de secțiune (sau start+22s)
 *  - durata clampată în [12s, 25s]
 * Întoarce `null` dacă nu există niciun marker de refren (caller folosește fallback).
 */
export function findChorusSegment(
  alignedWords: SunoAlignedWord[] | undefined | null,
): ChorusSegment | null {
  if (!Array.isArray(alignedWords) || alignedWords.length === 0) return null;

  // Index-ul primului marker de refren.
  let chorusIdx = -1;
  for (let i = 0; i < alignedWords.length; i++) {
    if (CHORUS_MARKER.test(alignedWords[i].word ?? '')) {
      chorusIdx = i;
      break;
    }
  }
  if (chorusIdx === -1) return null;

  const startSec = Number(alignedWords[chorusIdx].startS) || 0;

  // Următorul marker de secțiune după refren → sfârșitul segmentului.
  let endSec = startSec + 22;
  for (let i = chorusIdx + 1; i < alignedWords.length; i++) {
    if (SECTION_MARKER.test(alignedWords[i].word ?? '')) {
      const s = Number(alignedWords[i].startS) || 0;
      if (s > startSec) endSec = s;
      break;
    }
  }

  let durationSec = endSec - startSec;
  if (!Number.isFinite(durationSec) || durationSec <= 0) durationSec = 22;
  if (durationSec < 12) durationSec = 12;
  if (durationSec > 25) durationSec = 25;

  return { startSec: Math.max(0, startSec), durationSec };
}

export abstract class SunoProvider {
  abstract generate(input: SunoGenerateInput): Promise<SunoGenerateResult>;

  /**
   * Versurile aliniate temporal (per cuvânt) pentru o piesă dintr-un task.
   * Folosit pentru a detecta refrenul (segment scurt pentru clipuri TikTok).
   * Graceful: întoarce `null` la eșec sau dacă providerul nu suportă.
   */
  getTimestampedLyrics(
    _taskId: string,
    _audioId: string,
  ): Promise<SunoTimestampedLyrics | null> {
    return Promise.resolve(null);
  }

  /** Prelungește o piesă existentă. Întoarce noile track-uri (audio mai lung). */
  extendMusic(_input: SunoExtendInput): Promise<SunoGenerateResult> {
    return Promise.reject(new Error('extend not supported by this provider'));
  }

  /** Cover/restyle al unui audio încărcat (upload-cover). */
  coverMusic(_input: SunoCoverInput): Promise<SunoGenerateResult> {
    return Promise.reject(new Error('cover not supported by this provider'));
  }

  /** Înlocuiește o secțiune (ex. refrenul) dintr-o piesă cu alt stil. */
  replaceSection(_input: SunoReplaceSectionInput): Promise<SunoGenerateResult> {
    return Promise.reject(new Error('replace-section not supported by this provider'));
  }

  /** Convertește o piesă la WAV studio. Întoarce URL-ul WAV sau null. */
  convertToWav(_taskId: string, _audioId: string): Promise<string | null> {
    return Promise.resolve(null);
  }

  /** Separă vocea de instrumental (karaoke) sau în stem-uri individuale. */
  separateVocals(
    _taskId: string,
    _audioId: string,
    _type: 'separate_vocal' | 'split_stem' = 'separate_vocal',
  ): Promise<SunoSeparateResult | null> {
    return Promise.resolve(null);
  }

  /** Generează un videoclip MP4 oficial Suno pentru o piesă. Întoarce URL sau null. */
  createMusicVideo(
    _taskId: string,
    _audioId: string,
    _opts?: { author?: string; domainName?: string },
  ): Promise<string | null> {
    return Promise.resolve(null);
  }

  /** Soldul de credite rămase în contul Suno (GET /api/v1/generate/credit). */
  getCredits(): Promise<number | null> {
    return Promise.resolve(null);
  }
}
