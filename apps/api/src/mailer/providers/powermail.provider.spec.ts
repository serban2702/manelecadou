import { strict as assert } from 'node:assert';
import { test, describe, afterEach } from 'node:test';

import { PowerMailProvider } from './powermail.provider';
import type { BuiltMime, ResolvedMailContext, SendMailOptions } from '../mail.types';

/**
 * Teste pe calea de trimitere PowerMail. Nu ating rețeaua: înlocuim `fetch`
 * global și verificăm ce corp pleacă și cum se interpretează răspunsul.
 *
 * Zonele acoperite sunt exact cele unde o greșeală e tăcută și scumpă:
 * destinatarii blocați tratați ca eroare (am opri mailuri bune), suprimarea
 * totală tratată ca succes (operatorul ar crede că a răspuns), retry pe o
 * eroare permanentă (întârzie diagnosticul), și lipsa categoriei de dezabonare
 * pe mailurile de marketing (o dezabonare ar bloca și magic link-ul).
 */

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mime(): BuiltMime {
  return {
    raw: Buffer.from('raw'),
    messageId: 'abc-123@manelecadou.ro',
    envelopeFrom: 'contact@manelecadou.ro',
    recipients: ['client@example.com'],
  };
}

function ctx(extra: Partial<ResolvedMailContext> = {}): ResolvedMailContext {
  return {
    source: 'global',
    siteSlug: 'default',
    fromEmail: 'contact@manelecadou.ro',
    fromName: 'Manele Cadou',
    powermail: { apiKey: 'pm_live_test', unsubscribeGroup: 'marketing', transactionalGroup: 'tranzactionale' },
    ...extra,
  };
}

const opts: SendMailOptions = {
  to: 'client@example.com',
  subject: 'Maneaua ta e gata',
  html: '<p>gata</p>',
  text: 'gata',
};

/** Înlocuiește fetch cu un stub care înregistrează corpurile trimise. */
function stubFetch(responses: Array<{ status: number; body: unknown; headers?: Record<string, string> }>) {
  const calls: Array<Record<string, unknown>> = [];
  let i = 0;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    calls.push(JSON.parse(String(init.body)));
    const r = responses[Math.min(i++, responses.length - 1)];
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: new Headers(r.headers ?? {}),
      json: async () => r.body,
      text: async () => JSON.stringify(r.body),
    } as unknown as Response;
  }) as typeof fetch;
  return calls;
}

describe('PowerMailProvider', () => {
  test('fără cheie nu trimite, dar nici nu aruncă', async () => {
    const res = await new PowerMailProvider().send(opts, ctx({ powermail: {} }), mime());
    assert.equal(res.sent, false);
    assert.equal(res.provider, 'powermail');
    assert.match(res.notes ?? '', /not configured/);
  });

  test('trimite from, destinatari, etichete și cheie de idempotență', async () => {
    const calls = stubFetch([{ status: 202, body: { id: 'uuid-1', status: 'queued', blocked: [] } }]);
    const res = await new PowerMailProvider().send(opts, ctx({ kind: 'generation_ready' }), mime());

    assert.equal(calls.length, 1);
    assert.equal(calls[0].from, '"Manele Cadou" <contact@manelecadou.ro>');
    assert.deepEqual(calls[0].to, ['client@example.com']);
    assert.deepEqual(calls[0].tags, { kind: 'generation_ready', site: 'default' });
    // Stabilă pe durata unui send, unică între send-uri: un retry nu dublează
    // mailul, dar „Retrimite mailul" chiar retrimite.
    assert.equal(calls[0].idempotencyKey, 'abc-123@manelecadou.ro');
    assert.equal(res.sent, true);
    assert.equal(res.providerRef, 'uuid-1');
    // Message-ID-ul RFC rămâne al nostru — cu el se leagă copia din `Sent`.
    assert.equal(res.messageId, 'abc-123@manelecadou.ro');
  });

  test('bulk primește categoria de marketing, restul pe cea tranzacțională', async () => {
    for (const kind of ['recovery', 'marketing_campaign', 'marketing_rule']) {
      const calls = stubFetch([{ status: 202, body: { id: 'x', status: 'queued' } }]);
      await new PowerMailProvider().send(opts, ctx({ kind }), mime());
      assert.equal(calls[0].unsubscribeGroup, 'marketing', kind);
    }
    // Un „Unsubscribe" în Gmail nu are voie să taie livrarea unei melodii
    // plătite — de-aia astea merg pe categoria din care nu te poți dezabona.
    for (const kind of ['magic_link', 'generation_ready', 'payment_success', 'inbox_reply']) {
      const calls = stubFetch([{ status: 202, body: { id: 'x', status: 'queued' } }]);
      await new PowerMailProvider().send(opts, ctx({ kind }), mime());
      assert.equal(calls[0].unsubscribeGroup, 'tranzactionale', kind);
    }
  });

  test('un kind necunoscut e tratat ca tranzacțional, nu lăsat fără categorie', async () => {
    const calls = stubFetch([{ status: 202, body: { id: 'x', status: 'queued' } }]);
    await new PowerMailProvider().send(opts, ctx({ kind: undefined }), mime());
    assert.equal(calls[0].unsubscribeGroup, 'tranzactionale');
  });

  test('numele site-ului ajunge în From chiar dacă apelantul dă doar adresa', async () => {
    const calls = stubFetch([{ status: 202, body: { id: 'x', status: 'queued' } }]);
    await new PowerMailProvider().send(
      { ...opts, from: 'contact@manelecadou.ro' },
      ctx({ fromName: 'Manele Cadou' }),
      mime(),
    );
    assert.equal(calls[0].from, '"Manele Cadou" <contact@manelecadou.ro>');
  });

  test('destinatarii blocați nu sunt eroare — restul mesajului a plecat', async () => {
    stubFetch([
      {
        status: 202,
        body: {
          id: 'uuid-2',
          status: 'queued',
          blocked: [{ email: 'vechi@example.com', reason: 'hard_bounce' }],
        },
      },
    ]);
    const res = await new PowerMailProvider().send(opts, ctx(), mime());
    assert.equal(res.sent, true);
    assert.equal(res.suppressed, undefined);
    assert.equal(res.blocked?.length, 1);
    assert.match(res.notes ?? '', /hard_bounce/);
  });

  test('suprimare totală: acceptat de API, dar marcat ca nelivrat', async () => {
    stubFetch([
      {
        status: 202,
        body: {
          id: 'uuid-3',
          status: 'suppressed',
          blocked: [{ email: 'client@example.com', reason: 'complaint' }],
        },
      },
    ]);
    const res = await new PowerMailProvider().send(opts, ctx(), mime());
    assert.equal(res.sent, true);
    assert.equal(res.suppressed, true);
  });

  test('reîncearcă pe 500 și reușește', async () => {
    const calls = stubFetch([
      { status: 500, body: { error: 'internal_error', message: 'boom' } },
      { status: 202, body: { id: 'uuid-4', status: 'queued' } },
    ]);
    const res = await new PowerMailProvider().send(opts, ctx(), mime());
    assert.equal(calls.length, 2);
    assert.equal(res.sent, true);
    // Aceeași cheie la reîncercare = un singur mail la client.
    assert.equal(calls[0].idempotencyKey, calls[1].idempotencyKey);
  });

  test('403 e permanent: aruncă din prima, fără reîncercări', async () => {
    const calls = stubFetch([
      {
        status: 403,
        body: {
          statusCode: 403,
          error: 'forbidden',
          message: 'Adresa nu este autorizată în acest proiect.',
          requestId: 'req_1',
        },
      },
    ]);
    await assert.rejects(
      () => new PowerMailProvider().send(opts, ctx(), mime()),
      (e: Error) => {
        assert.match(e.message, /403/);
        assert.match(e.message, /req_1/);
        return true;
      },
    );
    assert.equal(calls.length, 1);
  });

  test('threading: In-Reply-To și References ajung în headers, Message-ID nu', async () => {
    const calls = stubFetch([{ status: 202, body: { id: 'x', status: 'queued' } }]);
    await new PowerMailProvider().send(
      { ...opts, inReplyTo: 'parinte@ex.ro', references: ['bunic@ex.ro', 'parinte@ex.ro'] },
      ctx(),
      mime(),
    );
    const headers = calls[0].headers as Record<string, string>;
    assert.equal(headers['In-Reply-To'], '<parinte@ex.ro>');
    assert.equal(headers['References'], '<bunic@ex.ro> <parinte@ex.ro>');
    // SES generează propriul Message-ID; un antet duplicat ar strica firul.
    assert.equal(headers['Message-ID'], undefined);
  });
});
