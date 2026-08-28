import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { LyricsService } from '../lyrics/lyrics.module';
import { SettingsService } from '../settings/settings.service';
import { SitesService } from '../sites/sites.service';
import { assemblePlayground } from './playground-assemble';
import { PlaygroundRun } from './playground-run.entity';
import {
  LYRIA_MODELS,
  OPENAI_MODEL_OPTIONS,
  OPENAI_MODELS,
  PLAYGROUND_QUEUE,
  SUNO_MODELS,
} from './playground.constants';
import type { PlaygroundRequestDto } from './playground.dto';

@Injectable()
export class PlaygroundService {
  constructor(
    @InjectRepository(PlaygroundRun) private readonly runs: Repository<PlaygroundRun>,
    @InjectQueue(PLAYGROUND_QUEUE) private readonly queue: Queue,
    private readonly sites: SitesService,
    private readonly lyrics: LyricsService,
    private readonly settings: SettingsService,
  ) {}

  async requireSite(siteId: string | undefined) {
    if (!siteId) {
      throw new BadRequestException('Selectează un site. Playground-ul e per tenant.');
    }
    const site = await this.sites.findById(siteId);
    if (!site) throw new NotFoundException('Site negăsit');
    return site;
  }

  async meta() {
    const [openaiModel, sunoModel, lyriaModel] = await Promise.all([
      this.settings.get('OPENAI_MODEL'),
      this.settings.get('SUNO_MODEL'),
      this.settings.get('LYRIA_MODEL'),
    ]);
    return {
      openaiModel: openaiModel || 'gpt-4o-mini',
      sunoModel: sunoModel || 'V4_5',
      lyriaModel: lyriaModel || 'lyria-3-pro-preview',
      openaiModels: [...OPENAI_MODELS],
      openaiModelOptions: OPENAI_MODEL_OPTIONS,
      sunoModels: [...SUNO_MODELS],
      lyriaModels: [...LYRIA_MODELS],
      defaultTemplates: this.lyrics.defaultTemplates(),
    };
  }

  async preview(siteId: string | undefined, dto: PlaygroundRequestDto) {
    const site = await this.requireSite(siteId);
    const assembled = assemblePlayground(site, dto);
    const gpt = this.lyrics.previewPrompts(assembled.lyricsInput, assembled.lyrics || '[Verse 1]\n…\n[Chorus]\n…');
    return {
      engine: assembled.engine,
      experienceSlug: assembled.experienceSlug,
      style: assembled.style ? { id: assembled.style.id, nm: assembled.style.nm } : null,
      occasion: assembled.occasion ? { id: assembled.occasion.id, nm: assembled.occasion.nm } : null,
      voice: assembled.voice ? { id: assembled.voice.id, nm: assembled.voice.nm } : null,
      lyricsMode: assembled.lyricsMode,
      instrumental: assembled.instrumental,
      phonetic: assembled.phonetic,
      skipCritic: assembled.skipCritic,
      gpt,
      suno: {
        model: assembled.suno.model,
        customMode: assembled.suno.customMode,
        style: assembled.suno.styleOverride ?? null,
        prompt: assembled.suno.promptOverride ?? assembled.lyrics ?? null,
        title: assembled.suno.titleOverride ?? null,
        basePrompt: assembled.suno.basePrompt ?? null,
        vocalGender: assembled.suno.vocalGender ?? null,
        styleWeight: assembled.suno.styleWeight ?? null,
        weirdnessConstraint: assembled.suno.weirdnessConstraint ?? null,
        negativeTags: assembled.suno.negativeTags ?? null,
        personaId: assembled.suno.personaId ?? null,
        personaModel: assembled.suno.personaModel ?? null,
        durationSec: assembled.suno.durationSec,
      },
      lyria: {
        model: assembled.lyria.model,
        stylePrompt: assembled.lyria.stylePrompt,
        occasionPrompt: assembled.lyria.occasionPrompt ?? null,
        prompt: assembled.lyria.builtPrompt,
        vocalGender: assembled.lyria.vocalGender ?? null,
        durationSec: assembled.lyria.durationSec,
        instrumental: assembled.lyria.instrumental,
        lyricsLocale: assembled.lyria.lyricsLocale,
      },
    };
  }

  async writeLyrics(siteId: string | undefined, dto: PlaygroundRequestDto) {
    const site = await this.requireSite(siteId);
    const assembled = assemblePlayground(site, dto);
    if (assembled.lyricsMode === 'instrumental') {
      return { draft: '', final: '', notes: 'instrumental' as const };
    }
    if (assembled.lyricsMode === 'custom') {
      const lyrics = assembled.lyrics;
      if (!lyrics) throw new BadRequestException('Lipesc eu — dar textarea de versuri e goală.');
      return { draft: lyrics, final: lyrics, notes: 'custom' as const };
    }
    const draft = await this.lyrics.writeDraft(assembled.lyricsInput);
    if (assembled.skipCritic) {
      return { draft, final: draft, notes: 'writer_only' as const };
    }
    const final = await this.lyrics.refineDraft(assembled.lyricsInput, draft);
    return { draft, final, notes: 'writer_critic' as const };
  }

  async startGenerate(
    siteId: string | undefined,
    dto: PlaygroundRequestDto,
    createdByEmail: string | null,
  ): Promise<PlaygroundRun> {
    const site = await this.requireSite(siteId);
    const assembled = assemblePlayground(site, dto);
    if (assembled.engine === 'suno' && assembled.suno.customMode) {
      const willHaveLyrics =
        assembled.lyricsMode === 'generate' ||
        assembled.lyricsMode === 'writer_only' ||
        !!assembled.lyrics ||
        !!assembled.suno.promptOverride;
      if (!willHaveLyrics && !assembled.instrumental) {
        throw new BadRequestException(
          'Custom mode Suno cere versuri. Generează-le, lipește-le, sau treci pe description mode / instrumental.',
        );
      }
    }
    const run = this.runs.create({
      siteId: site.id,
      createdByEmail,
      engine: assembled.engine,
      status: 'queued',
      input: dto as unknown as Record<string, unknown>,
      lyrics: assembled.lyrics || null,
      openaiModel: assembled.lyricsInput.model ?? null,
      audioModel: assembled.engine === 'google' ? assembled.lyria.model ?? null : assembled.suno.model ?? null,
    });
    const saved = await this.runs.save(run);
    await this.queue.add(
      'generate',
      { runId: saved.id },
      { attempts: 1, removeOnComplete: 50, removeOnFail: 50 },
    );
    void this.prune(site.id);
    return saved;
  }

  async getRun(siteId: string | undefined, id: string): Promise<PlaygroundRun> {
    await this.requireSite(siteId);
    const run = await this.runs.findOne({ where: { id, siteId } });
    if (!run) throw new NotFoundException('Run negăsit');
    return run;
  }

  async listRuns(siteId: string | undefined, limit = 30): Promise<PlaygroundRun[]> {
    await this.requireSite(siteId);
    return this.runs.find({
      where: { siteId },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  serialize(run: PlaygroundRun) {
    return {
      id: run.id,
      siteId: run.siteId,
      createdByEmail: run.createdByEmail,
      engine: run.engine,
      status: run.status,
      errorMessage: run.errorMessage,
      input: run.input,
      prompts: run.prompts,
      lyricsDraft: run.lyricsDraft,
      lyrics: run.lyrics,
      lyricsPhonetic: run.lyricsPhonetic,
      tracks: run.tracks,
      providerJobId: run.providerJobId,
      openaiModel: run.openaiModel,
      audioModel: run.audioModel,
      createdAt: run.createdAt,
      completedAt: run.completedAt,
    };
  }

  private async prune(siteId: string): Promise<void> {
    const extra = await this.runs.find({
      where: { siteId },
      order: { createdAt: 'DESC' },
      skip: 80,
      take: 40,
    });
    if (extra.length) await this.runs.remove(extra);
  }
}
