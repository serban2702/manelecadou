import { Injectable, Logger } from '@nestjs/common';
import { Between } from 'typeorm';

import { MailService } from './mail.service';
import { MailSendService } from './mail-send.service';
import { MailGateway } from './mail.gateway';
import { KbService } from '../kb/kb.service';
import { OpenAiClient } from '../../openai/openai.client';
import { AiReplySuggestion } from '../kb/entities/ai-reply-suggestion.entity';
import { MailMessage } from './entities/mail-message.entity';
import { MailAccount } from './entities/mail-account.entity';

interface AiReplyJson {
  shouldReply: boolean;
  confidence: number;
  htmlReply: string;
  plainReply?: string;
  reasoning?: string;
  usedKbIds?: string[];
}

const SYS_PROMPT = `Ești asistentul AI al echipei Manele Cadou. Răspunzi la emailuri în limba română, profesionist dar prietenos.

Reguli stricte:
1. Răspunzi DOAR dacă răspunsul e clar bazat pe baza de cunoștințe (KB) furnizată în mesajul utilizatorului.
2. Dacă întrebarea nu poate fi acoperită cu certitudine din KB, setează shouldReply=false și confidence<0.5.
3. confidence = 0..1, cât de sigur ești că răspunsul tău rezolvă cererea (1 = certitudine totală).
4. htmlReply = HTML curat (<p>, <ul>, <li>, <strong>, <a>, <br>) — fără <html>, <body>, <style>, <script>. Ton cordial, terminat cu mulțumiri.
5. plainReply = varianta text. Dacă lipsește, va fi generată automat din html.
6. NU inventa prețuri, termene, detalii care nu apar în KB. Dacă lipsesc, redirectionează politicos către echipa umană.
7. NU răspunde la newsletters, no-reply, mailing lists.

Format răspuns: JSON strict cu cheile shouldReply (bool), confidence (number 0..1), htmlReply (string), plainReply (string), reasoning (string scurt în română), usedKbIds (array de id-uri KB folosite).`;

@Injectable()
export class AiReplyService {
  private readonly logger = new Logger('AiReplyService');

  constructor(
    private readonly mail: MailService,
    private readonly send: MailSendService,
    private readonly gateway: MailGateway,
    private readonly kb: KbService,
    private readonly openai: OpenAiClient,
  ) {}

  async suggestFor(messageId: string): Promise<AiReplySuggestion | null> {
    const msg = await this.mail.messages.findOne({ where: { id: messageId } });
    if (!msg) return null;
    if (msg.direction !== 'in') return null;
    if (this.isLoopRisk(msg)) {
      this.logger.log(`skip AI for ${msg.id}: loop-risk headers/sender`);
      return this.persistSkipped(msg.id, 'loop-risk');
    }

    const acc = await this.mail.getAccount(msg.accountId);
    const query = `${msg.subject}\n\n${(msg.bodyText ?? '').slice(0, 1500)}`;
    // Fiecare site are propria bază de cunoștințe — search-ul ține cont de site-ul
    // contului de mail (ex: KB-ul RO nu se folosește pentru reply pe BG).
    const top = await this.kb.search(query, acc?.siteId ?? null, 5);

    if (!top.length) {
      return this.persistSkipped(msg.id, 'no-kb-match');
    }

    const userPrompt = this.buildUserPrompt(msg, top);
    let parsed: AiReplyJson;
    let model = '';
    try {
      const r = await this.openai.json<AiReplyJson>({
        system: SYS_PROMPT,
        user: userPrompt,
        temperature: 0.2,
        maxTokens: 900,
      });
      parsed = r.data;
      model = r.model;
    } catch (e) {
      this.logger.warn(`OpenAI failed for msg=${msg.id}: ${(e as Error).message}`);
      return this.persistSkipped(msg.id, `openai-error: ${(e as Error).message.slice(0, 100)}`);
    }

    const sugg = this.kb.suggestions.create({
      messageId: msg.id,
      siteId: acc?.siteId ?? null,
      confidence: clamp01(parsed.confidence ?? 0),
      shouldReply: !!parsed.shouldReply,
      htmlReply: parsed.htmlReply ?? '',
      plainReply: parsed.plainReply ?? '',
      reasoning: parsed.reasoning ?? '',
      usedKbIds: parsed.usedKbIds ?? top.map((t) => t.id),
      model,
      status: 'pending',
    });
    const saved = await this.kb.suggestions.save(sugg);
    this.gateway.emitSuggestionReady(msg.id, saved.id);

    if (await this.shouldAutoSend(acc, msg, saved)) {
      try {
        await this.send.sendReply({
          inReplyToId: msg.id,
          htmlBody: saved.htmlReply,
          aiGenerated: true,
        });
        saved.status = 'auto_sent';
        saved.sentAt = new Date();
        await this.kb.suggestions.save(saved);
        this.logger.log(`auto-replied msg=${msg.id} confidence=${saved.confidence.toFixed(2)}`);
      } catch (e) {
        this.logger.warn(`auto-send failed msg=${msg.id}: ${(e as Error).message}`);
      }
    }

    return saved;
  }

  private async shouldAutoSend(acc: MailAccount, msg: MailMessage, sugg: AiReplySuggestion): Promise<boolean> {
    if (!acc.autoReplyEnabled) return false;
    if (!sugg.shouldReply) return false;
    if (sugg.confidence < acc.autoReplyThreshold) return false;
    if (!msg.threadId) return true;
    // Dedupe: nu trimite două auto-reply în același thread în 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await this.mail.messages.findOne({
      where: {
        threadId: msg.threadId,
        accountId: msg.accountId,
        direction: 'out',
        aiGenerated: true,
        createdAt: Between(since, new Date()),
      },
    });
    return !recent;
  }

  private isLoopRisk(msg: MailMessage): boolean {
    const h = msg.headers ?? {};
    const has = (k: string) => h[k] !== undefined;
    const hv = (k: string): string => {
      const v = h[k];
      return Array.isArray(v) ? v.join(' ') : (v ?? '');
    };
    if (has('list-id') || has('list-unsubscribe')) return true;
    if (/bulk|junk|list/i.test(hv('precedence'))) return true;
    const autoSub = hv('auto-submitted').toLowerCase();
    if (autoSub && autoSub !== 'no') return true;
    if (hv('x-auto-response-suppress')) return true;
    const from = (msg.fromAddr ?? '').toLowerCase();
    if (/no[-_.]?reply|mailer-daemon|postmaster|bounce/.test(from)) return true;
    return false;
  }

  private async persistSkipped(messageId: string, reason: string): Promise<AiReplySuggestion> {
    const sugg = this.kb.suggestions.create({
      messageId,
      confidence: 0,
      shouldReply: false,
      htmlReply: '',
      plainReply: '',
      reasoning: `skip: ${reason}`,
      usedKbIds: [],
      model: '',
      status: 'skipped',
    });
    return this.kb.suggestions.save(sugg);
  }

  private buildUserPrompt(msg: MailMessage, kb: Array<{ id: string; title: string; content: string }>): string {
    const kbBlock = kb
      .map((k, i) => `[KB#${i + 1} id=${k.id}] ${k.title}\n${k.content.slice(0, 800)}`)
      .join('\n\n---\n\n');
    return `## Email primit
De la: ${msg.fromName ?? ''} <${msg.fromAddr ?? ''}>
Subiect: ${msg.subject}

${(msg.bodyText ?? '').slice(0, 2000)}

## Baza de cunoștințe relevantă
${kbBlock}

## Cerere
Răspunde JSON conform regulilor din system prompt.`;
  }
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
