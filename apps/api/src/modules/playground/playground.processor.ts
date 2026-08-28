import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { StorageService } from '../../storage/storage.service';
import { LyricsService } from '../lyrics/lyrics.module';
import { LyriaService } from '../lyria/lyria.service';
import { SitesService } from '../sites/sites.service';
import { SunoProvider } from '../suno/suno.types';
import {
  assemblePlayground,
  playgroundNeedsLyricsWrite,
  type PlaygroundAssembleInput,
} from './playground-assemble';
import { PlaygroundRun, type PlaygroundTrack } from './playground-run.entity';
import { PLAYGROUND_QUEUE } from './playground.constants';
import type { PlaygroundRequestDto } from './playground.dto';

@Processor(PLAYGROUND_QUEUE, { concurrency: 1 })
export class PlaygroundProcessor extends WorkerHost {
  private readonly logger = new Logger('PlaygroundProcessor');

  constructor(
    @InjectRepository(PlaygroundRun) private readonly runs: Repository<PlaygroundRun>,
    private readonly sites: SitesService,
    private readonly lyrics: LyricsService,
    private readonly suno: SunoProvider,
    private readonly lyria: LyriaService,
    private readonly storage: StorageService,
  ) {
    super();
  }

  async process(job: Job<{ runId: string }>): Promise<void> {
    const run = await this.runs.findOne({ where: { id: job.data.runId } });
    if (!run) {
      this.logger.warn(`playground run ${job.data.runId} not found`);
      return;
    }
    if (run.status === 'succeeded') return;

    const site = await this.sites.findById(run.siteId);
    if (!site) {
      await this.fail(run, 'Site-ul a dispărut între timp.');
      return;
    }

    const dto = (run.input ?? {}) as PlaygroundRequestDto;
    const assembled = assemblePlayground(site, dto as PlaygroundAssembleInput);

    try {
      let lyrics = assembled.lyrics;
      let draft = run.lyricsDraft ?? '';

      if (playgroundNeedsLyricsWrite(assembled)) {
        const needWrite = !lyrics || assembled.lyricsMode === 'generate' || assembled.lyricsMode === 'writer_only';
        if (needWrite && !lyrics) {
          run.status = 'writing_lyrics';
          await this.runs.save(run);
          draft = await this.lyrics.writeDraft(assembled.lyricsInput);
          run.lyricsDraft = draft;
          if (assembled.skipCritic) {
            lyrics = draft;
          } else {
            lyrics = await this.lyrics.refineDraft(assembled.lyricsInput, draft);
          }
          run.lyrics = lyrics;
          await this.runs.save(run);
        }
      }
      if (assembled.lyricsMode === 'custom') {
        lyrics = assembled.lyrics;
        run.lyrics = lyrics;
        run.lyricsDraft = lyrics;
      }

      let sung = lyrics;
      if (assembled.phonetic && sung && assembled.engine === 'suno' && !assembled.instrumental) {
        sung = await this.lyrics.toPhonetic(sung, {
          locale: assembled.lyria.lyricsLocale,
          siteId: site.id,
        });
        run.lyricsPhonetic = sung;
      }

      run.status = 'generating_audio';
      await this.runs.save(run);

      const gpt = this.lyrics.previewPrompts(assembled.lyricsInput, draft || lyrics || '…');
      const tracks: PlaygroundTrack[] = [];
      let providerJobId = '';
      let audioModel = '';

      if (assembled.engine === 'google') {
        audioModel = assembled.lyria.model || '';
        const lyriaInput = {
          stylePrompt: assembled.lyria.stylePrompt,
          occasionPrompt: assembled.lyria.occasionPrompt,
          lyrics: lyrics || '',
          vocalGender: assembled.lyria.vocalGender,
          durationSec: assembled.lyria.durationSec,
          instrumental: assembled.instrumental,
          lyricsLocale: assembled.lyria.lyricsLocale,
          model: assembled.lyria.model,
          promptOverride: assembled.lyria.promptOverride,
        };
        run.prompts = {
          gpt,
          lyria: assembled.lyria.promptOverride || assembled.lyria.builtPrompt,
          lyriaStyle: assembled.lyria.stylePrompt,
          lyriaOccasion: assembled.lyria.occasionPrompt,
        };
        await this.runs.save(run);

        const takeCount = assembled.instrumental ? 1 : assembled.variantCount;
        if (takeCount === 2) {
          const pair = await this.lyria.generatePair(lyriaInput);
          for (let i = 0; i < pair.tracks.length; i++) {
            const url = await this.persistBuffer(run.id, i, pair.tracks[i].audio);
            tracks.push({
              audioUrl: url,
              durationSec: assembled.lyria.durationSec,
              audioId: pair.tracks[i].interactionId,
            });
          }
          providerJobId = pair.providerJobId;
        } else {
          const one = await this.lyria.generateOne(lyriaInput, 1);
          const url = await this.persistBuffer(run.id, 0, one.audio);
          tracks.push({ audioUrl: url, durationSec: assembled.lyria.durationSec, audioId: one.interactionId });
          providerJobId = `lyria:${one.interactionId}`;
        }
      } else {
        audioModel = assembled.suno.model || '';
        const sunoSite = {
          ...site,
          suno: {
            ...(site.suno ?? {}),
            basePrompt: assembled.suno.basePrompt ?? site.suno?.basePrompt,
          },
        };
        const promptOverride = assembled.suno.promptOverride || (assembled.suno.customMode ? sung : undefined);
        run.prompts = {
          gpt,
          sunoStyle: assembled.suno.styleOverride,
          sunoPrompt: promptOverride,
          sunoTitle: assembled.suno.titleOverride,
          sunoCustomMode: assembled.suno.customMode,
          sunoBasePrompt: assembled.suno.basePrompt,
        };
        await this.runs.save(run);

        const result = await this.suno.generate({
          type: 'full',
          durationSec: assembled.suno.durationSec,
          style: assembled.style?.id ?? 'clasic',
          occasion: assembled.occasion?.id ?? assembled.occasion?.nm ?? '',
          occasionPrompt: assembled.suno.occasionPrompt,
          recipientName: assembled.lyricsInput.recipientName,
          message: assembled.lyricsInput.message,
          dedication: assembled.lyricsInput.dedication,
          voiceArtist: assembled.lyricsInput.voiceArtist,
          lyrics: assembled.suno.customMode ? sung || undefined : undefined,
          lyricsAreCustom: true,
          customMode: assembled.suno.customMode,
          model: assembled.suno.model,
          styleOverride: assembled.suno.styleOverride,
          promptOverride,
          titleOverride: assembled.suno.titleOverride,
          site: sunoSite,
          requestType: 'playground',
          vocalGender: assembled.suno.vocalGender,
          personaId: assembled.suno.personaId,
          personaModel: assembled.suno.personaModel,
          styleWeight: assembled.suno.styleWeight,
          weirdnessConstraint: assembled.suno.weirdnessConstraint,
          negativeTags: assembled.suno.negativeTags,
          instrumental: assembled.instrumental,
        });
        providerJobId = result.providerJobId;
        for (let i = 0; i < result.tracks.length; i++) {
          const url = await this.persistUrl(run.id, i, result.tracks[i].audioUrl);
          tracks.push({
            audioUrl: url,
            durationSec: result.tracks[i].durationSec,
            audioId: result.tracks[i].audioId,
          });
        }
      }

      run.tracks = tracks;
      run.providerJobId = providerJobId;
      run.audioModel = audioModel || run.audioModel;
      run.status = 'succeeded';
      run.completedAt = new Date();
      run.errorMessage = null;
      await this.runs.save(run);
      this.logger.log(`playground ${run.id} ok engine=${assembled.engine} tracks=${tracks.length}`);
    } catch (err) {
      const message = (err as Error).message || 'Generarea a eșuat.';
      this.logger.error(`playground ${run.id} failed: ${message}`);
      await this.fail(run, message);
    }
  }

  private async fail(run: PlaygroundRun, message: string): Promise<void> {
    run.status = 'failed';
    run.errorMessage = message.slice(0, 2000);
    run.completedAt = new Date();
    await this.runs.save(run);
  }

  private async persistBuffer(runId: string, index: number, buf: Buffer): Promise<string> {
    return this.storage.saveBuffer(`playground/${runId}/${index}.mp3`, buf, 'audio/mpeg');
  }

  private async persistUrl(runId: string, index: number, sourceUrl: string): Promise<string> {
    if (!sourceUrl) throw new Error('Audio URL gol');
    if (sourceUrl.startsWith('/uploads/')) return sourceUrl;
    try {
      const res = await fetch(sourceUrl, {
        signal: AbortSignal.timeout(120_000),
        headers: { 'User-Agent': 'manelecadou-playground/1.0' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1000) throw new Error('audio prea scurt');
      return await this.storage.saveBuffer(`playground/${runId}/${index}.mp3`, buf, 'audio/mpeg');
    } catch (err) {
      // Playground-ul trebuie să rămână ascultabil chiar dacă CDN-ul Suno refuză
      // download-ul din container (403). Player-ul din admin poate reda URL-ul original.
      this.logger.warn(
        `persist playground audio failed, keeping source: ${(err as Error).message} url=${sourceUrl.slice(0, 80)}`,
      );
      return sourceUrl;
    }
  }
}
