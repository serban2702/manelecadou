// Shim de back-compat. Codul nou ar trebui să importe direct:
//   import { MailApi, KbApi, ... } from '@/lib/api';
//   import { ApiError, getAdminToken, setAdminToken } from '@/lib/http/client';
//
// Lăsăm acest fișier ca punct de intrare unic pentru toate clasele *.api.ts
// + re-export pentru utilitarele de auth și pentru tipurile partajate.

export { ApiError, getAdminToken, setAdminToken } from './http/client';
export * from './types';
export * from './api/auth.api';
export * from './api/admin.api';
export * from './api/chat.api';
export * from './api/mail.api';
export * from './api/kb.api';
export * from './api/settings.api';
export * from './api/analytics.api';
export * from './api/suno.api';
export * from './api/database.api';
export * from './api/sites.api';
export * from './api/web-push.api';
export * from './api/ai-chat.api';
export * from './api/marketing.api';
