import { Injectable, Logger } from '@nestjs/common';
import { OpenAiClient } from '../../openai/openai.client';
import { TranslationService } from '../../openai/translation.service';
import { KbService } from '../kb/kb.service';
import { MailService } from '../mail/mail.service';
import { ChatService } from '../chat/chat.service';

export type AssistantContextKind = 'mail' | 'chat';

export interface AssistantContext {
  kind: AssistantContextKind;
  /** ID-ul mesajului email sau ID-ul conversației de chat. */
  refId: string;
  /** Limba țintă forțată (override). Dacă lipsește, deduce din mesaj/conversație. */
  forceTargetLang?: string;
}

export interface AssistantTurn {
  role: 'user' | 'assistant';
  content: string;
}

export type AssistantOp = 'reply' | 'reformulate' | 'fix-grammar' | 'shorten' | 'expand';

export interface AssistantResult {
  /** Răspuns conversațional în RO către admin (explicații, ghidare). */
  reply: string;
  /** Draft propus în RO (ce ar putea trimite adminul). */
  suggestedDraftRo: string;
  /** Același draft tradus în limba țintă a clientului. Egal cu draftul RO dacă target='ro'. */
  suggestedDraftTarget: string;
  /** Limba țintă (ro / en / bg / el ...). */
  targetLang: string;
  /** Articolele KB folosite. */
  usedKb: Array<{ id: string; title: string }>;
  /** Scor consens al traducerii (1 dacă target=ro). */
  translationConsensus: number;
}

const SYS_BASE = `Ești un asistent AI care îl ajută pe administratorul platformei Manele Cadou să răspundă mesajelor primite (chat sau email).
- Vorbești MEREU cu adminul în limba ROMÂNĂ. Și tu, și adminul comunicați în română.
- Cunoști baza de cunoștințe (KB) a site-ului relevant și o folosești ca sursă de adevăr.
- Mesajul către client trebuie generat în limba CLIENTULUI (specificată mai jos), NU în română (decât dacă clientul e român).
- Generezi răspunsul în limba clientului — nu adăuga preambul "iată traducerea" sau ghilimele inutile.
- Tonul: cordial, profesionist, scurt și la obiect. Nu inventa prețuri/date care nu apar în KB.
- Pentru operații ca "reformulează" sau "corectează gramatical", păstrezi sensul exact și limba.

Răspuns OBLIGATORIU în JSON STRICT cu cheile:
{
  "reply_ro":     "<explicația ta scurtă către admin, în română (de ce ai scris așa, ce alternative existau)>",
  "draft_ro":     "<draftul propus, în română — ce vrei să spui clientului>",
  "draft_target": "<aceeași idee, tradusă în limba clientului. Egal cu draft_ro dacă limba clientului e ro>"
}`;

@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger('AiAssistantService');

  constructor(
    private readonly openai: OpenAiClient,
    private readonly translation: TranslationService,
    private readonly kb: KbService,
    private readonly mail: MailService,
    private readonly chat: ChatService,
  ) {}

  async run(opts: {
    context: AssistantContext;
    history: AssistantTurn[];
    message: string;
    op?: AssistantOp;
  }): Promise<AssistantResult> {
    const ctx = await this.loadContext(opts.context);
    const targetLang = (opts.context.forceTargetLang ?? ctx.targetLang ?? 'ro').toLowerCase();

    // KB search peste tot ce a scris adminul + textul original al clientului.
    const queryText = [opts.message, ctx.originalText].filter(Boolean).join('\n');
    const kbHits = ctx.siteId
      ? await this.kb.search(queryText.slice(0, 1500), ctx.siteId, 5)
      : [];

    const userPrompt = this.buildUserPrompt({
      siteName: ctx.siteName,
      targetLang,
      originalText: ctx.originalText,
      originalLang: ctx.originalLang,
      kb: kbHits,
      history: opts.history,
      adminMessage: opts.message,
      op: opts.op ?? 'reply',
    });

    const r = await this.openai.json<{ reply_ro: string; draft_ro: string; draft_target: string }>({
      system: SYS_BASE,
      user: userPrompt,
      temperature: 0.4,
      maxTokens: 1400,
    });

    const draftRo = (r.data.draft_ro ?? '').trim();
    let draftTarget = (r.data.draft_target ?? '').trim();
    let consensus = 1;

    // Verificare: re-traducem draft_ro → target prin pipeline-ul multi-agent
    // ca să avem garanția consensului. Dacă diferă major, preferăm rezultatul verificat.
    if (targetLang !== 'ro' && draftRo) {
      try {
        const verified = await this.translation.translateFromRo(draftRo, targetLang);
        if (verified) {
          draftTarget = verified.final;
          consensus = verified.consensus;
        }
      } catch (e) {
        this.logger.warn(`verify translate fail: ${(e as Error).message}`);
      }
    }

    return {
      reply: (r.data.reply_ro ?? '').trim(),
      suggestedDraftRo: draftRo,
      suggestedDraftTarget: draftTarget,
      targetLang,
      usedKb: kbHits.map((k) => ({ id: k.id, title: k.title })),
      translationConsensus: consensus,
    };
  }

  /** Adună contextul (mesajul original, limba detectată, site) în funcție de tipul referenței. */
  private async loadContext(ctx: AssistantContext): Promise<{
    siteId: string | null;
    siteName: string;
    targetLang: string;
    originalText: string;
    originalLang: string;
  }> {
    if (ctx.kind === 'mail') {
      const m = await this.mail.messages.findOne({ where: { id: ctx.refId } });
      if (!m) throw new Error('Mesaj inexistent');
      return {
        siteId: m.siteId,
        siteName: '',
        targetLang: (m.detectedLang ?? 'ro').toLowerCase(),
        originalText: (m.bodyText ?? m.snippet ?? '').slice(0, 3000),
        originalLang: (m.detectedLang ?? 'ro').toLowerCase(),
      };
    }
    // chat: refId = conversationId. Luăm ultimul mesaj user pentru limbă & context.
    const conv = await this.chat.getConversation(ctx.refId);
    const lastUser = await this.chat.listMessages(conv.id).then((all) =>
      [...all].reverse().find((m) => m.authorRole === 'user'),
    );
    return {
      siteId: conv.siteId,
      siteName: conv.subject ?? '',
      targetLang: (lastUser?.detectedLang ?? 'ro').toLowerCase(),
      originalText: (lastUser?.body ?? '').slice(0, 3000),
      originalLang: (lastUser?.detectedLang ?? 'ro').toLowerCase(),
    };
  }

  private buildUserPrompt(opts: {
    siteName: string;
    targetLang: string;
    originalText: string;
    originalLang: string;
    kb: Array<{ id: string; title: string; content: string }>;
    history: AssistantTurn[];
    adminMessage: string;
    op: AssistantOp;
  }): string {
    const kbBlock = opts.kb.length
      ? opts.kb
          .map((k, i) => `[KB#${i + 1} id=${k.id}] ${k.title}\n${k.content.slice(0, 700)}`)
          .join('\n\n---\n\n')
      : '(KB gol — răspunde din cunoștințe generale despre Manele Cadou și redirectionează când nu ești sigur)';

    const historyBlock = opts.history.length
      ? opts.history.map((h) => `[${h.role === 'user' ? 'admin' : 'asistent'}] ${h.content}`).join('\n')
      : '(prima întrebare)';

    return `## Context client
Limba clientului: ${opts.originalLang}
Mesajul ORIGINAL al clientului:
"""
${opts.originalText || '(fără mesaj original)'}
"""

## Limba țintă pentru draft
${opts.targetLang}

## Operație cerută
${opts.op}

## KB relevant (sursă de adevăr)
${kbBlock}

## Istoric conversație admin↔asistent
${historyBlock}

## Mesaj curent admin (în română)
${opts.adminMessage}

## Cerință
Răspunde JSON conform regulilor. Reține: draft_ro = ce vrei să transmiți; draft_target = aceeași idee în limba clientului (${opts.targetLang}).`;
  }
}
