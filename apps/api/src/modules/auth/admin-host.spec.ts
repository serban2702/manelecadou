import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isAdminHost } from './admin-host';

const ADMIN = 'https://admin.manelecadou.ro';

describe('isAdminHost', () => {
  it('acceptă host-ul din ADMIN_URL', () => {
    assert.equal(isAdminHost('admin.manelecadou.ro', ADMIN), true);
    assert.equal(isAdminHost('ADMIN.MANELECADOU.RO', ADMIN), true);
  });

  it('acceptă orice host `admin.` — routerul servește admin-ul pe toate', () => {
    assert.equal(isAdminHost('admin.doroparaggelia.gr', ADMIN), true);
    assert.equal(isAdminHost('admin.test.manelecadou.ro', ADMIN), true);
  });

  it('respinge domeniile publice ale tenanților', () => {
    for (const h of ['manelecadou.ro', 'www.manelecadou.ro', 'chalgapodarok.bg', 'doroparaggelia.gr']) {
      assert.equal(isAdminHost(h, ADMIN), false, h);
    }
  });

  it('respinge host-uri care doar seamănă a admin', () => {
    // Fără punct după „admin" nu e subdomeniul nostru, ci un domeniu străin.
    assert.equal(isAdminHost('admin-manelecadou.ro', ADMIN), false);
    assert.equal(isAdminHost('notadmin.manelecadou.ro', ADMIN), false);
    assert.equal(isAdminHost('manelecadou.ro.admin.evil.com', ADMIN), false);
  });

  it('separă site-ul de admin în dev, unde ambele sunt pe localhost', () => {
    const devAdmin = 'http://localhost:1505';
    assert.equal(isAdminHost('localhost:1505', devAdmin), true);
    assert.equal(isAdminHost('localhost:1500', devAdmin), false);
    assert.equal(isAdminHost('localhost', devAdmin), false);
  });

  it('respinge când lipsește host-ul sau ADMIN_URL', () => {
    assert.equal(isAdminHost(null, ADMIN), false);
    assert.equal(isAdminHost('', ADMIN), false);
    assert.equal(isAdminHost('manelecadou.ro', undefined), false);
    assert.equal(isAdminHost('manelecadou.ro', 'nu-e-un-url'), false);
    // Chiar și fără ADMIN_URL, host-urile `admin.` rămân valide.
    assert.equal(isAdminHost('admin.manelecadou.ro', undefined), true);
  });
});
