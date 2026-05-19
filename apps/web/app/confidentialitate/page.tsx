import type { Metadata } from 'next';
import { getTranslations, getLocale } from 'next-intl/server';
import { SiteShell } from '@/components/SiteShell';
import { getSiteConfig } from '@/lib/site-config';
import { getLegalPath } from '@/lib/legal-slugs';

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteConfig();
  const t = await getTranslations('legal.privacy');
  return { title: `${t('title')} — ${site.name}` };
}

export default async function PrivacyPage() {
  const site = await getSiteConfig();
  const t = await getTranslations('legal.privacy');
  const locale = await getLocale();
  const company = site.companyInfo ?? {};
  const legalName = company.legalName || site.name;
  const dpoEmail = `dpo@${site.domain}`;
  const cuiSuffix = company.cui ? t('sec1.cuiSuffix', { cui: company.cui }) : '';
  const cookiesHref = getLegalPath(locale, 'cookies');

  return (
    <SiteShell hideStickyCta>
      <div className="inner-page">
        <h1 className="gold-text">{t('title')}</h1>
        <p className="lead">{t('lead')}</p>

        <h2>{t('sec1.h')}</h2>
        <p>
          {t.rich('sec1.p', {
            b: (chunks) => <b>{chunks}</b>,
            a: (chunks) => (
              <a href={`mailto:${dpoEmail}`} style={{ color: 'var(--gold)' }}>
                {chunks}
              </a>
            ),
            legalName,
            cuiSuffix,
            dpoEmail,
          })}
        </p>

        <h2>{t('sec2.h')}</h2>
        <ul>
          <li>{t.rich('sec2.b1', { b: (chunks) => <b>{chunks}</b> })}</li>
          <li>{t.rich('sec2.b2', { b: (chunks) => <b>{chunks}</b> })}</li>
          <li>{t.rich('sec2.b3', { b: (chunks) => <b>{chunks}</b> })}</li>
          <li>{t.rich('sec2.b4', { b: (chunks) => <b>{chunks}</b> })}</li>
          <li>{t.rich('sec2.b5', { b: (chunks) => <b>{chunks}</b> })}</li>
        </ul>

        <h2>{t('sec3.h')}</h2>
        <ul>
          <li>{t('sec3.b1')}</li>
          <li>{t('sec3.b2')}</li>
          <li>{t('sec3.b3')}</li>
          <li>{t('sec3.b4')}</li>
        </ul>
        <p>{t('sec3.out')}</p>

        <h2>{t('sec4.h')}</h2>
        <ul>
          <li>{t('sec4.b1')}</li>
          <li>{t('sec4.b2')}</li>
          <li>{t('sec4.b3')}</li>
        </ul>

        <h2>{t('sec5.h')}</h2>
        <p>{t('sec5.intro')}</p>
        <ul>
          <li>{t('sec5.b1')}</li>
          <li>{t('sec5.b2')}</li>
          <li>{t('sec5.b3')}</li>
          <li>{t('sec5.b4')}</li>
          <li>{t('sec5.b5')}</li>
          <li>
            {t.rich('sec5.b6', {
              a: (chunks) => (
                <a href="https://dataprotection.ro" style={{ color: 'var(--gold)' }}>
                  {chunks}
                </a>
              ),
            })}
          </li>
        </ul>

        <h2>{t('sec6.h')}</h2>
        <p>
          {t.rich('sec6.p', {
            a: (chunks) => (
              <a href={cookiesHref} style={{ color: 'var(--gold)' }}>
                {chunks}
              </a>
            ),
          })}
        </p>

        <h2>{t('sec7.h')}</h2>
        <ul>
          <li>{t.rich('sec7.b1', { b: (chunks) => <b>{chunks}</b> })}</li>
          <li>{t.rich('sec7.b2', { b: (chunks) => <b>{chunks}</b> })}</li>
          <li>{t.rich('sec7.b3', { b: (chunks) => <b>{chunks}</b> })}</li>
        </ul>
      </div>
    </SiteShell>
  );
}
