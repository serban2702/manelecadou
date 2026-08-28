import { http } from '../http/client';

export type PlaygroundEngine = 'suno' | 'google';
export type PlaygroundLyricsMode = 'generate' | 'writer_only' | 'custom' | 'instrumental';
export type PlaygroundRunStatus =
  | 'queued'
  | 'writing_lyrics'
  | 'generating_audio'
  | 'succeeded'
  | 'failed';

export interface PlaygroundRequest {
  engine?: PlaygroundEngine;
  experienceSlug?: string;
  styleId?: string;
  occasionId?: string;
  voiceId?: string;
  recipientName?: string;
  senderName?: string;
  message?: string;
  tipAmount?: number;
  lyricsMode?: PlaygroundLyricsMode;
  lyrics?: string;
  skipCritic?: boolean;
  phonetic?: boolean;
  openaiModel?: string;
  openaiTemperature?: number;
  writerSystemPrompt?: string;
  writerUserTemplate?: string;
  criticSystemPrompt?: string;
  criticUserTemplate?: string;
  languageOverride?: string;
  locale?: string;
  sunoModel?: string;
  sunoCustomMode?: boolean;
  sunoBasePrompt?: string;
  sunoStylePrompt?: string;
  sunoOccasionPrompt?: string;
  sunoPromptOverride?: string;
  sunoTitle?: string;
  vocalGender?: 'm' | 'f';
  styleWeight?: number;
  weirdnessConstraint?: number;
  negativeTags?: string;
  personaId?: string;
  personaModel?: 'style_persona' | 'voice_persona';
  instrumental?: boolean;
  durationSec?: number;
  lyriaModel?: string;
  lyriaStylePrompt?: string;
  lyriaOccasionPrompt?: string;
  lyriaPromptOverride?: string;
  variantCount?: number;
}

export interface PlaygroundMeta {
  openaiModel: string;
  sunoModel: string;
  lyriaModel: string;
  openaiModels: string[];
  openaiModelOptions?: Array<{ id: string; label: string; group: string }>;
  sunoModels: string[];
  lyriaModels: string[];
  defaultTemplates: {
    writerSystem: string;
    writerUser: string;
    criticSystem: string;
    criticUser: string;
  };
}

export interface PlaygroundPreview {
  engine: PlaygroundEngine;
  experienceSlug: string | null;
  style: { id: string; nm: string } | null;
  occasion: { id: string; nm: string } | null;
  voice: { id: string; nm: string } | null;
  lyricsMode: PlaygroundLyricsMode;
  instrumental: boolean;
  phonetic: boolean;
  skipCritic: boolean;
  gpt: {
    writerSystem: string;
    writerUser: string;
    criticSystem: string;
    criticUser: string;
  };
  suno: {
    model: string | null;
    customMode: boolean;
    style: string | null;
    prompt: string | null;
    title: string | null;
    basePrompt: string | null;
    vocalGender: 'm' | 'f' | null;
    styleWeight: number | null;
    weirdnessConstraint: number | null;
    negativeTags: string | null;
    personaId: string | null;
    personaModel: string | null;
    durationSec: number;
  };
  lyria: {
    model: string | null;
    stylePrompt: string;
    occasionPrompt: string | null;
    prompt: string;
    vocalGender: 'm' | 'f' | null;
    durationSec: number;
    instrumental: boolean;
    lyricsLocale: string;
  };
}

export interface PlaygroundTrack {
  audioUrl: string;
  durationSec?: number;
  audioId?: string;
}

export interface PlaygroundRun {
  id: string;
  siteId: string;
  createdByEmail: string | null;
  engine: PlaygroundEngine;
  status: PlaygroundRunStatus;
  errorMessage: string | null;
  input: PlaygroundRequest;
  prompts: Record<string, unknown> | null;
  lyricsDraft: string | null;
  lyrics: string | null;
  lyricsPhonetic: string | null;
  tracks: PlaygroundTrack[] | null;
  providerJobId: string | null;
  openaiModel: string | null;
  audioModel: string | null;
  createdAt: string;
  completedAt: string | null;
}

export class PlaygroundApi {
  static meta(): Promise<PlaygroundMeta> {
    return http.get('/admin/playground/meta');
  }
  static preview(body: PlaygroundRequest): Promise<PlaygroundPreview> {
    return http.post('/admin/playground/preview', body);
  }
  static lyrics(body: PlaygroundRequest): Promise<{ draft: string; final: string; notes: string }> {
    return http.post('/admin/playground/lyrics', body, { timeout: 180_000 });
  }
  static generate(body: PlaygroundRequest): Promise<PlaygroundRun> {
    return http.post('/admin/playground/generate', body);
  }
  static runs(limit = 30): Promise<{ items: PlaygroundRun[] }> {
    return http.get(`/admin/playground/runs?limit=${limit}`);
  }
  static run(id: string): Promise<PlaygroundRun> {
    return http.get(`/admin/playground/runs/${id}`);
  }
}
