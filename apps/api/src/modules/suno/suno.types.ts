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
}

export interface SunoTrack {
  audioUrl: string;
  durationSec: number;
  coverUrl?: string;
}

export interface SunoGenerateResult {
  tracks: SunoTrack[];
  lyrics?: string;
  providerJobId: string;
}

export abstract class SunoProvider {
  abstract generate(input: SunoGenerateInput): Promise<SunoGenerateResult>;
}
