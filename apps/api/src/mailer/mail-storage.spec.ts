import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  mailKey,
  resolveMailStoragePath,
  safeMailName,
  sanitizeMailMime,
} from './mail-storage';

const UPLOADS = '/app/uploads';

describe('resolveMailStoragePath', () => {
  it('cheie relativă (formatul nou) → StorageService, fără disc vechi', () => {
    const r = resolveMailStoragePath('mail-attach/abc/0-factura.pdf', UPLOADS);
    assert.equal(r.key, 'mail-attach/abc/0-factura.pdf');
    assert.equal(r.legacyAbs, null);
  });

  it('absolut sub rădăcina uploads → cheia relativă + fișierul local', () => {
    const r = resolveMailStoragePath('/app/uploads/mail-attach/abc/0-poza.png', UPLOADS);
    assert.equal(r.key, 'mail-attach/abc/0-poza.png');
    assert.equal(r.legacyAbs, '/app/uploads/mail-attach/abc/0-poza.png');
  });

  it('absolut pe volumul vechi de prod → disc întâi, apoi mail-attach/<rest>', () => {
    const r = resolveMailStoragePath('/app/mail-attach/abc/0-poza.png', UPLOADS);
    assert.equal(r.key, 'mail-attach/abc/0-poza.png');
    assert.equal(r.legacyAbs, '/app/mail-attach/abc/0-poza.png');
  });

  it('absolut pe directorul vechi de dev → aceeași mapare', () => {
    const r = resolveMailStoragePath('/tmp/manelecadou-mail-attach/staging/id/f.png', UPLOADS);
    assert.equal(r.key, 'mail-attach/staging/id/f.png');
    assert.equal(r.legacyAbs, '/tmp/manelecadou-mail-attach/staging/id/f.png');
  });

  it('rădăcină veche dată explicit (alt stack, alt MAIL_ATTACH_DIR)', () => {
    const r = resolveMailStoragePath('/data/mail/abc/0-x.pdf', UPLOADS, ['/data/mail']);
    assert.equal(r.key, 'mail-attach/abc/0-x.pdf');
    assert.equal(r.legacyAbs, '/data/mail/abc/0-x.pdf');
  });

  it('absolut necunoscut → doar disc, nu inventăm chei în bucket', () => {
    const r = resolveMailStoragePath('/var/lib/altceva/x.pdf', UPLOADS);
    assert.equal(r.key, null);
    assert.equal(r.legacyAbs, '/var/lib/altceva/x.pdf');
  });

  it('path de URL /uploads/... → cheie, fără fișier local', () => {
    const r = resolveMailStoragePath('/uploads/mail-attach/abc/0-x.pdf', UPLOADS);
    assert.equal(r.key, 'mail-attach/abc/0-x.pdf');
    assert.equal(r.legacyAbs, null);
  });

  it('gol → nimic de deschis', () => {
    assert.deepEqual(resolveMailStoragePath('', UPLOADS), { key: null, legacyAbs: null });
    assert.deepEqual(resolveMailStoragePath('   ', UPLOADS), { key: null, legacyAbs: null });
  });

  it('idempotent: cheia deja migrată nu se mai transformă', () => {
    const once = resolveMailStoragePath('/app/mail-attach/abc/0-x.pdf', UPLOADS).key!;
    const twice = resolveMailStoragePath(once, UPLOADS).key;
    assert.equal(twice, once);
  });
});

describe('mailKey / safeMailName', () => {
  it('compune chei sub prefixul de mail, fără slash-uri duble', () => {
    assert.equal(mailKey('abc', '0-x.pdf'), 'mail-attach/abc/0-x.pdf');
    assert.equal(mailKey('/staging/', '/id/', 'f.png'), 'mail-attach/staging/id/f.png');
  });

  it('numele de fișier nu poate ieși din folder', () => {
    assert.equal(safeMailName('../../etc/passwd'), '.._.._etc_passwd');
    assert.equal(safeMailName(''), 'file');
    assert.equal(safeMailName('Ofertă finală.pdf'), 'Ofert__final_.pdf');
  });
});

describe('sanitizeMailMime', () => {
  it('forțează download binar pentru tipurile care se pot randa', () => {
    assert.equal(sanitizeMailMime('text/html'), 'application/octet-stream');
    assert.equal(sanitizeMailMime('image/svg+xml'), 'application/octet-stream');
    assert.equal(sanitizeMailMime('application/javascript'), 'application/octet-stream');
  });

  it('lasă tipurile inofensive neschimbate', () => {
    assert.equal(sanitizeMailMime('image/png'), 'image/png');
    assert.equal(sanitizeMailMime('application/pdf'), 'application/pdf');
    assert.equal(sanitizeMailMime('text/plain'), 'text/plain');
  });
});
