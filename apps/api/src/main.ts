import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'fs';
import { AppModule } from './app.module';
import { SitesService } from './modules/sites/sites.service';
import { StorageService } from './storage/storage.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  // API-ul stă în spatele unui reverse proxy → respectă X-Forwarded-For ca
  // `req.ip` să fie IP-ul real al vizitatorului. Fără asta, ThrottlerGuard pune
  // toți utilizatorii în același bucket (IP-ul containerului de proxy din
  // rețeaua Docker) → 429-uri generalizate. Și IP-ul din OpenReplay/analytics
  // devine al proxy-ului (CLAUDE.md §15.7 pct. 12bis).
  //
  // Numărul de hop-uri diferă în funcție de stack:
  //   1 = Caddy direct (stack-ul vechi de pe Ionos)
  //   2 = Traefik (Coolify) → router intern (stack-ul nou)
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? '1');
  app.set('trust proxy', Number.isFinite(trustProxyHops) && trustProxyHops > 0 ? trustProxyHops : 1);

  // /uploads/* — disc local, sau redirect/stream din Cloudflare R2.
  const storage = app.get(StorageService);
  const uploadsDir = storage.localRoot;
  app.use('/uploads', async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const rel = decodeURIComponent(String(req.path ?? '').replace(/^\/+/, ''));
    if (!rel || rel.includes('..')) return next();
    if (!storage.usesR2) return next();

    // Discul local câștigă când fișierul e acolo: `express.static` știe
    // Range/ETag (seek în <audio>, iOS Safari), iar în timpul migrării e plasa
    // de siguranță pentru orice n-a apucat încă să ajungă în bucket.
    if (existsSync(storage.localAbs(rel))) return next();

    const target = storage.publicUrl(rel);
    if (target.startsWith('http')) {
      // Cache scurt pe redirect: dacă un fișier ajunge în bucket mai târziu,
      // nu vrem ca browserele să fi memorat un 404 o zi întreagă.
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      return res.redirect(302, target);
    }

    // Fără domeniu public pe bucket: proxy prin API, cu suport de Range ca
    // seek-ul din player să funcționeze.
    const obj = await storage.getObjectStream(rel, req.headers.range);
    if (!obj) return res.status(404).end();
    res.setHeader('Content-Type', obj.mime);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (obj.contentLength != null) res.setHeader('Content-Length', String(obj.contentLength));
    if (obj.contentRange) {
      res.setHeader('Content-Range', obj.contentRange);
      res.status(206);
    }
    if (req.method === 'HEAD') return res.end();
    obj.stream.pipe(res);
    return;
  });
  app.useStaticAssets(uploadsDir, {
    prefix: '/uploads/',
    setHeaders: (res) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
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
