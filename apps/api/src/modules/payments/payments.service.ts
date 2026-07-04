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
import { PREMIUM_EXTRA_CENTS, packageTotalCents } from './pricing';
import { normalizeTier, packageCompareAtCents, PackageTier } from './packages';
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
import { inferBuyerGender } from '../analytics/gender-infer';
import { MetaCapiService } from '../meta-capi/meta-capi.service';
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
   * (`packageTotalCents`, cu override per-site) și se IGNORĂ tip/premium.
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
    private readonly moduleRef: ModuleRef,
    private readonly metaCapi: MetaCapiService,
  ) {}

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

  /** Totalul pentru un pachet, cu override per-site (cents). */
  private sitePackageTotal(site: Site, tier: PackageTier): number {
    return packageTotalCents(tier, site.packagePricesCents ?? null);
  }

  /** Returnează prețul calculat (nu apelează Stripe). Suportă AMBELE modele:
   *  - PACHETE (input.packageTier setat) → total = prețul pachetului,
   *  - LEGACY (tip + premium) → comportamentul vechi, păstrat pentru compat. */
  quote(site: Site, input: { tipAmount?: number; premium?: boolean; packageTier?: PackageTier }) {
    if (input.packageTier) {
      const tier = normalizeTier(input.packageTier);
      const total = this.sitePackageTotal(site, tier);
      // Preț „tăiat" de afișare (marketing) — nu afectează checkout-ul.
      const compareAtCents = packageCompareAtCents(
        tier,
        site.packageCompareAtCents ?? null,
        site.packagePricesCents ?? null,
      );
      return { packageTier: tier, total, currency: site.currency, compareAtCents };
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
    const stripe = await this.getStripe();
    if (!stripe) throw new ServiceUnavailableException('Stripe not configured');
    const site = input.site;

    // Email pentru validarea promo (cod restricționat pe email) și precompletarea
    // Stripe Checkout. La reluarea plății dintr-un alt device/browser (link de
    // recovery), sesiunea owner lipsește → îl rezolvăm din owner-ul generării.
    let resolvedEmail = input.email ?? undefined;
    if (!resolvedEmail && input.generationId) {
      resolvedEmail =
        (await this.generations.resolveOwnerEmail(input.generationId)) ?? undefined;
    }

    // Admin chat poate suprascrie suma calculată cu un custom. Min 50 cents = limita Stripe.
    const hasOverride = typeof input.overrideAmount === 'number' && input.overrideAmount > 0;
    const baseTotal = hasOverride
      ? Math.max(50, Math.round(input.overrideAmount!))
      : input.packageTier
        ? // Model PACHETE: total = prețul pachetului (ignorăm tip/premium).
          this.sitePackageTotal(site, normalizeTier(input.packageTier))
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

    // Cap discount-ul la baseTotal - 50 ca să rămână peste minimul Stripe (50 cents).
    appliedDiscountCents = Math.min(appliedDiscountCents, Math.max(0, baseTotal - 50));
    const total = Math.max(50, baseTotal - appliedDiscountCents);

    const payment = await this.repo.save(
      this.repo.create({
        provider: 'stripe',
        amount: total,
        currency: site.currency,
        status: 'pending',
        userId: input.userId,
        guestId: input.guestId,
        siteId: site.id,
        // Meta Pixel attribution — persistăm la create ca să fie disponibile în
        // webhook-ul Purchase (server→server, fără cookies de browser).
        fbp: input.fbp ?? null,
        fbc: input.fbc ?? null,
        userAgent: input.userAgent ?? null,
        ipAddress: input.ipAddress ?? null,
        sessionKey: input.sessionKey ?? null,
        visitorId: input.visitorId ?? null,
      }),
    );

    const siteUrl = this.siteAppUrl(site);
    const successPath = input.generationId
      ? `/m/${input.generationId}?paymentId=${payment.id}&success=1`
      : `/checkout/success?paymentId=${payment.id}`;
    // Pay-first (site.demoEnabled=false): la cancel, generation-ul e `pending`
    // și `/m/<id>` ar arăta progress bar mincinos (vezi IN_PROGRESS_STATUSES
    // care include `pending`). Trimitem userul înapoi pe wizard la step 5 cu
    // datele restaurate ca să poată reîncerca plata.
    const isPayFirst = site.demoEnabled === false;
    const cancelPath =
      isPayFirst && input.generationId
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
        promoCodeId: promoCodeId ?? '',
        appliedDiscountCents: String(appliedDiscountCents),
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
  }): Promise<{ url: string; paymentId: string; generationId: string }> {
    const stripe = await this.getStripe();
    if (!stripe) throw new ServiceUnavailableException('Stripe not configured');
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
      },
    );

    const checkout = await this.createCheckoutSession({
      userId: input.userId,
      guestId: input.guestId,
      generationId: gen.id,
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

  /** Construiește URL-ul de bază pentru success/cancel (folosit și de Stripe Checkout). */
  private siteAppUrl(site: Site): string {
    // În dev (localhost domain), respectă APP_URL din env. Altfel, https://<domain>.
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

    const payment = await this.repo.save(
      this.repo.create({
        provider: 'stripe',
        amount: total,
        currency: site.currency,
        status: 'pending',
        userId: input.userId,
        guestId: input.guestId,
        siteId: site.id,
        // Meta Pixel attribution — persistăm la create ca să fie disponibile în
        // webhook-ul Purchase (server→server, fără cookies de browser).
        fbp: input.fbp ?? null,
        fbc: input.fbc ?? null,
        userAgent: input.userAgent ?? null,
        ipAddress: input.ipAddress ?? null,
        sessionKey: input.sessionKey ?? null,
        visitorId: input.visitorId ?? null,
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

      // Recuperăm exchange_rate din balance_transaction (pentru rapoarte RON
      // pe site-uri cu valută diferită).
      if (isPaid && session.payment_intent) {
        try {
          const piId = typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent.id;
          const pi = await stripe.paymentIntents.retrieve(piId, {
            expand: ['latest_charge.balance_transaction'],
          });
          const charge = pi.latest_charge as Stripe.Charge | null;
          const bt = charge?.balance_transaction as Stripe.BalanceTransaction | null;
          if (bt && bt.exchange_rate != null) {
            update.exchangeRateToRon = String(bt.exchange_rate);
            // Stripe convertește în RON la payout (cont Stripe RO).
            // amount = în valuta site, bt.amount = în RON cents la cursul aplicat.
            update.amountRonCents = bt.amount;
          } else if (session.currency && session.currency.toUpperCase() === 'RON') {
            update.exchangeRateToRon = '1';
            update.amountRonCents = session.amount_total ?? null;
          }
        } catch (err) {
          this.logger.warn(`balance_transaction lookup failed: ${(err as Error).message}`);
        }
      }

      // Setăm siteId pe payment dacă lipsește (poate fi creat înainte ca middleware-ul
      // de site să fie complet rulat în vechi requests).
      if (metaSiteId) update.siteId = metaSiteId;

      await this.repo.update({ id: paymentId }, update);

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
              value: amountRon,
              currency: (session.currency ?? 'RON').toUpperCase(),
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

      // Flux demo + unlock (chat): generation există deja în starea demo,
      // plata deblochează versiunea full. Setăm paidUnlocked=true + trimitem
      // un mesaj nou cu linkul melodiei complete.
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
            value: amount / 100,
            currency,
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
            valueCents: amount,
            currency,
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
   * EUR dar Stripe îți virează în RON — factura se emite pe suma în RON efectiv
   * încasată (`balance_transaction.amount`, brut, înainte de comision). O persistă
   * pe `amountRonCents` + `exchangeRateToRon` ca să nu reinterogăm. Null dacă nu se
   * poate determina (fără Stripe/sesiune/balance_transaction).
   */
  async resolveRonAmount(
    paymentId: string,
  ): Promise<{ amountRonCents: number; exchangeRate: number | null } | null> {
    const p = await this.repo.findOne({ where: { id: paymentId } });
    if (!p) return null;
    if ((p.currency || 'RON').toUpperCase() === 'RON') {
      return { amountRonCents: p.amount, exchangeRate: 1 };
    }
    if (p.amountRonCents != null && p.amountRonCents > 0) {
      return {
        amountRonCents: p.amountRonCents,
        exchangeRate: p.exchangeRateToRon ? Number(p.exchangeRateToRon) : null,
      };
    }
    if (!p.providerSessionId) return null;
    const stripe = await this.getStripe();
    if (!stripe) return null;
    try {
      const sid = p.providerSessionId;
      let bt: Stripe.BalanceTransaction | null = null;
      if (sid.startsWith('pi_')) {
        const pi = await stripe.paymentIntents.retrieve(sid, {
          expand: ['latest_charge.balance_transaction'],
        });
        bt = ((pi.latest_charge as Stripe.Charge | null)?.balance_transaction as Stripe.BalanceTransaction) ?? null;
      } else {
        const session = await stripe.checkout.sessions.retrieve(sid, {
          expand: ['payment_intent.latest_charge.balance_transaction'],
        });
        const pi = session.payment_intent as Stripe.PaymentIntent | null;
        bt = ((pi?.latest_charge as Stripe.Charge | null)?.balance_transaction as Stripe.BalanceTransaction) ?? null;
      }
      if (!bt || typeof bt.amount !== 'number' || bt.amount <= 0) return null;
      const ronCents = bt.amount; // brut, în moneda de settlement (RON)
      const rate = bt.exchange_rate != null ? Number(bt.exchange_rate) : null;
      await this.repo.update(paymentId, {
        amountRonCents: ronCents,
        exchangeRateToRon: rate != null ? String(rate) : null,
        ...(typeof bt.fee === 'number'
          ? { stripeFeeCents: bt.fee, stripeFeeCurrency: (bt.currency ?? 'ron').toUpperCase() }
          : {}),
      });
      return { amountRonCents: ronCents, exchangeRate: rate };
    } catch (err) {
      this.logger.warn(`resolveRonAmount ${paymentId}: ${(err as Error).message}`);
      return null;
    }
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
