import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { StorageService } from '../../storage/storage.service';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
]);
const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export interface SavedAttachment {
  url: string;
  filename: string;
  mime: string;
  size: number;
  originalName: string;
}

@Injectable()
export class ChatAttachmentsService {
  private readonly logger = new Logger('ChatAttachments');

  constructor(
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {}

  async save(args: {
    conversationId: string;
    fileBuffer: Buffer;
    originalName: string;
    mime: string;
  }): Promise<SavedAttachment> {
    if (!args.fileBuffer || args.fileBuffer.length === 0) {
      throw new BadRequestException('Fișier gol');
    }
    if (args.fileBuffer.length > MAX_BYTES) {
      throw new BadRequestException(
        `Fișier prea mare (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB)`,
      );
    }
    const mime = args.mime.toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
      throw new BadRequestException(`Tip neacceptat: ${mime}`);
    }
    const ext = EXT_BY_MIME[mime] ?? args.originalName.split('.').pop()?.toLowerCase() ?? 'bin';

    const uploadsDir = this.storage.localRoot;
    const dir = join(uploadsDir, 'chat', args.conversationId);
    await fs.mkdir(dir, { recursive: true });

    const filename = `${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
    const filePath = join(dir, filename);
    await fs.writeFile(filePath, args.fileBuffer);
    await this.storage.syncFile(filePath, mime);

    const apiUrl = (this.config.get<string>('API_URL') ?? 'http://localhost:1501').replace(/\/+$/, '');
    const url = `${apiUrl}/uploads/chat/${args.conversationId}/${filename}`;

    this.logger.log(
      `attachment saved conv=${args.conversationId.slice(0, 8)} bytes=${args.fileBuffer.length} mime=${mime}`,
    );

    return {
      url,
      filename,
      mime,
      size: args.fileBuffer.length,
      originalName: args.originalName,
    };
  }
}
