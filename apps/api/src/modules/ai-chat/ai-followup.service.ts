import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from '../chat/conversation.entity';
import { SettingsService } from '../settings/settings.service';
import { AIChatAgentService } from './ai-chat-agent.service';

/**
 * Follow-up automat în chat: dacă userul nu a răspuns de câteva minute la ultimul
 * mesaj al AI-ului (Irina), trimitem UN mesaj scurt de re-engagement („Mai ești
 * pe aici? 😊" / „Ai reușit cu plata?"). Cerut de owner 2026-06-10 — comportament
 * de om real pe chat, nu de bot care tace.
 *
 * Reguli anti-spam:
 *  - doar conversații aiMode='auto', deschise, ne-arhivate;
 *  - userul a scris MĂCAR un mesaj vreodată (nu urmărim greeting-uri fără răspuns);
 *  - ultimul mesaj vizibil e al AI-ului/adminului, vechi de 4-45 minute;
 *  - max 2 follow-up-uri per fereastră de tăcere (aiFollowupCount, resetat când
 *    userul scrie — vezi ChatService.sendAsUser);
 *  - max 8 conversații per tick (load control).
 */
@Injectable()
export class AiFollowupService {
  private readonly logger = new Logger('AiFollowup');
  private running = false;

  constructor(
    @InjectRepository(Conversation) private readonly conv: Repository<Conversation>,
    private readonly settings: SettingsService,
    private readonly agent: AIChatAgentService,
  ) {}

  @Cron('* * * * *', { name: 'ai-chat-followup', timeZone: 'UTC' })
  async tick(): Promise<void> {
    if (this.running) return; // anti-suprapunere dacă un tick durează >1 min
    this.running = true;
    try {
      const enabled = (await this.settings.get('AI_FOLLOWUP_ENABLED')).trim().toLowerCase();
      if (enabled === 'false' || enabled === '0') return;

      const rows: Array<{ id: string }> = await this.conv.manager.query(
        `SELECT c.id
         FROM conversations c
         WHERE c."aiMode" = 'auto'
           AND c.status = 'open'
           AND c."archivedAt" IS NULL
           AND c."aiFollowupCount" < 2
           AND c."lastMessageAt" BETWEEN now() - interval '45 minutes' AND now() - interval '4 minutes'
           AND EXISTS (
             SELECT 1 FROM chat_messages um
             WHERE um."conversationId" = c.id AND um."authorRole" = 'user'
           )
           AND (
             SELECT m."authorRole" FROM chat_messages m
             WHERE m."conversationId" = c.id
               AND m."deletedAt" IS NULL
               AND m."messageType" IN ('text', 'payment_link')
             ORDER BY m."createdAt" DESC LIMIT 1
           ) = 'admin'
           -- GUARD 1 (BUG 2026-06-20 conv d808c40b: „SA NU MAI INTREBE DACA ESTI AICI
           -- DACA ESTE TOTUL GATA"): melodia e DEJA livrată (song_preview în chat) →
           -- comanda e rezolvată, nu mai bate userul la cap cu „mai ești pe aici?".
           AND NOT EXISTS (
             SELECT 1 FROM chat_messages sp
             WHERE sp."conversationId" = c.id
               AND sp."messageType" = 'song_preview'
               AND sp."deletedAt" IS NULL
           )
           -- GUARD 2 (BUG 2026-06-20 conv 293ee6cc): s-a escaladat/alertat echipa recent
           -- → un coleg uman se ocupă; Irina NU trebuie să intervină proactiv peste el.
           AND NOT EXISTS (
             SELECT 1 FROM ai_tool_calls tc
             WHERE tc."conversationId" = c.id
               AND tc."toolName" IN ('alert_admins', 'escalate_to_human')
               AND tc."createdAt" > now() - interval '3 hours'
           )
           -- GUARD 3 (BUG 2026-06-20 conv 293ee6cc: „nu trebuie să-l țină de vorbă"):
           -- ultimul mesaj al userului e o închidere/confirmare scurtă („ok", „mersi",
           -- „da", „bine"...) → conversația s-a încheiat natural, nu re-angaja.
           AND COALESCE((
             SELECT lower(btrim(um2.body)) FROM chat_messages um2
             WHERE um2."conversationId" = c.id
               AND um2."authorRole" = 'user'
               AND um2."deletedAt" IS NULL
             ORDER BY um2."createdAt" DESC LIMIT 1
           ), 'x') !~ '^((ok|oki|okk|okay|bine|da|daa|gata|mersi|merci|multumesc|mulțumesc|multam|thanks|thx|ty|perfect|super|nu)[[:space:].,!]*)+[👍🙏❤️😊🎶]*$'
         ORDER BY c."lastMessageAt" ASC
         LIMIT 8`,
      );
      if (rows.length === 0) return;
      this.logger.log(`follow-up candidates: ${rows.length}`);
      for (const r of rows) {
        try {
          await this.agent.runFollowUp(r.id);
        } catch (e) {
          this.logger.warn(`follow-up failed conv=${r.id.slice(0, 8)}: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      this.logger.warn(`followup tick failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
