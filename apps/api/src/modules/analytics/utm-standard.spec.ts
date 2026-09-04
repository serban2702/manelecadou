import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildUtmUrl,
  isMacroPlaceholder,
  normalizeChannel,
  parseUtmFromUrl,
  utmSlug,
  UTM_TEMPLATES,
  UTM_MEDIUMS,
} from './utm-standard';

describe('normalizeChannel', () => {
  it('emailul câștigă înaintea lui Google', () => {
    // Clientul Gmail raportează `com.google.android.gm` ca referrer. Clasificat
    // naiv după „conține google", tot traficul din PROPRIILE noastre emailuri
    // ar fi apărut ca Google Ads — 64% din „Google" era Gmail în iulie 2026.
    assert.equal(normalizeChannel('com.google.android.gm'), 'email');
    assert.equal(normalizeChannel('mail.google.com'), 'email');
    assert.equal(normalizeChannel('www.google.com'), 'google');
    assert.equal(normalizeChannel('google'), 'google');
  });

  it('ChatGPT câștigă înaintea lui Google pe hosturi mixte', () => {
    assert.equal(normalizeChannel('chatgpt.com'), 'chatgpt');
    assert.equal(normalizeChannel('chat.openai.com'), 'chatgpt');
  });

  it('Facebook și Instagram se unesc în canalul meta', () => {
    // O campanie Meta livrează pe ambele; defalcarea corectă e `utm_placement`.
    for (const raw of ['facebook', 'm.facebook.com', 'instagram', 'l.instagram.com', 'fb', 'ig', 'meta', 'an']) {
      assert.equal(normalizeChannel(raw), 'meta', raw);
    }
  });

  it('Stripe nu e o sursă — e redirectul de după plată', () => {
    assert.equal(normalizeChannel('checkout.stripe.com'), 'direct');
  });

  it('lipsa sursei e direct, un hostname necunoscut e referral', () => {
    assert.equal(normalizeChannel(null), 'direct');
    assert.equal(normalizeChannel(''), 'direct');
    assert.equal(normalizeChannel('(direct)'), 'direct');
    assert.equal(normalizeChannel('ziarul-x.ro'), 'referral');
  });
});

describe('isMacroPlaceholder', () => {
  it('prinde macro-urile netraduse ale celor trei platforme', () => {
    assert.equal(isMacroPlaceholder('{{campaign.name}}'), true);   // Meta
    assert.equal(isMacroPlaceholder('__CAMPAIGN_NAME__'), true);   // TikTok
    assert.equal(isMacroPlaceholder('{campaignid}'), true);        // Google
    assert.equal(isMacroPlaceholder(''), true);
    assert.equal(isMacroPlaceholder(null), true);
  });

  it('nu confundă o campanie reală cu un macro', () => {
    assert.equal(isMacroPlaceholder('ro-conv-cadou-0926'), false);
    assert.equal(isMacroPlaceholder('120210000000000000'), false);
  });
});

describe('parseUtmFromUrl', () => {
  it('citește setul complet și deduce canalul din utm_source', () => {
    const c = parseUtmFromUrl(
      'https://manelecadou.ro/?utm_source=meta&utm_medium=paid_social&utm_campaign=ro-conv-cadou-0926' +
        '&utm_id=1202&utm_adset=femei-35-55&utm_adset_id=99&utm_content=video-reactie&utm_ad_id=77' +
        '&utm_placement=reels&utm_term=cadou+mama',
    );
    assert.equal(c.source, 'meta');
    assert.equal(c.medium, 'paid_social');
    assert.equal(c.campaign, 'ro-conv-cadou-0926');
    assert.equal(c.utmId, '1202');
    assert.equal(c.adset, 'femei-35-55');
    assert.equal(c.adsetId, '99');
    assert.equal(c.ad, null);
    assert.equal(c.adId, '77');
    assert.equal(c.placement, 'reels');
    assert.equal(c.term, 'cadou mama');   // `+` decodat ca spațiu
    assert.equal(c.channel, 'meta');
  });

  it('un click-id fără UTM ține atribuirea singur', () => {
    // Cazul reclamei cu parametrii uitați: platforma pune oricum click-id-ul.
    const c = parseUtmFromUrl('https://manelecadou.ro/?fbclid=IwAR123');
    assert.equal(c.source, null);
    assert.equal(c.clickId, 'IwAR123');
    assert.equal(c.clickIdSource, 'meta');
    assert.equal(c.channel, 'meta');
  });

  it('macro-urile netraduse devin null, nu valori', () => {
    const c = parseUtmFromUrl(
      'https://manelecadou.ro/?utm_source=tiktok&utm_campaign=__CAMPAIGN_NAME__&utm_content=__CID_NAME__',
    );
    assert.equal(c.source, 'tiktok');
    assert.equal(c.campaign, null);
    assert.equal(c.content, null);
    assert.equal(c.channel, 'tiktok');
  });

  it('fără nimic în URL, referrer-ul dă canalul', () => {
    const c = parseUtmFromUrl('https://manelecadou.ro/', 'https://www.tiktok.com/');
    assert.equal(c.channel, 'tiktok');
  });

  it('un click de reclamă ChatGPT e recunoscut din `oppref`, fără UTM', () => {
    // OpenAI pune `oppref` pe URL-ul de aterizare; fără el, o reclamă ChatGPT
    // fără UTM-uri ar fi căzut pe „referral".
    const c = parseUtmFromUrl('https://manelecadou.ro/?oppref=abc123');
    assert.equal(c.clickIdSource, 'chatgpt');
    assert.equal(c.channel, 'chatgpt');
  });

  it('tokenul de email e citit separat de restul click-id-urilor', () => {
    const c = parseUtmFromUrl('https://manelecadou.ro/m/x?mc_eid=abc123&utm_source=email');
    assert.equal(c.emailToken, 'abc123');
    assert.equal(c.channel, 'email');
  });

  it('mai multe click-id-uri: primul din ordinea de preferință câștigă, restul se păstrează', () => {
    const c = parseUtmFromUrl('https://manelecadou.ro/?gclid=G1&fbclid=F1');
    assert.equal(c.clickIdSource, 'meta');
    assert.deepEqual(c.clickIds, { fbclid: 'F1', gclid: 'G1' });
  });
});

describe('buildUtmUrl', () => {
  it('nu suprascrie parametrii deja prezenți în URL', () => {
    // Un CTA construit o dată și rescris a doua oară și-ar pierde altfel
    // atribuirea originală.
    const out = buildUtmUrl({
      baseUrl: 'https://manelecadou.ro/m/abc?promo=X10&utm_source=email',
      source: 'meta',
      medium: 'paid_social',
      campaign: 'ro-conv',
    });
    const u = new URL(out);
    assert.equal(u.searchParams.get('promo'), 'X10');
    assert.equal(u.searchParams.get('utm_source'), 'email');
    assert.equal(u.searchParams.get('utm_medium'), 'paid_social');
    assert.equal(u.searchParams.get('utm_campaign'), 'ro-conv');
  });

  it('sare peste valorile goale și acceptă parametri extra', () => {
    const u = new URL(
      buildUtmUrl({
        baseUrl: 'https://manelecadou.ro/',
        source: 'email',
        medium: 'email',
        campaign: '',
        extra: { mc_eid: 'tok', ignorat: '' },
      }),
    );
    assert.equal(u.searchParams.has('utm_campaign'), false);
    assert.equal(u.searchParams.get('mc_eid'), 'tok');
    assert.equal(u.searchParams.has('ignorat'), false);
  });

  it('un URL invalid se întoarce neatins, nu aruncă', () => {
    assert.equal(buildUtmUrl({ baseUrl: 'nu-e-url', source: 'meta', medium: 'cpc' }), 'nu-e-url');
  });
});

describe('utmSlug', () => {
  it('normalizează diacriticele și spațiile', () => {
    // Fără asta „Cadou Mamă", „cadou mama" și „Cadou-Mama" ar fi trei rânduri.
    assert.equal(utmSlug('Cadou Mamă'), 'cadou-mama');
    assert.equal(utmSlug('  Ședință  de   Test '), 'sedinta-de-test');
    assert.equal(utmSlug('Nuntă & Botez'), 'nunta-botez');
    assert.equal(utmSlug(null), '');
  });
});

describe('șabloanele per platformă', () => {
  it('niciun șablon nu începe cu „?" (platforma îl adaugă singură)', () => {
    for (const t of UTM_TEMPLATES) {
      assert.equal(t.suffix.startsWith('?'), false, t.id);
      assert.equal(t.suffix.startsWith('&'), false, t.id);
    }
  });

  it('fiecare șablon declară utm_source și utm_medium din vocabular', () => {
    const mediums = new Set(UTM_MEDIUMS.map((m) => m.value));
    for (const t of UTM_TEMPLATES) {
      const params = new URLSearchParams(t.suffix);
      assert.ok(params.get('utm_source'), `${t.id} fără utm_source`);
      const medium = params.get('utm_medium') ?? '';
      // Google folosește un macro condițional care alege între două valori din
      // vocabular; restul trebuie să aibă o valoare fixă, validă.
      if (!medium.includes('{')) {
        assert.ok(mediums.has(medium), `${t.id}: utm_medium „${medium}" nu e în vocabular`);
      }
    }
  });

  /**
   * Macro-urile pe care OpenAI le înlocuiește efectiv, cuvânt cu cuvânt din
   * câmpul „Parametrii de interogare ai paginii de destinație" (verificat în
   * Ads Manager, 4 sept. 2026). Un macro inventat NU dă eroare: ajunge la noi
   * ca text, iar `isMacroPlaceholder` îl aruncă — adică o coloană goală care
   * arată exact ca „reclamă fără UTM".
   */
  it('șablonul ChatGPT folosește doar macro-uri pe care platforma le are', () => {
    const SUPORTATE = new Set([
      '{campaign_id}',
      '{ad_group_id}',
      '{ad_id}',
      '{ad_account_id}',
      '{oppref}',
    ]);
    const t = UTM_TEMPLATES.find((x) => x.id === 'chatgpt')!;
    const inSuffix = t.suffix.match(/\{[^}]+\}/g) ?? [];
    assert.ok(inSuffix.length > 0, 'șablonul ChatGPT nu mai are niciun macro');
    for (const m of inSuffix) {
      assert.ok(SUPORTATE.has(m), `macro inexistent la OpenAI: ${m}`);
    }
    for (const f of t.fields) {
      for (const m of f.value.match(/\{[^}]+\}/g) ?? []) {
        assert.ok(SUPORTATE.has(m), `macro inexistent la OpenAI, pe câmpul ${f.param}: ${m}`);
      }
    }
  });

  it('valorile parsate din șabloane sunt macro-uri, nu text real', () => {
    // Verifică indirect că `parseUtmFromUrl` le va arunca: dacă un macro ar fi
    // scris greșit și ar trece de `isMacroPlaceholder`, ar ajunge ca „campanie"
    // în rapoarte pentru toate reclamele platformei.
    const meta = UTM_TEMPLATES.find((t) => t.id === 'meta')!;
    const c = parseUtmFromUrl(`https://manelecadou.ro/?${meta.suffix}`);
    assert.equal(c.campaign, null);
    assert.equal(c.content, null);
    assert.equal(c.source, 'meta');
  });
});
