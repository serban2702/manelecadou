import { Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { SettingsService } from '../settings/settings.service';

export interface LyricsInput {
  style: string;
  occasion: string;
  recipientName: string;
  message: string;
  dedication?: string;
  tipAmount?: number;
  voiceArtist: string;
  customLyrics?: string;
  locale?: string;
  /** Override system prompt pentru writer (din Site.suno.writerSystemPrompt).
   *  Când e setat, ÎNLOCUIEȘTE complet system prompt-ul default RO — codul
   *  doar prepend-ează langDirective ("CRITICAL: write in <Lang>") dacă
   *  locale != ro. Folosește pentru a livra vocabular nativ pe BG, RS, TR. */
  writerSystemPrompt?: string;
  /** Idem pentru critic. Gol = fallback la default RO. */
  criticSystemPrompt?: string;
  /** Hint descriptiv despre stilul muzical (ex: "modern manele 2020s, trap-808 sub-bass…").
   *  Se trimite la OpenAI ca "STIL MUZICAL" în user prompt — ajută AI-ul să aleagă
   *  vocabular și ritm potrivit. Folosit la sample preview cu customStylePrompt. */
  styleHint?: string;
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

export interface LyricsOutput {
  draft: string;
  final: string;
  notes?: string;
}

@Injectable()
export class LyricsService {
  private readonly logger = new Logger('LyricsService');

  constructor(
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
  ) {}

  /** Generează o ciornă de versuri (writer). */
  async writeDraft(input: LyricsInput): Promise<string> {
    if (input.customLyrics?.trim()) {
      return input.customLyrics.trim();
    }
    // Construim system-ul ca să vedem ce s-ar fi trimis (util pentru debug
    // în dev, indiferent dacă OPENAI_API_KEY e prezent sau nu).
    const sys = this.writerSystem(input.locale, input.writerSystemPrompt);
    if (this.config.get<string>('NODE_ENV') !== 'production') {
      this.logger.log(`[DEV] writer locale=${input.locale ?? 'ro'} override=${!!input.writerSystemPrompt} sys_chars=${sys.length} preview="${sys.slice(0, 100).replace(/\n/g, ' ')}..."`);
    }
    const apiKey = await this.settings.get('OPENAI_API_KEY');
    if (!apiKey) return this.mockDraft(input);
    try {
      return await this.openaiChat(apiKey, sys, this.writerUser(input));
    } catch (err) {
      this.logger.warn(`OpenAI writer failed, fallback mock: ${(err as Error).message}`);
      return this.mockDraft(input);
    }
  }

  /** Critic care rafinează versurile. */
  async refineDraft(input: LyricsInput, draft: string): Promise<string> {
    if (input.customLyrics?.trim()) return draft; // user's lyrics are sacred
    const apiKey = await this.settings.get('OPENAI_API_KEY');
    if (!apiKey) return this.mockRefine(draft);
    try {
      return await this.openaiChat(
        apiKey,
        this.criticSystem(input.locale, input.criticSystemPrompt),
        this.criticUser(input, draft),
      );
    } catch (err) {
      this.logger.warn(`OpenAI critic failed, fallback mock: ${(err as Error).message}`);
      return this.mockRefine(draft);
    }
  }

  private async openaiChat(apiKey: string, system: string, user: string): Promise<string> {
    const model = (await this.settings.get('OPENAI_MODEL')) || 'gpt-4o-mini';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.85,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    return json.choices[0]?.message?.content?.trim() ?? '';
  }

  private writerSystem(locale?: string, override?: string): string {
    const lang = LOCALE_NAME[locale ?? 'ro'] ?? 'Romanian';
    const langDirective = lang === 'Romanian'
      ? ''
      : `CRITICAL: Write the lyrics in ${lang}. All sung lyrics, recipient name aside, must be in ${lang}. Suno tags ([Intro], [Verse 1], [Chorus], [Bridge], [Outro], [Adlib]) stay in English. `;
    // Override per-site (chalga BG, turbofolk RS, arabesk TR etc.) — înlocuiește
    // complet vocabularul + atitudinea + sub-genurile, păstrăm doar langDirective.
    if (override?.trim()) {
      return langDirective + override.trim();
    }
    return langDirective + [
      'Ești un textier român specializat EXCLUSIV în manele autentice. NU scrii pop, NU scrii dance, NU scrii party generic. Scrii MANEA românească reală — tradiția lăutărească orientală, era 2000-2010, scena Pitești / București. INTERZIS să menționezi nume de artiști reali în versuri (Suno respinge piesele care conțin nume de cântăreți celebri).',
      'Vocabular obligatoriu de manea: "frate", "fraților", "Doamne-Doamne", "of of of", "aoleu", "haide", "viață", "soartă", "dușmani", "prieteni adevărați", "inima mea", "bani", "să-ți dea Dumnezeu", "noaptea", "pahar", "lume", "mama", "tata", "sângele meu", "să trăiești". Folosește interjecții manelistice ("aaa", "of", "haide-haide", "uuu").',
      'Structură obligatorie cu tag-uri Suno în output: începi cu [Intro: oriental synth taksim, accordion doina] (DOAR descriere instrumentală între paranteze, NICIUN text de cântat pe această linie), apoi [Verse 1] cu primele 2 rânduri OBLIGATORIU rostite clar (vezi instrucțiunea din user-prompt despre dedicație/mesaj), [Chorus] (refren melismatic cu hook puternic, repetabil), [Verse 2], [Chorus], [Bridge / Adlib: aoleu, haide haide] (descriere între paranteze), [Outro: "să trăiești"].',
      'REGULĂ CRITICĂ Suno: tot textul dintre paranteze pătrate este metadată instrumentală — NU se cântă. Vocea cântă DOAR liniile de după bracket-uri. De aceea, dedicația și mesajul personal trebuie să fie pe linii separate DUPĂ [Verse 1], NU în interiorul tag-ului [Intro: ...].',
      'Refrenul TREBUIE să fie hook melismatic, repetitiv, ușor de cântat — fraza-cheie repetată de 2-4 ori cu mici variații, cu vocale prelungite (ex: "viaaațăăă", "iniiiima").',
      'Versurile au rimă AABB sau ABAB, ritm de manea (8-10 silabe pe rând). Tematica autentică: drama vieții, soartă, frățietate, bani și șmecherie, dușmani gelozi, dragoste pătimașă, sărbătoare cu pahar.',
      'Subgenuri: clasic (lăutărească), modern (trap-manea), oriental (darbuka), trompetă (fanfară), de jale (heartbreak cu plâns), comercială (club), opulență (lux/bani/șmecherie), iubire (dulce), tallava, kuchek, trapanele (dark), de pahar (petrecere).',
      'Fără limbaj injurios, dar PĂSTREAZĂ atitudinea de manea (mândrie, dramă, frățietate, bani, soartă). Nu suna "frumușel pop" — suna A MANEA REALĂ. Returnează DOAR versurile cu tag-uri, fără explicații.',
    ].join(' ');
  }

  private writerUser(i: LyricsInput): string {
    const tipLine = i.tipAmount ? `Include în versuri formularea șmecher: "dedic ${i.tipAmount} de lei" sau echivalent (ex: "arunc ${i.tipAmount} la lăutari").` : '';
    const messageHook = i.message?.trim() ? this.condenseMessage(i.message) : '';
    const dedicationOpening = i.dedication
      ? [
          `OBLIGATORIU — DESCHIDEREA PIESEI (PRIMELE 2 RÂNDURI DUPĂ [Verse 1]):`,
          `Rândul 1 (sung, NU în paranteze): "De la ${i.dedication}, pentru ${i.recipientName}, cu drag" (sau o variantă care conține CLAR ambele nume).`,
          messageHook
            ? `Rândul 2 (sung, NU în paranteze): o reformulare scurtă a mesajului personal — "${messageHook}" — astfel încât în primele 8 secunde de cântat să se audă: cine dedică (${i.dedication}), cui (${i.recipientName}), și care e ideea mesajului.`
            : `Rândul 2 (sung): continuă cu un vers ce reia ideea ocaziei (${i.occasion}).`,
          `NU pune dedicația / numele între paranteze — paranteze = instrument, NU vocea. Reia "${i.dedication}" încă o dată în [Bridge] sau [Outro].`,
        ].join(' ')
      : '';
    const styleHintLine = i.styleHint?.trim()
      ? `STIL MUZICAL (aliniază vocabularul și ritmul cu această descriere): ${i.styleHint.trim()}`
      : '';
    return [
      `Scrie versurile pentru o MANEA ${i.style} autentică, ocazia: ${i.occasion}.`,
      styleHintLine,
      `Pentru: ${i.recipientName} (folosește numele de minim 3 ori în versuri, inclusiv în refren).`,
      `Mesajul personal de transmis: "${i.message}".`,
      dedicationOpening,
      tipLine,
      `Format STRICT cu tag-uri Suno: [Intro], [Verse 1], [Chorus], [Verse 2], [Chorus], [Bridge], [Outro]. Refrenul scris complet de 2 ori.`,
      `Lungime totală: 20-28 rânduri de versuri (excluzând tag-urile).`,
      `Vocea cerută: ${i.voiceArtist} — adaptează tonul (voce de jale → mai mult "of"/"aoleu"; voce de șmecher → mai mult flex/bani/dușmani).`,
      `IMPORTANT: TREBUIE să sune a MANEA, nu a melodie pop. Folosește vocabularul manelistic obligatoriu și interjecții.`,
    ].filter(Boolean).join('\n');
  }

  private criticSystem(locale?: string, override?: string): string {
    const lang = LOCALE_NAME[locale ?? 'ro'] ?? 'Romanian';
    const langDirective = lang === 'Romanian'
      ? ''
      : `CRITICAL: Keep all lyrics in ${lang}. Do NOT translate to Romanian. Suno tags stay in English. `;
    if (override?.trim()) {
      return langDirective + override.trim();
    }
    return langDirective + [
      'Ești editor de versuri de MANELE autentice. Rafinezi ciorna păstrând:',
      '(1) NUMELE destinatarului exact, nemodificat;',
      '(2) MESAJUL personal — păstrezi ideea, poți reformula;',
      '(3) DACĂ există dedicație, primele 2 rânduri DUPĂ [Verse 1] (NU în interiorul tag-ului [Intro]) trebuie să conțină CLAR atât numele expeditorului cât și al destinatarului, plus esența mesajului. Dacă ciorna le-a îngropat sau le-a pus între paranteze pătrate, REScrie deschiderea: linia 1 din Verse 1 = "De la <expeditor>, pentru <destinatar>..."; linia 2 = un vers scurt cu ideea mesajului. Tag-ul [Intro: ...] rămâne PUR INSTRUMENTAL — niciun cuvânt cântat în el.',
      '(4) Vocabularul manelistic ("of", "aoleu", "frate", "Doamne-Doamne", "haide");',
      '(5) TOATE tag-urile Suno ([Intro], [Verse], [Chorus], [Bridge], [Outro], [Adlib]) exact cum sunt;',
      '(6) Întărești hook-ul refrenului dacă e slab. NU transforma în pop.',
      'Returnează DOAR versurile finale cu tag-uri intacte, fără explicații.',
    ].join(' ');
  }

  private criticUser(i: LyricsInput, draft: string): string {
    const messageHook = i.message?.trim() ? this.condenseMessage(i.message) : '';
    return [
      `Stil: ${i.style}, ocazie: ${i.occasion}, pentru ${i.recipientName}.`,
      `Mesaj-cheie de păstrat: "${i.message}"`,
      i.dedication
        ? [
            `EXPEDITOR (dedicație): "${i.dedication}". DESTINATAR: "${i.recipientName}".`,
            `OBLIGATORIU primele 2 rânduri DUPĂ tag-ul [Verse 1] (cele care se cântă efectiv, NU descrierea instrumentală din [Intro: ...]):`,
            `  • rândul 1: "De la ${i.dedication}, pentru ${i.recipientName}, cu drag" (sau formulare echivalentă cu AMBELE nume rostite clar).`,
            messageHook
              ? `  • rândul 2: parafrazează scurt mesajul "${messageHook}".`
              : `  • rândul 2: continuă cu ideea ocaziei.`,
            `Verifică ciorna: dacă "${i.dedication}" sau "${i.recipientName}" lipsesc din primele 2 rânduri sung după [Verse 1], REScrie deschiderea. Niciodată să nu pui numele între [paranteze] — ar deveni instrumental.`,
            `Reia "${i.dedication}" încă o dată în [Bridge] sau [Outro].`,
          ].join(' ')
        : '',
      `Ciornă:\n${draft}`,
      `Întoarce versurile finale rafinate.`,
    ].filter(Boolean).join('\n\n');
  }

  /**
   * Condensează un mesaj lung al utilizatorului într-o frază de ~10-12 cuvinte
   * potrivită ca rând cântat în deschiderea piesei. Tăiem la prima propoziție
   * sau la 80 caractere, fără să rupem cuvinte.
   */
  private condenseMessage(msg: string): string {
    const cleaned = msg.replace(/\s+/g, ' ').trim();
    if (!cleaned) return '';
    const firstSentence = cleaned.split(/[.!?]/)[0]?.trim() ?? cleaned;
    if (firstSentence.length <= 80) return firstSentence;
    const cut = firstSentence.slice(0, 80);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim();
  }

  private mockDraft(i: LyricsInput): string {
    const refrain = `Pentru ${i.recipientName}, cu drag,\nO manea ${i.style} de pahar.`;
    return [
      refrain,
      `${i.message ? `"${i.message.slice(0, 80)}"` : 'Doamne, dă-i sănătate'}`,
      i.dedication ? `— ${i.dedication}` : '',
      i.tipAmount ? `Cu dedicație ${i.tipAmount} de lei,` : '',
      i.tipAmount ? 'Să sune banii ca arginții.' : '',
      `\nCuplet:\n${i.recipientName}, ești frate-n viața mea,`,
      `Banii vin, banii merg, dar prietenia stă.`,
      `Refren:\n${refrain}`,
    ].filter(Boolean).join('\n');
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
  imports: [ConfigModule],
  providers: [LyricsService],
  exports: [LyricsService],
})
export class LyricsModule {}
