import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SiteShell } from '@/components/SiteShell';
import { getFromPriceCents, getSiteConfig, formatPrice } from '@/lib/site-config';

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteConfig();
  const t = await getTranslations('legal.terms');
  return { title: `${t('title')} — ${site.name}` };
}

export default async function TermeniPage() {
  const site = await getSiteConfig();
  const t = await getTranslations('legal.terms');
  const company = site.companyInfo ?? {};
  const legalName = company.legalName || site.name;
  // Prețurile reale sunt pe pachete (editabile din admin). În termeni afișăm
  // pragul „de la", nu `basePriceCents` — care e câmpul legacy și diverge.
  const fromCents = await getFromPriceCents();
  const fromPrice = fromCents !== null ? formatPrice(site, fromCents) : null;
  const tipPct = String(site.tipSurchargePercent ?? 5);
  const tipCap = formatPrice(site, site.tipSurchargeCapCents ?? 5000);
  const businessEmail = `business@${site.domain}`;
  const regSuffix = (company.regCom || company.cui)
    ? t('sec1.regSuffix', { regCom: company.regCom || '—', cui: company.cui || '—' })
    : '';
  const addressSuffix = company.address
    ? t('sec1.addressSuffix', { address: company.address })
    : '';
  return (
    <SiteShell hideStickyCta>
      <div className="inner-page">
        <h1 className="gold-text">{t('title')}</h1>
        <p className="lead">{t('lastUpdate')}</p>

        <h2>{t('sec1.h')}</h2>
        <p>
          {t.rich('sec1.p', {
            b: (chunks) => <b>{chunks}</b>,
            domain: site.domain,
            legalName,
            regSuffix,
            addressSuffix,
          })}
        </p>

        <h2>{t('sec2.h')}</h2>
        <p>{t('sec2.p1')}</p>
        <p>{t.rich('sec2.p2', { b: (chunks) => <b>{chunks}</b> })}</p>

        <h2>{t('sec3.h')}</h2>
        <ul>
          <li>{t('sec3.b1')}</li>
          {fromPrice !== null && (
            <li>{t.rich('sec3.b2', { b: (chunks) => <b>{chunks}</b>, fromPrice })}</li>
          )}
          <li>{t('sec3.b3', { pct: tipPct, cap: tipCap })}</li>
          <li>{t('sec3.b4')}</li>
        </ul>

        <h2>{t('sec4.h')}</h2>
        <p>
          {t.rich('sec4.p', {
            a: (chunks) => (
              <a href={`mailto:${businessEmail}`} style={{ color: 'var(--gold)' }}>
                {chunks}
              </a>
            ),
            email: businessEmail,
          })}
        </p>

        <h2>{t('sec5.h')}</h2>
        <p>{t('sec5.intro')}</p>
        <ul>
          <li>{t('sec5.b1')}</li>
          <li>{t('sec5.b2')}</li>
          <li>{t('sec5.b3')}</li>
          <li>{t('sec5.b4')}</li>
        </ul>
        <p>{t('sec5.out')}</p>

        <h2>{t('sec6.h')}</h2>
        <p>{t.rich('sec6.p', { b: (chunks) => <b>{chunks}</b> })}</p>

        <h2>{t('sec7.h')}</h2>
        <p>{t('sec7.p')}</p>

        <h2>{t('sec8.h')}</h2>
        <p>
          {t.rich('sec8.p', {
            a: (chunks) => (
              <a href="https://anpc.ro" style={{ color: 'var(--gold)' }}>
                {chunks}
              </a>
            ),
          })}
        </p>
      </div>
    </SiteShell>
  );
}
