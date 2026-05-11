import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';

import { Payment } from './payment.entity';
import { tipSurchargeCents } from './pricing';
import { PromoService } from '../promo/promo.service';
import { GiftCodesService } from '../gift-codes/gift-codes.service';
import { GiftTier, TIER_PRICES_RON } from '../gift-codes/gift-code.entity';
import { Site } from '../sites/site.entity';
import { SitesService } from '../sites/sites.service';
import { SettingsService } from '../settings/settings.service';
import { GenerationsService } from '../generations/generations.service';
import { CreateGenerationDto } from '../generations/dto/create-generation.dto';

interface CheckoutInput {
  userId: string | null;
  guestId: string | null;
  generationId?: string;
  tipAmount?: number;
  premium?: boolean;
  promoCode?: string;
  email?: string;
  site: Site;
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

  /** Tip-surcharge are sens doar pe RON (lei). Pe alte valute îl ignorăm. */
  private siteTipSurcharge(site: Site, tipAmount: number): number {
    if (site.currency.toUpperCase() !== 'RON') return 0;
    return tipSurchargeCents(tipAmount);
  }

  private siteTotal(site: Site, tipAmount: number): number {
    return site.basePriceCents + this.siteTipSurcharge(site, tipAmount);
  }

  /** Returnează prețul calculat (nu apelează Stripe). */
  quote(site: Site, input: { tipAmount?: number; premium?: boolean }) {
    const tip = input.tipAmount ?? 0;
    const surcharge = this.siteTipSurcharge(site, tip);
    const total = this.siteTotal(site, tip);
    return {
      base: site.basePriceCents,
      tipAmount: tip,
      tipSurcharge: surcharge,
      premiumExtra: 0,
      total,
      currency: site.currency,
    };
  }

  async createCheckoutSession(input: CheckoutInput): Promise<{ url: string; paymentId: string }> {
    const stripe = await this.getStripe();
    if (!stripe) throw new ServiceUnavailableException('Stripe not configured');
    const site = input.site;

    const baseTotal = this.siteTotal(site, input.tipAmount ?? 0);
    let total = baseTotal;
    let promoCodeId: string | undefined;
    let appliedDiscountCents = 0;
    if (input.promoCode) {
      const v = await this.promo.validate(input.promoCode, input.email, baseTotal, site.id);
      if (v.ok && v.appliedDiscountCents) {
        total = Math.max(50, baseTotal - v.appliedDiscountCents); // min 0,50 din motive Stripe
        promoCodeId = v.promoCodeId;
        appliedDiscountCents = v.appliedDiscountCents;
      }
    }

    const payment = await this.repo.save(
      this.repo.create({
        provider: 'stripe',
        amount: total,
        currency: site.currency,
        status: 'pending',
        userId: input.userId,
        guestId: input.guestId,
        siteId: site.id,
      }),
    );

    const siteUrl = this.siteAppUrl(site);
    const successPath = input.generationId
      ? `/m/${input.generationId}?paymentId=${payment.id}&success=1`
      : `/checkout/success?paymentId=${payment.id}`;
    const cancelPath = input.generationId
      ? `/m/${input.generationId}?paymentId=${payment.id}&cancel=1`
      : `/checkout/cancel?paymentId=${payment.id}`;

    const productName = site.stripe?.productName ?? site.name;
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        quantity: 1,
        price_data: {
          currency: site.currency.toLowerCase(),
          unit_amount: total,
          product_data: {
            name: input.premium
              ? `${productName} — Premium (90s, 2 versiuni)`
              : `${productName} (90s, 2 versiuni)`,
            description: input.tipAmount
              ? `Include dedicație de ${input.tipAmount} ${site.currency} în versuri.`
              : undefined,
          },
        },
      },
    ];

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: `${siteUrl}${successPath}`,
      cancel_url: `${siteUrl}${cancelPath}`,
      metadata: {
        paymentId: payment.id,
        generationId: input.generationId ?? '',
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
  }): Promise<{ url: string; paymentId: string; generationId: string }> {
    const stripe = await this.getStripe();
    if (!stripe) throw new ServiceUnavailableException('Stripe not configured');
    const site = input.site;

    const gen = await this.generations.createPendingForPayment(
      {
        ...input.generation,
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
      tipAmount: input.tipAmount ?? 0,
      premium: input.premium ?? false,
      promoCode: input.promoCode,
      email: input.email,
      site,
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
      }),
    );

    const siteUrl = this.siteAppUrl(site);
    const productName = site.stripe?.productName ?? site.name;
    const tierName =
      input.tier === 'single'
        ? `${productName}`
        : input.tier === 'pack3'
          ? `${productName} — pachet 3`
          : `${productName} — pachet 10`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: input.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: site.currency.toLowerCase(),
            unit_amount: total,
            product_data: {
              name: `🎁 ${tierName} (cod cadou)`,
              description: 'Cod cadou trimis pe email — îl folosești tu sau îl dai cui vrei.',
            },
          },
        },
      ],
      success_url: `${siteUrl}/cadou/success?paymentId=${payment.id}`,
      cancel_url: `${siteUrl}/cadou?paymentId=${payment.id}&cancel=1`,
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
