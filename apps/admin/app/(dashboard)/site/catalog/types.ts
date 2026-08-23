export type CatalogKind = 'styles' | 'occasions' | 'voices';
export type SampleKind = 'style' | 'voice';
export type MusicEngine = 'suno' | 'google';

export type GenerateOverrides = {
  voice?: string;
  lyrics?: string;
  customStylePrompt?: string;
  recipientName?: string;
  dedication?: string;
  style?: string;
  occasion?: string;
  message?: string;
  tipAmount?: number;
  premium?: boolean;
  vocalGender?: 'm' | 'f';
};

export type SampleStatus = 'present' | 'generating' | 'missing';
