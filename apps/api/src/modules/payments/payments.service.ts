import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';

import { Payment } from './payment.entity';
import { PREMIUM_EXTRA_CENTS } from './pricing';
import { normalizeTier, PackageTier } from './packages';
import { resolveSitePackage } from '../experiences/package-resolve';
import type { ResolvedExperiencePackage } from '../experiences/types';
import { PromoService } from '../promo/promo.service';
import { GiftCodesService } from '../gift-codes/gift-codes.service';
import { GiftTier, TIER_PRICES_RON } from '../gift-codes/gift-code.entity';
import { Site } from '../sites/site.entity';
import { SitesService } from '../sites/sites.service';
import { SettingsService } from '../settings/settings.service';
import { GenerationsService } from '../generations/generations.service';
import { CreateGenerationDto } from '../generations/dto/create-generation.dto';
import { TiktokEventsService } from '../tiktok/tiktok-events.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { PaymentAttributionService } from '../analytics/payment-attribution.service';
import { inferBuyerGender } from '../analytics/gender-infer';
import { MetaCapiService } from '../meta-capi/meta-capi.service';
import { FxRateService } from '../fx/fx-rate.service';
import {
  productName as i18nProductName,
  dedicationDescription as i18nDedicDesc,
  giftProductName as i18nGiftProductName,
  giftDescription as i18nGiftDesc,
  stripeUiLocale,
} from './stripe-i18n';

interface CheckoutInput {
  userId: string | null;
  guestId: string | null;
  generationId?: string;
  tipAmount?: number;
  premium?: boolean;
  /**
   * Tier-ul pachetului (model nou). Când e setat, totalul = prețul pachetului
   * (`resolvedPackage`, cu override per-site și per-interfață) și se IGNORĂ tip/premium.
   */
  packageTier?: PackageTier;
  promoCode?: string;
  email?: string;
  site: Site;
  /**
   * Suprascrie suma calculată din site pricing. Folosit de chat admin payment
   * links unde admin alege liber prețul (ex. 5 RON pentru un caz special).
   * În cents. Dacă e setat, NU se aplică tipSurcharge sau premiumExtra.
   * Min 50 cents (limita Stripe).
   */
  overrideAmount?: number;
  /** Suprascrie valuta din site (opțional). 3-letter ISO. */
  overrideCurrency?: string;
  /** Descriere custom pentru produsul Stripe (opțional). */
  overrideProductName?: string;
  /**
   * Generation existentă care va fi deblocată la plata acestui checkout
   * (flux demo + plată unlock din chat). Diferit de `generationId` care
   * marchează „creează full după plată". Aici generation există deja
   * (type='demo'), iar webhook-ul va seta paidUnlocked=true.
   */
  unlockGenerationId?: string;
  experienceSlug?: string | null;
  upgradeGenerationId?: string;
  targetTier?: PackageTier;
  /** Refacere plătită pe o manea deja livrată (15 lei). Nu deblochează o comandă nouă. */
  remakeForGenerationId?: string;
  remakeNotes?: string;

  // ============== Meta Pixel attribution ==============
  // Capturate la creare-checkout din controller (cookies + headers).
  // Persistate pe Payment.* și folosite la webhook Purchase ca să trimitem
  // un eveniment CAPI complet (EMQ ~8+). Fără ele Meta nu poate atribui plata
  // la click-ul Facebook → ROAS raportat scade artificial.
  fbp?: string | null;
  fbc?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;

  // ============== Atribuire trafic ==============
  // sessionKey/visitorId din tracker-ul de analytics (sessionStorage/localStorage),
  // trimise de web în headerele requestului de checkout. Persistate pe Payment.*
  // pentru atribuire 100% precisă pe surse/campanii în dashboard-ul de marketing.
  sessionKey?: string | null;
  visitorId?: string | null;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('PaymentsService');
  // Stripe instance lazy — re-created when STRIPE_SECRET_KEY changes in admin settings.
  private stripeInstance: Stripe | null = null;
  private lastStripeKey: string | null = null;

  constructor(
    @InjectRepository(Payment) private readonly repo: Repository<Payment>,
    private readonly config: ConfigService,
    private readonly promo: PromoService,
    @Inject(forwardRef(() => GiftCodesService))
    private readonly giftCodes: GiftCodesService,
    private readonly sites: SitesService,
    private readonly settings: SettingsService,
    @Inject(forwardRef(() => GenerationsService))
    private readonly generations: GenerationsService,
    private readonly tiktok: TiktokEventsService,
    private readonly analytics: AnalyticsService,
    private readonly attribution: PaymentAttributionService,
    private readonly moduleRef: ModuleRef,
    private readonly metaCapi: MetaCapiService,
    private readonly fx: FxRateService,
  ) {}

  /** Snapshot de atribuire + câmpurile de pe Payment, gata de `repo.create`. */
  private async attributionFields(input: {
    siteId: string | null;
    createdAt?: Date;
    userId?: string | null;
    guestId?: string | null;
    ipAddress?: string | null;
    sessionKey?: string | null;
    visitorId?: string | null;
  }) {
    return this.attribution.resolve({
      siteId: input.siteId,
      createdAt: input.createdAt ?? new Date(),
      userId: input.userId ?? null,
      guestId: input.guestId ?? null,
      ipAddress: input.ipAddress ?? null,
      sessionKey: input.sessionKey ?? null,
      visitorId: input.visitorId ?? null,
    });
  }

  /**
   * Când userul apasă „Plătește" pe un link din chat, request-ul e din browser —
   * avem cookies _fbp/_fbc + sessionKey. Le scriem pe plata deja creată server-side
   * (încă pending) și re-snapshot-uim campania. Nu atingem plățile deja paid.
   */
  async attachBrowserContext(
    paymentId: string,
    ctx: {
      fbp?: string | null;
      fbc?: string | null;
      sessionKey?: string | null;
      visitorId?: string | null;
      ipAddress?: string | null;
      userAgent?: string | null;
    },
  ): Promise<void> {
    if (!paymentId) return;
    const p = await this.repo.findOne({ where: { id: paymentId } });
    if (!p || p.status === 'paid' || p.status === 'refunded') return;
    if (ctx.fbp && !p.fbp) p.fbp = ctx.fbp;
    if (ctx.fbc && !p.fbc) p.fbc = ctx.fbc;
    if (ctx.sessionKey && !p.sessionKey) p.sessionKey = ctx.sessionKey;
    if (ctx.visitorId && !p.visitorId) p.visitorId = ctx.visitorId;
    if (ctx.ipAddress && !p.ipAddress) p.ipAddress = ctx.ipAddress;
    if (ctx.userAgent && !p.userAgent) p.userAgent = ctx.userAgent;
    const snap = await this.attribution.resolve(p);
    this.attribution.applySnapshot(p, snap);
    await this.repo.save(p);
  }

  /** Returnează instanța Stripe, re-instanțiată dacă cheia s-a schimbat în admin. */
  private async getStripe(): Promise<Stripe | null> {
    const key = await this.settings.get('STRIPE_SECRET_KEY');
    if (!key) {
      this.stripeInstance = null;
      this.lastStripeKey = null;
      return null;
    }
    if (key !== this.lastStripeKey) {
      this.stripeInstance = new Stripe(key, { apiVersion: '2024-09-30.acacia' as any });
      this.lastStripeKey = key;
    }
    return this.stripeInstance;
  }

  async isEnabled(): Promise<boolean> {
    return (await this.getStripe()) !== null;
  }

  /**
   * Emailul clientului pentru coloana `customerEmail`, normalizat (varchar 320).
   *
   * Îl persistăm la CREAREA plății, nu doar din webhook: dacă clientul abandonează
   * Stripe Checkout, `checkout.session.completed` nu mai vine niciodată și plata
   * rămâne fără email în admin, deși îl știam în momentul în care am pornit
   * checkout-ul (din cont, din sesiunea guest sau din owner-ul generării).
   * Webhook-ul suprascrie ulterior cu emailul real tastat în Stripe, dacă diferă.
   */
  private static customerEmailValue(email?: string | null): string | null {
    const e = (email ?? '').trim().toLowerCase();
    return e ? e.slice(0, 320) : null;
  }

  /** Suprataxă pe dedicație. Folosește valorile DIN site config
   *  (tipSurchargePercent + cap) cu fallback la constantele globale dacă DB
   *  nu are valori setate. Se aplică pentru orice monedă — fiecare site își
   *  setează propriile valori (sau le pune 0 dacă nu vrea suprataxă). */
  private siteTipSurcharge(site: Site, tipAmount: number): number {
    if (!tipAmount || tipAmount < 0) return 0;
    const percent = site.tipSurchargePercent ?? 5;
    const cap = site.tipSurchargeCapCents ?? 5000;
    if (percent <= 0) return 0;
    const surchargeCents = Math.round(tipAmount * 100 * (percent / 100));
    return Math.min(cap, surchargeCents);
  }

  private sitePremiumExtra(site: Site, premium: boolean): number {
    if (!premium) return 0;
    return site.premiumExtraCents ?? PREMIUM_EXTRA_CENTS;
  }

  private siteTotal(site: Site, tipAmount: number, premium: boolean): number {
    return (
      site.basePriceCents +
      this.sitePremiumExtra(site, premium) +
      this.siteTipSurcharge(site, tipAmount)
    );
  }

  /**
   * Pachetul EFECTIV (preț, preț tăiat, livrabile, `enabled`) pentru un site + tier +
   * interfață. SINGURUL loc din serviciu care are voie să calculeze un preț de pachet:
   * `quote`, `createCheckoutSession` și `createUpgradeCheckoutSession` trec toate pe
   * aici, ca prețul AFIȘAT și cel TAXAT să nu mai poată diverge.
   *
   * Bug reparat: checkout-ul folosea doar `site.packagePricesCents` și IGNORA
   * override-ul de pe interfață (`experienceConfig.items[slug].packages[tier]`) —
   * adminul schimba prețul pentru „cadou", site-ul îl afișa corect, iar Stripe taxa
   * prețul vechi.
   */
  private resolvedPackage(
    site: Site,
    tier: PackageTier,
    experienceSlug?: string | null,
  ): ResolvedExperiencePackage {
    return resolveSitePackage(site, normalizeTier(tier), experienceSlug ?? null);
  }

  /** Refuză un pachet scos din vitrină (`enabled: false`) — nu poate fi cumpărat nici
   *  printr-un link vechi, nici din chat. */
  private assertPackagePurchasable(pkg: ResolvedExperiencePackage): void {
    if (pkg.enabled === false) {
      throw new BadRequestException(
        `Pachetul ${pkg.label} nu mai este disponibil pentru cumpărare pe acest site.`,
      );
    }
  }

  /** Returnează prețul calculat (nu apelează Stripe). Suportă AMBELE modele:
   *  - PACHETE (input.packageTier setat) → total = prețul pachetului,
   *  - LEGACY (tip + premium) → comportamentul vechi, păstrat pentru compat. */
  quote(site: Site, input: { tipAmount?: number; premium?: boolean; packageTier?: PackageTier; experienceSlug?: string | null }) {
    if (input.packageTier) {
      const tier = normalizeTier(input.packageTier);
      const pkg = this.resolvedPackage(site, tier, input.experienceSlug);
      return {
        packageTier: tier,
        total: pkg.priceCents,
        currency: site.currency,
        compareAtCents: pkg.compareAtCents,
        // Vitrina trebuie să știe dacă pachetul mai e cumpărabil — checkout-ul îl refuză.
        enabled: pkg.enabled,
      };
    }
    const tip = input.tipAmount ?? 0;
    const premium = !!input.premium;
    const surcharge = this.siteTipSurcharge(site, tip);
    const premiumExtra = this.sitePremiumExtra(site, premium);
    const total = this.siteTotal(site, tip, premium);
    return {
      base: site.basePriceCents,
      tipAmount: tip,
      tipSurcharge: surcharge,
      premiumExtra,
      total,
      currency: site.currency,
    };
  }

  /**
   * Bypass total al Stripe Checkout când un cod promo acoperă 100% din preț.
   * Util pentru:
   *   - testare internă: admin emite cod 100% off ca să genereze demouri fără
   *     să se taie real pe cardul lui;
   *   - cadouri „free" către prieteni / influenceri etc.
   *
   * Comportament: salvăm Payment direct cu status='paid' amount=0, queue-ăm
   * generation-ul (sau îl marcăm unlocked pentru flow-ul demo→unlock), redempt
   * codul promo și returnăm URL-ul success — frontend va naviga direct acolo.
   */
  private async createFreeCheckout(args: {
    input: CheckoutInput;
    baseTotal: number;
    promoCodeId: string;
    promoCode: string;
    site: Site;
  }): Promise<{ url: string; paymentId: string }> {
    const { input, baseTotal, promoCodeId, promoCode, site } = args;

    const attr = await this.attributionFields({
      siteId: site.id,
      userId: input.userId,
      guestId: input.guestId,
      ipAddress: input.ipAddress,
      sessionKey: input.sessionKey,
      visitorId: input.visitorId,
    });
    const payment = await this.repo.save(
      this.repo.create({
        provider: 'free',
        providerSessionId: `free:${promoCode}:${baseTotal}`,
        amount: 0,
        currency: site.currency,
        status: 'paid',
        userId: input.userId,
        guestId: input.guestId,
        siteId: site.id,
        customerEmail: PaymentsService.customerEmailValue(input.email),
        fbp: input.fbp ?? null,
        fbc: input.fbc ?? null,
        userAgent: input.userAgent ?? null,
        ipAddress: input.ipAddress ?? null,
        sessionKey: input.sessionKey ?? null,
        visitorId: input.visitorId ?? null,
        ...attr,
      }),
    );

    // markPaidAndQueue acoperă ambele flow-uri: dacă generation e 'pending' o
    // queue-ează, dacă e 'succeeded' (demo) îi setează paidUnlocked=true.
    if (input.generationId) {
      try {
        await this.generations.markPaidAndQueue(input.generationId, payment.id);
      } catch (err) {
        this.logger.error(`free-checkout markPaidAndQueue failed: ${(err as Error).message}`);
      }
    }

    try {
      await this.promo.redeem({
        promoCodeId,
        siteId: site.id,
        email: input.email ?? null,
        userId: input.userId,
        guestId: input.guestId,
        paymentId: payment.id,
        appliedDiscountCents: baseTotal,
      });
    } catch (err) {
      this.logger.warn(`free-checkout promo.redeem failed: ${(err as Error).message}`);
    }

    const siteUrl = this.siteAppUrl(site);
    const successPath = input.generationId
      ? `/m/${input.generationId}?paymentId=${payment.id}&success=1`
      : `/checkout/success?paymentId=${payment.id}`;
    this.logger.log(
      `Free checkout: payment=${payment.id} generation=${input.generationId ?? '-'} promo=${promoCode} (${baseTotal} cents)`,
    );
    return { url: `${siteUrl}${successPath}`, paymentId: payment.id };
  }

  async createCheckoutSession(input: CheckoutInput): Promise<{ url: string; paymentId: string }> {
    const site = input.site;

    // ============== Guard anti dublă-plată (prevenție) ==============
    // Dacă generationId indică o melodie DEJA plătită și deblocată, NU mai creăm o
    // a doua sesiune de plată — clientul a plătit deja pentru ea. Îl trimitem direct
    // la pagina melodiei gata. Reluarea LEGITIMĂ a plății (recovery, retrimitere link)
    // se face doar pe generări pending/neplătite — acelea au paidUnlocked=false și
    // trec de guard. Fluxurile de unlock demo și de modificare folosesc alt câmp
    // (unlockGenerationId / overrideAmount fără generationId), deci nu sunt afectate.
    if (input.generationId) {
      const existingGen = await this.generations.findOnePublic(input.generationId);
      if (existingGen?.paidUnlocked) {
        this.logger.warn(
          `Checkout refuzat (dublă-plată): generarea ${input.generationId} e deja plătită. Redirect la melodie.`,
        );
        return { url: `${this.siteAppUrl(site)}/m/${input.generationId}?already=1`, paymentId: '' };
      }
    }

    // Email pentru validarea promo (cod restricționat pe email) și precompletarea
    // Stripe Checkout. La reluarea plății dintr-un alt device/browser (link de
    // recovery), sesiunea owner lipsește → îl rezolvăm din owner-ul generării.
    let resolvedEmail = input.email ?? undefined;
    if (!resolvedEmail && input.generationId) {
      resolvedEmail =
        (await this.generations.resolveOwnerEmail(input.generationId)) ?? undefined;
    }

    // Model PACHETE: pachetul EFECTIV pe interfața comenzii (aceeași sursă ca `quote`).
    // Îl rezolvăm chiar și când adminul suprascrie suma, ca să putem refuza un pachet
    // scos din vitrină indiferent pe unde vine cererea.
    const pkg = input.packageTier
      ? this.resolvedPackage(site, normalizeTier(input.packageTier), input.experienceSlug)
      : null;
    if (pkg) this.assertPackagePurchasable(pkg);

    // Admin chat poate suprascrie suma calculată cu un custom. Min 50 cents = limita Stripe.
    const hasOverride = typeof input.overrideAmount === 'number' && input.overrideAmount > 0;
    const baseTotal = hasOverride
      ? Math.max(50, Math.round(input.overrideAmount!))
      : pkg
        ? // Model PACHETE: total = prețul pachetului (ignorăm tip/premium).
          pkg.priceCents
        : this.siteTotal(site, input.tipAmount ?? 0, !!input.premium);
    const effectiveCurrency = (input.overrideCurrency ?? site.currency).toUpperCase();
    let promoCodeId: string | undefined;
    let appliedDiscountCents = 0;
    if (input.promoCode) {
      const v = await this.promo.validate(input.promoCode, resolvedEmail, baseTotal, site.id);
      if (v.ok && v.appliedDiscountCents) {
        appliedDiscountCents = v.appliedDiscountCents;
        promoCodeId = v.promoCodeId;
      } else {
        this.logger.warn(
          `Promo ${input.promoCode} revalidare backend a eșuat: ${v.ok ? 'no-discount' : v.reason ?? 'unknown'}`,
        );
      }
    }

    // Promo 100% off → sărim cu totul peste Stripe Checkout. Salvăm payment
    // direct ca 'paid' amount=0, unlock-uim generation-ul / queue-ăm-l (pentru
    // pay-first), redempt-uim codul și returnăm URL-ul de success.
    if (appliedDiscountCents >= baseTotal && promoCodeId) {
      return this.createFreeCheckout({
        input: { ...input, email: resolvedEmail },
        baseTotal,
        promoCodeId,
        promoCode: input.promoCode!,
        site,
      });
    }

    const stripe = await this.getStripe();
    if (!stripe) throw new ServiceUnavailableException('Stripe not configured');

    // Cap discount-ul la baseTotal - 50 ca să rămână peste minimul Stripe (50 cents).
    appliedDiscountCents = Math.min(appliedDiscountCents, Math.max(0, baseTotal - 50));
    const total = Math.max(50, baseTotal - appliedDiscountCents);

    const attr = await this.attributionFields({
      siteId: site.id,
      userId: input.userId,
      guestId: input.guestId,
      ipAddress: input.ipAddress,
      sessionKey: input.sessionKey,
      visitorId: input.visitorId,
    });
    const payment = await this.repo.save(
      this.repo.create({
        provider: 'stripe',
        amount: total,
        currency: site.currency,
        status: 'pending',
        userId: input.userId,
        guestId: input.guestId,
        siteId: site.id,
        experienceSlug: input.experienceSlug ?? null,
        // Emailul știut în momentul checkout-ului (cont / sesiune guest / owner-ul
        // generării). Fără el, o plată abandonată rămâne anonimă în admin.
        customerEmail: PaymentsService.customerEmailValue(resolvedEmail),
        // Meta Pixel attribution — persistăm la create ca să fie disponibile în
        // webhook-ul Purchase (server→server, fără cookies de browser).
        fbp: input.fbp ?? null,
        fbc: input.fbc ?? null,
        userAgent: input.userAgent ?? null,
        ipAddress: input.ipAddress ?? null,
        sessionKey: input.sessionKey ?? null,
        visitorId: input.visitorId ?? null,
        remakeForGenerationId: input.remakeForGenerationId ?? null,
        remakeNotes: input.remakeNotes ?? null,
        ...attr,
      }),
    );

    const siteUrl = this.siteAppUrl(site);
    const successPath = input.remakeForGenerationId
      ? `/m/${input.remakeForGenerationId}?remakePaid=1`
      : input.generationId
      ? `/m/${input.generationId}?paymentId=${payment.id}&success=1`
      : `/checkout/success?paymentId=${payment.id}`;
    // Pay-first (site.demoEnabled=false): la cancel, generation-ul e `pending`
    // și `/m/<id>` ar arăta progress bar mincinos (vezi IN_PROGRESS_STATUSES
    // care include `pending`). Trimitem userul înapoi pe wizard la step 5 cu
    // datele restaurate ca să poată reîncerca plata.
    const isPayFirst = site.demoEnabled === false;
    const cancelPath = input.remakeForGenerationId
      ? `/m/${input.remakeForGenerationId}?remakeCanceled=1`
      : input.experienceSlug === 'cadou' && input.generationId
        ? `/studio?paymentCanceled=1&genId=${input.generationId}`
        : isPayFirst && input.generationId
        ? `/?paymentCanceled=1&genId=${input.generationId}#generator`
        : input.generationId
          ? `/m/${input.generationId}?paymentId=${payment.id}&cancel=1`
          : `/checkout/cancel?paymentId=${payment.id}`;

    const brand = site.stripe?.productName ?? site.name;
    // Trimitem la Stripe prețul ÎNTREG (baseTotal) și aplicăm discount-ul ca
    // un Coupon Stripe. Asta face ca în UI-ul Stripe Checkout userul să vadă:
    //   produs: 5.99 €
    //   −promo: −1.00 €
    //   total : 4.99 €
    // Altfel (când dădeam unit_amount = discounted) se vedea doar prețul final
    // fără context de reducere.
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        quantity: 1,
        price_data: {
          currency: effectiveCurrency.toLowerCase(),
          unit_amount: baseTotal,
          product_data: {
            name: input.overrideProductName ?? i18nProductName(site.locale, brand, !!input.premium),
            description: input.tipAmount && !hasOverride
              ? i18nDedicDesc(site.locale, input.tipAmount, site.currency)
              : undefined,
          },
        },
      },
    ];

    let discounts: Stripe.Checkout.SessionCreateParams.Discount[] | undefined;
    if (appliedDiscountCents > 0) {
      try {
        const coupon = await stripe.coupons.create({
          amount_off: appliedDiscountCents,
          currency: effectiveCurrency.toLowerCase(),
          duration: 'once',
          name: input.promoCode ? `Promo ${input.promoCode}` : 'Reducere',
          max_redemptions: 1,
        });
        discounts = [{ coupon: coupon.id }];
      } catch (err) {
        this.logger.warn(`Nu am putut crea cupon Stripe: ${(err as Error).message}`);
        // fallback: aplicăm discount-ul direct pe unit_amount ca să nu pierdem
        // reducerea utilizatorului final.
        lineItems[0].price_data!.unit_amount = total;
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      locale: stripeUiLocale(site.locale),
      // Precompletat la reluarea plății (recovery) — altfel undefined și Stripe
      // cere email-ul în UI ca de obicei.
      customer_email: resolvedEmail,
      line_items: lineItems,
      discounts,
      success_url: `${siteUrl}${successPath}`,
      cancel_url: `${siteUrl}${cancelPath}`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      phone_number_collection: { enabled: true },
      // Cerem adresa completă de facturare — necesar pentru emitere facturi.
      // Stripe afișează un formular cu Adresă / Oraș / Cod poștal / Țară.
      billing_address_collection: 'required',
      metadata: {
        paymentId: payment.id,
        generationId: input.generationId ?? '',
        unlockGenerationId: input.unlockGenerationId ?? '',
        upgradeGenerationId: input.upgradeGenerationId ?? '',
        targetTier: input.targetTier ?? '',
        remakeForGenerationId: input.remakeForGenerationId ?? '',
        promoCodeId: promoCodeId ?? '',
        appliedDiscountCents: String(appliedDiscountCents),
        experienceSlug: input.experienceSlug ?? '',
        siteId: site.id,
        siteSlug: site.slug,
        siteDomain: site.domain,
      },
      payment_intent_data: site.stripe?.statementDescriptor
        ? { statement_descriptor_suffix: site.stripe.statementDescriptor }
        : undefined,
    });

    payment.providerSessionId = session.id;
    await this.repo.save(payment);

    if (!session.url) throw new BadRequestException('Stripe did not return a URL');
    return { url: session.url, paymentId: payment.id };
  }

  async findById(id: string): Promise<Payment | null> {
    return this.repo.findOne({ where: { id } });
  }

  /**
   * Checkout direct (pay-first): site.demoEnabled=false. Creează:
   *   - o Generation type='full' în status='pending' (NU se queueează încă);
   *   - un Payment 'pending';
   *   - un Stripe Checkout Session legat de payment.
   * Pe webhook payment success, GenerationsService.markPaidAndQueue() pornește
   * efectiv generarea + queueing-ul.
   */
  async createDirectCheckoutSession(input: {
    userId: string | null;
    guestId: string | null;
    generation: Omit<CreateGenerationDto, 'type' | 'paymentId'>;
    tipAmount?: number;
    premium?: boolean;
    promoCode?: string;
    email?: string;
    site: Site;
    // Meta Pixel attribution (propagate to createCheckoutSession → Payment row)
    fbp?: string | null;
    fbc?: string | null;
    userAgent?: string | null;
    ipAddress?: string | null;
    sessionKey?: string | null;
    visitorId?: string | null;
    experienceSlug?: string | null;
  }): Promise<{ url: string; paymentId: string; generationId: string }> {
    const site = input.site;

    // Model PACHETE: tier-ul vine din obiectul generation (web wizard).
    // Dacă lipsește → 'basic'. createPendingForPayment persistă packageTier +
    // setează durata corectă a melodiei (premium = 150s).
    const tier = normalizeTier((input.generation as { packageTier?: string }).packageTier);
    const gen = await this.generations.createPendingForPayment(
      {
        ...input.generation,
        packageTier: tier,
        tipAmount: input.tipAmount ?? input.generation.tipAmount ?? 0,
        premium: input.premium ?? input.generation.premium ?? false,
      },
      {
        userId: input.userId,
        guestId: input.guestId,
        siteId: site.id,
        experienceSlug: input.experienceSlug ?? null,
      },
    );

    const checkout = await this.createCheckoutSession({
      userId: input.userId,
      guestId: input.guestId,
      generationId: gen.id,
      experienceSlug: input.experienceSlug ?? gen.experienceSlug,
      // Pachetul determină totalul; tip/premium rămân pentru audit/compat dar
      // sunt ignorate de calcul când packageTier e setat.
      packageTier: tier,
      tipAmount: input.tipAmount ?? 0,
      premium: input.premium ?? false,
      promoCode: input.promoCode,
      email: input.email,
      site,
      fbp: input.fbp,
      fbc: input.fbc,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      sessionKey: input.sessionKey,
      visitorId: input.visitorId,
    });

    return { ...checkout, generationId: gen.id };
  }

  async createUpgradeCheckoutSession(input: {
    generationId: string;
    targetTier: PackageTier;
    userId: string | null;
    guestId: string | null;
    email?: string;
    site: Site;
    experienceSlug?: string | null;
    fbp?: string | null;
    fbc?: string | null;
    userAgent?: string | null;
    ipAddress?: string | null;
    sessionKey?: string | null;
    visitorId?: string | null;
  }): Promise<{ url?: string; paymentId?: string; upgraded?: boolean }> {
    const gen = await this.generations.findOne(input.generationId, {
      userId: input.userId,
      guestId: input.guestId,
    });
    const current = normalizeTier(gen.packageTier);
    const target = normalizeTier(input.targetTier);
    const rank = { basic: 0, plus: 1, premium: 2 };
    if (rank[target] <= rank[current]) throw new BadRequestException('already_at_tier');
    const alreadyPaid = await this.repo
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.amount),0)', 'sum')
      .where('p.status = :st', { st: 'paid' })
      .andWhere('(p.id = :pay OR p.id IN (SELECT g."paymentId" FROM generations g WHERE g.id = :gid))', {
        pay: gen.paymentId,
        gid: gen.id,
      })
      .getRawOne<{ sum: string }>()
      .catch(() => ({ sum: '0' }));
    // Aceeași interfață pentru AMBELE tier-uri: diferența de plată se calculează pe
    // prețurile efective ale interfeței comenzii, nu pe prețurile de listă ale site-ului.
    const upgradeSlug = input.experienceSlug ?? gen.experienceSlug;
    const targetPkg = this.resolvedPackage(input.site, target, upgradeSlug);
    this.assertPackagePurchasable(targetPkg);
    const paidCents =
      Number(alreadyPaid?.sum ?? 0) ||
      this.resolvedPackage(input.site, current, upgradeSlug).priceCents;
    const targetCents = targetPkg.priceCents;
    const diff = Math.max(0, targetCents - paidCents);
    if (diff === 0) {
      await this.generations.applyPaidUpgrade(gen.id, target, input.experienceSlug ?? gen.experienceSlug);
      return { upgraded: true };
    }
    const checkout = await this.createCheckoutSession({
      userId: input.userId,
      guestId: input.guestId,
      upgradeGenerationId: gen.id,
      targetTier: target,
      experienceSlug: input.experienceSlug ?? gen.experienceSlug,
      overrideAmount: diff,
      overrideProductName: `Upgrade ${target}`,
      email: input.email,
      site: input.site,
      fbp: input.fbp,
      fbc: input.fbc,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      sessionKey: input.sessionKey,
      visitorId: input.visitorId,
    });
    return checkout;
  }

  /** Construiește URL-ul de bază pentru success/cancel (folosit și de Stripe Checkout). */
  private siteAppUrl(site: Site): string {
    // În dev, site.domain e adesea manelecadou.ro din DB — nu trimite userul pe producție.
    if (this.config.get<string>('NODE_ENV') !== 'production') {
      return this.config.get<string>('APP_URL') ?? 'http://localhost:1500';
    }
    if (site.domain.startsWith('localhost') || site.domain.startsWith('127.')) {
      return this.config.get<string>('APP_URL') ?? `http://${site.domain}`;
    }
    return `https://${site.domain}`;
  }

  /** Prețul tier-ului pentru un site dat. Pentru RON folosim TIER_PRICES_RON (compat).
   *  Pentru alte valute, folosim site.giftPriceCents pentru "single" și un multiplicator
   *  derivat din raportul tier-urilor RON pentru pack3/pack10. */
  private tierPriceForSite(site: Site, tier: GiftTier): number {
    if (site.currency.toUpperCase() === 'RON') return TIER_PRICES_RON[tier];
    const single = site.giftPriceCents || site.basePriceCents;
    if (tier === 'single') return single;
    if (tier === 'pack3') return Math.round((single * TIER_PRICES_RON.pack3) / TIER_PRICES_RON.single);
    return Math.round((single * TIER_PRICES_RON.pack10) / TIER_PRICES_RON.single);
  }

  /**
   * Stripe Checkout pentru CUMPĂRARE COD CADOU.
   * La paid → webhook-ul emite gift code și-l trimite pe email.
   */
  async createGiftCheckoutSession(input: {
    userId: string | null;
    guestId: string | null;
    tier: GiftTier;
    email: string;
    site: Site;
    // Meta Pixel attribution (opțional)
    fbp?: string | null;
    fbc?: string | null;
    userAgent?: string | null;
    ipAddress?: string | null;
    sessionKey?: string | null;
    visitorId?: string | null;
  }): Promise<{ url: string; paymentId: string }> {
    const stripe = await this.getStripe();
    if (!stripe) throw new ServiceUnavailableException('Stripe not configured');
    const site = input.site;
    const total = this.tierPriceForSite(site, input.tier);

    const attr = await this.attributionFields({
      siteId: site.id,
      userId: input.userId,
      guestId: input.guestId,
      ipAddress: input.ipAddress,
      sessionKey: input.sessionKey,
      visitorId: input.visitorId,
    });
    const payment = await this.repo.save(
      this.repo.create({
        provider: 'stripe',
        amount: total,
        currency: site.currency,
        status: 'pending',
        userId: input.userId,
        guestId: input.guestId,
        siteId: site.id,
        customerEmail: PaymentsService.customerEmailValue(input.email),
        // Meta Pixel attribution — persistăm la create ca să fie disponibile în
        // webhook-ul Purchase (server→server, fără cookies de browser).
        fbp: input.fbp ?? null,
        fbc: input.fbc ?? null,
        userAgent: input.userAgent ?? null,
        ipAddress: input.ipAddress ?? null,
        sessionKey: input.sessionKey ?? null,
        visitorId: input.visitorId ?? null,
        ...attr,
      }),
    );

    const siteUrl = this.siteAppUrl(site);
    const brand = site.stripe?.productName ?? site.name;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      locale: stripeUiLocale(site.locale),
      customer_email: input.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: site.currency.toLowerCase(),
            unit_amount: total,
            product_data: {
              name: i18nGiftProductName(site.locale, brand, input.tier),
              description: i18nGiftDesc(site.locale),
            },
          },
        },
      ],
      success_url: `${siteUrl}/cadou/success?paymentId=${payment.id}`,
      cancel_url: `${siteUrl}/cadou?paymentId=${payment.id}&cancel=1`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      phone_number_collection: { enabled: true },
      billing_address_collection: 'required',
      metadata: {
        paymentId: payment.id,
        giftPurchase: 'true',
        giftTier: input.tier,
        giftEmail: input.email,
        siteId: site.id,
        siteSlug: site.slug,
        siteDomain: site.domain,
      },
      payment_intent_data: site.stripe?.statementDescriptor
        ? { statement_descriptor_suffix: site.stripe.statementDescriptor }
        : undefined,
    });

    payment.providerSessionId = session.id;
    await this.repo.save(payment);
    if (!session.url) throw new BadRequestException('Stripe did not return a URL');
    return { url: session.url, paymentId: payment.id };
  }

  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const stripe = await this.getStripe();
    if (!stripe) return;
    const webhookSecret = await this.settings.get('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      this.logger.warn('STRIPE_WEBHOOK_SECRET missing — skipping verification');
      return;
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      this.logger.error(`webhook verification failed: ${(err as Error).message}`);
      throw new BadRequestException('Invalid signature');
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const paymentId = session.metadata?.paymentId;
      const metaSiteId = session.metadata?.siteId || null;

      if (!paymentId) return;

      const isPaid = session.payment_status === 'paid';
      const update: Partial<Payment> = { status: isPaid ? 'paid' : 'failed' };
      if (!isPaid) {
        // payment_status poate fi 'unpaid' sau 'no_payment_required'.
        // În cazul rar în care checkout completează fără plată reușită, captăm
        // un motiv generic; detalii reale vin în payment_intent.payment_failed.
        update.failureReason = `Checkout completed with status="${session.payment_status}"`;
        update.failureCode = session.payment_status ?? 'unknown';
      }

      // Date cumpărător din Stripe — persistate pe plată pentru analytics (gen
      // cumpărător + reconciliere). buyerGender e inferat din prenume (RO).
      const custName = (session.customer_details?.name ?? '').trim() || null;
      const custEmail = (session.customer_details?.email ?? '').trim() || null;
      if (custName) update.customerName = custName.slice(0, 160);
      if (custEmail) update.customerEmail = custEmail.slice(0, 320);
      // Gen cumpărător din nume → prefix email (vezi gender-infer). Plățile noi
      // sunt astfel populate automat, indiferent dacă Stripe trimite numele.
      update.buyerGender = inferBuyerGender({ name: custName, email: custEmail });
      if (isPaid) update.paidAt = new Date();

      // Adresă de facturare din Stripe — persistată pe plată (sursă pentru
      // /facturare + /clienti, ca să nu reinterogăm Stripe per rând).
      const cdAddr = (session.customer_details?.address ?? null) as
        | { line1?: string | null; line2?: string | null; city?: string | null; state?: string | null; postal_code?: string | null; country?: string | null }
        | null;
      const cdStreet = [cdAddr?.line1, cdAddr?.line2].filter(Boolean).join(', ');
      if (cdStreet) update.billingAddress = cdStreet.slice(0, 512);
      if (cdAddr?.city) update.billingCity = cdAddr.city.slice(0, 128);
      if (cdAddr?.state) update.billingCounty = cdAddr.state.slice(0, 128);
      if (cdAddr?.postal_code) update.billingPostalCode = cdAddr.postal_code.slice(0, 32);
      if (cdAddr?.country) update.billingCountry = cdAddr.country.slice(0, 8);
      const cdPhone = (session.customer_details?.phone ?? '').trim() || null;
      if (cdPhone) update.billingPhone = cdPhone.slice(0, 64);
      update.billingSyncedAt = new Date();

      // Conversie RON la cursul BNR de dinainte de data plății (raportare + facturi).
      // Înlocuiește cursul Stripe (balance_transaction) — vezi FxRateService.
      if (isPaid) {
        const cur = (session.currency || 'ron').toUpperCase();
        const amt = session.amount_total ?? null;
        if (cur === 'RON') {
          update.exchangeRateToRon = '1';
          update.amountRonCents = amt;
        } else if (amt != null) {
          try {
            const conv = await this.fx.toRonCents(amt, cur, new Date());
            if (conv) {
              update.exchangeRateToRon = String(conv.rate);
              update.amountRonCents = conv.amountRonCents;
            }
          } catch (err) {
            this.logger.warn(`BNR conversion failed: ${(err as Error).message}`);
          }
        }
      }

      // Setăm siteId pe payment dacă lipsește (poate fi creat înainte ca middleware-ul
      // de site să fie complet rulat în vechi requests).
      if (metaSiteId) update.siteId = metaSiteId;

      await this.repo.update({ id: paymentId }, update);

      // Plăți create înainte de snapshot (sau chat fără sesiune la create):
      // rezolvăm o dată, la paid. Nu rescriem un snapshot deja înghețat.
      if (isPaid) {
        try {
          const row = await this.repo.findOne({ where: { id: paymentId } });
          if (row && !row.attributedAt) await this.attribution.snapshotPayment(row);
        } catch (err) {
          this.logger.warn(`attribution snapshot failed: ${(err as Error).message}`);
        }
      }

      // ============== Meta CAPI — Purchase server-side ==============
      // Cel mai important eveniment. Trimitem server-side ca să bypass-ăm iOS ATT
      // și ad-blockers (40%+ din Purchases s-ar pierde pe client-side pixel).
      // event_id = pay-<paymentId> pentru deduplicare cu eventul client (success page,
      // care folosește același format — vezi /m/[id]/view.tsx).
      //
      // IDEMPOTENCY: Stripe poate retrimite webhook-ul (timeout response sau
      // retry policy). UPDATE atomic capiPurchaseSentAt IS NULL → o singură fire
      // per plată chiar la 100 webhook-uri. Fără asta, Meta primește 2+ servers
      // per Purchase și inflează „Total server events received" (chiar dacă
      // dedup-ul prin event_id elimină dublarea în reporting, statisticile sunt
      // afectate și EMQ scade).
      if (isPaid) {
        const lock = await this.repo
          .createQueryBuilder()
          .update(Payment)
          .set({ capiPurchaseSentAt: () => 'NOW()' })
          .where('id = :id AND "capiPurchaseSentAt" IS NULL', { id: paymentId })
          .execute();
        if (!lock.affected || lock.affected === 0) {
          this.logger.log(
            `Meta CAPI Purchase skip (event_id=pay-${paymentId.slice(0, 8)}) — webhook duplicate`,
          );
          // Sărim peste fire — webhook duplicat, deja trimis CAPI la primul.
        } else try {
          const customerEmail =
            (session.customer_details?.email as string | undefined) ?? null;
          const customerPhone =
            (session.customer_details?.phone as string | undefined) ?? null;
          const customerName = (session.customer_details?.name as string | undefined) ?? '';
          const [fn, ...lnParts] = customerName.split(' ');
          const externalId = (session.metadata?.userId || session.metadata?.guestId) ?? null;
          const amountRon = (session.amount_total ?? 0) / 100;

          // Adresă de facturare din Stripe (city/state/zip/country) — EMQ booster.
          const billingAddr = (session.customer_details?.address ?? null) as
            | { city?: string | null; state?: string | null; postal_code?: string | null; country?: string | null }
            | null;

          // Atribuire Meta Pixel — fbp/fbc/UA/IP capturate la creare-checkout
          // (vezi PaymentsController + createCheckoutSession). Fără ele EMQ < 4
          // și click-urile Facebook nu se pot atribui plății.
          // Refacem payment row ca să avem cele mai noi câmpuri (au fost
          // update-uite mai sus cu providerSessionId + exchangeRate etc.).
          const paymentRow = await this.repo.findOne({ where: { id: paymentId } });

          // Per-site Meta CAPI: găsim site-ul de care aparține plata.
          const siteIdForCapi = paymentRow?.siteId ?? (session.metadata?.siteId as string | undefined);
          const siteForCapi = siteIdForCapi
            ? await this.sites.findById(siteIdForCapi).catch(() => null)
            : null;

          // Raportăm la pixeluri în RON (curs BNR, persistat pe plată mai sus),
          // ca valorile să fie consistente cross-tenant cu restul statisticilor.
          // Meta/TikTok/GA convertesc singure la valuta contului de ads.
          // Fallback: dacă lipsește conversia, trimitem valuta nativă (nu
          // etichetăm greșit o sumă EUR ca RON).
          const pixelRonCents = paymentRow?.amountRonCents ?? null;
          const pixelValue = pixelRonCents != null ? pixelRonCents / 100 : amountRon;
          const pixelCurrency =
            pixelRonCents != null ? 'RON' : (session.currency ?? 'RON').toUpperCase();

          void this.metaCapi.sendEvent(
            'Purchase',
            {
              eventId: `pay-${paymentId}`,
              email: customerEmail,
              phone: customerPhone,
              firstName: fn || null,
              lastName: lnParts.join(' ') || null,
              externalId,
              ip: paymentRow?.ipAddress ?? null,
              userAgent: paymentRow?.userAgent ?? null,
              fbp: paymentRow?.fbp ?? null,
              fbc: paymentRow?.fbc ?? null,
              city: billingAddr?.city ?? null,
              state: billingAddr?.state ?? null,
              zip: billingAddr?.postal_code ?? null,
              country: billingAddr?.country ?? null,
              value: pixelValue,
              currency: pixelCurrency,
              contentName: 'Manea personalizată',
              contentIds: session.metadata?.generationId
                ? [session.metadata.generationId]
                : undefined,
              customData: {
                payment_method: 'stripe',
                promo_applied: session.metadata?.promoCodeId || '',
              },
            },
            'website',
            siteForCapi,
          );
        } catch (err) {
          this.logger.warn(`Meta CAPI Purchase emit failed: ${(err as Error).message}`);
        }
      }

      // Flow pay-first (site.demoEnabled=false): generation a fost creată în
      // status='pending', acum o queueăm efectiv.
      if (isPaid && session.metadata?.generationId) {
        try {
          await this.generations.markPaidAndQueue(
            session.metadata.generationId,
            paymentId,
          );
        } catch (err) {
          this.logger.error(`markPaidAndQueue failed: ${(err as Error).message}`);
        }
      }

      if (isPaid) {
        const remakeRow = await this.repo.findOne({ where: { id: paymentId } });
        const remakeGenId =
          remakeRow?.remakeForGenerationId || session.metadata?.remakeForGenerationId || '';
        if (remakeGenId) {
          const lock = await this.repo
            .createQueryBuilder()
            .update(Payment)
            .set({ remakeAppliedAt: () => 'NOW()' })
            .where('id = :id AND "remakeAppliedAt" IS NULL', { id: paymentId })
            .execute();
          if (lock.affected && lock.affected > 0) {
            try {
              await this.generations.applyPaidRemake(remakeGenId, remakeRow?.remakeNotes ?? '');
            } catch (err) {
              this.logger.error(`applyPaidRemake failed: ${(err as Error).message}`);
            }
          }
        }
      }

      // Flux demo + unlock (chat): generation există deja în starea demo,
      // plata deblochează versiunea full. Setăm paidUnlocked=true + trimitem
      // un mesaj nou cu linkul melodiei complete.
      if (isPaid && session.metadata?.upgradeGenerationId && session.metadata?.targetTier) {
        try {
          await this.generations.applyPaidUpgrade(
            session.metadata.upgradeGenerationId,
            session.metadata.targetTier,
            session.metadata.experienceSlug || null,
          );
        } catch (err) {
          this.logger.error(`applyPaidUpgrade failed: ${(err as Error).message}`);
        }
      }

      if (isPaid && session.metadata?.unlockGenerationId) {
        try {
          const chatMod = await import('../chat/chat.service');
          const chat = this.moduleRef.get(chatMod.ChatService, { strict: false });
          await chat.unlockGenerationAfterPayment(
            session.metadata.unlockGenerationId,
            paymentId,
          );
        } catch (err) {
          this.logger.error(
            `unlockGenerationAfterPayment failed for gen=${session.metadata.unlockGenerationId}: ${(err as Error).message}`,
          );
        }
      }

      // Notifică chat-ul (dacă plata a venit din chat payment_link) — update
      // card cu status='paid' + system message. Lazy import pentru circular dep.
      try {
        const chatMod = await import('../chat/chat.service');
        const chat = this.moduleRef.get(chatMod.ChatService, { strict: false });
        await chat.markPaymentLinksAsPaid(paymentId, isPaid ? 'paid' : 'failed');
      } catch (err) {
        // ChatService poate lipsi în tests sau payment poate nu fi din chat — best-effort
        this.logger.debug?.(`chat notify on payment skipped: ${(err as Error).message}`);
      }

      if (isPaid && session.metadata?.promoCodeId) {
        const applied = Number(session.metadata.appliedDiscountCents ?? '0') || 0;
        if (applied > 0) {
          await this.promo.redeem({
            promoCodeId: session.metadata.promoCodeId,
            siteId: metaSiteId,
            email: session.customer_email ?? undefined,
            paymentId,
            appliedDiscountCents: applied,
          });
        }
      }
      // TikTok Events API per-site: încărcăm site-ul (cu credențialele
      // TikTok ale acelui site) și trimitem CompletePayment server-side cu
      // event_id = paymentId (același folosit de pixelul browser → dedup).
      if (isPaid && metaSiteId) {
        const amount = session.amount_total ?? 0;
        const currency = (session.currency ?? 'ron').toUpperCase();
        const generationId = session.metadata?.generationId || undefined;
        const siteForTracking = await this.sites.findById(metaSiteId).catch(() => null);
        const payment = await this.repo.findOne({ where: { id: paymentId } });
        // Email și phone sunt acum colectate din Stripe Checkout
        // (customer_details). External ID = userId sau guestId, stabil per client.
        const customerEmail =
          session.customer_details?.email ?? session.customer_email ?? null;
        const customerPhone = session.customer_details?.phone ?? null;
        const externalId = payment?.userId ?? payment?.guestId ?? null;

        // Raportăm în RON (curs BNR persistat pe plată) către TikTok + GA4, ca
        // valorile să fie consistente cu restul statisticilor. Fallback pe
        // valuta nativă dacă lipsește conversia.
        const ronCents = payment?.amountRonCents ?? null;
        const pixelValueCents = ronCents ?? amount;
        const pixelCurrency = ronCents != null ? 'RON' : currency;

        this.tiktok
          .trackEvent({
            site: siteForTracking,
            eventName: 'Purchase',
            eventId: paymentId,
            url: session.metadata?.siteDomain
              ? `https://${session.metadata.siteDomain}/`
              : undefined,
            email: customerEmail,
            phone: customerPhone,
            externalId,
            value: pixelValueCents / 100,
            currency: pixelCurrency,
            contentId: generationId ?? paymentId,
            contentName: 'Manea Cadou',
          })
          .catch((err) =>
            this.logger.warn(`TikTok Purchase event failed: ${(err as Error).message}`),
          );

        // Meta CAPI + GA4 Measurement Protocol (server-side Purchase). event_id
        // = paymentId — identic cu `eventID` din `fbq('track', 'Purchase', ...)`
        // de pe success page → Meta/GA dedup browser↔server automat.
        // Webhook-ul vine 100% din partea Stripe, chiar dacă userul închide
        // tab-ul după plată → atribuirea reclamei nu mai depinde de redirect.
        this.analytics
          .ingestServerEvent({
            type: 'purchase_success',
            eventId: paymentId,
            siteId: metaSiteId,
            userId: payment?.userId ?? null,
            guestId: payment?.guestId ?? null,
            userEmail: customerEmail,
            valueCents: pixelValueCents,
            currency: pixelCurrency,
            url: session.metadata?.siteDomain
              ? `https://${session.metadata.siteDomain}/`
              : null,
            props: {
              transaction_id: paymentId,
              content_id: generationId ?? paymentId,
              content_name: 'Manea Cadou',
              content_type: 'product',
            },
          })
          .catch((err) =>
            this.logger.warn(`Meta CAPI Purchase event failed: ${(err as Error).message}`),
          );
      }

      // Cod cadou: emite codul + email
      if (isPaid && session.metadata?.giftPurchase === 'true' && session.metadata?.giftTier) {
        const payment = await this.repo.findOne({ where: { id: paymentId } });
        await this.giftCodes.issueAfterPayment({
          paymentId,
          tier: session.metadata.giftTier as GiftTier,
          purchasedByUserId: payment?.userId ?? null,
          purchasedByGuestId: payment?.guestId ?? null,
          purchasedByEmail: session.metadata.giftEmail ?? session.customer_email ?? null,
          siteId: metaSiteId,
        });
      }
    }

    // Capturăm motivul real al eșecului plății — Stripe trimite acest event
    // pentru carduri respinse, fonduri insuficiente, 3DS eșuat, etc.
    if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object as Stripe.PaymentIntent;
      await this.recordPaymentFailureFromIntent(pi);
    }

    // Sesiunea de checkout a expirat (userul a abandonat / nu a apăsat Pay
    // în fereastra de `expires_at`). Stripe NU trimite niciodată un event
    // imediat când userul închide tab-ul, doar acest expired după timeout.
    if (event.type === 'checkout.session.expired') {
      const session = event.data.object as Stripe.Checkout.Session;
      const paymentId = session.metadata?.paymentId;
      if (paymentId) {
        await this.repo.update(
          { id: paymentId },
          {
            status: 'failed',
            failureReason: 'Checkout abandonat (sesiune expirată)',
            failureCode: 'session_expired',
          },
        );
      }
    }

    // Plăți async (SEPA, ACH, etc.) care eșuează după ce checkout-ul a închis.
    if (event.type === 'checkout.session.async_payment_failed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const paymentId = session.metadata?.paymentId;
      if (paymentId) {
        const reason = session.payment_intent
          ? await this.fetchIntentFailureReason(
              typeof session.payment_intent === 'string'
                ? session.payment_intent
                : session.payment_intent.id,
            )
          : { reason: 'Plata async a eșuat (motivul nu e disponibil)', code: 'async_failed' };
        await this.repo.update(
          { id: paymentId },
          { status: 'failed', failureReason: reason.reason, failureCode: reason.code },
        );
      }
    }
  }

  /**
   * Localizează payment-ul nostru după payment_intent id (stocat de Stripe
   * Checkout în PaymentIntent dar nu direct pe Payment în sistem). Folosim
   * metadata sau Session lookup pentru a-l găsi.
   */
  private async recordPaymentFailureFromIntent(pi: Stripe.PaymentIntent): Promise<void> {
    const stripe = await this.getStripe();
    if (!stripe) return;
    // Stripe pune `metadata.paymentId` în PaymentIntent doar dacă l-am pus noi
    // direct. În flow-ul nostru via Checkout, metadata e pe Session, nu pe PI.
    // Așa că facem lookup invers: căutăm Session-ul asociat acestui PI.
    let paymentId = (pi.metadata as Record<string, string> | null)?.paymentId;
    if (!paymentId) {
      try {
        const sessions = await stripe.checkout.sessions.list({
          payment_intent: pi.id,
          limit: 1,
        });
        const session = sessions.data[0];
        paymentId = session?.metadata?.paymentId;
      } catch (err) {
        this.logger.warn(`session lookup by PI failed: ${(err as Error).message}`);
      }
    }
    if (!paymentId) return;

    const reason = extractIntentFailureReason(pi);
    await this.repo.update(
      { id: paymentId },
      { status: 'failed', failureReason: reason.reason, failureCode: reason.code },
    );
  }

  private async fetchIntentFailureReason(
    intentId: string,
  ): Promise<{ reason: string; code: string }> {
    const stripe = await this.getStripe();
    if (!stripe) return { reason: 'Stripe indisponibil', code: 'stripe_unavailable' };
    try {
      const pi = await stripe.paymentIntents.retrieve(intentId);
      return extractIntentFailureReason(pi);
    } catch (err) {
      return {
        reason: `Nu am putut citi PaymentIntent: ${(err as Error).message}`,
        code: 'intent_fetch_failed',
      };
    }
  }

  /**
   * Returnează detalii de facturare din Stripe Session pentru un payment dat:
   * customer name, email, phone, billing address. Folosit în admin pentru
   * emiterea facturilor / contabilitate.
   */
  async fetchStripeCustomerDetails(paymentId: string): Promise<{
    name: string | null;
    email: string | null;
    phone: string | null;
    address: {
      line1: string | null;
      line2: string | null;
      city: string | null;
      state: string | null;
      postalCode: string | null;
      country: string | null;
    } | null;
    paymentMethod: {
      brand: string | null;
      last4: string | null;
      expMonth: number | null;
      expYear: number | null;
      country: string | null;
    } | null;
  } | null> {
    const payment = await this.repo.findOne({ where: { id: paymentId } });
    if (!payment?.providerSessionId) return null;
    const stripe = await this.getStripe();
    if (!stripe) return null;

    try {
      const session = await stripe.checkout.sessions.retrieve(payment.providerSessionId, {
        expand: ['customer_details', 'payment_intent.latest_charge.payment_method_details.card'],
      });
      const cd = session.customer_details;
      const pi = session.payment_intent as Stripe.PaymentIntent | null;
      const charge = pi?.latest_charge as Stripe.Charge | null;
      const card = charge?.payment_method_details?.card ?? null;

      const addr = cd?.address ?? null;
      return {
        name: cd?.name ?? null,
        email: cd?.email ?? payment.userId ? null : null,
        phone: cd?.phone ?? null,
        address: addr
          ? {
              line1: addr.line1 ?? null,
              line2: addr.line2 ?? null,
              city: addr.city ?? null,
              state: addr.state ?? null,
              postalCode: addr.postal_code ?? null,
              country: addr.country ?? null,
            }
          : null,
        paymentMethod: card
          ? {
              brand: card.brand ?? null,
              last4: card.last4 ?? null,
              expMonth: card.exp_month ?? null,
              expYear: card.exp_year ?? null,
              country: card.country ?? null,
            }
          : null,
      };
    } catch (err) {
      this.logger.warn(`fetchStripeCustomerDetails failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Suma brută încasată în RON pentru o plată (moneda contului Stripe = RON).
   * Pentru plățile în valută (ex. EUR pe doroparaggelia.gr), clientul plătește în
   * EUR dar factura se emite în RON. Convertim la cursul de referință BNR de
   * dinainte de data plății (cerință Șerban — vezi FxRateService), NU la cursul
   * Stripe. Persistă `amountRonCents` + `exchangeRateToRon` ca să nu reinterogăm.
   * Null dacă nu se poate determina cursul.
   */
  async resolveRonAmount(
    paymentId: string,
  ): Promise<{ amountRonCents: number; exchangeRate: number | null } | null> {
    const p = await this.repo.findOne({ where: { id: paymentId } });
    if (!p) return null;
    if ((p.currency || 'RON').toUpperCase() === 'RON') {
      if (p.amountRonCents == null) {
        await this.repo.update(paymentId, { amountRonCents: p.amount, exchangeRateToRon: '1' });
      }
      return { amountRonCents: p.amount, exchangeRate: 1 };
    }
    if (p.amountRonCents != null && p.amountRonCents > 0) {
      return {
        amountRonCents: p.amountRonCents,
        exchangeRate: p.exchangeRateToRon ? Number(p.exchangeRateToRon) : null,
      };
    }
    // Curs BNR de dinainte de data plății (paidAt, altfel createdAt).
    const when = p.paidAt ?? p.createdAt ?? new Date();
    const conv = await this.fx.toRonCents(p.amount, p.currency || 'RON', when);
    if (!conv) return null;
    await this.repo.update(paymentId, {
      amountRonCents: conv.amountRonCents,
      exchangeRateToRon: String(conv.rate),
    });
    return { amountRonCents: conv.amountRonCents, exchangeRate: conv.rate };
  }

  /** Câte plăți mai au nevoie de backfill al adresei de facturare. */
  async countBillingBackfillCandidates(force = false): Promise<number> {
    const qb = this.repo
      .createQueryBuilder('p')
      .where('p.status = :s', { s: 'paid' })
      .andWhere('p."providerSessionId" IS NOT NULL');
    if (!force) qb.andWhere('p."billingSyncedAt" IS NULL');
    return qb.getCount();
  }

  /**
   * Backfill one-time al adresei de facturare pe plățile vechi: aduce din Stripe
   * numele + adresa cumpărătorului și le persistă pe `payments`. Throttled ca să
   * nu lovim rate-limit-ul Stripe. Rulează în fundal (poate dura ~30s la câteva
   * sute de plăți). Idempotent: sare peste cele deja sincronizate (dacă !force).
   */
  async backfillBillingDetails(opts?: {
    limit?: number;
    force?: boolean;
  }): Promise<{ processed: number; updated: number; failed: number }> {
    const limit = Math.min(Math.max(opts?.limit ?? 1000, 1), 5000);
    const qb = this.repo
      .createQueryBuilder('p')
      .where('p.status = :s', { s: 'paid' })
      .andWhere('p."providerSessionId" IS NOT NULL');
    if (!opts?.force) qb.andWhere('p."billingSyncedAt" IS NULL');
    const rows = await qb.orderBy('p."createdAt"', 'DESC').take(limit).getMany();

    let updated = 0;
    let failed = 0;
    for (const p of rows) {
      try {
        const d = await this.fetchStripeCustomerDetails(p.id);
        const upd: Partial<Payment> = { billingSyncedAt: new Date() };
        if (d?.name && !p.customerName) upd.customerName = d.name.slice(0, 160);
        if (d?.email && !p.customerEmail) upd.customerEmail = d.email.slice(0, 320);
        const a = d?.address ?? null;
        const street = [a?.line1, a?.line2].filter(Boolean).join(', ');
        if (street) upd.billingAddress = street.slice(0, 512);
        if (a?.city) upd.billingCity = a.city.slice(0, 128);
        if (a?.state) upd.billingCounty = a.state.slice(0, 128);
        if (a?.postalCode) upd.billingPostalCode = a.postalCode.slice(0, 32);
        if (a?.country) upd.billingCountry = a.country.slice(0, 8);
        if (d?.phone) upd.billingPhone = d.phone.slice(0, 64);
        await this.repo.update({ id: p.id }, upd);
        updated += 1;
      } catch (err) {
        this.logger.warn(`backfill billing ${p.id} failed: ${(err as Error).message}`);
        failed += 1;
      }
      await new Promise((r) => setTimeout(r, 120)); // throttle Stripe (~8/sec)
    }
    this.logger.log(
      `backfillBillingDetails: processed=${rows.length} updated=${updated} failed=${failed}`,
    );
    return { processed: rows.length, updated, failed };
  }

  /**
   * Face refund prin Stripe. Acceptă suma parțială (în cents) sau full refund
   * (default). Actualizează Payment.status la 'refunded' și salvează motivul.
   */
  async refund(
    paymentId: string,
    options: { amountCents?: number; reason?: string } = {},
  ): Promise<{ ok: true; refundId: string; amountCents: number } | { ok: false; error: string }> {
    const payment = await this.repo.findOne({ where: { id: paymentId } });
    if (!payment) return { ok: false, error: 'payment_not_found' };
    if (payment.status !== 'paid') {
      return { ok: false, error: `cannot refund payment with status='${payment.status}'` };
    }
    if (!payment.providerSessionId) {
      return { ok: false, error: 'no_provider_session_id' };
    }
    const stripe = await this.getStripe();
    if (!stripe) return { ok: false, error: 'stripe_not_configured' };

    try {
      const session = await stripe.checkout.sessions.retrieve(payment.providerSessionId);
      const piId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id;
      if (!piId) return { ok: false, error: 'no_payment_intent' };

      const refund = await stripe.refunds.create({
        payment_intent: piId,
        amount: options.amountCents,
        reason: options.reason === 'requested_by_customer' ? 'requested_by_customer' : undefined,
        metadata: {
          paymentId,
          adminReason: options.reason ?? '',
        },
      });

      await this.repo.update(
        { id: paymentId },
        {
          status: 'refunded',
          failureReason: options.reason ? `Refund: ${options.reason}` : 'Refund manual din admin',
          failureCode: 'refunded',
        },
      );

      return { ok: true, refundId: refund.id, amountCents: refund.amount };
    } catch (err) {
      this.logger.warn(`refund failed for ${paymentId}: ${(err as Error).message}`);
      return { ok: false, error: (err as Error).message };
    }
  }

  /**
   * Marchează manual o plată ca 'refunded' DOAR ca status, fără să apeleze
   * Stripe (niciun refund real) și fără să atingă facturarea. Util pentru plăți
   * vechi rambursate pe alt canal (transfer bancar / direct din Stripe dashboard)
   * pe care vrem doar să le reflectăm corect în sistem.
   */
  async markRefunded(
    paymentId: string,
    options: { reason?: string } = {},
  ): Promise<{ ok: true; status: 'refunded' } | { ok: false; error: string }> {
    const payment = await this.repo.findOne({ where: { id: paymentId } });
    if (!payment) return { ok: false, error: 'payment_not_found' };
    if (payment.status === 'refunded') return { ok: false, error: 'already_refunded' };
    if (payment.status !== 'paid') {
      return { ok: false, error: `cannot mark refunded a payment with status='${payment.status}'` };
    }

    const reason = options.reason?.trim();
    await this.repo.update(
      { id: paymentId },
      {
        status: 'refunded',
        failureReason: reason
          ? `Refunded manual: ${reason}`
          : 'Marcată refunded manual din admin (fără Stripe)',
        failureCode: 'manual_refund',
      },
    );

    this.logger.log(
      `Payment ${paymentId} marcată refunded manual (fără Stripe). Motiv: ${reason ?? '—'}`,
    );
    return { ok: true, status: 'refunded' };
  }
}

function extractIntentFailureReason(pi: Stripe.PaymentIntent): { reason: string; code: string } {
  const err = pi.last_payment_error;
  if (err) {
    const code = err.decline_code || err.code || err.type || 'unknown';
    const msg = err.message || `${err.type ?? 'Stripe'} error`;
    return { reason: msg, code };
  }
  return {
    reason: `PaymentIntent status="${pi.status}" fără last_payment_error`,
    code: pi.status,
  };
}
