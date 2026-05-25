import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import {
  extractOpenReplaySessionId,
  openReplayStorage,
} from './openreplay-context';

/**
 * Extrage `X-OpenReplay-SessionID` header trimis de client și-l rulează
 * restul request-ului într-un AsyncLocalStorage context, ca să fie
 * vizibil din TypeORM subscribers, services etc. Atașează și pe `req`
 * pentru access direct.
 */
@Injectable()
export class OpenReplayMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const sessionId = extractOpenReplaySessionId(
      req.headers as Record<string, unknown>,
    );
    (req as Request & { openReplaySessionId?: string | null }).openReplaySessionId =
      sessionId;
    openReplayStorage.run({ sessionId }, () => next());
  }
}
