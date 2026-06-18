import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IsNull, Repository } from 'typeorm';
import { ChatMessage } from '../chat/message.entity';
import { Conversation } from '../chat/conversation.entity';
import { AiMemory, AiMemoryKind } from './ai-memory.entity';
import { OpenAiClient } from '../../openai/openai.client';
import { SettingsService } from '../settings/settings.service';

interface ExtractedMemory {
  kind: AiMemoryKind;
  content: string;
  confidence?: number;
}

interface ExtractionResponse {
  facts: ExtractedMemory[];
}

/**
 * AI Learner — cron nightly care scanează conversațiile rezolvate ale ultimelor 24h
 * și extrage candidați de memorie nouă. Toți cu approved=false, admin trebuie să-i
 * aprobe în /ai/memory ca să intre în system prompt.
 */
@Injectable()
export class AILearnerService {
  private readonly logger = new Logger('AILearner');

  constructor(
    @InjectRepository(Conversation) private readonly conv: Repository<Conversation>,
    @InjectRepository(ChatMessage) private readonly msg: Repository<ChatMessage>,
    @InjectRepository(AiMemory) private readonly memory: Repository<AiMemory>,
    private readonly openai: OpenAiClient,
    private readonly settings: SettingsService,
  ) {}

  /** Cron 03:30 UTC zilnic. */
  @Cron('30 3 * * *', { name: 'ai-learner', timeZone: 'UTC' })
  async runNightly(): Promise<void> {
    const enabled = (await this.settings.get('AI_CHAT_LEARN_NIGHTLY')).toLowerCase();
    if (enabled === 'false' || enabled === '0' || enabled === '') {
      // Default OFF — admin enable-uiește din settings când vrea
      this.logger.log('skip — AI_CHAT_LEARN_NIGHTLY not enabled');
      return;
    }
    const apiKey = await this.settings.get('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.warn('skip — OPENAI_API_KEY missing');
      return;
    }
    await this.extractFromRecent();
  }

  /** Manual trigger pentru testing / admin. */
  async runManual(): Promise<{ scannedConversations: number; newMemories: number }> {
    return this.extractFromRecent();
  }

  private async extractFromRecent(): Promise<{ scannedConversations: number; newMemories: number }> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Conversații cu activitate în ultimele 24h care par „rezolvate":
    // au mesaje user + admin și ultimul mesaj e cu peste 30 min în urmă.
    const cutoffRecent = new Date(Date.now() - 30 * 60 * 1000);
    const convs = await this.conv
      .createQueryBuilder('c')
      .where('c."updatedAt" >= :since', { since })
      .andWhere('c."lastMessageAt" IS NOT NULL')
      .andWhere('c."lastMessageAt" < :cutoff', { cutoff: cutoffRecent })
      .orderBy('c."lastMessageAt"', 'DESC')
      .take(50)
      .getMany();

    let totalNew = 0;
    for (const c of convs) {
      try {
        const newCount = await this.extractFromConversation(c);
        totalNew += newCount;
      } catch (e) {
        this.logger.warn(`extract from conv=${c.id.slice(0, 8)} failed: ${(e as Error).message}`);
      }
    }
    this.logger.log(`learner done — scanned=${convs.length} newMemories=${totalNew}`);
    return { scannedConversations: convs.length, newMemories: totalNew };
  }

  private async extractFromConversation(conv: Conversation): Promise<number> {
    const messages = await this.msg.find({
      where: { conversationId: conv.id },
      order: { createdAt: 'ASC' },
    });
    // Filtrăm: skipăm system + ai_suggestion; cerem >= 4 mesaje (cel puțin 2 schimburi)
    const relevant = messages.filter(
      (m) => m.messageType !== 'system' && m.messageType !== 'ai_suggestion',
    );
    if (relevant.length < 4) return 0;

    // Existing memory pentru a evita duplicate
    const existing = await this.memory.find({
      where: conv.siteId ? { siteId: conv.siteId } : { siteId: IsNull() },
      select: ['content'],
      take: 200,
    });
    const existingNorms = new Set(existing.map((e) => normalize(e.content)));

    // Transcript ultimele 30 schimburi
    const transcript = relevant
      .slice(-30)
      .map((m) => `${m.authorRole === 'user' ? 'USER' : 'ADMIN'}: ${m.body.replace(/\s+/g, ' ').slice(0, 400)}`)
      .join('\n');

    const extraction = await this.openai
      .json<ExtractionResponse>({
        system: `Ești un analist care extrage FAPTE noi despre brand/produs/proces dintr-o conversație de suport rezolvată. NU inventa. NU extrage informații personale (nume client, email, telefon).

Returnează JSON cu schema:
{ "facts": [ { "kind": "fact" | "faq" | "tone_example" | "edge_case" | "product" | "policy", "content": "string scurt (max 250 caractere) în română", "confidence": 0.0..1.0 } ] }

Tipuri:
- "fact": fapt despre brand/preț/livrare verificat în conversație (ex. „Prețul de intrare e 29.99 lei"). ⛔ NU extrage fapte despre refund / banii înapoi — NU oferim refund (decis exclusiv de un om).
- "faq": Q clientului + A canonic admin condensat (ex. „Q: Cât durează? A: 5-10 minute de la plată.").
- "tone_example": un exemplu scurt de răspuns admin care a funcționat (max 150 caractere).
- "edge_case": situație rară gestionată (ex. „User cu plată dublă — refund manual prin Stripe").
- "product": detaliu produs (stiluri disponibile, voci, opțiuni premium).
- "policy": politică formală.

Maxim 3 fapte per conversație. Doar dacă sunt cu adevărat utile (confidence >= 0.7).`,
        user: `Conversație:\n${transcript}\n\nExtrage fapte noi.`,
        temperature: 0.2,
        maxTokens: 600,
      })
      .catch((e) => {
        this.logger.warn(`openai extract failed: ${(e as Error).message}`);
        return null;
      });

    if (!extraction?.data?.facts) return 0;
    const facts = extraction.data.facts.filter(
      (f) => f.content && f.content.length >= 10 && (f.confidence ?? 1) >= 0.7,
    );

    let added = 0;
    for (const f of facts) {
      const norm = normalize(f.content);
      if (existingNorms.has(norm)) continue;
      const row = this.memory.create({
        siteId: conv.siteId,
        kind: f.kind,
        content: f.content.trim().slice(0, 1000),
        sourceConversationId: conv.id,
        extractedFrom: { messageIds: relevant.slice(-30).map((m) => m.id) },
        approved: false,
      });
      await this.memory.save(row).catch(() => {});
      existingNorms.add(norm);
      added++;
    }
    return added;
  }
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9ăâîșțéàèùç ]+/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}
