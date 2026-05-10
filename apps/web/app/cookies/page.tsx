import type { Metadata } from 'next';
import { SiteShell } from '@/components/SiteShell';
import { getSiteConfig } from '@/lib/site-config';

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteConfig();
  return { title: `Politica de cookies — ${site.name}` };
}

export default function CookiesPage() {
  return (
    <SiteShell hideStickyCta>
      <div className="inner-page">
        <h1 className="gold-text">Politica de cookies</h1>
        <p className="lead">Ce cookie-uri folosim și de ce sunt toate necesare.</p>

        <h2>Ce sunt cookie-urile?</h2>
        <p>
          Sunt fișiere mici stocate în browser-ul tău. Le folosim ca să-ți reținem starea (ce ai în
          generator), să măsurăm cum se comportă site-ul, să procesăm plăți și să-ți arătăm reclame
          relevante.
        </p>

        <h2>Toate cookie-urile sunt obligatorii pentru funcționalitate</h2>
        <p>
          Pentru ca site-ul să funcționeze complet (generare, plată, autentificare, livrare), avem
          nevoie de toate cookie-urile listate mai jos. Prin folosirea site-ului, accepti integral
          politica de cookies. Dacă nu ești de acord, te rugăm să nu folosești site-ul.
        </p>

        <h2>Categorii</h2>

        <h2 style={{ fontSize: 16 }}>1. Funcționale (sesiune, autentificare)</h2>
        <ul>
          <li><code>mc_guest_id</code> — sesiunea ta fără cont. Durată: 1 an.</li>
          <li><code>mc_access_token</code> — la login, te ține autentificat. Durată: 7 zile.</li>
          <li><code>mc_cookie_consent</code> — confirmarea ta că ai citit politica. Durată: persistent.</li>
        </ul>

        <h2 style={{ fontSize: 16 }}>2. Plăți (Stripe)</h2>
        <ul>
          <li><code>__stripe_mid</code>, <code>__stripe_sid</code> — fraud detection și sesiune Stripe.</li>
        </ul>

        <h2 style={{ fontSize: 16 }}>3. Analytics</h2>
        <ul>
          <li><code>_ga</code>, <code>_ga_*</code> — Google Analytics 4 pentru măsurare trafic.</li>
          <li><code>plausible_*</code> — analytics privacy-friendly (alternativ).</li>
        </ul>

        <h2 style={{ fontSize: 16 }}>4. Marketing & remarketing</h2>
        <ul>
          <li><code>_fbp</code>, <code>fr</code> — Meta Pixel (Facebook/Instagram).</li>
          <li><code>tt_*</code>, <code>_ttp</code> — TikTok Pixel.</li>
        </ul>

        <h2>Cum le poți șterge</h2>
        <p>
          Poți oricând șterge cookie-urile din setările browser-ului tău (Chrome, Firefox, Safari).
          Atenție: după ștergere, nu vei mai putea folosi anumite funcții (ex: rămâne logat,
          procesare plată).
        </p>
      </div>
    </SiteShell>
  );
}
