import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  SunoCoverInput,
  SunoExtendInput,
  SunoGenerateInput,
  SunoGenerateResult,
  SunoProvider,
  SunoReplaceSectionInput,
  SunoSeparateResult,
} from '../suno.types';

const POOL = [
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
];

@Injectable()
export class SunoMockProvider extends SunoProvider {
  private readonly logger = new Logger('SunoMockProvider');

  async generate(input: SunoGenerateInput): Promise<SunoGenerateResult> {
    const delayMs = input.type === 'demo' ? 8000 : 14000;
    this.logger.log(
      `mock generate type=${input.type} duration=${input.durationSec}s recipient=${input.recipientName}`,
    );
    await new Promise((r) => setTimeout(r, delayMs));
    const shuffled = [...POOL].sort(() => Math.random() - 0.5);
    return {
      tracks: [
        { audioUrl: shuffled[0], durationSec: input.durationSec },
        { audioUrl: shuffled[1], durationSec: input.durationSec },
      ],
      lyrics: input.lyrics,
      providerJobId: `mock_${randomUUID()}`,
    };
  }

  async extendMusic(_input: SunoExtendInput): Promise<SunoGenerateResult> {
    await new Promise((r) => setTimeout(r, 6000));
    return {
      tracks: [{ audioUrl: POOL[0], durationSec: 180, audioId: randomUUID() }],
      providerJobId: `mock_${randomUUID()}`,
    };
  }

  async coverMusic(_input: SunoCoverInput): Promise<SunoGenerateResult> {
    await new Promise((r) => setTimeout(r, 8000));
    const shuffled = [...POOL].sort(() => Math.random() - 0.5);
    return {
      tracks: [
        { audioUrl: shuffled[0], durationSec: 150, audioId: randomUUID() },
        { audioUrl: shuffled[1], durationSec: 150, audioId: randomUUID() },
      ],
      providerJobId: `mock_${randomUUID()}`,
    };
  }

  async replaceSection(_input: SunoReplaceSectionInput): Promise<SunoGenerateResult> {
    await new Promise((r) => setTimeout(r, 7000));
    return {
      tracks: [{ audioUrl: POOL[1], durationSec: 150, audioId: randomUUID() }],
      providerJobId: `mock_${randomUUID()}`,
    };
  }

  async convertToWav(): Promise<string | null> {
    await new Promise((r) => setTimeout(r, 3000));
    return POOL[2];
  }

  async separateVocals(
    _taskId: string,
    _audioId: string,
    type: 'separate_vocal' | 'split_stem' = 'separate_vocal',
  ): Promise<SunoSeparateResult | null> {
    await new Promise((r) => setTimeout(r, 4000));
    if (type === 'split_stem') {
      return { stems: { vocal: POOL[0], drums: POOL[1], bass: POOL[2], guitar: POOL[3] } };
    }
    return { vocalUrl: POOL[0], instrumentalUrl: POOL[1] };
  }

  async createMusicVideo(): Promise<string | null> {
    await new Promise((r) => setTimeout(r, 5000));
    return 'https://example.com/mock-video.mp4';
  }

  async getCredits(): Promise<number | null> {
    return 1234.5;
  }
}
