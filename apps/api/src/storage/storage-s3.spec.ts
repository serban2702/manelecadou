/**
 * Test de INTEGRARE pentru driverul R2, rulat pe un S3 real.
 *
 * De ce există: R2 nu are credențiale în repo, deci calea de cod S3 (Range,
 * listare, ștergere) ar fi rămas complet neverificată până la primul deploy —
 * exact codul de care depinde redarea audio și seek-ul pe iOS Safari. R2 e
 * S3-compatibil, deci un MinIO local acoperă contractul.
 *
 * Se SARE automat dacă nu găsește un S3 la `S3_TEST_ENDPOINT`, ca rularea
 * normală a testelor să nu depindă de Docker.
 *
 *   docker run -d --name s3test -p 19000:9000 \
 *     -e MINIO_ROOT_USER=testkey -e MINIO_ROOT_PASSWORD=testsecret123 \
 *     quay.io/minio/minio:RELEASE.2024-12-18T13-15-44Z server /data
 *   docker run --rm --network host --entrypoint sh minio/mc -c \
 *     "mc alias set t http://127.0.0.1:19000 testkey testsecret123 && mc mb t/manele-test"
 *   S3_TEST_ENDPOINT=http://127.0.0.1:19000 npx node --require ts-node/register \
 *     --test src/storage/storage-s3.spec.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StorageService } from './storage.service';

const ENDPOINT = process.env.S3_TEST_ENDPOINT ?? '';
const BUCKET = process.env.S3_TEST_BUCKET ?? 'manele-test';

async function s3Reachable(): Promise<boolean> {
  if (!ENDPOINT) return false;
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 1500);
    await fetch(`${ENDPOINT}/minio/health/live`, { signal: c.signal });
    clearTimeout(t);
    return true;
  } catch {
    return false;
  }
}

function svc(): StorageService {
  const env: Record<string, string> = {
    UPLOADS_DIR: join(tmpdir(), 'manele-s3-spec'),
    STORAGE_DRIVER: 'r2',
    STORAGE_CONFIG_SOURCE: 'env',
    NODE_ENV: 'test',
    R2_ACCESS_KEY_ID: process.env.S3_TEST_KEY ?? 'testkey',
    R2_SECRET_ACCESS_KEY: process.env.S3_TEST_SECRET ?? 'testsecret123',
    R2_BUCKET: BUCKET,
    R2_ENDPOINT: ENDPOINT,
    R2_PUBLIC_URL: '',
    R2_ACCOUNT_ID: '',
  };
  const config = { get: (k: string) => env[k] } as never;
  // Fără SettingsService: verificăm exact calea „citește din env".
  const moduleRef = { get: () => { throw new Error('no settings'); } } as never;
  return new StorageService(config, moduleRef);
}

test('driverul R2, pe un S3 real: scrie, citește, listează, Range, șterge', async (t) => {
  if (!(await s3Reachable())) {
    t.skip('fără S3_TEST_ENDPOINT accesibil — vezi comentariul din capul fișierului');
    return;
  }
  const s = svc();
  await s.onModuleInit();
  assert.equal(s.usesR2, true, 'trebuie să pornească pe driverul r2');

  const key = `audio/spec-${process.pid}/full.mp3`;
  const body = Buffer.from('0123456789abcdefghij');

  const publicPath = await s.saveBuffer(key, body, 'audio/mpeg');
  assert.equal(publicPath, `/uploads/${key}`, 'în DB trebuie să ajungă path relativ, nu URL de CDN');

  assert.equal(await s.exists(key), true);
  assert.deepEqual(await s.readBuffer(key), body);

  const listed = await s.list(`audio/spec-${process.pid}`);
  assert.ok(listed.some((k) => k.endsWith('full.mp3')), `list a întors: ${listed.join(',')}`);

  // Range — de el depind seek-ul din player și redarea pe iOS Safari.
  const ranged = await s.getObjectStream(key, 'bytes=5-9');
  assert.ok(ranged, 'getObjectStream cu Range a întors null');
  const chunks: Buffer[] = [];
  for await (const c of ranged!.stream) chunks.push(Buffer.from(c as Buffer));
  assert.equal(Buffer.concat(chunks).toString(), '56789');
  assert.ok(ranged!.contentRange?.includes('5-9'), `contentRange=${ranged!.contentRange}`);

  await s.delete(key);
  assert.equal(await s.exists(key), false, 'delete nu a scos obiectul din bucket');
});
