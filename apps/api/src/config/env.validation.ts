import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PORT: z.coerce.number().default(3000),
  APP_URL: z.string().url().default('http://localhost:1500'),
  ADMIN_URL: z.string().url().default('http://localhost:1505'),
  API_URL: z.string().url().default('http://localhost:1501'),

  POSTGRES_HOST: z.string().default('postgres'),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_USER: z.string().default('manelecadou'),
  POSTGRES_PASSWORD: z.string().default('manelecadou'),
  POSTGRES_DB: z.string().default('manelecadou'),

  REDIS_HOST: z.string().default('redis'),
  REDIS_PORT: z.coerce.number().default(6379),

  JWT_SECRET: z.string().min(8).default('change_me_in_production'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  MAGIC_LINK_TTL_MIN: z.coerce.number().default(15),

  MAIL_PROVIDER: z.enum(['smtp', 'mailgun']).default('smtp'),
  MAIL_FROM: z.string().default('no-reply@manelecadou.ro'),
  MAIL_FROM_NAME: z.string().optional().default(''),

  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_SECURE: z.string().optional().default(''),

  MAILGUN_API_KEY: z.string().optional().default(''),
  MAILGUN_DOMAIN: z.string().optional().default(''),
  MAILGUN_REGION: z.enum(['us', 'eu']).optional().default('us'),
  MAILGUN_API_URL: z.string().optional().default(''),
  MAILGUN_FROM_EMAIL: z.string().optional().default(''),
  MAILGUN_WEBHOOK_SIGNING_KEY: z.string().optional().default(''),

  SUNO_PROVIDER: z.enum(['mock', 'real']).default('mock'),
  SUNO_API_BASE_URL: z.string().optional().default('https://api.sunoapi.org'),
  SUNO_API_KEY: z.string().optional().default(''),
  SUNO_MODEL: z.string().optional().default('V4_5'),

  STRIPE_SECRET_KEY: z.string().optional().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(''),

  ADMIN_EMAILS: z.string().optional().default(''),

  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_MODEL: z.string().optional().default('gpt-4o-mini'),
  OPENAI_AUTOREPLY_MODEL: z.string().optional().default(''),

  // Mail Hub
  MAIL_CRED_KEY: z.string().optional().default(''),
  MAIL_ATTACH_DIR: z.string().optional().default('/tmp/manelecadou-mail-attach'),
  MAIL_POLL_INTERVAL_MS: z.coerce.number().optional().default(60_000),

  // Analytics — opționale; dacă lipsesc, forwarder-ele intră în "skipped"
  GA4_MEASUREMENT_ID: z.string().optional().default(''),
  GA4_API_SECRET: z.string().optional().default(''),
  META_PIXEL_ID: z.string().optional().default(''),
  META_CAPI_TOKEN: z.string().optional().default(''),
});

export type AppConfig = z.infer<typeof schema>;

export function configValidate(raw: Record<string, unknown>): AppConfig {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('Invalid environment:', parsed.error.format());
    throw new Error('Invalid environment configuration');
  }
  return parsed.data;
}
