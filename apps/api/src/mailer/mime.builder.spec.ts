import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';

import { resolveFromHeader, splitAddresses } from './mime.builder';
import type { ResolvedMailContext, SendMailOptions } from './mail.types';

/**
 * `From` e singurul lucru pe care clientul îl vede înainte să deschidă mailul.
 * Testele de aici păzesc regresia care a trăit luni de zile nebăgată în seamă:
 * call-site-urile pasează `site.fromEmail` (adresă simplă), iar varianta veche
 * o returna ca atare — deci brandul dispărea din inbox exact pe mailurile
 * tranzacționale, cele mai des citite.
 */

const base: SendMailOptions = { to: 'client@example.com', subject: 's', html: '<p>x</p>' };

function ctx(extra: Partial<ResolvedMailContext> = {}): ResolvedMailContext {
  return { source: 'site', fromEmail: 'contact@manelecadou.ro', fromName: 'Manele Cadou', ...extra };
}

describe('resolveFromHeader', () => {
  test('adaugă numele când apelantul dă doar adresa', () => {
    assert.equal(
      resolveFromHeader({ ...base, from: 'contact@manelecadou.ro' }, ctx()),
      '"Manele Cadou" <contact@manelecadou.ro>',
    );
  });

  test('fără `from` explicit, folosește identitatea site-ului', () => {
    assert.equal(resolveFromHeader(base, ctx()), '"Manele Cadou" <contact@manelecadou.ro>');
  });

  test('un nume deja pus de apelant e respectat, nu dublat', () => {
    assert.equal(
      resolveFromHeader({ ...base, from: '"Чалга Подарък" <contact@chalgapodarok.bg>' }, ctx()),
      '"Чалга Подарък" <contact@chalgapodarok.bg>',
    );
  });

  test('fără nume în context, rămâne adresa simplă', () => {
    assert.equal(
      resolveFromHeader({ ...base, from: 'contact@manele-top.ro' }, ctx({ fromName: undefined })),
      'contact@manele-top.ro',
    );
  });

  test('ghilimelele din nume sunt escapate, ca headerul să rămână valid', () => {
    assert.equal(
      resolveFromHeader(base, ctx({ fromName: 'Manele "Cadou"' })),
      '"Manele \\"Cadou\\"" <contact@manelecadou.ro>',
    );
  });

  test('scripturile non-latine trec neatinse', () => {
    assert.equal(
      resolveFromHeader(base, ctx({ fromName: 'Δώρο Παραγγελία', fromEmail: 'contact@doroparaggelia.gr' })),
      '"Δώρο Παραγγελία" <contact@doroparaggelia.gr>',
    );
  });
});

describe('splitAddresses', () => {
  test('nu rupe un nume care conține virgulă', () => {
    assert.deepEqual(splitAddresses('"Popescu, Ion" <ion@ex.ro>, ana@ex.ro'), ['ion@ex.ro', 'ana@ex.ro']);
  });
});
