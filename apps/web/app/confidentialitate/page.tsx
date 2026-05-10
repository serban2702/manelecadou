import type { Metadata } from 'next';
import { SiteShell } from '@/components/SiteShell';
import { getSiteConfig } from '@/lib/site-config';

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteConfig();
  return { title: `Politica de confidențialitate — ${site.name}` };
}

export default async function PrivacyPage() {
  const site = await getSiteConfig();
  const company = site.companyInfo ?? {};
  const legalName = company.legalName || site.name;
  const dpoEmail = `dpo@${site.domain}`;
  return (
    <SiteShell hideStickyCta>
      <div className="inner-page">
        <h1 className="gold-text">Politica de confidențialitate</h1>
        <p className="lead">Cum tratăm datele tale (GDPR-friendly).</p>

        <h2>1. Cine colectează datele</h2>
        <p>
          Operatorul de date este <b>{legalName}</b>{company.cui && <>, CUI {company.cui}</>}. Pentru orice întrebare sau
          cerere GDPR (acces, ștergere, portabilitate): <a href={`mailto:${dpoEmail}`} style={{ color: 'var(--gold)' }}>{dpoEmail}</a>.
        </p>

        <h2>2. Ce date colectăm</h2>
        <ul>
          <li><b>Email-ul tău</b> — pentru a-ți livra maneaua și pentru autentificare.</li>
          <li><b>ID de sesiune guest</b> (UUID anonim) — în localStorage, ne ajută să-ți reținem starea fără cont.</li>
          <li><b>Conținutul request-ului</b> (nume destinatar, mesaj, stil) — folosit doar pentru a genera maneaua ta.</li>
          <li><b>Date tehnice</b> (IP, browser, timestamp) — pentru securitate și prevenirea abuzului.</li>
          <li><b>Plăți</b> — Stripe procesează cardul. Noi vedem doar statusul (paid/failed) și suma.</li>
        </ul>

        <h2>3. Pentru ce le folosim</h2>
        <ul>
          <li>Livrarea serviciului (generare manea + email).</li>
          <li>Suport tehnic și răspuns la întrebări.</li>
          <li>Statistici agregate, fără date personale.</li>
          <li>Combaterea abuzului (rate-limit, ban).</li>
        </ul>
        <p>Nu vindem datele tale. Niciodată.</p>

        <h2>4. Cât timp le păstrăm</h2>
        <ul>
          <li>Maneaua + request-ul: 12 luni de la generare, apoi se șterg.</li>
          <li>Email-ul de cont: până ceri ștergerea contului.</li>
          <li>Documente fiscale (facturi): 10 ani (obligație legală).</li>
        </ul>

        <h2>5. Drepturile tale</h2>
        <p>Conform GDPR, ai dreptul la:</p>
        <ul>
          <li>Acces la datele tale (export complet)</li>
          <li>Rectificare (corectare email, etc.)</li>
          <li>Ștergere ("dreptul de a fi uitat")</li>
          <li>Portabilitate (export în format machine-readable)</li>
          <li>Opoziție la prelucrare</li>
          <li>Plângere la ANSPDCP — <a href="https://dataprotection.ro" style={{ color: 'var(--gold)' }}>dataprotection.ro</a></li>
        </ul>

        <h2>6. Cookies</h2>
        <p>Vezi detalii pe <a href="/cookies" style={{ color: 'var(--gold)' }}>pagina de Cookies</a>.</p>

        <h2>7. Furnizori terți</h2>
        <ul>
          <li><b>Stripe</b> — procesare plăți</li>
          <li><b>Furnizori AI specializați</b> — generare audio și versuri (procesatori sub-contractați conform GDPR art. 28)</li>
          <li><b>Hosting</b> — date stocate în EU</li>
        </ul>
      </div>
    </SiteShell>
  );
}
