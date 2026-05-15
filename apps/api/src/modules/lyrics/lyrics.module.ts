import { Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsService } from '../settings/settings.service';
import { buildChatParams } from '../../openai/openai-params.helper';
import { LyricsLog } from './lyrics-log.entity';
import { LyricsLogService } from './lyrics-log.service';

export interface LyricsInput {
  /** Cheia stilului (clasic / modern / oriental / etc) — text liber. */
  style: string;
  /** Cheia ocaziei (nuntă / botez / aniversare / etc). */
  occasion: string;
  recipientName: string;
  message: string;
  /** Numele celui care dedică piesa (expeditor). */
  dedication?: string;
  /** Suma dedicată (în moneda site-ului). */
  tipAmount?: number;
  /** Codul valutei site-ului (RON, BGN, EUR, TRY, RSD, HRK, …). */
  currency?: string;
  voiceArtist: string;
  customLyrics?: string;
  locale?: string;
  /** Override system prompt pentru writer (din Site.suno.writerSystemPrompt).
   *  Când e setat, ÎNLOCUIEȘTE corpul default — codul prepend-ează doar
   *  langDirective (forțează limba de output). Folosește pentru chalga BG,
   *  turbofolk RS, arabesk TR etc. */
  writerSystemPrompt?: string;
  /** Idem pentru critic. Gol = fallback la corpul default. */
  criticSystemPrompt?: string;
  /** Hint descriptiv despre stilul muzical (ex: "modern manele 2020s, trap-808 sub-bass…"). */
  styleHint?: string;
  /** Context pentru logging — opțional, doar pentru audit. */
  siteId?: string | null;
  generationId?: string | null;
}

export interface LyricsOutput {
  draft: string;
  final: string;
  notes?: string;
}

const LOCALE_NAME: Record<string, string> = {
  ro: 'Romanian',
  bg: 'Bulgarian',
  sr: 'Serbian',
  tr: 'Turkish',
  el: 'Greek',
  hr: 'Croatian',
  sl: 'Slovenian',
  bs: 'Bosnian',
};

/** Marker pentru câmpurile pe care userul nu le-a completat (cerință explicită). */
const NOT_FILLED = 'Utilizatorul nu a completat';

/** Înlocuiește {{variabilă}} cu valoarea din map; valori goale/null → NOT_FILLED. */
function fillTemplate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => {
    const v = vars[key];
    if (v === undefined || v === null) return NOT_FILLED;
    const s = typeof v === 'number' ? String(v) : String(v).trim();
    if (s === '' || s === '0') {
      // tipAmount = 0 → tratat ca lipsă (păstrăm semantica veche).
      if (key === 'tipAmount' && (v === 0 || v === '0')) return NOT_FILLED;
      if (s === '') return NOT_FILLED;
    }
    return s;
  });
}

/**
 * System prompt default pentru writer — în engleză (limba "neutră" pe care GPT
 * o procesează cel mai sigur ca meta-instrucțiune). Output-ul real e forțat în
 * limba țintă prin langDirective.
 *
 * Override-ul per-site (writerSystemPrompt) ÎNLOCUIEȘTE acest corp — codul
 * concatenează langDirective + override și nu mai folosește textul de mai jos.
 */
const DEFAULT_WRITER_SYSTEM = [
  'You are a songwriter specialized EXCLUSIVELY in authentic manele — the Romanian Balkan-oriental lăutărească genre (2000-2010 Pitești/București scene). NEVER mention real artist names (Suno rejects songs with celebrity references).',
  '',
  'Mandatory output structure with Suno tags (TAGS STAY IN ENGLISH, even when lyrics are in another language):',
  '[Intro: oriental synth taksim, accordion doina] — instrumental description ONLY, no sung text on this line.',
  '[Verse 1] — if a sender is provided, the FIRST 2 sung lines must clearly state BOTH the sender name AND the recipient name, in the natural opening style of the target language (e.g. Romanian "De la X, pentru Y, cu drag"; English "From X, for Y, with love"). NEVER put names inside square brackets — square brackets are instrumental metadata.',
  '[Chorus] — melismatic hook, repeatable, prolonged vowels, repeated 2-4 times with small variations.',
  '[Verse 2]',
  '[Chorus] — full repeat.',
  '[Bridge / Adlib: aoleu, haide haide] — instrumental description.',
  '[Outro: long live] — short outro phrase in target language (e.g. "să trăiești" in RO).',
  '',
  'CRITICAL RULE: text inside [square brackets] is instrumental metadata — NOT sung. The voice sings ONLY the lines AFTER the brackets. Sender / recipient names go on separate lines after [Verse 1], NEVER inside [Intro: ...].',
  '',
  'Manele vocabulary to use natively in the target language (or as-is if it has no equivalent): "brother / fraților", "God-God / Doamne-Doamne", "of of of", "aoleu", "haide", "life", "fate", "enemies", "true friends", "my heart", "money", "may God give you", "night", "drinking glass", "world", "mother", "father", "my blood", "long live". Use manele interjections ("aaa", "of", "haide-haide", "uuu") as-is — they are universal.',
  '',
  'Rhyme AABB or ABAB. 8-10 syllables per line. Themes: life drama, fate, brotherhood, money and swagger, jealous enemies, passionate love, celebration with drinks.',
  '',
  'Sub-genres available: clasic (lăutărească), modern (trap-manea), oriental (darbuka), trompetă (fanfară), de jale (heartbreak with crying), comercială (club), opulență (luxury / money / swagger), iubire (sweet love), tallava, kuchek, trapanele (dark), de pahar (drinking party).',
  '',
  'No vulgar language, but KEEP the manele attitude (pride, drama, brotherhood, money, fate). Do NOT sound like polite pop — sound like a REAL manea.',
  '',
  'Return ONLY the lyrics with Suno tags. No explanations.',
].join('\n');

/**
 * User prompt template pentru writer. `{{variabilă}}` se înlocuiește cu input-ul
 * userului; orice variabilă necompletată devine "Utilizatorul nu a completat".
 */
const WRITER_USER_TEMPLATE = [
  'Write lyrics for an authentic manea with these details:',
  '- Music style (key): {{style}}',
  '- Occasion: {{occasion}}',
  '- Recipient (person honored): {{recipientName}}',
  '- Sender (person dedicating the song): {{senderName}}',
  '- Tip amount dedicated: {{tipAmount}} {{currency}}',
  '- Personal message to convey: {{message}}',
  '- Voice artist style: {{voiceArtist}}',
  '- Optional music style hint: {{styleHint}}',
  '',
  'REQUIREMENTS:',
  '1. Use the recipient name at least 3 times in the lyrics, including in the chorus.',
  '2. If the sender is provided, the first 2 sung lines after [Verse 1] must clearly contain BOTH the sender and the recipient name, in the natural opening style of the target language. Reprise the sender name once in [Bridge] or [Outro].',
  '3. If a tip amount is provided, include a swagger line dedicating that amount, using the currency-appropriate phrasing in the target language (e.g. RO "dedic X lei / arunc X la lăutari"; BG лева; TR lira; EUR euro).',
  '4. Strictly use Suno tags: [Intro], [Verse 1], [Chorus], [Verse 2], [Chorus], [Bridge], [Outro]. Write the chorus in full twice.',
  '5. Total length: 20-28 lines of lyrics (excluding tag lines).',
  '6. Adapt the tone to the requested voice artist (jale → more "of"/"aoleu"; swagger → more flex/money/enemies).',
  '7. MUST sound like a real manea, NOT pop — use manele vocabulary natively in the target language.',
  '',
  `IMPORTANT: if any field above is literally "${NOT_FILLED}", that value was not provided by the user — skip the related instruction (e.g. do not invent a sender name, do not invent a tip amount).`,
].join('\n');

/**
 * System prompt default pentru critic — engleză, meta-instrucțiuni.
 */
const DEFAULT_CRITIC_SYSTEM = [
  'You are an editor of authentic manele lyrics. You refine the draft while preserving:',
  '1. The recipient name EXACTLY as given.',
  '2. The personal message — keep the idea, you may rephrase.',
  '3. If a sender is provided, the first 2 sung lines after [Verse 1] (NOT inside [Intro: ...]) must clearly contain BOTH names plus the message essence. If the draft buried them or put them inside square brackets, REWRITE the opening: line 1 = a natural-language equivalent of "From <sender>, for <recipient>..." in the target language; line 2 = a short line carrying the message idea. The [Intro: ...] tag stays PURELY instrumental — not a single sung word inside.',
  '4. Manele-style vocabulary in the target language ("of", "aoleu", "brother", "God-God", "haide" or their equivalents).',
  '5. ALL Suno tags ([Intro], [Verse], [Chorus], [Bridge], [Outro], [Adlib]) exactly as they are — DO NOT translate or rename them.',
  '6. Strengthen the chorus hook if it is weak. DO NOT turn the song into pop.',
  '',
  'Return ONLY the final lyrics with the tags intact. No explanations.',
].join('\n');

const CRITIC_USER_TEMPLATE = [
  'Refine the following manea draft.',
  '',
  'Context:',
  '- Style: {{style}}',
  '- Occasion: {{occasion}}',
  '- Recipient: {{recipientName}}',
  '- Sender (dedication from): {{senderName}}',
  '- Tip amount: {{tipAmount}} {{currency}}',
  '- Key message to preserve: {{message}}',
  '',
  'REQUIREMENTS:',
  `- If the sender field is NOT "${NOT_FILLED}", the first 2 sung lines after [Verse 1] must clearly state BOTH the sender and the recipient name, in the natural opening style of the target language (line 1 follows the pattern "From <sender>, for <recipient>..." translated naturally; line 2 paraphrases the key message). If the draft buried these or put them inside [brackets], REWRITE the opening. Never put names inside [brackets] — they would become instrumental. Reprise the sender once in [Bridge] or [Outro].`,
  `- If the tip amount is NOT "${NOT_FILLED}", make sure a swagger line dedicates it using the proper currency in target language.`,
  '',
  'Draft:',
  '{{draft}}',
  '',
  'Return the refined lyrics, tags intact.',
].join('\n');

@Injectable()
export class LyricsService {
  private readonly logger = new Logger('LyricsService');

  constructor(
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
    private readonly logs: LyricsLogService,
  ) {}

  /** Generează o ciornă de versuri (writer). */
  async writeDraft(input: LyricsInput): Promise<string> {
    if (input.customLyrics?.trim()) {
      return input.customLyrics.trim();
    }
    const sys = this.writerSystem(input);
    const user = this.writerUser(input);
    if (this.config.get<string>('NODE_ENV') !== 'production') {
      this.logger.log(`[DEV] writer locale=${input.locale ?? 'ro'} override=${!!input.writerSystemPrompt} sys_chars=${sys.length}`);
    }
    const apiKey = await this.settings.get('OPENAI_API_KEY');
    const model = (await this.settings.get('OPENAI_MODEL')) || 'gpt-4o-mini';
    const logId = (await this.logs.start({
      stage: 'writer',
      systemPrompt: sys,
      userPrompt: user,
      model,
      locale: input.locale ?? null,
      siteId: input.siteId ?? null,
      generationId: input.generationId ?? null,
    }))?.id ?? null;

    if (!apiKey) {
      const mock = this.mockDraft(input);
      await this.logs.finalize(logId, {
        outcome: 'mock_fallback',
        responseContent: mock,
        errorMessage: 'OPENAI_API_KEY missing',
      });
      return mock;
    }
    try {
      const result = await this.openaiChat(apiKey, model, sys, user);
      await this.logs.finalize(logId, {
        outcome: 'success',
        responseStatus: result.status,
        responseBody: result.raw,
        responseContent: result.content,
        tokensPrompt: result.usage?.prompt_tokens ?? null,
        tokensCompletion: result.usage?.completion_tokens ?? null,
        tokensTotal: result.usage?.total_tokens ?? null,
        durationMs: result.durationMs,
      });
      return result.content;
    } catch (err) {
      const message = (err as Error).message;
      this.logger.warn(`OpenAI writer failed, fallback mock: ${message}`);
      const mock = this.mockDraft(input);
      await this.logs.finalize(logId, {
        outcome: 'mock_fallback',
        responseContent: mock,
        errorMessage: message,
      });
      return mock;
    }
  }

  /** Critic care rafinează versurile. */
  async refineDraft(input: LyricsInput, draft: string): Promise<string> {
    if (input.customLyrics?.trim()) return draft; // user's lyrics are sacred
    const sys = this.criticSystem(input);
    const user = this.criticUser(input, draft);
    const apiKey = await this.settings.get('OPENAI_API_KEY');
    const model = (await this.settings.get('OPENAI_MODEL')) || 'gpt-4o-mini';
    const logId = (await this.logs.start({
      stage: 'critic',
      systemPrompt: sys,
      userPrompt: user,
      model,
      locale: input.locale ?? null,
      siteId: input.siteId ?? null,
      generationId: input.generationId ?? null,
    }))?.id ?? null;

    if (!apiKey) {
      const mock = this.mockRefine(draft);
      await this.logs.finalize(logId, {
        outcome: 'mock_fallback',
        responseContent: mock,
        errorMessage: 'OPENAI_API_KEY missing',
      });
      return mock;
    }
    try {
      const result = await this.openaiChat(apiKey, model, sys, user);
      await this.logs.finalize(logId, {
        outcome: 'success',
        responseStatus: result.status,
        responseBody: result.raw,
        responseContent: result.content,
        tokensPrompt: result.usage?.prompt_tokens ?? null,
        tokensCompletion: result.usage?.completion_tokens ?? null,
        tokensTotal: result.usage?.total_tokens ?? null,
        durationMs: result.durationMs,
      });
      return result.content;
    } catch (err) {
      const message = (err as Error).message;
      this.logger.warn(`OpenAI critic failed, fallback mock: ${message}`);
      const mock = this.mockRefine(draft);
      await this.logs.finalize(logId, {
        outcome: 'mock_fallback',
        responseContent: mock,
        errorMessage: message,
      });
      return mock;
    }
  }

  private async openaiChat(
    apiKey: string,
    model: string,
    system: string,
    user: string,
  ): Promise<{
    content: string;
    raw: unknown;
    status: number;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    durationMs: number;
  }> {
    const startedAt = Date.now();
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(
        buildChatParams({
          model,
          temperature: 0.85,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      ),
    });
    const durationMs = Date.now() - startedAt;
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI ${res.status}: ${text}`);
    }
    const json = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const content = json.choices[0]?.message?.content?.trim() ?? '';
    return { content, raw: json, status: res.status, usage: json.usage, durationMs };
  }

  /**
   * Directiva de limbă — ÎNTOTDEAUNA prezentă, indiferent de locale. Forțează
   * OpenAI să cânte în limba țintă, chiar dacă meta-instrucțiunile sunt în
   * engleză (cazul implicit).
   */
  private langDirective(locale?: string): string {
    const lang = LOCALE_NAME[locale ?? 'ro'] ?? 'Romanian';
    return `OUTPUT LANGUAGE: all sung lyrics MUST be in ${lang}. Recipient and sender names appear as-is (do not translate proper nouns). Suno tags ([Intro], [Verse 1], [Chorus], [Bridge], [Outro], [Adlib]) STAY IN ENGLISH.\n\n`;
  }

  private writerSystem(input: LyricsInput): string {
    const body = input.writerSystemPrompt?.trim() || DEFAULT_WRITER_SYSTEM;
    // Substituim {{variabile}} și în system body — utile pentru override-uri
    // per-site din admin care vor să folosească numele destinatarului direct
    // în meta-instrucțiuni. Default-ul nu conține placeholders, deci e no-op.
    return this.langDirective(input.locale) + fillTemplate(body, this.templateVars(input));
  }

  private criticSystem(input: LyricsInput): string {
    const body = input.criticSystemPrompt?.trim() || DEFAULT_CRITIC_SYSTEM;
    return this.langDirective(input.locale) + fillTemplate(body, this.templateVars(input));
  }

  private templateVars(i: LyricsInput): Record<string, unknown> {
    return {
      style: i.style,
      occasion: i.occasion,
      recipientName: i.recipientName,
      senderName: i.dedication,
      tipAmount: i.tipAmount,
      currency: i.currency,
      message: i.message,
      voiceArtist: i.voiceArtist,
      styleHint: i.styleHint,
    };
  }

  private writerUser(i: LyricsInput): string {
    return fillTemplate(WRITER_USER_TEMPLATE, this.templateVars(i));
  }

  private criticUser(i: LyricsInput, draft: string): string {
    return fillTemplate(CRITIC_USER_TEMPLATE, {
      ...this.templateVars(i),
      draft,
    });
  }

  private mockDraft(i: LyricsInput): string {
    // Mock simplu pentru dev (fără OPENAI_API_KEY). Folosește placeholder-ele
    // exact ca în template — utile la inspecție vizuală în log-uri.
    const sender = i.dedication?.trim() || NOT_FILLED;
    const recipient = i.recipientName?.trim() || NOT_FILLED;
    return [
      '[Intro: oriental synth taksim, accordion doina]',
      '[Verse 1]',
      `De la ${sender}, pentru ${recipient}, cu drag,`,
      i.message?.trim() ? `${i.message.slice(0, 80)}` : NOT_FILLED,
      '[Chorus]',
      `${recipient}, ești frate-n viața mea,`,
      'Banii vin, banii merg, dar prietenia stă.',
      '[Outro: să trăiești]',
      '',
      `(MOCK FALLBACK — set OPENAI_API_KEY în Settings.)`,
    ].join('\n');
  }

  private mockRefine(draft: string): string {
    return draft
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n');
  }
}

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([LyricsLog])],
  providers: [LyricsService, LyricsLogService],
  exports: [LyricsService, LyricsLogService],
})
export class LyricsModule {}
