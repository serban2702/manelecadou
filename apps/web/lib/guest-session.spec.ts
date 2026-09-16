import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Regresie pentru „apasă pe trimite și nu se trimite nimic" (prod, 16 sept 2026,
 * chalgapodarok.bg).
 *
 * Lanțul, din `error_logs`: `POST /api/guest-sessions` → 429, pageload-ul rămâne
 * fără `X-Guest-Id`, `GET /api/chat/me` → 403 la fiecare poll, iar cele cinci
 * apăsări pe „trimite" din șapte secunde au produs cinci `POST
 * /api/chat/me/messages` → 403. Nimic nu repara starea: `refresh()` din
 * SessionProvider rulează o singură dată, la montare.
 *
 * Testul ține cele trei apărări puse atunci: o singură cerere de sesiune
 * oricâți apelanți concurenți, retry pe 429, și refacerea automată a sesiunii
 * când API-ul răspunde „Need guest or user".
 */

interface Call { url: string; method: string }

let calls: Call[] = [];
let store: Record<string, string> = {};
let cookie = '';

function installBrowser() {
  store = {};
  cookie = '';
  const localStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
  const doc = {
    get cookie() { return cookie; },
    set cookie(v: string) { cookie = v; },
    documentElement: { lang: 'bg' },
  };
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = { localStorage, sessionStorage: localStorage, __OR_SESSION_ID__: undefined };
  g.document = doc;
  // Node 22 expune deja `navigator`, cu getter — nu se poate atribui.
  Object.defineProperty(globalThis, 'navigator', {
    value: { language: 'bg-BG', userAgent: 'test' },
    configurable: true,
    writable: true,
  });
}

/** Răspuns `fetch` minimal, cât folosește `request()`. */
function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

function installFetch(handler: (url: string, init: { method?: string }) => unknown) {
  (globalThis as unknown as Record<string, unknown>).fetch = async (
    url: string,
    init: { method?: string } = {},
  ) => {
    calls.push({ url, method: init.method ?? 'GET' });
    return handler(url, init);
  };
}

beforeEach(() => {
  calls = [];
  installBrowser();
});

/** Modul proaspăt de fiecare dată — `ensureGuestSession` ține stare de modul. */
async function freshApi() {
  return import(`./api?t=${Math.random()}`) as Promise<typeof import('./api')>;
}

test('apelanții concurenți produc O SINGURĂ creare de sesiune', async () => {
  installFetch((url) =>
    url.includes('/guest-sessions') ? reply(201, { id: 'g-1' }) : reply(200, {}),
  );
  const api = await freshApi();

  // Exact situația reală: SessionProvider, wizardul cadou și promoul de follow
  // pornesc în aceeași bifă de event loop, toate văd guest-ul lipsă.
  const ids = await Promise.all([
    api.ensureGuestSession(),
    api.ensureGuestSession(),
    api.ensureGuestSession(),
  ]);

  assert.deepEqual(ids, ['g-1', 'g-1', 'g-1']);
  const creates = calls.filter((c) => c.method === 'POST' && c.url.endsWith('/guest-sessions'));
  assert.equal(creates.length, 1, 'trei apelanți, o singură cerere de creare');
});

test('429 la creare nu lasă pageload-ul fără sesiune — se reîncearcă', async () => {
  let attempt = 0;
  installFetch((url, init) => {
    if (init.method === 'POST' && url.endsWith('/guest-sessions')) {
      attempt++;
      return attempt === 1
        ? reply(429, { statusCode: 429, message: 'ThrottlerException: Too Many Requests' })
        : reply(201, { id: 'g-2' });
    }
    return reply(200, {});
  });
  const api = await freshApi();

  assert.equal(await api.ensureGuestSession(), 'g-2');
  assert.equal(attempt, 2);
});

test('„Need guest or user" reface sesiunea și reia cererea', async () => {
  let hadGuest = false;
  installFetch((url, init) => {
    if (init.method === 'POST' && url.endsWith('/guest-sessions')) {
      hadGuest = true;
      return reply(201, { id: 'g-3' });
    }
    if (url.includes('/chat/me/messages')) {
      // Fix pe care API-ul îl vede: fără sesiune, 403; cu ea, mesajul trece.
      return hadGuest
        ? reply(201, { id: 'm-1', body: 'здравей' })
        : reply(403, { statusCode: 403, message: 'Need guest or user', error: 'ForbiddenException' });
    }
    return reply(200, {});
  });
  const api = await freshApi();

  const msg = await api.api.chatSend('здравей');

  assert.equal((msg as { id: string }).id, 'm-1');
  const sends = calls.filter((c) => c.url.includes('/chat/me/messages'));
  assert.equal(sends.length, 2, 'primul 403, al doilea după refacerea sesiunii');
});

test('un 403 care NU e despre sesiune se propagă neatins', async () => {
  installFetch((url) =>
    url.includes('/chat/me/messages')
      ? reply(403, { statusCode: 403, message: 'blocked', error: 'ForbiddenException' })
      : reply(200, {}),
  );
  const api = await freshApi();

  await assert.rejects(() => api.api.chatSend('salut'), (e: unknown) => {
    assert.ok(e instanceof api.ApiError);
    assert.equal(e.status, 403);
    return true;
  });
  // Nicio sesiune nu s-a creat degeaba: un client pe lista neagră rămâne blocat.
  assert.equal(calls.filter((c) => c.url.endsWith('/guest-sessions')).length, 0);
});
