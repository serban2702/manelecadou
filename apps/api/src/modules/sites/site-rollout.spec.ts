import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SiteRolloutService, type RolloutCheckResult } from './site-rollout.service';
import {
  CATALOG_SEEDS,
  OCCASION_PROMPT_SEED,
  OCCASION_PROMPT_SEED_BG,
  OCCASION_PROMPT_SEED_EL,
  STYLE_PROMPT_SEED,
  STYLE_PROMPT_SEED_BG,
  STYLE_PROMPT_SEED_EL,
  seedForLocale,
  seedRow,
  type CatalogPromptSeedMap,
} from './catalog-seed';
import type { Site, SiteOccasionEntry, SiteStyleEntry } from './site.entity';
import type { SitesService } from './sites.service';
import type { SettingsService } from '../settings/settings.service';

/**
 * Cele două capcane pe care le acoperă fișierul:
 *
 * R1 — fiecare seed e scris într-o limbă. Seed-ul RO aplicat pe
 *      chalgapodarok.bg (care are exact id-urile de ocazii românești, cu
 *      prompturi goale) ar fi trimis „mire și mireasă” direct în style
 *      string-ul de la Suno. Acum bg și el au seed-urile lor: fiecare site
 *      primește limba lui, iar o limbă fără seed (ex. „sr”) nu primește nimic.
 * R2 — check-urile numărau doar item-ele pe care le știa seed-ul, deci un site
 *      grec cu stiluri proprii apărea „ok” cu 0 din 12 prompturi scrise.
 */

// --- fixtures ---------------------------------------------------------------

function styleEntries(ids: string[], patch: Partial<SiteStyleEntry> = {}): SiteStyleEntry[] {
  return ids.map((id) => ({ id, em: '🎵', nm: id, ds: '', ...patch }));
}

function occasionEntries(ids: string[], patch: Partial<SiteOccasionEntry> = {}): SiteOccasionEntry[] {
  return ids.map((id) => ({ id, em: '🎉', nm: id, ...patch }));
}

function makeSite(p: Partial<Site>): Site {
  return {
    id: 'site-1',
    name: 'Test',
    domain: 'test.local',
    slug: 'test',
    locale: 'ro',
    currency: 'RON',
    musicEngine: 'suno',
    active: true,
    styles: [],
    occasions: [],
    ...p,
  } as Site;
}

/** SitesService in-memory: reține patch-urile ca să verificăm ce s-a scris. */
class FakeSites {
  readonly updates: Array<{ id: string; patch: Partial<Site> }> = [];

  constructor(private readonly rows: Site[]) {}

  async findById(id: string): Promise<Site | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }

  async listAll(): Promise<Site[]> {
    return this.rows;
  }

  async update(id: string, patch: Partial<Site>): Promise<Site> {
    this.updates.push({ id, patch });
    const i = this.rows.findIndex((r) => r.id === id);
    this.rows[i] = { ...this.rows[i], ...patch } as Site;
    return this.rows[i];
  }
}

function service(rows: Site[]) {
  const sites = new FakeSites(rows);
  const settings = { get: async () => 'gemini-key' } as unknown as SettingsService;
  return { svc: new SiteRolloutService(sites as unknown as SitesService, settings), sites };
}

function check(checks: RolloutCheckResult[], id: string): RolloutCheckResult {
  const found = checks.find((c) => c.id === id);
  assert.ok(found, `check ${id} lipsește din rezultat`);
  return found;
}

// --- R1: garda de limbă -----------------------------------------------------

describe('rollout — seed-ul se aplică doar pe limba lui (R1)', () => {
  it('site RO: apply umple prompturile goale din seed', async () => {
    const { svc, sites } = service([
      makeSite({
        locale: 'ro',
        styles: styleEntries(['clasic', 'modern']),
        occasions: occasionEntries(['nunta', 'zi']),
      }),
    ]);

    const res = await svc.apply('site-1');
    assert.ok(res.applied.includes('suno-occasion-prompts'));
    assert.ok(res.applied.includes('google-style-prompts'));

    const after = (await sites.findById('site-1'))!;
    assert.equal(after.occasions[0].sunoPrompt, OCCASION_PROMPT_SEED.nunta.sunoPrompt);
    assert.equal(after.occasions[1].googlePrompt, OCCASION_PROMPT_SEED.zi.googlePrompt);
    assert.equal(after.styles[0].sunoPrompt, STYLE_PROMPT_SEED.clasic.sunoPrompt);
    assert.equal(after.styles[1].googlePrompt, STYLE_PROMPT_SEED.modern.googlePrompt);

    for (const id of ['suno-style-prompts', 'suno-occasion-prompts', 'google-style-prompts', 'google-occasion-prompts']) {
      assert.equal(check(res.site!.checks, id).status, 'ok', `${id} ar trebui ok după apply`);
    }
  });

  it('site BG cu id-uri de ocazii românești: apply scrie bulgărește, nu românește', async () => {
    const { svc, sites } = service([
      makeSite({
        id: 'bg',
        locale: 'bg',
        domain: 'chalgapodarok.bg',
        styles: styleEntries(['kyuchek', 'popfolk']),
        // Exact capcana: id-urile sunt moștenite din catalogul RO, dar site-ul e
        // bulgăresc. Cheia e doar cheie — conținutul trebuie să vină din seed-ul bg.
        occasions: occasionEntries(['nunta', 'botez', 'sef']),
      }),
    ]);

    const res = await svc.apply('bg');
    const after = (await sites.findById('bg'))!;

    assert.ok(res.applied.includes('suno-occasion-prompts'));
    assert.ok(res.applied.includes('google-style-prompts'));

    assert.equal(after.occasions[0].sunoPrompt, OCCASION_PROMPT_SEED_BG.nunta.sunoPrompt);
    assert.equal(after.occasions[1].googlePrompt, OCCASION_PROMPT_SEED_BG.botez.googlePrompt);
    assert.equal(after.styles[0].sunoPrompt, STYLE_PROMPT_SEED_BG.kyuchek.sunoPrompt);
    assert.equal(after.styles[1].googlePrompt, STYLE_PROMPT_SEED_BG.popfolk.googlePrompt);

    // Sub nicio formă seed-ul RO, deși id-urile de ocazii sunt aceleași.
    assert.notEqual(after.occasions[0].sunoPrompt, OCCASION_PROMPT_SEED.nunta.sunoPrompt);
    assert.notEqual(after.occasions[1].googlePrompt, OCCASION_PROMPT_SEED.botez.googlePrompt);

    // Plasa finală: zero română (și zero manele) scăpată pe site-ul bulgăresc.
    const dump = JSON.stringify(after);
    assert.ok(!dump.includes('mire și mireasă'));
    assert.ok(!dump.includes('la mulți ani'));
    assert.ok(!/romanian|manele/i.test(dump));

    for (const id of ['suno-style-prompts', 'suno-occasion-prompts', 'google-style-prompts', 'google-occasion-prompts']) {
      assert.equal(check(res.site!.checks, id).status, 'ok', `${id} ar trebui ok după apply pe bg`);
    }
  });

  it('site EL: apply umple din seed-ul grecesc', async () => {
    const { svc, sites } = service([
      makeSite({
        id: 'el',
        locale: 'el',
        domain: 'doroparaggelia.gr',
        musicEngine: 'google',
        styles: styleEntries(['zeimbekiko', 'skiladiko']),
        occasions: occasionEntries(['gamos', 'mnimosino']),
      }),
    ]);

    const res = await svc.apply('el');
    const after = (await sites.findById('el'))!;

    assert.equal(after.styles[0].googlePrompt, STYLE_PROMPT_SEED_EL.zeimbekiko.googlePrompt);
    assert.equal(after.styles[1].sunoPrompt, STYLE_PROMPT_SEED_EL.skiladiko.sunoPrompt);
    assert.equal(after.occasions[0].sunoPrompt, OCCASION_PROMPT_SEED_EL.gamos.sunoPrompt);
    assert.equal(after.occasions[1].googlePrompt, OCCASION_PROMPT_SEED_EL.mnimosino.googlePrompt);

    const dump = JSON.stringify(after);
    assert.ok(!/romanian|manele/i.test(dump), 'nimic românesc pe site-ul grecesc');

    // Consecința bună: motorul Google chiar e gata de comutat.
    assert.equal(check(res.site!.checks, 'music-engine').status, 'ok');
  });

  it('site pe limbă fără seed (sr): apply NU scrie nimic', async () => {
    const { svc, sites } = service([
      makeSite({
        id: 'sr',
        locale: 'sr',
        domain: 'poklonpesma.rs',
        styles: styleEntries(['turbofolk']),
        occasions: occasionEntries(['nunta', 'botez', 'sef']),
      }),
    ]);

    const res = await svc.apply('sr');
    const after = (await sites.findById('sr'))!;

    assert.ok(!res.applied.includes('suno-occasion-prompts'));
    assert.ok(!res.applied.includes('google-occasion-prompts'));
    assert.ok(res.skipped.includes('suno-occasion-prompts'));
    assert.equal(after.occasions[0].sunoPrompt ?? '', '');
    assert.equal(after.styles[0].googlePrompt ?? '', '');
    for (const u of sites.updates) {
      assert.equal(u.patch.styles, undefined, 'nu se atinge catalogul de stiluri');
      assert.equal(u.patch.occasions, undefined, 'nu se atinge catalogul de ocazii');
    }
    // Nici română, nici bulgărește: id-ul „nunta” există în ro și bg, dar site-ul e sârbesc.
    const dump = JSON.stringify(after);
    assert.ok(!dump.includes('mire și mireasă'));
    assert.ok(!dump.includes('сватбено хоро'));
  });

  it('site pe limbă fără seed: check-urile raportează lipsa, fără să pretindă că o repară', async () => {
    const { svc } = service([
      makeSite({
        id: 'sr',
        locale: 'sr',
        occasions: occasionEntries(['nunta', 'botez', 'sef']),
        styles: styleEntries(['turbofolk']),
      }),
    ]);

    const res = await svc.forSite('sr');
    const occ = check(res.site.checks, 'suno-occasion-prompts');
    assert.equal(occ.status, 'missing');
    assert.equal(occ.autoApply, false, 'nu are ce repara — nu promite „auto”');
    assert.match(occ.detail, /3 din 3/);
    assert.match(occ.detail, /manual/);
    assert.match(occ.detail, /„sr”/);
    assert.match(occ.detail, /„ro”, „bg”, „el”/, 'spune ce limbi au seed');
    assert.equal(res.site.autoFixable, 1, 'doar cadou-interface rămâne auto-reparabil');
  });

  it('applyAll: fiecare site primește seed-ul limbii lui, restul rămân neatinse', async () => {
    const ro = makeSite({ id: 'ro', locale: 'ro', occasions: occasionEntries(['nunta']) });
    const bg = makeSite({ id: 'bg', locale: 'bg', occasions: occasionEntries(['nunta']) });
    const el = makeSite({ id: 'el', locale: 'el', occasions: occasionEntries(['gamos']) });
    const sr = makeSite({ id: 'sr', locale: 'sr', occasions: occasionEntries(['nunta']) });
    const { svc, sites } = service([ro, bg, el, sr]);

    await svc.applyAll();

    assert.equal((await sites.findById('ro'))!.occasions[0].sunoPrompt, OCCASION_PROMPT_SEED.nunta.sunoPrompt);
    assert.equal((await sites.findById('bg'))!.occasions[0].sunoPrompt, OCCASION_PROMPT_SEED_BG.nunta.sunoPrompt);
    assert.equal((await sites.findById('el'))!.occasions[0].sunoPrompt, OCCASION_PROMPT_SEED_EL.gamos.sunoPrompt);
    assert.equal((await sites.findById('sr'))!.occasions[0].sunoPrompt ?? '', '');
  });

  it('locale cu regiune („ro-RO”) tot primește seed-ul RO', async () => {
    const { svc, sites } = service([makeSite({ locale: 'ro-RO', occasions: occasionEntries(['nunta']) })]);
    await svc.apply('site-1');
    assert.equal((await sites.findById('site-1'))!.occasions[0].sunoPrompt, OCCASION_PROMPT_SEED.nunta.sunoPrompt);
  });
});

// --- R2: numărare corectă ---------------------------------------------------

describe('rollout — item fără rând în seed e lipsă, nu „ok” (R2)', () => {
  it('site GR cu stiluri în afara seed-ului: 0 din 2 prompturi, status missing', async () => {
    const { svc } = service([
      makeSite({
        id: 'gr',
        locale: 'el',
        domain: 'doroparaggelia.gr',
        musicEngine: 'google',
        // Stiluri grecești reale, dar care nu au rând în seed-ul „el”.
        styles: styleEntries(['pontiako', 'kritiko']),
        occasions: occasionEntries(['gamos', 'vaptisi']),
      }),
    ]);

    const res = await svc.forSite('gr');
    const styles = check(res.site.checks, 'google-style-prompts');
    assert.equal(styles.status, 'missing');
    assert.equal(styles.autoApply, false);
    assert.match(styles.detail, /2 din 2/);
    assert.match(styles.detail, /pontiako/);
    assert.match(styles.detail, /manual/);
    assert.match(styles.detail, /rând în seed/, 'limba are seed — lipsesc doar id-urile astea');

    // Consecința gravă din bug: motorul Google apărea „gata de comutat”.
    const engine = check(res.site.checks, 'music-engine');
    assert.equal(engine.status, 'partial');
    assert.match(engine.detail, /manual/);
  });

  it('site RO cu un stil propriu, în plus față de seed: partial, nu ok', async () => {
    const { svc } = service([
      makeSite({
        locale: 'ro',
        styles: [
          ...styleEntries(['clasic']),
          ...styleEntries(['manea-de-casa']),
          ...styleEntries(['modern'], { googlePrompt: 'scris de operator' }),
        ],
      }),
    ]);

    const res = await svc.forSite('site-1');
    const c = check(res.site.checks, 'google-style-prompts');
    assert.equal(c.status, 'partial');
    assert.equal(c.autoApply, true, 'există „clasic” de umplut din seed');
    assert.match(c.detail, /2 din 3/);
    assert.match(c.detail, /clasic/);
    assert.match(c.detail, /manea-de-casa/);
    assert.match(c.detail, /rând în seed/);
  });

  it('apply pe RO umple ce e în seed și lasă restul ca lipsă', async () => {
    const { svc, sites } = service([
      makeSite({ locale: 'ro', styles: [...styleEntries(['clasic']), ...styleEntries(['manea-de-casa'])] }),
    ]);

    const res = await svc.apply('site-1');
    const after = (await sites.findById('site-1'))!;
    assert.equal(after.styles[0].googlePrompt, STYLE_PROMPT_SEED.clasic.googlePrompt);
    assert.equal(after.styles[1].googlePrompt ?? '', '');
    assert.equal(check(res.site!.checks, 'google-style-prompts').status, 'partial');
  });

  it('catalogul Cadou cu id-uri proprii nu mai raportează „ok” gol', async () => {
    const { svc } = service([
      makeSite({
        id: 'gr',
        locale: 'el',
        experienceConfig: {
          defaultSlug: 'cadou',
          items: {
            cadou: {
              enabled: true,
              utmRules: [],
              catalog: { styles: [{ id: 'pontiako', nm: 'Ποντιακό' }] },
            },
          },
        },
      }),
    ]);

    const res = await svc.forSite('gr');
    const c = check(res.site.checks, 'cadou-catalog-google');
    assert.equal(c.status, 'missing');
    assert.equal(c.autoApply, false);
    assert.match(c.detail, /pontiako/);
  });

  it('catalogul Cadou cu id-uri din seed-ul limbii se umple la apply', async () => {
    const { svc, sites } = service([
      makeSite({
        id: 'gr',
        locale: 'el',
        experienceConfig: {
          defaultSlug: 'cadou',
          items: {
            cadou: {
              enabled: true,
              utmRules: [],
              catalog: { styles: [{ id: 'zeimbekiko', nm: 'Ζεϊμπέκικο' }] },
            },
          },
        },
      }),
    ]);

    const res = await svc.apply('gr');
    assert.ok(res.applied.includes('cadou-catalog-google'));
    const after = (await sites.findById('gr'))!;
    assert.equal(
      after.experienceConfig!.items.cadou!.catalog!.styles![0].googlePrompt,
      STYLE_PROMPT_SEED_EL.zeimbekiko.googlePrompt,
    );
  });
});

// --- regula de aur ----------------------------------------------------------

describe('rollout — apply umple doar goluri', () => {
  it('nu suprascrie textul scris de operator', async () => {
    const { svc, sites } = service([
      makeSite({
        locale: 'ro',
        styles: styleEntries(['clasic'], { sunoPrompt: 'promptul meu', googlePrompt: 'al meu, pe Google' }),
        occasions: occasionEntries(['nunta'], { sunoPrompt: 'nunta noastră' }),
      }),
    ]);

    await svc.apply('site-1');
    const after = (await sites.findById('site-1'))!;
    assert.equal(after.styles[0].sunoPrompt, 'promptul meu');
    assert.equal(after.styles[0].googlePrompt, 'al meu, pe Google');
    assert.equal(after.occasions[0].sunoPrompt, 'nunta noastră');
    // Golul rămas (googlePrompt pe ocazie) se completează normal din seed.
    assert.equal(after.occasions[0].googlePrompt, OCCASION_PROMPT_SEED.nunta.googlePrompt);
  });

  it('nu schimbă motorul audio și nu inventează prețuri', async () => {
    const { svc, sites } = service([
      makeSite({ locale: 'ro', musicEngine: 'suno', styles: styleEntries(['clasic']) }),
    ]);
    await svc.apply('site-1');
    for (const u of sites.updates) {
      assert.equal(u.patch.musicEngine, undefined);
      assert.equal(u.patch.packagePricesCents, undefined);
    }
  });
});

// --- helperii de seed -------------------------------------------------------

describe('catalog-seed — potrivire pe limbă', () => {
  it('seedForLocale întoarce seed doar pentru limbile scrise', () => {
    assert.equal(seedForLocale('ro')?.locale, 'ro');
    assert.equal(seedForLocale('RO')?.locale, 'ro');
    assert.equal(seedForLocale('ro-RO')?.locale, 'ro');
    assert.equal(seedForLocale('bg')?.locale, 'bg');
    assert.equal(seedForLocale('bg-BG')?.locale, 'bg');
    assert.equal(seedForLocale('el')?.locale, 'el');
    assert.equal(seedForLocale('el-GR')?.locale, 'el');
    assert.equal(seedForLocale('sr'), null);
    assert.equal(seedForLocale('tr'), null);
    assert.equal(seedForLocale(''), null);
    assert.equal(seedForLocale(undefined), null);
  });

  it('fiecare limbă își primește propriile mapuri, nu pe ale altei limbi', () => {
    assert.equal(seedForLocale('bg')!.styles, STYLE_PROMPT_SEED_BG);
    assert.equal(seedForLocale('bg')!.occasions, OCCASION_PROMPT_SEED_BG);
    assert.equal(seedForLocale('el')!.styles, STYLE_PROMPT_SEED_EL);
    assert.equal(seedForLocale('el')!.occasions, OCCASION_PROMPT_SEED_EL);
    // Id-ul „nunta” există în ro și bg — dar cu texte diferite.
    assert.notEqual(OCCASION_PROMPT_SEED_BG.nunta.sunoPrompt, OCCASION_PROMPT_SEED.nunta.sunoPrompt);
  });

  it('seedRow nu cade pe Object.prototype', () => {
    assert.equal(seedRow(STYLE_PROMPT_SEED, 'constructor'), null);
    assert.equal(seedRow(STYLE_PROMPT_SEED, 'toString'), null);
    assert.equal(seedRow(STYLE_PROMPT_SEED, 'clasic')?.sunoPrompt, STYLE_PROMPT_SEED.clasic.sunoPrompt);
    assert.equal(seedRow(null, 'clasic'), null);
  });
});

// --- conținutul seed-urilor bg / el -----------------------------------------

const BG_STYLE_IDS = [
  'popfolk', 'klasicheska', 'kyuchek', 'talava', 'lyubov', 'maka',
  'trompet', 'orientalna', 'luks', 'komertsialna', 'svadbarska', 'nazdrave',
];
const BG_OCCASION_IDS = [
  'zi', 'nunta', 'botez', 'cumatrie', 'cuplu', 'sef',
  'dragoste', 'roast', 'nas', 'inmorm', 'motiv', 'altul',
];
const EL_STYLE_IDS = [
  'klasiko', 'skiladiko', 'rembetiko', 'nisiotiko', 'anatoliko', 'zeimbekiko',
  'tsifteteli', 'panigyradiko', 'laiko-agapis', 'laiko-kaymou', 'emporiko', 'syrtaki',
];
const EL_OCCASION_IDS = [
  'genethlia', 'gamos', 'vaptisi', 'nonos', 'epeteios', 'afentiko',
  'agapi', 'plaka', 'koumparos', 'mnimosino', 'dynamis', 'allo',
];

function dumpOf(map: CatalogPromptSeedMap): string {
  return JSON.stringify(map);
}

describe('catalog-seed — seed-urile bg și el', () => {
  it('acoperă exact catalogul fiecărui site', () => {
    assert.deepEqual(Object.keys(STYLE_PROMPT_SEED_BG), BG_STYLE_IDS);
    assert.deepEqual(Object.keys(OCCASION_PROMPT_SEED_BG), BG_OCCASION_IDS);
    assert.deepEqual(Object.keys(STYLE_PROMPT_SEED_EL), EL_STYLE_IDS);
    assert.deepEqual(Object.keys(OCCASION_PROMPT_SEED_EL), EL_OCCASION_IDS);
  });

  it('fiecare intrare are ambele prompturi, nevide', () => {
    const maps: Array<[string, CatalogPromptSeedMap]> = [
      ['bg.styles', STYLE_PROMPT_SEED_BG],
      ['bg.occasions', OCCASION_PROMPT_SEED_BG],
      ['el.styles', STYLE_PROMPT_SEED_EL],
      ['el.occasions', OCCASION_PROMPT_SEED_EL],
    ];
    for (const [label, map] of maps) {
      for (const [id, row] of Object.entries(map)) {
        assert.ok(row.sunoPrompt.trim().length > 20, `${label}.${id}: sunoPrompt prea scurt`);
        assert.ok(row.googlePrompt.trim().length > 20, `${label}.${id}: googlePrompt prea scurt`);
      }
    }
  });

  it('nicăieri „Romanian” sau „manele” în bg / el', () => {
    for (const locale of ['bg', 'el']) {
      const seed = seedForLocale(locale)!;
      const dump = `${dumpOf(seed.styles)}${dumpOf(seed.occasions)}`;
      assert.ok(!/romanian/i.test(dump), `seed ${locale}: apare „Romanian”`);
      assert.ok(!/manele/i.test(dump), `seed ${locale}: apare „manele”`);
      assert.ok(!/lăutăr|mire și mireasă|la mulți ani/i.test(dump), `seed ${locale}: text românesc scăpat`);
    }
  });

  it('stilurile cer explicit limba și genul pieței', () => {
    for (const row of Object.values(STYLE_PROMPT_SEED_BG)) {
      assert.match(row.sunoPrompt, /Bulgarian language/);
      assert.match(row.sunoPrompt, /CHALGA \/ pop-folk/);
      assert.match(row.sunoPrompt, /NOT pop, NOT EDM/, 'exclude genurile greșite ca la ro');
      assert.match(row.googlePrompt, /Language: Bulgarian/);
      assert.match(row.sunoPrompt, /\d{2,3}(-\d{2,3})? BPM/, 'are tempo concret');
    }
    for (const row of Object.values(STYLE_PROMPT_SEED_EL)) {
      assert.match(row.sunoPrompt, /Greek language/);
      assert.match(row.sunoPrompt, /LAÏKO \/ skiladiko/);
      assert.match(row.sunoPrompt, /NOT pop, NOT EDM/);
      assert.match(row.googlePrompt, /Language: Greek/);
      assert.match(row.sunoPrompt, /\d{2,3}( to | ?- ?)?\d{0,3} ?BPM/, 'are tempo concret');
    }
  });

  it('ocaziile au textul liber în limba pieței, nu în română', () => {
    for (const row of Object.values(OCCASION_PROMPT_SEED_BG)) {
      assert.match(row.sunoPrompt, /[Ѐ-ӿ]/, 'hint-ul Suno conține chirilic');
      assert.ok(row.sunoPrompt.length < 90, 'hint scurt, se lipește de style string');
    }
    for (const row of Object.values(OCCASION_PROMPT_SEED_EL)) {
      assert.match(row.sunoPrompt, /[Ͱ-Ͽἀ-῿]/, 'hint-ul Suno conține grecesc');
      assert.ok(row.sunoPrompt.length < 90, 'hint scurt, se lipește de style string');
    }
  });

  it('CATALOG_SEEDS are cheia = locale-ul declarat', () => {
    for (const [key, set] of Object.entries(CATALOG_SEEDS)) {
      assert.equal(set.locale, key, `cheia „${key}” nu se potrivește cu set.locale`);
    }
    assert.deepEqual(Object.keys(CATALOG_SEEDS), ['ro', 'bg', 'el']);
  });
});
