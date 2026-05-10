import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  SunoGenerateInput,
  SunoGenerateResult,
  SunoProvider,
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
}
