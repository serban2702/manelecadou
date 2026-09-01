import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PaymentsService } from './payments.service';
import { PACKAGES, PACKAGE_TIERS, type PackageTier } from './packages';
import type { Site } from '../sites/site.entity';
import type { ExperiencePackageOverride, SiteExperienceConfig } from '../experiences/types';

/**
 * INVARIANTUL care lipsea: prețul AFIȘAT (`quote`) și prețul TAXAT
 * (`createCheckoutSession`) trebuie să fie ACELAȘI număr, pentru orice combinație de
 * preț per-site × override pe interfață × tier.
 *
 * Bug-ul reparat: `createCheckoutSession` calcula totalul doar din
 * `site.packagePricesCents` și ignora `experienceConfig.items[slug].packages[tier]`.
 * Owner-ul schimba prețul pachetului pentru interfața „cadou", site-ul îl afișa corect,
 * iar Stripe îi taxa clientului prețul vechi.
 *
 * `PaymentsService` are ~15 dependințe (Stripe, TypeORM, mailer…), dar calculul de preț
 * nu atinge niciuna. Construim instanța cu `Object.create(prototype)` și punem la loc
 * doar cele 3 lucruri pe care le atinge drumul testat (logger, promo, getStripe) — așa
 * testăm METODELE REALE, nu o copie a logicii care poate diverge de ele.
 */
function makeService(): PaymentsService {
  const svc = Object.create(PaymentsService.prototype) as PaymentsService;
  const s = svc as unknown as Record<string, unknown>;
  s.logger = { log() {}, warn() {}, error() {} };
  return svc;
}

function makeSite(opts: {
  prices?: Partial<Record<PackageTier, number>> | null;
  compareAt?: Partial<Record<PackageTier, number>> | null;
  experienceConfig?: SiteExperienceConfig | null;
}): Site {
  return {
    id: 'site-1',
    slug: 'test',
    domain: 'test.local',
    currency: 'RON',
    locale: 'ro',
    basePriceCents: 2999,
    packagePricesCents: opts.prices ?? null,
    packageCompareAtCents: opts.compareAt ?? null,
    experienceConfig: opts.experienceConfig ?? null,
  } as unknown as Site;
}

function withPackageOverride(
  slug: string,
  tier: PackageTier,
  override: ExperiencePackageOverride,
  defaultSlug = 'classic',
): SiteExperienceConfig {
  return {
    defaultSlug,
    items: {
      [slug]: { enabled: true, utmRules: [], packages: { [tier]: override } },
    },
  };
}

/**
 * Totalul de bază pe care îl trimite `createCheckoutSession` la Stripe, obținut din
 * metoda REALĂ: îl interceptăm prin `promo.validate` (primește `baseTotal`), apoi
 * oprim fluxul înainte de Stripe.
 */
async function checkoutBaseTotal(
  svc: PaymentsService,
  site: Site,
  packageTier: PackageTier,
  experienceSlug?: string | null,
): Promise<number> {
  let captured: number | null = null;
  const s = svc as unknown as Record<string, unknown>;
  s.promo = {
    validate: async (_code: string, _email: string | undefined, baseTotal: number) => {
      captured = baseTotal;
      return { ok: true, appliedDiscountCents: 0 };
    },
  };
  s.getStripe = async () => null; // oprește fluxul imediat după calculul totalului
  await assert.rejects(
    svc.createCheckoutSession({
      userId: null,
      guestId: null,
      packageTier,
      experienceSlug: experienceSlug ?? null,
      promoCode: 'CAPTURA',
      email: 'client@example.com',
      site,
    }),
    /Stripe not configured/,
  );
  assert.notEqual(captured, null, 'promo.validate nu a fost apelat — totalul nu a fost capturat');
  return captured!;
}

describe('preț afișat === preț taxat', () => {
  const combos: Array<{ name: string; site: Site; slug: string | null }> = [
    {
      name: 'site fără prețuri proprii, interfață fără override',
      site: makeSite({}),
      slug: null,
    },
    {
      name: 'site cu prețuri proprii (EUR-style), interfață fără override',
      site: makeSite({ prices: { basic: 599, plus: 999, premium: 1999 } }),
      slug: null,
    },
    {
      name: 'override pe interfața cerută explicit',
      site: makeSite({
        prices: { basic: 2999, plus: 4999, premium: 9999 },
        experienceConfig: withPackageOverride('cadou', 'premium', { priceCents: 12999 }),
      }),
      slug: 'cadou',
    },
    {
      name: 'override pe interfața DEFAULT a site-ului (slug necerut)',
      site: makeSite({
        prices: { basic: 2999 },
        experienceConfig: withPackageOverride('cadou', 'basic', { priceCents: 3999 }, 'cadou'),
      }),
      slug: null,
    },
    {
      name: 'override pe ALTĂ interfață decât cea cerută (nu trebuie să se aplice)',
      site: makeSite({
        prices: { plus: 4999 },
        experienceConfig: withPackageOverride('cadou', 'plus', { priceCents: 7999 }),
      }),
      slug: 'classic',
    },
    {
      name: 'override cu preț invalid (0) — cade pe prețul per-site',
      site: makeSite({
        prices: { plus: 4499 },
        experienceConfig: withPackageOverride('cadou', 'plus', { priceCents: 0 }),
      }),
      slug: 'cadou',
    },
  ];

  for (const combo of combos) {
    for (const tier of PACKAGE_TIERS) {
      it(`${combo.name} — ${tier}`, async () => {
        const svc = makeService();
        const quoted = svc.quote(combo.site, { packageTier: tier, experienceSlug: combo.slug });
        const charged = await checkoutBaseTotal(svc, combo.site, tier, combo.slug);
        assert.equal(
          charged,
          quoted.total,
          `quote=${quoted.total} dar checkout=${charged} (${combo.name}, ${tier})`,
        );
        assert.ok(quoted.total > 0);
      });
    }
  }

  it('override-ul de interfață bate prețul per-site ȘI prețul de listă', () => {
    const site = makeSite({
      prices: { premium: 9999 },
      experienceConfig: withPackageOverride('cadou', 'premium', { priceCents: 12999 }),
    });
    const svc = makeService();
    assert.equal(svc.quote(site, { packageTier: 'premium', experienceSlug: 'cadou' }).total, 12999);
    assert.equal(svc.quote(site, { packageTier: 'premium', experienceSlug: 'classic' }).total, 9999);
  });

  it('fără niciun override, prețul e cel de listă din cod', () => {
    const svc = makeService();
    const site = makeSite({});
    for (const tier of PACKAGE_TIERS) {
      assert.equal(svc.quote(site, { packageTier: tier }).total, PACKAGES[tier].priceCents);
    }
  });

  it('prețul tăiat se ignoră dacă nu e mai mare decât prețul efectiv', () => {
    const svc = makeService();
    const site = makeSite({
      prices: { plus: 4999 },
      compareAt: { plus: 4999 },
      experienceConfig: null,
    });
    assert.equal(svc.quote(site, { packageTier: 'plus' }).compareAtCents, null);
  });

  it('prețul tăiat per-site se păstrează când override-ul doar scade prețul', () => {
    const svc = makeService();
    const site = makeSite({
      prices: { plus: 6999 },
      compareAt: { plus: 9999 },
      experienceConfig: withPackageOverride('cadou', 'plus', { priceCents: 4999 }),
    });
    const q = svc.quote(site, { packageTier: 'plus', experienceSlug: 'cadou' });
    assert.equal(q.total, 4999);
    assert.equal(q.compareAtCents, 9999);
  });
});

describe('pachet dezactivat', () => {
  const site = makeSite({
    prices: { premium: 9999 },
    experienceConfig: withPackageOverride('cadou', 'premium', { enabled: false }),
  });

  it('nu poate fi cumpărat prin checkout (link vechi sau chat)', async () => {
    const svc = makeService();
    const s = svc as unknown as Record<string, unknown>;
    s.getStripe = async () => null;
    await assert.rejects(
      svc.createCheckoutSession({
        userId: null,
        guestId: null,
        packageTier: 'premium',
        experienceSlug: 'cadou',
        email: 'client@example.com',
        site,
      }),
      /nu mai este disponibil/,
    );
  });

  it('nu poate fi cumpărat nici cu sumă suprascrisă din admin', async () => {
    const svc = makeService();
    const s = svc as unknown as Record<string, unknown>;
    s.getStripe = async () => null;
    await assert.rejects(
      svc.createCheckoutSession({
        userId: null,
        guestId: null,
        packageTier: 'premium',
        experienceSlug: 'cadou',
        overrideAmount: 500,
        email: 'client@example.com',
        site,
      }),
      /nu mai este disponibil/,
    );
  });

  it('rămâne cumpărabil pe interfața unde NU a fost dezactivat', async () => {
    const svc = makeService();
    const total = await checkoutBaseTotal(svc, site, 'premium', 'classic');
    assert.equal(total, 9999);
  });

  it('quote raportează starea, ca vitrina să nu-l mai ofere', () => {
    const svc = makeService();
    assert.equal(svc.quote(site, { packageTier: 'premium', experienceSlug: 'cadou' }).enabled, false);
    assert.equal(svc.quote(site, { packageTier: 'premium', experienceSlug: 'classic' }).enabled, true);
  });
});


/**
 * Comanda gratuită (cod promo 100%).
 *
 * Două lucruri s-au rupt aici în producție pe 1 septembrie 2026, pe același
 * click:
 *  1. clientul nu retrimitea `packageTier` la reluarea plății (stare de wizard
 *     restaurată), iar checkout-ul cădea cu 400 pe o comandă validă — deși
 *     tier-ul era deja persistat pe generare;
 *  2. comanda gratuită nu raporta nicio conversie server-side, deci un cod 100%
 *     dat unui influencer nu apărea nicăieri în rapoarte.
 */
describe('comandă gratuită (promo 100%)', () => {
  function makeFreeService(opts: { genTier?: PackageTier | null } = {}) {
    const svc = makeService();
    const s = svc as unknown as Record<string, unknown>;
    const calls = { conversions: 0, stripe: 0, queued: [] as string[], redeemed: 0 };

    s.generations = {
      findOnePublic: async () => ({ id: 'gen-1', paidUnlocked: false, packageTier: opts.genTier ?? null }),
      markPaidAndQueue: async (genId: string) => { calls.queued.push(genId); },
    };
    s.promo = {
      validate: async (_c: string, _e: string | undefined, baseTotal: number) => ({
        ok: true,
        promoCodeId: 'promo-1',
        appliedDiscountCents: baseTotal, // 100% off
      }),
      redeem: async () => { calls.redeemed += 1; },
    };
    s.repo = {
      create: (row: Record<string, unknown>) => row,
      save: async (row: Record<string, unknown>) => ({ ...row, id: 'pay-free-1' }),
    };
    s.attributionFields = async () => ({});
    // `siteAppUrl` citește un fallback din config; site-ul de test are domeniu,
    // deci valoarea n-are efect — dar metoda reală tot îl interoghează.
    s.config = { get: () => undefined };
    s.notifyOwnerOfPayment = () => undefined;
    s.emitFreeOrderConversions = async () => { calls.conversions += 1; };
    s.getStripe = async () => { calls.stripe += 1; return null; };
    return { svc, calls };
  }

  it('nu atinge Stripe și confirmă direct, cu redirect pe melodie', async () => {
    const { svc, calls } = makeFreeService({ genTier: 'basic' });
    const res = await svc.createCheckoutSession({
      userId: null,
      guestId: null,
      generationId: 'gen-1',
      packageTier: 'basic',
      promoCode: 'FREEVOX100',
      email: 'client@example.com',
      site: makeSite({}),
    });

    assert.equal(calls.stripe, 0, 'Stripe NU trebuie interogat pentru o comandă de 0');
    assert.match(res.url, /\/m\/gen-1\?paymentId=pay-free-1&success=1$/);
    assert.equal(res.paymentId, 'pay-free-1');
    assert.deepEqual(calls.queued, ['gen-1'], 'generarea trebuie pornită imediat');
    assert.equal(calls.redeemed, 1, 'codul promo trebuie marcat ca folosit');
  });

  it('raportează conversia (cu valoare 0), nu doar din browser', async () => {
    const { svc, calls } = makeFreeService({ genTier: 'basic' });
    await svc.createCheckoutSession({
      userId: null,
      guestId: null,
      generationId: 'gen-1',
      packageTier: 'basic',
      promoCode: 'FREEVOX100',
      email: 'client@example.com',
      site: makeSite({}),
    });
    assert.equal(calls.conversions, 1);
  });

  it('merge și când clientul NU mai trimite packageTier — îl ia de pe generare', async () => {
    // Regresia din producție: 400 „packageTier este obligatoriu" pe o comandă
    // al cărei pachet era deja salvat pe generare.
    const { svc, calls } = makeFreeService({ genTier: 'plus' });
    const res = await svc.createCheckoutSession({
      userId: null,
      guestId: null,
      generationId: 'gen-1',
      promoCode: 'FREEVOX100',
      email: 'client@example.com',
      site: makeSite({}),
    });
    assert.match(res.url, /\/m\/gen-1\?/);
    assert.equal(calls.stripe, 0);
  });

  it('fără generare ȘI fără packageTier rămâne o cerere invalidă', async () => {
    // Retragerea e pe ce ȘTIM deja, nu o relaxare a validării: o cerere din
    // care lipsește și pachetul, și generarea, chiar nu poate fi prețuită.
    const { svc } = makeFreeService();
    await assert.rejects(
      svc.createCheckoutSession({
        userId: null,
        guestId: null,
        promoCode: 'FREEVOX100',
        email: 'client@example.com',
        site: makeSite({}),
      }),
      /packageTier este obligatoriu/,
    );
  });
});
