import pino from 'pino';
import { join } from 'path';

const LOGS_DIR = process.env.LOGS_DIR ?? join(process.cwd(), 'logs');

// pino-roll: rotație zilnică, păstrăm 14 fișiere. Scrierile sunt non-blocking
// (sonic-boom în spate). Format JSON lines — ușor de citit cu `jq`/`grep`.
export const accessLogger = pino(
  {
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
    level: process.env.LOG_LEVEL ?? 'info',
  },
  pino.transport({
    target: 'pino-roll',
    options: {
      file: join(LOGS_DIR, 'access.log'),
      frequency: 'daily',
      mkdir: true,
      dateFormat: 'yyyy-MM-dd',
      limit: { count: 14 },
    },
  }),
);
