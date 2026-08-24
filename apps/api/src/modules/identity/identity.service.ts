import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { IdentityPerson } from './identity-person.entity';
import { IdentityVisitor } from './identity-visitor.entity';
import { GuestSession } from '../guest-sessions/guest-session.entity';
import { Conversation } from '../chat/conversation.entity';
import { ChatMessage } from '../chat/message.entity';
import { SitesService } from '../sites/sites.service';
import { SettingsService } from '../settings/settings.service';
import { resolveExperienceSlug } from '../experiences/assign';
import { DEFAULT_EXPERIENCE_SLUG } from '../experiences/catalog';
import type { AssignReason } from '../experiences/types';
import { ipsCompatible } from './device-key';

/** Cât timp un `deviceKey` mai contează — DOAR pentru varianta de UI. */
const DEVICE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Cât de stabil e `visitorId`-ul primit de la client:
 * - `fingerprint` — amprentă FingerprintJS (persistă între pageload-uri);
 * - `local` — id aleator generat de noi și ținut în localStorage/cookie, când
 *   amprenta pică (in-app browsers iOS). Nu se ciocnește niciodată: e uuid;
 * - `ephemeral` — clientul n-a putut păstra nimic, deci id-ul trăiește un
 *   singur pageload. Pentru el NU scriem în `identity_*` — altfel tabelele se
 *   umplu cu un rând la fiecare afișare de pagină (bug-ul `nofp-<timestamp>`).
 *
 * Clienții vechi nu trimit câmpul → tratați ca `fingerprint`.
 */
export type VisitorIdSource = 'fingerprint' | 'local' | 'ephemeral';

/**
 * Comutatorul de siguranță pentru „adopție de guest" (serverul îi dă
 * clientului un guestId pe care clientul NU l-a trimis):
 * - `visitor` (default) — doar pe potrivire exactă de `visitorId`, confirmată
 *   de `deviceKey`, și doar guest-ul legat de acel rând `identity_visitors`;
 * - `off` — niciodată; fiecare client rămâne cu guest-ul pe care îl are.
 *
 * Setare: `IDENTITY_GUEST_ADOPTION` (admin → Avansat). Se schimbă fără deploy.
 */
export type GuestAdoptionMode = 'visitor' | 'off';

/** Cum am găsit persoana. Doar `visitor` e o dovadă de continuitate a browserului. */
type PersonMatch = 'visitor' | 'guest' | 'none';

export interface IdentifyDto {
  visitorId: string;
  deviceKey: string;
  guestId?: string | null;
  /**
   * @deprecated IGNORAT. Endpoint-ul e public și neautentificat: dacă am căuta
   * persoana după email, oricine ar putea revendica persoana altcuiva (și,
   * prin merge, guest-urile ei) doar tastându-i adresa. Legarea de email se
   * face exclusiv prin `linkEmail`, pe sesiunea proprie de guest.
   */
  email?: string | null;
  uiParam?: string | null;
  cookieSlug?: string | null;
  /** Vezi `VisitorIdSource`. Lipsă = `fingerprint` (clienți vechi). */
  visitorIdSource?: string | null;
  utm?: { source?: string | null; campaign?: string | null; content?: string | null } | null;
}

export interface IdentifyResult {
  /** `null` doar pe request-uri efemere, unde nu creăm rânduri de identitate. */
  personId: string | null;
  guestId: string | null;
  experienceSlug: string;
  adoptedGuest: boolean;
  reason: AssignReason;
}

function normEmail(email?: string | null): string | null {
  if (!email) return null;
  const v = email.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return null;
  return v;
}

export function normalizeVisitorSource(raw?: string | null): VisitorIdSource {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'ephemeral') return 'ephemeral';
  if (v === 'local') return 'local';
  return 'fingerprint';
}

export function parseAdoptionMode(raw?: string | null): GuestAdoptionMode {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'off' || v === 'false' || v === '0' || v === 'none') return 'off';
  return 'visitor';
}

@Injectable()
export class IdentityService {
  private readonly logger = new Logger('IdentityService');

  constructor(
    @InjectRepository(IdentityPerson) private readonly persons: Repository<IdentityPerson>,
    @InjectRepository(IdentityVisitor) private readonly visitors: Repository<IdentityVisitor>,
    @InjectRepository(GuestSession) private readonly guests: Repository<GuestSession>,
    @InjectRepository(Conversation) private readonly convs: Repository<Conversation>,
    @InjectRepository(ChatMessage) private readonly messages: Repository<ChatMessage>,
    private readonly sites: SitesService,
    private readonly settings: SettingsService,
  ) {}

  async identify(siteId: string, ip: string | null, dto: IdentifyDto, userAgent?: string | null): Promise<IdentifyResult> {
    const visitorId = (dto.visitorId ?? '').trim().slice(0, 64);
    const deviceKey = (dto.deviceKey ?? '').trim().slice(0, 64);
    if (!visitorId || !deviceKey) {
      throw new Error('visitorId and deviceKey are required');
    }
    const source = normalizeVisitorSource(dto.visitorIdSource);
    const ephemeral = source === 'ephemeral';

    // Guest-ul pe care îl ARE deja clientul. Unul de pe alt site nu contează.
    const raw = dto.guestId ? await this.guests.findOne({ where: { id: dto.guestId } }) : null;
    const heldGuest = raw && raw.siteId && raw.siteId !== siteId ? null : raw;

    let visitor = ephemeral ? null : await this.visitors.findOne({ where: { siteId, visitorId } });
    // Guest-ul legat de ACEST rând de vizitator (același browser, alt pageload)
    // și cheia de dispozitiv de la vizita trecută. Le citim înainte de orice
    // scriere: guest-ul legat e singura bază de adopție acceptată, iar cheia
    // veche e cea care confirmă potrivirea (după upsert ar fi mereu egală).
    const boundGuestId = visitor?.guestId ?? null;
    const boundDeviceKey = (visitor?.deviceKey ?? '').trim();

    let person: IdentityPerson | null = null;
    let matchedBy: PersonMatch = 'none';
    if (visitor?.personId) {
      const p = await this.persons.findOne({ where: { id: visitor.personId, siteId } });
      if (p) {
        person = p;
        matchedBy = 'visitor';
      }
    }
    if (!person && heldGuest?.personId) {
      const p = await this.persons.findOne({ where: { id: heldGuest.personId, siteId } });
      if (p) {
        person = p;
        matchedBy = 'guest';
      }
    }
    // NU mai există căutare de persoană după `deviceKey` sau după email: ambele
    // se pot ciocni / revendica și ar lega vizitatorul de persoana altui om.
    const deviceHint = person ? null : await this.findDeviceExperienceHint(siteId, deviceKey, ip);

    const site = await this.sites.findById(siteId);
    // Varianta pentru un om nou: `deviceHint` e DOAR sugestie de UI (același
    // model de telefon a văzut design-ul X), niciodată identitate.
    const forNewPerson = resolveExperienceSlug({
      uiParam: dto.uiParam,
      cookieSlug: dto.cookieSlug,
      personSlug: deviceHint,
      utm: dto.utm,
      config: site?.experienceConfig ?? null,
    });
    // Sticky UI = cookie / ?ui= / UTM. Fingerprint nu suprascrie default-ul din
    // admin (incognito tot are același deviceKey).
    const assigned = resolveExperienceSlug({
      uiParam: dto.uiParam,
      cookieSlug: dto.cookieSlug,
      utm: dto.utm,
      config: site?.experienceConfig ?? null,
    });

    if (!person && !ephemeral) {
      person = await this.persons.save(
        this.persons.create({
          siteId,
          experienceSlug: forNewPerson.slug,
          email: null,
        }),
      );
    }

    if (person) {
      if (
        assigned.reason === 'url' ||
        assigned.reason === 'utm' ||
        assigned.reason === 'cookie' ||
        !person.experienceSlug
      ) {
        person.experienceSlug = assigned.slug;
      }
      person.lastSeenAt = new Date();
      await this.persons.save(person);
    }

    if (!ephemeral && person) {
      if (!visitor) {
        visitor = this.visitors.create({
          siteId,
          visitorId,
          deviceKey,
          personId: person.id,
          guestId: heldGuest?.id ?? null,
          lastIp: ip,
          userAgent: userAgent?.slice(0, 512) ?? null,
        });
      } else {
        visitor.personId = person.id;
        // Nu rescriem o cheie de dispozitiv deja cunoscută cu una diferită: ea e
        // martorul care confirmă adopțiile viitoare. Dacă s-ar rescrie, o
        // nepotrivire suspectă azi ar deveni „confirmată" la request-ul următor.
        // Un dispozitiv chiar schimbat schimbă oricum și amprenta, deci vine cu
        // alt `visitorId` și alt rând.
        if (!visitor.deviceKey) visitor.deviceKey = deviceKey;
        visitor.lastIp = ip;
        visitor.userAgent = userAgent?.slice(0, 512) ?? null;
      }
      await this.visitors.save(visitor);
    }

    let guestId = heldGuest?.id ?? null;
    if (heldGuest && person) {
      heldGuest.personId = person.id;
      await this.guests.save(heldGuest);
      await this.attachConversationPerson(heldGuest.id, person.id, siteId);
    }

    const adoptedGuest = ephemeral
      ? false
      : await this.maybeAdoptGuest({
          siteId,
          visitor,
          boundGuestId,
          boundDeviceKey,
          heldGuestId: guestId,
          incomingDeviceKey: deviceKey,
          matchedBy,
          source,
        });
    if (adoptedGuest && boundGuestId) guestId = boundGuestId;

    // Legăm guest-ul curent de rândul de vizitator doar dacă nu era deja legat
    // altul: legătura veche e mai valoroasă (ea repară un localStorage șters).
    if (visitor && guestId && !visitor.guestId) {
      visitor.guestId = guestId;
      await this.visitors.save(visitor);
    }

    const reason: AssignReason = assigned.reason === 'fingerprint' && deviceHint ? 'device' : assigned.reason;

    return {
      personId: person?.id ?? null,
      guestId,
      experienceSlug: person?.experienceSlug || forNewPerson.slug || DEFAULT_EXPERIENCE_SLUG,
      adoptedGuest,
      reason,
    };
  }

  /**
   * Singura formă de adopție rămasă: guest-ul legat de ACELAȘI `visitorId`
   * (rând `identity_visitors`), cu `deviceKey` care confirmă potrivirea.
   *
   * Ce NU mai adoptăm, și de ce:
   * - pe `deviceKey` — se ciocnește (pe iOS `deviceMemory` și
   *   `hardwareConcurrency` lipsesc, deci toate iPhone-urile de același model
   *   dau aceeași cheie), iar „IP compatibil" înseamnă /24, adică un întreg
   *   bloc de operator mobil;
   * - pe persoana găsită după email — endpoint public, oricine ar revendica;
   * - guest-ul „cel mai vechi al persoanei" — persoanele se pot uni (merge pe
   *   email), deci ar putea ajunge să conțină guest-uri de la doi oameni.
   */
  private async maybeAdoptGuest(args: {
    siteId: string;
    visitor: IdentityVisitor | null;
    boundGuestId: string | null;
    boundDeviceKey: string;
    heldGuestId: string | null;
    incomingDeviceKey: string;
    matchedBy: PersonMatch;
    source: VisitorIdSource;
  }): Promise<boolean> {
    const { siteId, visitor, boundGuestId, boundDeviceKey, heldGuestId, incomingDeviceKey, matchedBy } = args;
    if (!visitor || !boundGuestId || boundGuestId === heldGuestId) return false;
    if (matchedBy !== 'visitor') return false;

    const mode = await this.adoptionMode();
    if (mode === 'off') {
      this.logger.warn(`adopție refuzată (IDENTITY_GUEST_ADOPTION=off): person=${visitor.personId} guest=${boundGuestId}`);
      return false;
    }

    // `deviceKey` = semnal secundar care ÎNTĂREȘTE potrivirea de visitorId.
    // Rândurile vechi pot avea cheia goală → nu pedepsim, doar nu confirmăm.
    if (boundDeviceKey && boundDeviceKey !== incomingDeviceKey) {
      this.logger.warn(
        `adopție refuzată (deviceKey diferit pe același visitorId): person=${visitor.personId} guest=${boundGuestId} site=${siteId}`,
      );
      return false;
    }

    const candidate = await this.guests.findOne({ where: { id: boundGuestId } });
    if (!candidate) return false;
    if (candidate.siteId && candidate.siteId !== siteId) {
      this.logger.warn(`adopție refuzată (guest de pe alt site): guest=${boundGuestId} site=${siteId}`);
      return false;
    }
    if (candidate.userId) {
      // Sesiunea e revendicată de un cont: recuperarea se face prin login
      // (magic link), nu pe baza unui id trimis de client.
      this.logger.warn(`adopție refuzată (guest legat de cont): guest=${boundGuestId} user=${candidate.userId}`);
      return false;
    }

    this.logger.log(
      `adopție guest: person=${visitor.personId} guest=${boundGuestId} motiv=visitorId+deviceKey sursă=${args.source} site=${siteId}`,
    );
    return true;
  }

  private async adoptionMode(): Promise<GuestAdoptionMode> {
    try {
      return parseAdoptionMode(await this.settings.get('IDENTITY_GUEST_ADOPTION'));
    } catch {
      return 'visitor';
    }
  }

  /** Called when a guest types an email (wizard / chat). Merges persons + chats. */
  async linkEmail(siteId: string, guestId: string, rawEmail: string): Promise<void> {
    const email = normEmail(rawEmail);
    if (!email) return;
    const guest = await this.guests.findOne({ where: { id: guestId } });
    if (!guest) return;
    let person = guest.personId
      ? await this.persons.findOne({ where: { id: guest.personId } })
      : null;
    const byEmail = await this.persons.findOne({ where: { siteId, email } });
    if (byEmail && person && byEmail.id !== person.id) {
      await this.absorbPerson(byEmail, person);
      person = byEmail;
    } else if (byEmail) {
      person = byEmail;
    } else if (person) {
      if (!person.email) {
        person.email = email;
        await this.persons.save(person);
      }
    } else {
      person = await this.persons.save(
        this.persons.create({
          siteId,
          experienceSlug: DEFAULT_EXPERIENCE_SLUG,
          email,
        }),
      );
    }
    guest.personId = person.id;
    guest.email = email;
    await this.guests.save(guest);
    await this.attachConversationPerson(guest.id, person.id, siteId);
    await this.mergeConversationsForPerson(person.id, siteId);
  }

  /**
   * Sugestie de VARIANTĂ DE UI (nu identitate) pentru un om pe care nu-l
   * cunoaștem: dacă de pe același model de dispozitiv, din același /24, s-a
   * intrat recent pe design-ul X, îi arătăm tot X — ca incognito-ul să nu sară
   * de la un design la altul. Nu întoarce niciodată o persoană.
   *
   * Ambiguu = mai mulți candidați, indiferent cât de recenți: atunci nu avem ce
   * sugera și lăsăm regulile normale (cookie / UTM / default de site).
   */
  private async findDeviceExperienceHint(
    siteId: string,
    deviceKey: string,
    ip: string | null,
  ): Promise<string | null> {
    const since = new Date(Date.now() - DEVICE_WINDOW_MS);
    const rows = await this.visitors.find({
      where: { siteId, deviceKey, lastSeenAt: MoreThan(since) },
      order: { lastSeenAt: 'DESC' },
    });
    const compatible = rows.filter((v) => ipsCompatible(v.lastIp, ip));
    if (compatible.length === 0) return null;

    const personIds = [...new Set(compatible.map((v) => v.personId))];
    const candidates: IdentityPerson[] = [];
    for (const id of personIds) {
      const p = await this.persons.findOne({ where: { id, siteId } });
      if (p) candidates.push(p);
    }
    if (candidates.length !== 1) return null;
    return candidates[0].experienceSlug ?? null;
  }

  private async absorbPerson(keeper: IdentityPerson, other: IdentityPerson): Promise<void> {
    await this.visitors.update({ personId: other.id }, { personId: keeper.id });
    await this.guests.update({ personId: other.id }, { personId: keeper.id });
    await this.convs.update({ personId: other.id }, { personId: keeper.id });
    if (!keeper.email && other.email) keeper.email = other.email;
    if (keeper.experienceSlug === DEFAULT_EXPERIENCE_SLUG && other.experienceSlug) {
      keeper.experienceSlug = other.experienceSlug;
    }
    await this.persons.save(keeper);
    await this.persons.delete({ id: other.id });
  }

  private async attachConversationPerson(guestId: string, personId: string, siteId: string): Promise<void> {
    const conv = await this.convs.findOne({ where: { guestId, siteId } });
    if (!conv) return;
    if (!conv.personId) {
      conv.personId = personId;
      await this.convs.save(conv);
    }
  }

  private async mergeConversationsForPerson(personId: string, siteId: string): Promise<void> {
    const convs = await this.convs.find({
      where: { personId, siteId },
      order: { createdAt: 'ASC' },
    });
    const live = convs.filter((c) => !c.mergedIntoConversationId);
    if (live.length < 2) return;

    const scored: Array<{ c: Conversation; n: number }> = [];
    for (const c of live) {
      const n = await this.messages.count({ where: { conversationId: c.id } });
      scored.push({ c, n });
    }
    scored.sort((a, b) => b.n - a.n || a.c.createdAt.getTime() - b.c.createdAt.getTime());
    const keeper = scored[0].c;
    for (const { c } of scored.slice(1)) {
      c.mergedIntoConversationId = keeper.id;
      await this.convs.save(c);
    }
  }
}
