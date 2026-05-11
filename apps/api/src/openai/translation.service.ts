import { Injectable, Logger } from '@nestjs/common';
import { OpenAiClient } from './openai.client';

/**
 * Sistem de traducere multi-agent pentru mesaje (chat + email).
 *
 * Pipeline:
 *  1. Detect — agent care identifică limba sursă (ISO 639-1) și nivel încredere.
 *  2. Translate ×2 — doi agenți paraleli traduc independent (`gpt-4o-mini` / `gpt-4o`).
 *  3. Verify/Consensus — un agent al treilea compară cele două traduceri,
 *     identifică divergențele și întoarce versiunea finală + un scor de consens.
 *
 * Scopul dublei traduceri: reducerea hallucinated/translit în limbi cu alfabet diferit
 * (greacă, bulgară, sârbă chirilic). Dacă cei doi traducători diverg semnificativ
 * pe sens, verifier-ul re-formulează păstrând nuanțele comune.
 */

const DETECT_SYS = `Detectezi limba unui mesaj. Răspunzi JSON STRICT:
{ "lang": "<ISO 639-1, ex: ro, en, bg, el, sr, hu, pl>", "confidence": 0..1 }
Dacă mesajul e prea scurt sau ambiguu, returnezi confidence<0.6.`;

const TRANSLATE_SYS_TO_RO = `Ești un traducător profesionist. Traduci textul utilizatorului în ROMÂNĂ ușor de înțeles, păstrând tonul (formal/informal), formatarea și sensul. NU adăuga comentarii, NU explica — doar traducerea.
Răspuns JSON: { "translation": "<text tradus în română>" }`;

const TRANSLATE_SYS_FROM_RO = `Ești un traducător profesionist. Traduci textul utilizatorului din ROMÂNĂ în limba țintă specificată în mesaj. Păstrezi tonul, formatarea HTML dacă e prezentă, și sensul exact. NU adăuga comentarii.
Răspuns JSON: { "translation": "<text tradus în limba țintă>" }`;

const VERIFY_SYS = `Ești un editor bilingv. Primești textul ORIGINAL și DOUĂ traduceri candidate. Sarcină:
1. Compară cele două traduceri.
2. Alege fraza cea mai naturală și fidelă pentru fiecare segment, sau combină.
3. Returnează versiunea finală + un scor de consens (1.0 = identice, 0.0 = total divergente) + lista divergențelor majore (dacă există).
Răspuns JSON STRICT: { "final": "<text final>", "consensus": 0..1, "divergences": ["..."] }`;

export interface DetectResult {
  lang: string;
  confidence: number;
}

export interface ConsensusTranslation {
  /** Versiunea finală agreată de verifier. */
  final: string;
  /** Cele două traduceri brute (pentru audit). */
  candidates: [string, string];
  /** 1.0 = traducătorii au fost de acord; <0.7 = divergențe semnificative. */
  consensus: number;
  divergences: string[];
  sourceLang: string;
  targetLang: string;
}

@Injectable()
export class TranslationService {
  private readonly logger = new Logger('TranslationService');

  constructor(private readonly openai: OpenAiClient) {}

  /** Detectează limba unui text. Returnează `{ lang: 'ro', confidence: 1 }` pentru gol. */
  async detect(text: string): Promise<DetectResult> {
    const trimmed = text.trim();
    if (!trimmed) return { lang: 'ro', confidence: 1 };
    // Heuristic rapid pentru texte foarte scurte cu caractere specifice — economisim un round-trip.
    const hint = quickHint(trimmed);
    if (hint && trimmed.length < 80) return { lang: hint, confidence: 0.85 };
    try {
      const r = await this.openai.json<DetectResult>({
        system: DETECT_SYS,
        user: trimmed.slice(0, 1500),
        temperature: 0,
        maxTokens: 60,
      });
      return {
        lang: (r.data.lang ?? 'ro').toLowerCase().slice(0, 5),
        confidence: clamp01(r.data.confidence ?? 0),
      };
    } catch (e) {
      this.logger.warn(`detect failed: ${(e as Error).message}`);
      return { lang: 'ro', confidence: 0 };
    }
  }

  /**
   * Traduce text inbound (limbă sursă oarecare) → română, cu pipeline multi-agent.
   * Returnează `null` dacă sourceLang === 'ro' (nimic de făcut).
   */
  async translateToRo(text: string, sourceLangHint?: string): Promise<ConsensusTranslation | null> {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const detected = sourceLangHint
      ? { lang: sourceLangHint, confidence: 1 }
      : await this.detect(trimmed);
    if (detected.lang === 'ro') return null;
    return this.runConsensus(trimmed, detected.lang, 'ro', TRANSLATE_SYS_TO_RO);
  }

  /**
   * Traduce text outbound (compus în română) → limba țintă, cu pipeline multi-agent.
   * Folosit la trimitere răspuns: adminul scrie în RO, sistemul livrează în limba clientului.
   */
  async translateFromRo(text: string, targetLang: string): Promise<ConsensusTranslation | null> {
    const trimmed = text.trim();
    if (!trimmed) return null;
    if (targetLang === 'ro' || !targetLang) return null;
    return this.runConsensus(
      trimmed,
      'ro',
      targetLang,
      `${TRANSLATE_SYS_FROM_RO}\n\nLimba țintă: ${targetLang}.`,
    );
  }

  private async runConsensus(
    text: string,
    sourceLang: string,
    targetLang: string,
    translateSys: string,
  ): Promise<ConsensusTranslation> {
    // Doi traducători — modele diferite ca să avem perspective diferite.
    const userPrompt = text.slice(0, 4000);
    const [a, b] = await Promise.all([
      this.singleTranslate(translateSys, userPrompt, 'gpt-4o-mini'),
      this.singleTranslate(translateSys, userPrompt, 'gpt-4o').catch(() =>
        // Fallback la mini dacă gpt-4o nu e disponibil (cont fără acces).
        this.singleTranslate(translateSys, userPrompt, 'gpt-4o-mini'),
      ),
    ]);

    if (a === b) {
      return {
        final: a,
        candidates: [a, b],
        consensus: 1,
        divergences: [],
        sourceLang,
        targetLang,
      };
    }

    try {
      const verifyUser = `## Original (${sourceLang})\n${userPrompt}\n\n## Traducere candidat A\n${a}\n\n## Traducere candidat B\n${b}\n\nProduce JSON cu cheile: final, consensus, divergences.`;
      const v = await this.openai.json<{ final: string; consensus: number; divergences?: string[] }>({
        system: VERIFY_SYS,
        user: verifyUser,
        temperature: 0,
        maxTokens: 1500,
      });
      return {
        final: (v.data.final ?? a).trim(),
        candidates: [a, b],
        consensus: clamp01(v.data.consensus ?? 0.5),
        divergences: v.data.divergences ?? [],
        sourceLang,
        targetLang,
      };
    } catch (e) {
      this.logger.warn(`verify failed, fallback la candidat A: ${(e as Error).message}`);
      return {
        final: a,
        candidates: [a, b],
        consensus: 0.5,
        divergences: ['verifier indisponibil'],
        sourceLang,
        targetLang,
      };
    }
  }

  private async singleTranslate(system: string, user: string, model: string): Promise<string> {
    const r = await this.openai.json<{ translation: string }>({
      system,
      user,
      model,
      temperature: 0.1,
      maxTokens: 1200,
    });
    return (r.data.translation ?? '').trim();
  }
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Scurt-circuit pentru detecție: alfabet specific = limbă sigură.
 * Acoperă cazurile comune (greacă, chirilic) fără round-trip OpenAI.
 */
function quickHint(text: string): string | null {
  if (/[Ͱ-Ͽ]/.test(text)) return 'el';
  if (/[Ѐ-ӿ]/.test(text)) {
    // Cyrillic — ar putea fi bg/sr/ru. Lăsăm modelul să decidă pentru texte lungi;
    // pentru scurte, default la bulgară (cel mai probabil tenant nostru).
    return 'bg';
  }
  if (/[֐-׿]/.test(text)) return 'he';
  if (/[؀-ۿ]/.test(text)) return 'ar';
  return null;
}
