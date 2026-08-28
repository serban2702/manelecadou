# Configurare Stripe pentru multi-site (un singur cont Stripe pentru toate țările)

## Decizia arhitecturală

Folosim **un singur cont Stripe** pentru toate cele 10 site-uri. Avantaje:
- 1 SECRET_KEY, 1 webhook, 1 dashboard.
- Plățile din toate site-urile apar consolidat — bun pentru contabilitate.
- Cash-flow agregat (un singur transfer bancar, nu 10).

Dezavantaj: separarea contabilă pe țări trebuie făcută de tine prin **metadata Stripe** + raportarea filtrată din admin (nu din Stripe Dashboard direct).

## Ce trebuie să faci în contul Stripe

### 1. Activează plățile în mai multe valute (multi-currency)

Stripe permite din coada (out of the box) să accepți plăți în orice valută acceptată — **doar dacă ai contul Stripe verificat în țara unde acceptă acea valută**. Dacă contul tău e în România:
- **RON, EUR, USD, GBP** — funcționează direct.
- **BGN (Bulgaria), RSD (Serbia), MKD (Macedonia), ALL (Albania), HRK (Croația — acum EUR), HUF (Ungaria)** — Stripe nu suportă oficial decât prin **Stripe Connect cu localizare per țară** sau prin a colecta plățile în EUR în acele țări (recomandat).

> **Recomandare**: pe site-urile balcanice cu valute exotice, afișează prețul în valuta locală pentru psihologie de marketing, dar facturează în **EUR** la Stripe (sau **RON** dacă userul e din UE și acceptă conversie). Setează `currency: 'eur'` pe site-ul respectiv în admin → `Site.currency = 'EUR'`. UI-ul afișează `basePriceCents / 100` cu simbolul valutei.

### 2. Creează webhook-ul

În Stripe Dashboard → Developers → Webhooks → Add endpoint:

- **URL**: `https://manelecadou.ro/api/payments/webhook` — API-ul e expus
  same-origin pe fiecare domeniu de tenant. **Nu există `api.manelecadou.ro`**
  (vezi CLAUDE.md §11.3); un webhook configurat spre el n-ar ajunge nicăieri.
- **Events**:
  - `checkout.session.completed`
  - `payment_intent.succeeded`
  - `charge.refunded`
- Salvează `whsec_...` → `STRIPE_WEBHOOK_SECRET` în `.env` API.

### 3. Statement descriptors per site

Pe checkout.session, codul nostru setează `payment_intent_data.statement_descriptor_suffix` din `Site.stripe.statementDescriptor` (max 22 chars). Asta apare pe extrasul cardului clientului.

Default per site: `MANELE-RO`, `MANELE-BG`, etc. — îți permite să vezi în Stripe Dashboard din ce țară a venit plata fără să cauți metadata.

### 4. Metadata pe checkout session

La fiecare `checkout.session.create`, codul atașează automat:

```json
{
  "siteId": "<uuid>",
  "siteSlug": "ro" | "bg" | "rs" | ...,
  "siteDomain": "manelecadou.ro",
  "generationId": "...",
  "productType": "demo_unlock" | "gift_code"
}
```

Asta permite:
- **Filtrare în Stripe Dashboard** după țară: caută în Payments cu `metadata['siteSlug']:bg`.
- **Webhook handler-ul** știe pe ce site să marcheze plata ca paid.

### 5. Cont bancar / payouts + conversie automată în RON

Există un singur payout schedule. Banii din toate site-urile aterizează în același cont, **convertiți automat în RON** de Stripe.

**Cum funcționează conversia auto la RON:**
- Cardul utilizatorului e taxat în valuta din line_item (`Site.currency`, ex. EUR pentru BG, RON pentru RO).
- Stripe colectează plata în valuta acelei tranzacții.
- La payout (transferul către contul tău bancar din RO), Stripe **convertește automat** în RON folosind cursul Stripe (de obicei mid-market + ~2% spread). Asta apare ca tranzacție de „currency conversion" în dashboard.
- Concluzie: tu primești tot în RON pe contul bancar, indiferent că plătesc oameni din BG, RS, GR, etc.

**Activare**: în Stripe Dashboard → Settings → Payouts → asigură-te că **payout currency = RON**. Dacă vrei să optimizezi spread-ul de FX:
- Activează „**Multi-currency settlements**" (Stripe Atlas/EU pentru anumite valute) — Stripe ține solduri separate per valută și convertește doar la payout, ceea ce reduce numărul de conversii.
- Sau lasă default (conversie pe fiecare tranzacție) — mai simplu.

> **Decizie actuală**: un singur cont Stripe România, plățile se fac în valuta site-ului (UX nativ — bulgarii văd EUR/BGN, sârbii RSD, etc.), iar conversia la RON e automat la payout. Separarea contabilă pe site-uri o faci pe baza rapoartelor admin filtrate per `siteId`, cu suma originală în valuta tranzacției + suma echivalentă în RON din webhook (`event.data.object.amount` + `currency` × cursul de la `payment_intent.charges.data[0].balance_transaction.exchange_rate`).

## Variabile de mediu necesare

```env
# .env la API (global)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_live_...   # opțional pe API, dar sigur pe web
```

Atât. Toate celelalte (preț, valută, descriptor, success URL) ies din `Site.*` în baza de date.

## Modul în care code-ul folosește contul

`PaymentsService.createCheckoutSession({ generation, site })`:

```ts
const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  line_items: [{
    price_data: {
      currency: site.currency.toLowerCase(),
      unit_amount: site.basePriceCents,
      product_data: {
        name: site.stripe.productName ?? 'Manea personalizată',
      },
    },
    quantity: 1,
  }],
  success_url: `https://${site.domain}/m/${generation.id}?success=1`,
  cancel_url: `https://${site.domain}/studio?canceled=1`,
  metadata: {
    siteId: site.id,
    siteSlug: site.slug,
    siteDomain: site.domain,
    generationId: generation.id,
  },
  payment_intent_data: {
    statement_descriptor_suffix: site.stripe.statementDescriptor ?? 'MANELE',
  },
});
```

Webhook handler citește `metadata.siteId` și marchează `Payment.siteId` corect.

## Test mode pe fiecare site (dev)

Toate site-urile folosesc același `STRIPE_SECRET_KEY` (test sau prod). Pe `localhost`, Site-ul default rezolvă din `Host: localhost:1500` — `SitesService.resolveFromHost` întoarce site-ul cu `isDefault: true`.

Pentru a testa un site BG specific local:
```bash
# adaugă în /etc/hosts
127.0.0.1 manelecadou.bg.local

# acum http://manelecadou.bg.local:1500 → web folosește Site BG
```

## Rapoarte contabile per site

În admin → **Payments** → selector de site (sau "Toate site-urile"). Export CSV per site pentru ANAF / fisc local. Filtrare query e simplă: `WHERE siteId = $1 AND status = 'paid' AND paidAt BETWEEN ...`.
