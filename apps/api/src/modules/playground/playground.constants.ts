export const PLAYGROUND_QUEUE = 'playground';

export const SUNO_MODELS = ['V4', 'V4_5', 'V4_5PLUS', 'V4_5ALL', 'V5', 'V5_5'] as const;
export const LYRIA_MODELS = ['lyria-3-pro-preview'] as const;

/** Modele utile la versuri. `id` e stringul de API. Lista e curată, nu exhaustivă —
 *  playground-ul acceptă oricum un id scris de mână. */
export const OPENAI_MODEL_OPTIONS: Array<{ id: string; label: string; group: string }> = [
  { id: 'gpt-5.6-luna', label: '5.6 Luna — rapid / ieftin', group: 'GPT-5.6' },
  { id: 'gpt-5.6-terra', label: '5.6 Terra — echilibrat', group: 'GPT-5.6' },
  { id: 'gpt-5.6-sol', label: '5.6 Sol — flagship', group: 'GPT-5.6' },
  { id: 'gpt-5.6', label: '5.6 (alias Sol)', group: 'GPT-5.6' },
  { id: 'gpt-5.5', label: '5.5', group: 'GPT-5.x' },
  { id: 'gpt-5.4', label: '5.4', group: 'GPT-5.x' },
  { id: 'gpt-5.4-mini', label: '5.4 mini', group: 'GPT-5.x' },
  { id: 'gpt-5.4-nano', label: '5.4 nano', group: 'GPT-5.x' },
  { id: 'gpt-5-mini', label: '5 mini', group: 'GPT-5.x' },
  { id: 'gpt-5', label: '5', group: 'GPT-5.x' },
  { id: 'gpt-4.1', label: '4.1', group: 'GPT-4' },
  { id: 'gpt-4.1-mini', label: '4.1 mini', group: 'GPT-4' },
  { id: 'gpt-4o', label: '4o', group: 'GPT-4' },
  { id: 'gpt-4o-mini', label: '4o mini', group: 'GPT-4' },
];

export const OPENAI_MODELS = OPENAI_MODEL_OPTIONS.map((m) => m.id);

export const PLAYGROUND_LYRICS_MODES = ['generate', 'writer_only', 'custom', 'instrumental'] as const;
export type PlaygroundLyricsMode = (typeof PLAYGROUND_LYRICS_MODES)[number];

export const PLAYGROUND_ENGINES = ['suno', 'google'] as const;
export type PlaygroundEngine = (typeof PLAYGROUND_ENGINES)[number];
