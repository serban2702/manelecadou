import type { Metadata } from 'next';
import { SiteShell } from '@/components/SiteShell';
import { getSiteConfig, formatPrice } from '@/lib/site-config';

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteConfig();
  return { title: `Termeni și condiții — ${site.name}` };
}

export default async function TermeniPage() {
  const site = await getSiteConfig();
  const company = site.companyInfo ?? {};
  const legalName = company.legalName || site.name;
  const fullPrice = formatPrice(site, site.basePriceCents);
  return (
    <SiteShell hideStickyCta>
      <div className="inner-page">
        <h1 className="gold-text">Termeni și condiții</h1>
        <p className="lead">Ultima actualizare: 1 mai 2026</p>

        <h2>1. Părțile contractante</h2>
        <p>
          Acest site ({site.domain}) este operat de <b>{legalName}</b>
          {(company.regCom || company.cui) && (
            <>
              , înregistrată la Registrul Comerțului sub numărul {company.regCom || '—'}, CUI {company.cui || '—'}
            </>
          )}
          {company.address ? <>, cu sediul în {company.address}</> : null}.
        </p>

        <h2>2. Despre serviciu</h2>
        <p>
          Oferim un serviciu de generare de manele cu inteligență artificială. Tu introduci stilul,
          ocazia, mesajul, vocea — noi îți întoarcem 1-2 piese audio MP3 generate automat.
        </p>
        <p>
          <b>Important:</b> toate vocile sunt sintetice (AI). Numele artiștilor (Florinel de Aur, Adi
          Șampanie, etc.) sunt fictive și parodice. Nu reprezentăm artiști reali, vii sau decedați.
        </p>

        <h2>3. Prețuri și plăți</h2>
        <ul>
          <li>Demo gratuit: 30 secunde, 1 per cont/sesiune.</li>
          <li>Manea completă: <b>{fullPrice}</b> (TVA inclus).</li>
          <li>Suprataxă dedicație: 10% din suma menționată în versuri, plafonată la 150 lei (doar pentru lei).</li>
          <li>Plățile se procesează prin Stripe — nu stocăm datele cardului.</li>
        </ul>

        <h2>4. Drepturi de utilizare</h2>
        <p>
          Maneaua îți aparține pentru utilizare personală: o poți asculta, descărca, da pe TikTok,
          pune pe Story. Pentru utilizare comercială (reclame plătite, monetizare YouTube etc.),
          contactează-ne la <a href={`mailto:business@${site.domain}`} style={{ color: 'var(--gold)' }}>business@{site.domain}</a>.
        </p>

        <h2>5. Conținut interzis</h2>
        <p>Nu generăm manele cu:</p>
        <ul>
          <li>Insulte rasiale, etnice, religioase</li>
          <li>Amenințări sau apeluri la violență</li>
          <li>Conținut sexual explicit</li>
          <li>Identitate furată (impersonare a unei persoane reale fără consimțământ)</li>
        </ul>
        <p>Ne rezervăm dreptul de a refuza generarea și de a returna banii pentru request-uri neconforme.</p>

        <h2>6. Returnare</h2>
        <p>
          Conform OUG 34/2014 art. 16(m), produsele digitale customizate (cum sunt manelele tale
          unicat) <b>nu pot fi returnate</b> după livrare. Excepție: dacă maneaua are defect tehnic,
          o regenerăm gratis sau returnăm banii la cerere.
        </p>

        <h2>7. Limitarea răspunderii</h2>
        <p>
          AI-ul poate genera versuri ne-conforme cu intenția ta. Te rugăm să citești versurile înainte
          să le distribui public. Nu suntem răspunzători pentru daune indirecte rezultate din folosirea
          maneluței în context inadecvat.
        </p>

        <h2>8. Litigii</h2>
        <p>
          Litigiile se rezolvă pe cale amiabilă. În caz de eșec, competența aparține instanțelor
          române. Pentru consumatori: ANPC — <a href="https://anpc.ro" style={{ color: 'var(--gold)' }}>anpc.ro</a>.
        </p>
      </div>
    </SiteShell>
  );
}
