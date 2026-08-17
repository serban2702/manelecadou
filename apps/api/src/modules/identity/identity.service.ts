import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { IdentityPerson } from './identity-person.entity';
import { IdentityVisitor } from './identity-visitor.entity';
import { GuestSession } from '../guest-sessions/guest-session.entity';
import { Conversation } from '../chat/conversation.entity';
import { ChatMessage } from '../chat/message.entity';
import { SitesService } from '../sites/sites.service';
import { resolveExperienceSlug } from '../experiences/assign';
import { DEFAULT_EXPERIENCE_SLUG } from '../experiences/catalog';
import type { AssignReason } from '../experiences/types';
import { ipsCompatible } from './device-key';

const DEVICE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const AMBIGUOUS_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface IdentifyDto {
  visitorId: string;
  deviceKey: string;
  guestId?: string | null;
  email?: string | null;
  uiParam?: string | null;
  cookieSlug?: string | null;
  utm?: { source?: string | null; campaign?: string | null; content?: string | null } | null;
}

export interface IdentifyResult {
  personId: string;
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
  ) {}

  async identify(siteId: string, ip: string | null, dto: IdentifyDto, userAgent?: string | null): Promise<IdentifyResult> {
    const visitorId = (dto.visitorId ?? '').trim().slice(0, 64);
    const deviceKey = (dto.deviceKey ?? '').trim().slice(0, 64);
    if (!visitorId || !deviceKey) {
      throw new Error('visitorId and deviceKey are required');
    }
    const email = normEmail(dto.email);
    const guest = dto.guestId ? await this.guests.findOne({ where: { id: dto.guestId } }) : null;

    let visitor = await this.visitors.findOne({ where: { siteId, visitorId } });
    let person: IdentityPerson | null = null;
    let deviceAmbiguous = false;
    let deviceExperienceHint: string | null = null;

    if (visitor?.personId) {
      person = await this.persons.findOne({ where: { id: visitor.personId, siteId } });
    }
    if (!person && guest?.personId) {
      person = await this.persons.findOne({ where: { id: guest.personId, siteId } });
    }
    if (!person && email) {
      person = await this.persons.findOne({ where: { siteId, email } });
    }
    if (!person) {
      const device = await this.findDevicePerson(siteId, deviceKey, ip, email);
      person = device.person;
      deviceAmbiguous = device.ambiguous;
      deviceExperienceHint = device.experienceHint;
    }

    if (!person) {
      const site = await this.sites.findById(siteId);
      const assigned = resolveExperienceSlug({
        uiParam: dto.uiParam,
        cookieSlug: dto.cookieSlug,
        personSlug: deviceExperienceHint,
        utm: dto.utm,
        config: site?.experienceConfig ?? null,
      });
      person = await this.persons.save(
        this.persons.create({
          siteId,
          experienceSlug: assigned.slug,
          email,
        }),
      );
    } else if (email && !person.email) {
      person.email = email;
    } else if (email && person.email && person.email !== email) {
      // conflict — don't overwrite; treat as a different person only if we got here via visitor/guest
    }

    if (email && person.email && person.email === email) {
      await this.mergePersonsByEmail(siteId, person, email);
      const refreshed = await this.persons.findOne({ where: { id: person.id } });
      if (refreshed) person = refreshed;
    }

    const site = await this.sites.findById(siteId);
    const assigned = resolveExperienceSlug({
      uiParam: dto.uiParam,
      cookieSlug: dto.cookieSlug,
      personSlug: person.experienceSlug,
      utm: dto.utm,
      config: site?.experienceConfig ?? null,
    });
    // ?ui= always rewrites person slug. Otherwise keep existing person slug.
    if (assigned.reason === 'url' || !person.experienceSlug) {
      person.experienceSlug = assigned.slug;
    }
    person.lastSeenAt = new Date();
    await this.persons.save(person);

    if (!visitor) {
      visitor = this.visitors.create({
        siteId,
        visitorId,
        deviceKey,
        personId: person.id,
        guestId: guest?.id ?? null,
        lastIp: ip,
        userAgent: userAgent?.slice(0, 512) ?? null,
      });
    } else {
      visitor.personId = person.id;
      visitor.deviceKey = deviceKey;
      visitor.lastIp = ip;
      visitor.userAgent = userAgent?.slice(0, 512) ?? null;
      if (guest?.id) visitor.guestId = guest.id;
    }
    await this.visitors.save(visitor);

    let adoptedGuest = false;
    let guestId = guest?.id ?? null;
    if (guest && guest.siteId && guest.siteId !== siteId) {
      guestId = null;
    } else if (guest) {
      guest.personId = person.id;
      if (email && !guest.email) guest.email = email;
      await this.guests.save(guest);
      await this.attachConversationPerson(guest.id, person.id, siteId);
    }

    if (!deviceAmbiguous) {
      const canonical = await this.canonicalGuestId(person.id);
      if (canonical && guestId && canonical !== guestId) {
        guestId = canonical;
        adoptedGuest = true;
        if (visitor) {
          visitor.guestId = canonical;
          await this.visitors.save(visitor);
        }
      } else if (canonical && !guestId) {
        guestId = canonical;
      }
    }

    const reason: AssignReason = assigned.reason === 'fingerprint' && deviceExperienceHint
      ? 'device'
      : assigned.reason;

    return {
      personId: person.id,
      guestId,
      experienceSlug: person.experienceSlug || DEFAULT_EXPERIENCE_SLUG,
      adoptedGuest,
      reason,
    };
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

  private async findDevicePerson(
    siteId: string,
    deviceKey: string,
    ip: string | null,
    email: string | null,
  ): Promise<{ person: IdentityPerson | null; ambiguous: boolean; experienceHint: string | null }> {
    const since = new Date(Date.now() - DEVICE_WINDOW_MS);
    const rows = await this.visitors.find({
      where: { siteId, deviceKey, lastSeenAt: MoreThan(since) },
      order: { lastSeenAt: 'DESC' },
    });
    const compatible = rows.filter((v) => ipsCompatible(v.lastIp, ip));
    if (compatible.length === 0) return { person: null, ambiguous: false, experienceHint: null };

    const personIds = [...new Set(compatible.map((v) => v.personId))];
    const candidates: IdentityPerson[] = [];
    for (const id of personIds) {
      const p = await this.persons.findOne({ where: { id, siteId } });
      if (!p) continue;
      if (email && p.email && p.email !== email) continue;
      candidates.push(p);
    }
    if (candidates.length === 0) return { person: null, ambiguous: false, experienceHint: null };

    const recentCut = new Date(Date.now() - AMBIGUOUS_WINDOW_MS);
    const recent = candidates.filter((p) => p.lastSeenAt && p.lastSeenAt >= recentCut);
    const pool = recent.length > 0 ? recent : candidates;
    const hint = pool[0]?.experienceSlug ?? null;
    if (pool.length > 1 && recent.length > 1) {
      return { person: null, ambiguous: true, experienceHint: hint };
    }
    return { person: pool[0], ambiguous: false, experienceHint: hint };
  }

  private async mergePersonsByEmail(siteId: string, keeper: IdentityPerson, email: string): Promise<void> {
    const others = await this.persons.find({ where: { siteId, email } });
    for (const other of others) {
      if (other.id === keeper.id) continue;
      await this.absorbPerson(keeper, other);
    }
    await this.mergeConversationsForPerson(keeper.id, siteId);
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

  private async canonicalGuestId(personId: string): Promise<string | null> {
    const guests = await this.guests.find({
      where: { personId },
      order: { createdAt: 'ASC' },
    });
    return guests[0]?.id ?? null;
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
