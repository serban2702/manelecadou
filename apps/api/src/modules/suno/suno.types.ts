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

export abstract class SunoProvider {
  abstract generate(input: SunoGenerateInput): Promise<SunoGenerateResult>;
}
