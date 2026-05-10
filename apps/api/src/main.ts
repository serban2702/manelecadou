import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import { SitesService } from './modules/sites/sites.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  // Servește mostrele audio (și orice alt asset uploadat) sub /uploads/.
  // Pe API URL-ul absolut → ex. https://api.manelecadou.ro/uploads/site-samples/<slug>/style-modern.mp3
  const uploadsDir = process.env.UPLOADS_DIR ?? join(process.cwd(), 'uploads');
  app.useStaticAssets(uploadsDir, {
    prefix: '/uploads/',
    setHeaders: (res) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Cache-Control', 'public, max-age=86400');
    },
  });

  // Origini statice din env (APP_URL/ADMIN_URL) — backward compatible.
  const staticOrigins = new Set(
    [
      process.env.APP_URL ?? 'http://localhost:1500',
      process.env.ADMIN_URL ?? 'http://localhost:1505',
    ]
      .flatMap((s) => s.split(','))
      .map((s) => s.trim())
      .filter(Boolean),
  );

  // Origini dinamice din DB — fiecare site activ are domain-ul lui.
  // Pentru fiecare domain admis: http://<domain>:1500 (dev), http://<domain>, https://<domain>.
  const sitesService = app.get(SitesService);
  app.enableCors({
    origin: async (origin, callback) => {
      // Same-origin / curl / server-to-server (fără header Origin) → allow.
      if (!origin) return callback(null, true);
      try {
        // Allowlist static (env)
        if (staticOrigins.has(origin)) return callback(null, true);

        // localhost + 127.0.0.1 pe orice port → dev only
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
          return callback(null, true);
        }

        // Origin parsing
        const url = new URL(origin);
        const host = url.hostname;

        // *.local pe orice port (testare multi-tenant locală fără TLS)
        if (host.endsWith('.local')) return callback(null, true);

        // Domeniile site-urilor active din DB (prod)
        const domains = await sitesService.listActiveDomains();
        if (domains.includes(host)) return callback(null, true);

        return callback(new Error(`CORS blocked: ${origin}`), false);
      } catch (err) {
        return callback(err as Error, false);
      }
    },
    credentials: true,
    exposedHeaders: ['x-guest-id'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.setGlobalPrefix('api', { exclude: ['health', 'api/health'] });

  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`[manelecadou-api] listening on :${port}`);
}

bootstrap();
