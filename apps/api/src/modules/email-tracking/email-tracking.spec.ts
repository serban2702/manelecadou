import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { rewriteEmailLinks } from './email-tracking.service';

let n = 0;
const seqToken = () => `tok${++n}`;

function rewrite(html: string, over: Partial<Parameters<typeof rewriteEmailLinks>[1]> = {}) {
  n = 0;
  return rewriteEmailLinks(html, {
    siteUrl: 'https://manelecadou.ro',
    campaign: 'recovery-h24',
    term: 'stage-3',
    tracking: true,
    openPixel: false,
    makeToken: seqToken,
    ...over,
  });
}

describe('rewriteEmailLinks', () => {
  it('rescrie linkul nostru prin redirect și păstrează destinația cu UTM-uri', () => {
    const r = rewrite('<a href="https://manelecadou.ro/m/abc?promo=X10">Ascultă</a>');
    assert.equal(r.tracked, 1);
    assert.ok(r.html.includes('https://manelecadou.ro/api/e/c/tok1'));

    const target = new URL(r.links[0].targetUrl);
    assert.equal(target.pathname, '/m/abc');
    assert.equal(target.searchParams.get('promo'), 'X10');       // parametrul original supraviețuiește
    assert.equal(target.searchParams.get('utm_source'), 'email');
    assert.equal(target.searchParams.get('utm_medium'), 'email');
    assert.equal(target.searchParams.get('utm_campaign'), 'recovery-h24');
    assert.equal(target.searchParams.get('utm_content'), 'song');
    assert.equal(target.searchParams.get('mc_eid'), 'tok1');
  });

  it('NU atinge linkul de dezabonare', () => {
    // Un hop în plus între om și butonul „nu-mi mai trimite" e exact ce
    // penalizează furnizorii de email, iar Gmail apelează List-Unsubscribe singur.
    const html = '<a href="https://manelecadou.ro/unsubscribe?token=abc">Dezabonare</a>';
    const r = rewrite(html);
    assert.equal(r.html, html);
    assert.equal(r.tracked, 0);
    assert.equal(r.links.length, 0);
  });

  it('NU atinge linkurile externe și nici mailto/tel/ancore', () => {
    const html =
      '<a href="https://facebook.com/pagina">FB</a>' +
      '<a href="mailto:contact@manelecadou.ro">Scrie</a>' +
      '<a href="tel:+40700000000">Sună</a>' +
      '<a href="#jos">Jos</a>';
    const r = rewrite(html);
    assert.equal(r.html, html);
    assert.equal(r.tracked, 0);
  });

  it('linkuri diferite primesc chei distincte, iar repetările capătă sufix', () => {
    // Fără sufix, butonul din antet și cel din subsol s-ar aduna pe același
    // rând de raport și n-ai ști care e apăsat.
    const r = rewrite(
      '<a href="https://manelecadou.ro/m/abc">sus</a>' +
        '<a href="https://manelecadou.ro/studio">studio</a>' +
        '<a href="https://manelecadou.ro/m/abc">jos</a>',
    );
    assert.deepEqual(r.links.map((l) => l.linkKey), ['song', 'studio', 'song-2']);
  });

  it('un subdomeniu al site-ului e tot „al nostru"', () => {
    const r = rewrite('<a href="https://files.manelecadou.ro/x.mp3">Descarcă</a>');
    assert.equal(r.tracked, 1);
  });

  it('fără urmărire adaugă doar UTM-uri, fără redirect și fără tokenuri', () => {
    const r = rewrite('<a href="https://manelecadou.ro/studio">Comandă</a>', { tracking: false });
    assert.equal(r.tracked, 0);
    assert.equal(r.tagged, 1);
    assert.equal(r.links.length, 0);
    assert.ok(r.html.includes('utm_source=email'));
    assert.equal(r.html.includes('/api/e/c/'), false);
  });

  it('decodează `&amp;` din href și îl re-scapă corect', () => {
    // Șabloanele scriu `&amp;` (corect în HTML), dar URL-ul real n-are entitatea.
    // Fără decodare, `promo` s-ar fi numit `amp;promo`.
    const r = rewrite('<a href="https://manelecadou.ro/m/a?promo=X&amp;off=20">CTA</a>');
    const target = new URL(r.links[0].targetUrl);
    assert.equal(target.searchParams.get('off'), '20');
    assert.equal(target.searchParams.has('amp;off'), false);

    // Pe calea fără urmărire (URL-ul rămâne în href), `&` iese din nou ca
    // entitate — altfel HTML-ul ar fi invalid și unii clienți de mail ar rupe linkul.
    const tagged = rewrite('<a href="https://manelecadou.ro/m/a?promo=X&amp;off=20">CTA</a>', {
      tracking: false,
    });
    assert.ok(tagged.html.includes('off=20'));
    assert.ok(tagged.html.includes('&amp;'));
    assert.equal(tagged.html.includes('amp%3B'), false);
  });

  it('nu re-decorează un link deja rescris', () => {
    const once = rewrite('<a href="https://manelecadou.ro/studio">CTA</a>');
    const twice = rewriteEmailLinks(once.html, {
      siteUrl: 'https://manelecadou.ro',
      campaign: 'alta',
      term: null,
      tracking: true,
      openPixel: false,
      makeToken: () => 'NOU',
    });
    assert.equal(twice.tracked, 0);
    assert.equal(twice.html, once.html);
  });

  it('pixelul de deschidere intră înainte de </body> și doar când există urmărire', () => {
    const withBody = rewrite('<html><body><a href="https://manelecadou.ro/studio">CTA</a></body></html>', {
      openPixel: true,
    });
    assert.ok(withBody.html.includes('/api/e/o/tok2'));
    assert.ok(withBody.html.indexOf('/api/e/o/tok2') < withBody.html.indexOf('</body>'));
    assert.equal(withBody.links.filter((l) => l.isOpenPixel).length, 1);

    // Fără niciun link urmărit, pixelul n-ar avea de ce să se lege.
    const noLinks = rewrite('<html><body>Text simplu</body></html>', { openPixel: true });
    assert.equal(noLinks.html.includes('/api/e/o/'), false);
  });

  it('ghilimelele simple din href sunt tratate la fel', () => {
    const r = rewrite("<a href='https://manelecadou.ro/top'>Top</a>");
    assert.equal(r.tracked, 1);
    assert.ok(r.html.includes("href='https://manelecadou.ro/api/e/c/tok1'"));
  });
});
