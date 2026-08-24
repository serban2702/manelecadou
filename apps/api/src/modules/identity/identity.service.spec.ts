import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FindOperator, type Repository } from 'typeorm';
import { IdentityService, type IdentifyDto } from './identity.service';
import { IdentityPerson } from './identity-person.entity';
import { IdentityVisitor } from './identity-visitor.entity';
import { GuestSession } from '../guest-sessions/guest-session.entity';
import type { Conversation } from '../chat/conversation.entity';
import type { ChatMessage } from '../chat/message.entity';
import type { SitesService } from '../sites/sites.service';
import type { SettingsService } from '../settings/settings.service';
import type { Site } from '../sites/site.entity';

/**
 * Scurgerea pe care o închide fișierul (audit 2026-08):
 *
 * `deviceKey` = screen + DPR + cores + deviceMemory + touch + timezone +
 * platform + colorDepth. Pe iOS `deviceMemory` și `hardwareConcurrency` lipsesc,
 * deci TOATE iPhone-urile de același model dintr-o țară dau aceeași cheie, iar
 * „IP compatibil" însemna /24 — un bloc întreg de operator mobil. Pe baza asta
 * serverul dădea înapoi guest-ul altui om: comenzile, versurile, pozele,
 * refacerile gratuite ale altuia.
 *
 * Acum singura adopție e „același `visitorId`, confirmat de `deviceKey`", și
 * doar guest-ul legat de acel rând de vizitator.
 */

const SITE = 'site-1';
const OTHER_SITE = 'site-2';

// --- repository fake --------------------------------------------------------

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const actual = row[key];
    if (expected instanceof FindOperator) {
      // singurul operator folosit de serviciu: MoreThan(dată)
      const bound = expected.value as unknown as Date;
      return actual instanceof Date && bound instanceof Date && actual > bound;
    }
    return actual === expected;
  });
}

class FakeRepo<T extends { id: string }> {
  readonly rows: T[] = [];

  constructor(private readonly prefix: string, seed: T[] = []) {
    this.rows.push(...seed);
  }

  create(patch: Partial<T>): T {
    return { ...(patch as T) };
  }

  async save(entity: T): Promise<T> {
    if (!entity.id) entity.id = nextId(this.prefix);
    const idx = this.rows.findIndex((r) => r.id === entity.id);
    if (idx >= 0) this.rows[idx] = entity;
    else this.rows.push(entity);
    return entity;
  }

  async findOne(opts: { where: Record<string, unknown> }): Promise<T | null> {
    return this.rows.find((r) => matches(r as Record<string, unknown>, opts.where)) ?? null;
  }

  async find(opts?: { where?: Record<string, unknown> }): Promise<T[]> {
    if (!opts?.where) return [...this.rows];
    return this.rows.filter((r) => matches(r as Record<string, unknown>, opts.where!));
  }

  async update(where: Record<string, unknown>, patch: Partial<T>): Promise<void> {
    for (const row of this.rows) {
      if (matches(row as Record<string, unknown>, where)) Object.assign(row, patch);
    }
  }

  async delete(where: Record<string, unknown>): Promise<void> {
    for (let i = this.rows.length - 1; i >= 0; i--) {
      if (matches(this.rows[i] as Record<string, unknown>, where)) this.rows.splice(i, 1);
    }
  }

  async count(): Promise<number> {
    return this.rows.length;
  }

  asRepo(): Repository<T> {
    return this as unknown as Repository<T>;
  }
}

// --- fixtures ---------------------------------------------------------------

function person(patch: Partial<IdentityPerson> = {}): IdentityPerson {
  return {
    id: nextId('person'),
    siteId: SITE,
    experienceSlug: 'classic',
    email: null,
    createdAt: new Date(),
    lastSeenAt: new Date(),
    ...patch,
  } as IdentityPerson;
}

function visitor(patch: Partial<IdentityVisitor> = {}): IdentityVisitor {
  return {
    id: nextId('visitor'),
    siteId: SITE,
    visitorId: nextId('fp'),
    deviceKey: 'iphone15-ro',
    personId: nextId('person'),
    guestId: null,
    lastIp: '86.120.10.4',
    userAgent: null,
    lastSeenAt: new Date(),
    ...patch,
  } as IdentityVisitor;
}

function guest(patch: Partial<GuestSession> = {}): GuestSession {
  return {
    id: nextId('guest'),
    siteId: SITE,
    userId: null,
    freeDemoUsed: false,
    email: null,
    personId: null,
    meta: null,
    createdAt: new Date(),
    lastSeenAt: new Date(),
    ...patch,
  } as GuestSession;
}

function makeSite(experienceConfig: Site['experienceConfig'] = null): Site {
  return { id: SITE, experienceConfig } as Site;
}

function build(opts: {
  persons?: IdentityPerson[];
  visitors?: IdentityVisitor[];
  guests?: GuestSession[];
  site?: Site | null;
  adoption?: string;
}) {
  const persons = new FakeRepo<IdentityPerson>('person', opts.persons ?? []);
  const visitors = new FakeRepo<IdentityVisitor>('visitor', opts.visitors ?? []);
  const guests = new FakeRepo<GuestSession>('guest', opts.guests ?? []);
  const convs = new FakeRepo<Conversation>('conv');
  const messages = new FakeRepo<ChatMessage>('msg');
  const sites = { findById: async () => opts.site ?? makeSite() } as unknown as SitesService;
  const settings = { get: async () => opts.adoption ?? '' } as unknown as SettingsService;
  const service = new IdentityService(
    persons.asRepo(),
    visitors.asRepo(),
    guests.asRepo(),
    convs.asRepo(),
    messages.asRepo(),
    sites,
    settings,
  );
  return { service, persons, visitors, guests };
}

function dto(patch: Partial<IdentifyDto> = {}): IdentifyDto {
  return { visitorId: 'fp-mine', deviceKey: 'iphone15-ro', ...patch };
}

// --- teste ------------------------------------------------------------------

describe('IdentityService.identify — adopția de guest', () => {
  it('NU adoptă între două persoane cu același deviceKey și IP în același /24', async () => {
    const victim = person({ experienceSlug: 'cadou' });
    const victimGuest = guest({ personId: victim.id });
    const victimVisitor = visitor({
      visitorId: 'fp-victima',
      deviceKey: 'iphone15-ro',
      personId: victim.id,
      guestId: victimGuest.id,
      lastIp: '86.120.10.4',
    });
    const { service, guests } = build({
      persons: [victim],
      visitors: [victimVisitor],
      guests: [victimGuest],
    });

    // alt om, același model de iPhone, același bloc /24 al operatorului
    const res = await service.identify(SITE, '86.120.10.99', dto({ visitorId: 'fp-strain' }));

    assert.equal(res.adoptedGuest, false);
    assert.equal(res.guestId, null);
    assert.notEqual(res.personId, victim.id);
    // guest-ul victimei rămâne al victimei
    assert.equal(guests.rows.find((g) => g.id === victimGuest.id)?.personId, victim.id);
  });

  it('NU adoptă nici când vine cu guest propriu — nu i se schimbă guest-ul cu al altuia', async () => {
    const victim = person();
    const victimGuest = guest({ personId: victim.id });
    const victimVisitor = visitor({
      visitorId: 'fp-victima',
      personId: victim.id,
      guestId: victimGuest.id,
      lastIp: '86.120.10.4',
    });
    const mine = guest();
    const { service } = build({
      persons: [victim],
      visitors: [victimVisitor],
      guests: [victimGuest, mine],
    });

    const res = await service.identify(SITE, '86.120.10.77', dto({ visitorId: 'fp-strain', guestId: mine.id }));

    assert.equal(res.adoptedGuest, false);
    assert.equal(res.guestId, mine.id);
  });

  it('adoptă pe potrivire exactă de visitorId (același browser, localStorage șters)', async () => {
    const me = person();
    const myGuest = guest({ personId: me.id });
    const myVisitor = visitor({
      visitorId: 'fp-eu',
      deviceKey: 'iphone15-ro',
      personId: me.id,
      guestId: myGuest.id,
    });
    const { service } = build({ persons: [me], visitors: [myVisitor], guests: [myGuest] });

    const res = await service.identify(SITE, '86.120.10.4', dto({ visitorId: 'fp-eu', guestId: null }));

    assert.equal(res.adoptedGuest, true);
    assert.equal(res.guestId, myGuest.id);
    assert.equal(res.personId, me.id);
  });

  it('deviceKey diferit pe același visitorId = semnal care nu confirmă → fără adopție', async () => {
    const me = person();
    const myGuest = guest({ personId: me.id });
    const myVisitor = visitor({ visitorId: 'fp-eu', deviceKey: 'iphone15-ro', personId: me.id, guestId: myGuest.id });
    const { service } = build({ persons: [me], visitors: [myVisitor], guests: [myGuest] });

    const res = await service.identify(SITE, '86.120.10.4', dto({ visitorId: 'fp-eu', deviceKey: 'pixel8-de' }));

    assert.equal(res.adoptedGuest, false);
    assert.equal(res.guestId, null);

    // și la a doua încercare: cheia veche nu se lasă rescrisă, altfel
    // nepotrivirea de acum ar deveni „confirmată" imediat.
    const again = await service.identify(SITE, '86.120.10.4', dto({ visitorId: 'fp-eu', deviceKey: 'pixel8-de' }));
    assert.equal(again.adoptedGuest, false);
    assert.equal(again.guestId, null);
  });

  it('IDENTITY_GUEST_ADOPTION=off oprește adopția și pe potrivirea sigură', async () => {
    const me = person();
    const myGuest = guest({ personId: me.id });
    const myVisitor = visitor({ visitorId: 'fp-eu', personId: me.id, guestId: myGuest.id });
    const { service } = build({
      persons: [me],
      visitors: [myVisitor],
      guests: [myGuest],
      adoption: 'off',
    });

    const res = await service.identify(SITE, '86.120.10.4', dto({ visitorId: 'fp-eu' }));

    assert.equal(res.adoptedGuest, false);
    assert.equal(res.guestId, null);
  });

  it('nu adoptă o sesiune revendicată de un cont (recuperarea se face prin login)', async () => {
    const me = person();
    const myGuest = guest({ personId: me.id, userId: 'user-1' });
    const myVisitor = visitor({ visitorId: 'fp-eu', personId: me.id, guestId: myGuest.id });
    const { service } = build({ persons: [me], visitors: [myVisitor], guests: [myGuest] });

    const res = await service.identify(SITE, '86.120.10.4', dto({ visitorId: 'fp-eu' }));

    assert.equal(res.adoptedGuest, false);
    assert.equal(res.guestId, null);
  });

  it('nu adoptă un guest de pe alt site', async () => {
    const me = person();
    const myGuest = guest({ personId: me.id, siteId: OTHER_SITE });
    const myVisitor = visitor({ visitorId: 'fp-eu', personId: me.id, guestId: myGuest.id });
    const { service } = build({ persons: [me], visitors: [myVisitor], guests: [myGuest] });

    const res = await service.identify(SITE, '86.120.10.4', dto({ visitorId: 'fp-eu' }));

    assert.equal(res.adoptedGuest, false);
    assert.equal(res.guestId, null);
  });

  it('emailul trimis la /identify nu mai revendică persoana (și guest-ul) altcuiva', async () => {
    const victim = person({ email: 'victima@example.com' });
    const victimGuest = guest({ personId: victim.id, email: 'victima@example.com' });
    const victimVisitor = visitor({ visitorId: 'fp-victima', personId: victim.id, guestId: victimGuest.id });
    const { service, persons } = build({
      persons: [victim],
      visitors: [victimVisitor],
      guests: [victimGuest],
    });

    const res = await service.identify(
      SITE,
      '5.5.5.5',
      dto({ visitorId: 'fp-atacator', deviceKey: 'alt-device', email: 'victima@example.com' }),
    );

    assert.equal(res.adoptedGuest, false);
    assert.equal(res.guestId, null);
    assert.notEqual(res.personId, victim.id);
    // persoana victimei nu a fost absorbită / rescrisă
    assert.equal(persons.rows.find((p) => p.id === victim.id)?.email, 'victima@example.com');
  });

  it('leagă guest-ul de rândul de vizitator, ca următoarea vizită să-l poată recupera', async () => {
    const mine = guest();
    const { service, visitors } = build({ guests: [mine] });

    const first = await service.identify(SITE, '86.120.10.4', dto({ visitorId: 'fp-eu', guestId: mine.id }));
    assert.equal(first.adoptedGuest, false);
    assert.equal(first.guestId, mine.id);
    assert.equal(visitors.rows.length, 1);
    assert.equal(visitors.rows[0].guestId, mine.id);

    // același browser, storage golit
    const second = await service.identify(SITE, '86.120.10.4', dto({ visitorId: 'fp-eu', guestId: null }));
    assert.equal(second.adoptedGuest, true);
    assert.equal(second.guestId, mine.id);
    assert.equal(visitors.rows.length, 1, 'nu creăm un rând nou pentru același visitorId');
  });
});

describe('IdentityService.identify — sugestia de variantă pe deviceKey', () => {
  const config = {
    defaultSlug: 'classic',
    items: { cadou: { enabled: true, utmRules: [] }, classic: { enabled: true, utmRules: [] } },
  } as Site['experienceConfig'];

  it('un singur candidat pe același dispozitiv → moștenește varianta', async () => {
    const p1 = person({ experienceSlug: 'cadou' });
    const v1 = visitor({ visitorId: 'fp-1', personId: p1.id, lastIp: '86.120.10.4' });
    const { service } = build({ persons: [p1], visitors: [v1], site: makeSite(config) });

    const res = await service.identify(SITE, '86.120.10.55', dto({ visitorId: 'fp-nou' }));

    assert.equal(res.experienceSlug, 'cadou');
  });

  it('mai mulți candidați → ambiguu, chiar dacă niciunul nu e din ultimele 24h', async () => {
    const old = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const p1 = person({ experienceSlug: 'cadou', lastSeenAt: old });
    const p2 = person({ experienceSlug: 'classic', lastSeenAt: old });
    const v1 = visitor({ visitorId: 'fp-1', personId: p1.id, lastIp: '86.120.10.4' });
    const v2 = visitor({ visitorId: 'fp-2', personId: p2.id, lastIp: '86.120.10.9' });
    const { service } = build({ persons: [p1, p2], visitors: [v1, v2], site: makeSite(config) });

    const res = await service.identify(SITE, '86.120.10.55', dto({ visitorId: 'fp-nou' }));

    // fără sugestie → default-ul site-ului, nu varianta primului candidat
    assert.equal(res.experienceSlug, 'classic');
  });
});

describe('IdentityService.identify — vizitator efemer', () => {
  it('nu scrie rânduri de identitate când clientul nu poate păstra nimic', async () => {
    const { service, persons, visitors } = build({});

    const res = await service.identify(
      SITE,
      '86.120.10.4',
      dto({ visitorId: 'nofp-unic-per-pageload', visitorIdSource: 'ephemeral' }),
    );

    assert.equal(persons.rows.length, 0);
    assert.equal(visitors.rows.length, 0);
    assert.equal(res.personId, null);
    assert.equal(res.adoptedGuest, false);
    assert.equal(res.experienceSlug, 'classic');
  });

  it('păstrează guest-ul pe care clientul îl are deja', async () => {
    const mine = guest();
    const { service, visitors } = build({ guests: [mine] });

    const res = await service.identify(
      SITE,
      '86.120.10.4',
      dto({ visitorId: 'nofp-unic', visitorIdSource: 'ephemeral', guestId: mine.id }),
    );

    assert.equal(res.guestId, mine.id);
    assert.equal(visitors.rows.length, 0);
  });

  it('un visitorId stabil (local) scrie un singur rând, nu unul per vizită', async () => {
    const { service, visitors } = build({});

    await service.identify(SITE, '86.120.10.4', dto({ visitorId: 'nofp-uuid', visitorIdSource: 'local' }));
    await service.identify(SITE, '86.120.10.4', dto({ visitorId: 'nofp-uuid', visitorIdSource: 'local' }));

    assert.equal(visitors.rows.length, 1);
  });
});
