import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SiteShell } from '@/components/SiteShell';
import { getSiteConfig } from '@/lib/site-config';

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteConfig();
  const t = await getTranslations('legal.cookies');
  return { title: `${t('title')} — ${site.name}` };
}

export default async function CookiesPage() {
  const t = await getTranslations('legal.cookies');
  return (
    <SiteShell hideStickyCta>
      <div className="inner-page">
        <h1 className="gold-text">{t('title')}</h1>
        <p className="lead">{t('lead')}</p>

        <h2>{t('sec1.h')}</h2>
        <p>{t('sec1.p')}</p>

        <h2>{t('sec2.h')}</h2>
        <p>{t('sec2.p')}</p>

        <h2>{t('sec3.h')}</h2>

        <h2 style={{ fontSize: 16 }}>{t('cat1.h')}</h2>
        <ul>
          <li>{t.rich('cat1.b1', { code: (chunks) => <code>{chunks}</code> })}</li>
          <li>{t.rich('cat1.b2', { code: (chunks) => <code>{chunks}</code> })}</li>
          <li>{t.rich('cat1.b3', { code: (chunks) => <code>{chunks}</code> })}</li>
        </ul>

        <h2 style={{ fontSize: 16 }}>{t('cat2.h')}</h2>
        <ul>
          <li>{t.rich('cat2.b1', { code: (chunks) => <code>{chunks}</code> })}</li>
        </ul>

        <h2 style={{ fontSize: 16 }}>{t('cat3.h')}</h2>
        <ul>
          <li>{t.rich('cat3.b1', { code: (chunks) => <code>{chunks}</code> })}</li>
          <li>{t.rich('cat3.b2', { code: (chunks) => <code>{chunks}</code> })}</li>
        </ul>

        <h2 style={{ fontSize: 16 }}>{t('cat4.h')}</h2>
        <ul>
          <li>{t.rich('cat4.b1', { code: (chunks) => <code>{chunks}</code> })}</li>
          <li>{t.rich('cat4.b2', { code: (chunks) => <code>{chunks}</code> })}</li>
        </ul>

        <h2>{t('sec4.h')}</h2>
        <p>{t('sec4.p')}</p>
      </div>
    </SiteShell>
  );
}
