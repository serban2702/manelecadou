import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { LOCALES, normalizeLocale } from '@/i18n/locales';

/**
 * Pagina de livrare `/m/<id>` pentru o comandă cu `locale: 'bg'`.
 *
 * Testul se uită la MESAJELE care ajung în pagină, nu la randarea React: pe
 * calea asta, o pagină „bulgară" care iese în română nu vine dintr-un component
 * greșit, ci dintr-o cheie lipsă în `bg.json` — pe care `i18n/request.ts` o
 * completează tăcut din română (§11.5 CLAUDE.md). Adică exact modul de eșec pe
 * care un test de randare nu l-ar prinde.
 */

const MESSAGES = (locale: string): Record<string, Record<string, string>> =>
  JSON.parse(
    readFileSync(path.join(import.meta.dirname, '..', '..', 'messages', `${locale}.json`), 'utf-8'),
  );

/** Cheile folosite de `app/m/[id]/view.tsx` pentru fiecare grup de etichete. */
const DELIVERY_LABELS = {
  navigare: ['backToMine'],
  descărcare: ['download', 'formatLabel'],
  partajare: ['shareTitle', 'shareSub', 'shareCopyCta', 'shareNativeCta', 'shareCopied'],
  contact: ['contactTitle', 'contactSub'],
} as const;

const CYRILLIC = /[Ѐ-ӿ]/;

test('o comandă bg servește pagina de livrare cu etichete bulgare', () => {
  const bg = MESSAGES('bg').mViewPage;
  assert.ok(bg, 'messages/bg.json nu are secțiunea mViewPage');

  for (const [grup, keys] of Object.entries(DELIVERY_LABELS)) {
    for (const key of keys) {
      const value = bg[key];
      assert.ok(value, `${grup}: lipsește mViewPage.${key} din bg.json`);
      assert.match(
        value,
        CYRILLIC,
        `${grup}: mViewPage.${key} nu e în chirilică („${value}") — cade pe română`,
      );
    }
  }
});

test('etichetele bulgare chiar diferă de cele românești', () => {
  // O cheie copiată din `ro.json` ar trece testul de existență, dar ar livra
  // românește. Verificarea de chirilică o prinde; asta o dublează explicit.
  const bg = MESSAGES('bg').mViewPage;
  const ro = MESSAGES('ro').mViewPage;
  for (const keys of Object.values(DELIVERY_LABELS)) {
    for (const key of keys) {
      assert.notEqual(bg[key], ro[key], `mViewPage.${key} e identic cu româna`);
    }
  }
});

test('comportamentul românesc rămâne neschimbat', () => {
  const ro = MESSAGES('ro').mViewPage;
  for (const keys of Object.values(DELIVERY_LABELS)) {
    for (const key of keys) {
      assert.ok(ro[key], `mViewPage.${key} lipsește din ro.json`);
      assert.doesNotMatch(ro[key], CYRILLIC);
    }
  }
});

test('celelalte limbi livrate au aceleași etichete de livrare', () => {
  // Un site nou pe una din limbile livrate nu trebuie să descopere la prima
  // comandă că pagina de livrare îi e pe jumătate românească.
  for (const locale of LOCALES) {
    const m = MESSAGES(locale).mViewPage;
    assert.ok(m, `messages/${locale}.json nu are mViewPage`);
    for (const keys of Object.values(DELIVERY_LABELS)) {
      for (const key of keys) {
        assert.ok(m[key], `mViewPage.${key} lipsește din ${locale}.json`);
      }
    }
  }
});

test('limbile site-urilor de producție sunt coduri valide', () => {
  // Maparea domeniu → limbă, așa cum e configurată în admin.
  for (const [domain, locale] of Object.entries({
    'chalgapodarok.bg': 'bg',
    'doroparaggelia.gr': 'el',
    'manelecadou.ro': 'ro',
    'manele-top.ro': 'ro',
  })) {
    assert.equal(normalizeLocale(locale), locale, `${domain} → ${locale}`);
  }
});
