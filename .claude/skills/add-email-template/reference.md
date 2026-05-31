# Referință — anatomia unui șablon de marketing

## Tipul `MarketingRenderVars`

Variabilele pe care le primește orice template la `render(vars)`:

```ts
interface MarketingRenderVars {
  recipientName?: string | null; // numele destinatarului (gol → salut generic)
  ctaUrl: string;                // unde duce butonul principal (de obicei site-ul)
  ctaLabel?: string | null;      // override text buton
  promoCode?: string | null;     // codul afișat în card (dacă oferta are reducere)
  discountLabel?: string | null; // "20%" sau "15 lei"
  validUntil?: string | null;    // data formatată (string)
  headline?: string | null;      // titlu custom (pt. customHeadline)
  bodyHtml?: string | null;      // corp HTML custom (pt. customBody)
  locale?: string;               // ro|bg|sr|tr|el|hr|sl|bs
  branding?: EmailBranding;      // logo/footer/firma per site (vine automat)
}
```

`branding` și `locale` sunt injectate automat de `MarketingService` din `Site`-ul curent.
La preview în admin se folosesc valorile din `sample`.

## Helperi disponibili în `marketing.ts`

- `escape(s)` — escape HTML pentru orice input dinamic. **Folosește-l mereu.**
- `ctaButton(href, label)` — butonul gold standard.
- `promoCard(code, discountLabel, validUntil, strings)` — cardul cu cod (dashed border).
- `greeting(strings, name)` — „Salut, Andrei! 👋" sau „Salut! 👋".
- `namePrefix(name)` — „Andrei, " sau „" (pt. începutul unei fraze).
- `mstr(locale)` — întoarce dicționarul de string-uri pentru locale (fallback EN).
- `unsubscribeFooter(v.unsubscribeUrl, v.locale)` — linkul de dezabonare. **Pune-l la finalul
  `bodyHtml`** în orice șablon de marketing (legal necesar). Se ascunde singur dacă nu există URL.
- `renderBrandedEmail({ subject, preheader, locale, branding, bodyHtml })` — layout complet
  (banner + card + footer cu firma/contact). Returnează string HTML.

## Schelet minim de template nou

```ts
export function myOfferTemplate(v: MarketingRenderVars): { subject: string; html: string; text: string } {
  const s = mstr(v.locale);
  const subject = v.headline || 'Titlul meu';
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:18px;color:${COLORS.goldMid};font-weight:700;">${greeting(s, v.recipientName)}</p>
    <h2 style="margin:0 0 12px;font-family:'Times New Roman',serif;color:${COLORS.goldMid};font-size:22px;">${escape(subject)}</h2>
    <p style="margin:0 0 8px;color:${COLORS.cream};line-height:1.6;">Textul ofertei...</p>
    ${v.promoCode ? promoCard(v.promoCode, v.discountLabel, v.validUntil, s.discount) : ''}
    <div style="text-align:center;">${ctaButton(v.ctaUrl, v.ctaLabel || s.discount.cta)}</div>
    ${unsubscribeFooter(v.unsubscribeUrl, v.locale)}
  `;
  return {
    subject,
    html: renderBrandedEmail({ subject, preheader: subject, locale: v.locale, branding: v.branding, bodyHtml }),
    text: `${greeting(s, v.recipientName)}\n\nTextul ofertei...\n\n${v.ctaUrl}`,
  };
}
```

## `COLORS` (paleta brand)

```
goldFrom #fff5cc · goldMid #ffe28a · goldDeep #b07c1e · cream #fff5dc
```

## Checklist înainte de „gata"

- [ ] `id` unic, snake_case, stabil (nu îl mai schimba după ce a fost folosit într-o campanie/regulă).
- [ ] Funcția întoarce `subject`, `html` ȘI `text`.
- [ ] Tot inputul dinamic e trecut prin `escape()`.
- [ ] Footer de dezabonare inclus (`unsubscribeFooter(v.unsubscribeUrl, v.locale)`) — obligatoriu la marketing.
- [ ] Înregistrat în `MARKETING_TEMPLATES` cu `supports` + `sample` corecte.
- [ ] `supports.customHeadline`/`customBody` reflectă ce câmpuri folosește efectiv render-ul.
- [ ] RO complet; restul limbilor traduse sau fallback EN.
- [ ] `npx tsc --noEmit` curat în `apps/api`.
- [ ] Preview verificat (admin sau `/tmp/email-preview.html`) împreună cu userul.
