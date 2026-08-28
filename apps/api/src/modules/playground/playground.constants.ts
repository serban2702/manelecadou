export const PLAYGROUND_QUEUE = 'playground';

export const SUNO_MODELS = ['V4', 'V4_5', 'V4_5PLUS', 'V4_5ALL', 'V5', 'V5_5'] as const;
export const LYRIA_MODELS = ['lyria-3-pro-preview'] as const;
export const OPENAI_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-5-mini', 'gpt-5.4-mini'] as const;

export const PLAYGROUND_LYRICS_MODES = ['generate', 'writer_only', 'custom', 'instrumental'] as const;
export type PlaygroundLyricsMode = (typeof PLAYGROUND_LYRICS_MODES)[number];

export const PLAYGROUND_ENGINES = ['suno', 'google'] as const;
export type PlaygroundEngine = (typeof PLAYGROUND_ENGINES)[number];
