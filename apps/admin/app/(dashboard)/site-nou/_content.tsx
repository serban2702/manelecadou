'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  Info,
  Lightbulb,
  Loader2,
  MinusCircle,
  RotateCcw,
  Search,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SitesApi, setSelectedSiteId, type DomainCheckResult, type DomainCheckStatus } from '@/lib/api/sites.api';
import { SpaLink, useSpaNavigate } from '@/lib/spa-router';
import { cn } from '@/lib/cn';

/**
 * Documentația de lansare a unui domeniu nou. Pagină statică, intenționat —
 * nu citește nimic din API, deci nu se poate strica și nu minte când backend-ul
 * e picat. Checklist-ul care CITEȘTE starea reală e altul: /site (Privire de
 * ansamblu) și /rollout.
 *
 * Când schimbi infrastructura (IP, proxy, ordinea pașilor), actualizează și
 * aici — e locul unde se uită omul care adaugă al patrulea site peste șase luni.
 */

const SERVER_IP = '37.187.159.41';

/** Limbile cu fișier propriu în apps/web/messages/ — vezi apps/web/i18n/locales.ts. */
const LIVE_LOCALES: Array<{ code: string; name: string }> = [
  { code: 'ro', name: 'Română' },
  { code: 'bg', name: 'Български' },
  { code: 'sr', name: 'Српски' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'el', name: 'Ελληνικά' },
  { code: 'hr', name: 'Hrvatski' },
  { code: 'sl', name: 'Slovenščina' },
  { code: 'bs', name: 'Bosanski' },
];

const STORAGE_KEY = 'mc_ghid_site_nou';

export default function SiteNouGuidePage() {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);
  const [domain, setDomain] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<DomainCheckResult | null>(null);
  const [checkError, setCheckError] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setDone(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  function toggle(id: string) {
    setDone((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function reset() {
    setDone({});
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  const doneCount = Object.values(done).filter(Boolean).length;

  const step = (id: string) => ({
    id,
    done: hydrated && !!done[id],
    onToggle: () => toggle(id),
  });

  async function runCheck() {
    const d = domain.trim();
    if (!d) return;
    setChecking(true);
    setCheckError('');
    try {
      setResult(await SitesApi.domainCheck(d));
    } catch (e) {
      setResult(null);
      setCheckError((e as Error).message || 'Verificarea a eșuat.');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Site nou, pas cu pas"
        description="Tot ce trebuie făcut ca un domeniu nou să ajungă live, în ordinea în care trebuie făcut. Bifele sunt doar pentru tine, se țin în browser."
        actions={
          doneCount > 0 ? (
            <Button variant="outline" size="sm" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" />
              Resetează bifele ({doneCount})
            </Button>
          ) : undefined
        }
      />

      {/* ------------------------------------------------------------------ */}
      <Card className="mb-6">
        <CardContent className="py-4 space-y-3">
          <div>
            <div className="text-sm font-semibold">Unde am rămas cu un domeniu?</div>
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
              Scrie domeniul și îți spun ce e deja făcut: DNS, certificat, dacă există site în
              platformă și cât e configurat. Merge și pe un domeniu pe care încă n-ai făcut nimic.
            </p>
          </div>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void runCheck();
            }}
          >
            <Input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="domeniul-nou.ro"
              className="flex-1 min-w-[220px]"
            />
            <Button type="submit" disabled={checking || !domain.trim()}>
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {checking ? 'Verific…' : 'Verifică'}
            </Button>
          </form>
          {checkError && <p className="text-sm text-destructive">{checkError}</p>}
          {result && <DomainReport result={result} />}
        </CardContent>
      </Card>

      <Card className="mb-6 border-primary/30 bg-primary/5">
        <CardContent className="py-4 space-y-3">
          <div className="text-sm font-semibold">Trei lucruri de știut înainte să începi</div>
          <ol className="space-y-2 text-sm text-muted-foreground list-decimal pl-5 leading-relaxed">
            <li>
              <strong className="text-foreground">Un site = un domeniu.</strong> Limba nu are nicio
              legătură cu asta: poți avea oricâte site-uri pe aceeași limbă. Unice trebuie să fie
              doar <em>codul intern</em> și <em>domeniul</em>.
            </li>
            <li>
              <strong className="text-foreground">Dacă limba e deja livrată, nu scrii cod deloc.</strong>{' '}
              Cele opt de mai jos au traducerile gata — restul e configurare din admin. O limbă nouă
              cere fișier de traducere și un deploy (partea D).
            </li>
            <li>
              <strong className="text-foreground">Ordinea DNS → Coolify e obligatorie.</strong>{' '}
              Invers, certificatul nu se mai emite și site-ul rămâne pe certificatul implicit al lui
              Traefik, chiar și după ce DNS-ul devine corect.
            </li>
          </ol>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {LIVE_LOCALES.map((l) => (
              <Badge key={l.code} variant="success" className="font-mono">
                {l.code} · {l.name}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ================================================================== */}
      <SectionTitle
        letter="A"
        title="Infrastructura"
        subtitle="O singură dată per domeniu. Durează ~10 minute, plus propagarea DNS."
      />

      <Step {...step('dns')} n={1} title="A record în Cloudflare, cu norul GRI" where="Cloudflare">
        <p>
          Cloudflare → domeniul → <strong>DNS</strong> → <strong>Records</strong> → Add record. Două
          înregistrări, amândouă cu <strong>Proxy status: DNS only</strong> (norul gri):
        </p>
        <Table
          head={['Type', 'Name', 'IPv4 address', 'Proxy']}
          rows={[
            ['A', '@', SERVER_IP, 'DNS only (gri)'],
            ['A', 'www', SERVER_IP, 'DNS only (gri)'],
          ]}
        />
        <p>Verifică din terminal că s-a propagat — trebuie să răspundă exact IP-ul serverului:</p>
        <Cmd>{`dig +short domeniul-nou.ro\ndig +short www.domeniul-nou.ro`}</Cmd>
        <Note tone="danger" title="Norul portocaliu rupe certificatul, tăcut">
          Cu proxy-ul Cloudflare pornit, validarea HTTP-01 nu ajunge niciodată la Traefik. Nu apare
          nicio eroare în admin — pur și simplu site-ul rămâne fără HTTPS.
        </Note>
      </Step>

      <Step {...step('coolify')} n={2} title="Domeniul în Coolify, pe serviciul router" where="Coolify">
        <p>
          <a
            href="https://coolify.freevox.ro"
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            coolify.freevox.ro
          </a>{' '}
          → resursa aplicației → tab-ul serviciului <Code>router</Code> → secțiunea General →
          câmpul <strong>Domains</strong>.
        </p>
        <p>
          Câmpul e o listă CSV pe un singur rând, comună tuturor site-urilor, cu fiecare domeniu
          scris ca <Code>https://domeniu:80</Code> (portul e al containerului nginx).{' '}
          <strong>Nu-l goli</strong> — te duci la capătul rândului și lipești, cu virgulă în față:
        </p>
        <Cmd>{`,https://domeniul-nou.ro:80,https://www.domeniul-nou.ro:80`}</Cmd>
        <p>
          Apoi <strong>Save</strong>, și după el <strong>Actions → Redeploy</strong> (sau{' '}
          <Code>make deploy-coolify</Code> din terminal). Coolify scrie etichetele pentru Traefik
          doar la deploy — până atunci, domeniul salvat nu înseamnă nimic pentru proxy.
        </p>
        <p>Verifică certificatul:</p>
        <Cmd>{`curl -sI https://domeniul-nou.ro | head -1\necho | openssl s_client -connect domeniul-nou.ro:443 -servername domeniul-nou.ro 2>/dev/null | openssl x509 -noout -issuer -dates`}</Cmd>
        <Note tone="warn" title="Dacă în ~3 minute tot vezi „TRAEFIK DEFAULT CERT”">
          Traefik a încercat o validare care a eșuat și a intrat în backoff. Îl scoți de acolo cu un
          restart — după el, certificatele se emit în sub un minut:
          <Cmd className="mt-2">{`ssh ovh 'docker restart coolify-proxy'`}</Cmd>
        </Note>
        <Note tone="info" title="Domeniile se pun DOAR pe router">
          Nu pe <Code>web</Code>, nu pe <Code>api</Code>. Ruta publică e împărțită pe path
          (<Code>/api</Code>, <Code>/socket.io</Code>, <Code>/health</Code>, <Code>/uploads</Code> →
          api; <Code>admin.*</Code> → admin; restul → web), iar routerul nginx face împărțeala. Un
          site nou înseamnă încă un rând în același câmp.
        </Note>
      </Step>

      {/* ================================================================== */}
      <SectionTitle
        letter="B"
        title="Site-ul în admin"
        subtitle="Aici se face 90% din muncă. Nimic din partea asta nu cere deploy — se salvează în baza de date și se vede live în maximum 30 de secunde."
      />

      <Step {...step('create')} n={3} title="Creează site-ul" where="Admin → Toate site-urile">
        <p>
          <SpaLink href="/sites" className="text-primary hover:underline">
            Toate site-urile
          </SpaLink>{' '}
          → <strong>Adaugă site</strong>. După salvare, selectorul din bara laterală comută automat
          pe site-ul nou și ajungi direct în ecranul lui de configurare.
        </p>
        <Table
          head={['Câmp', 'Ce pui']}
          rows={[
            ['Cod intern', 'Scurt, unic, doar litere mici și cifre (ex. gr2). Nu se mai schimbă comod după ce ai comenzi.'],
            ['Domeniu', 'Fără https:// și fără www. Doar domeniul apex: domeniul-nou.ro'],
            ['Nume brand', 'Cum se numește site-ul pentru clienți'],
            ['Limbă', 'Doar una dintre cele opt cu traduceri — altfel site-ul iese în română'],
            ['Valută', 'Valuta în care se încasează'],
            ['Prețuri pachete', 'Standard / Plus / Premium — sumele reale pe care le plătește clientul'],
          ]}
        />
        <Note tone="danger" title="Prețurile implicite sunt gândite în lei">
          Formularul pornește cu 29,99 / 49,99 / 99,99. Pe un site în euro asta ar însemna 29,99 €
          în loc de ~8 €. Schimbă-le în dialog, înainte de a apăsa „Creează”.
        </Note>
        <Note tone="info" title="www se rezolvă singur">
          API-ul taie prefixul <Code>www.</Code> și la salvare, și la rezolvarea site-ului din
          Host — deci în admin scrii domeniul apex o singură dată. În Coolify, în schimb, ai nevoie
          de ambele variante (pasul 2), pentru că certificatul se emite pe fiecare nume în parte.
        </Note>
        <Note tone="warn" title="Selectorul de site din bara laterală">
          Toate ecranele de la pașii 4-10 lucrează pe site-ul din selector. Dacă ai deschise mai
          multe taburi, verifică-l înainte de a scrie ceva — e cea mai ușoară cale de a configura
          site-ul greșit.
        </Note>
      </Step>

      <Step {...step('identity')} n={4} title="Identitate și aspect" where="Admin → Acest site">
        <p>
          <SpaLink href="/site/identity" className="text-primary hover:underline">
            Identitate
          </SpaLink>{' '}
          — verifică domeniul, numele, limba, valuta. Meniul de limbă rămâne ascuns în producție: un
          domeniu = o limbă.
        </p>
        <p>
          <SpaLink href="/site/appearance" className="text-primary hover:underline">
            Aspect
          </SpaLink>{' '}
          — logo, favicon, imagine de share (OG), banner de email, culoare principală și accent,
          tagline, titlu și descriere SEO, linkuri sociale, recenzii. Fișierele urcate se salvează
          imediat, independent de bara „Salvează”.
        </p>
        <Note tone="tip" title="Logo-ul e în checklist-ul de lansare">
          Fără el, pagina de mentenanță și emailurile ies fără brand.
        </Note>
      </Step>

      <Step {...step('library')} n={5} title="Librăria: stiluri, ocazii, voci" where="Admin → Acest site → Librărie">
        <p>
          <SpaLink href="/site/catalog/styles" className="text-primary hover:underline">
            Librărie
          </SpaLink>{' '}
          ține stilurile, ocaziile și vocile comune ale site-ului. Fiecare intrare are un prompt
          pentru motorul audio (Suno și/sau Google) — promptul e ce transformă „zi” în „birthday
          celebration, la mulți ani, festive family gathering”.
        </p>
        <p>De făcut, în ordinea asta:</p>
        <ol className="list-decimal pl-5 space-y-1.5 leading-relaxed">
          <li>Deschide fiecare tab: Stiluri, Ocazii, Voci.</li>
          <li>
            Rescrie prompturile în limba și muzica locală. Seed-ul din care se completează automat
            e în română și pentru manele — pe un site grecesc sau croat trebuie schimbat.
          </li>
          <li>
            <strong>Apasă Salvează.</strong> Vezi avertismentul de mai jos.
          </li>
          <li>
            „Generează mostrele lipsă” pentru sample-urile audio de pe stiluri și voci (ce aude
            clientul când alege).
          </li>
        </ol>
        <Note tone="danger" title="Ce vezi pe ecran nu e neapărat ce e salvat">
          La prima deschidere a Librăriei pentru un site, ecranul completează automat prompturile
          goale din seed și marchează modificări nesalvate („Stiluri 10 → 10 elemente”). Dacă pleci
          fără să salvezi, în baza de date rămâne gol, iar la generare motorul primește doar
          <Code>, themed for &lt;id&gt;</Code> — adică literalmente „themed for zi”. Checklist-ul din
          Privire de ansamblu citește baza de date, deci el spune adevărul, nu ecranul.
        </Note>
      </Step>

      <Step {...step('interfaces')} n={6} title="Interfețe: design, pachete, prețuri" where="Admin → Acest site → Interfețe">
        <p>
          <SpaLink href="/site/interfaces" className="text-primary hover:underline">
            Interfețe
          </SpaLink>{' '}
          e locul unde se configurează ce vede clientul. Un site poate rula mai multe design-uri
          peste aceleași date.
        </p>
        <ul className="list-disc pl-5 space-y-1.5 leading-relaxed">
          <li>
            <strong>Activă</strong> = interfața poate fi deschisă (din reclame, cu <Code>?ui=</Code>).
            Oprită înseamnă complet inaccesibilă, nu doar ascunsă.
          </li>
          <li>
            <strong>Implicită</strong> = ce vede un vizitator nou care intră pe domeniu, fără
            parametri.
          </li>
          <li>
            Pe fiecare design: <strong>Pachete</strong> (preț, preț tăiat, refaceri, colaj) și
            <strong> Catalog</strong> — dacă vrei alte stiluri/prompturi decât în Librărie. Dacă nu
            pui catalog propriu, moștenește Librăria.
          </li>
        </ul>
        <Note tone="warn" title="Prețul real vine de aici">
          Câmpurile „preț de bază” din ecranul Plată sunt rămășițe ale unui model vechi de tarifare;
          se mai citesc în locuri secundare (textul din articolele SEO, valoarea trimisă la Meta) și
          pot să difere de realitate. Prețul pe care îl plătește clientul e cel din pachetul
          interfeței.
        </Note>
        <Note tone="tip" title="Cum testezi un design fără să-l dai public">
          Îl marchezi Activ, dar NU îl faci implicit. Atunci <Code>?ui=slug</Code> merge pentru tine,
          iar restul lumii vede designul implicit.
        </Note>
      </Step>

      <Step {...step('lyrics')} n={7} title="Versuri și motor audio" where="Admin → Acest site → Versuri">
        <p>
          <SpaLink href="/site/generation" className="text-primary hover:underline">
            Versuri
          </SpaLink>{' '}
          — motorul audio default (Suno sau Google Lyria), limba în care GPT scrie versurile
          (de obicei limba site-ului), promptul Suno de bază, plus scriitorul și editorul de versuri.
        </p>
        <Note tone="warn" title="Lăsate goale, cad pe template-urile românești">
          Pe un site non-RO scrie-le explicit, în limba site-ului. Prompturile din baza de date
          suprascriu complet template-urile din cod — deci dacă ceva sună greșit în versuri, se
          repară aici, nu în repo.
        </Note>
      </Step>

      <Step {...step('payments')} n={8} title="Plată" where="Admin → Acest site → Plată">
        <p>
          <SpaLink href="/site/prices" className="text-primary hover:underline">
            Plată
          </SpaLink>{' '}
          — alegi dacă vizitatorul aude 30 de secunde gratuit sau merge direct la checkout, și
          setezi textele care apar pe extrasul de card (statement descriptor, numele produsului).
        </p>
        <Note tone="info" title="În Stripe nu trebuie să faci nimic">
          Un singur cont Stripe deservește toate site-urile, iar webhook-ul e deja configurat pe
          domeniul principal. Site-ul comenzii se ia din metadata plății. Nu adăuga un endpoint nou.
        </Note>
      </Step>

      <Step {...step('operations')} n={9} title="Operațiuni: status, chat, firmă, pixeli" where="Admin → Acest site → Operațiuni">
        <p>
          <SpaLink href="/site/operations" className="text-primary hover:underline">
            Operațiuni
          </SpaLink>{' '}
          adună tot ce ține de funcționarea zilnică:
        </p>
        <Table
          head={['Secțiune', 'Ce setezi']}
          rows={[
            ['Site live', 'Activ, HTTPS, Mentenanță, Ascuns. Ține-l în mentenanță până termini configurarea.'],
            ['Mesaj de mentenanță', 'Prima linie = titlu, restul = subtitlu. Per limbă.'],
            ['IP-uri scutite', 'IP-urile tale — vezi site-ul normal chiar dacă e în mentenanță sau ascuns.'],
            ['Chat Irina', 'Modul AI pentru conversații noi (manual / sugestii / automat) și salutul proactiv.'],
            ['Mail', 'Expeditor, email de suport, emailuri interne, serverul de trimitere (pasul 10).'],
            ['Date firmă', 'Apar pe factură și în termeni.'],
            ['SmartBill', 'Facturi fiscale per site. Testează conexiunea după ce salvezi.'],
            ['Pixeli și ads', 'GA4, Meta pixel + CAPI, TikTok, Google Ads, plus tokenii de raportare a cheltuielilor.'],
          ]}
        />
        <Note tone="warn" title="Pixeli separați pentru fiecare site">
          Dacă refolosești pixelul altui site, conversiile se amestecă și raportarea pe campanii
          devine inutilizabilă.
        </Note>
      </Step>

      <Step {...step('email')} n={10} title="Email: căsuță, expeditor, livrabilitate" where="Mailcow + Cloudflare + Admin">
        <ol className="list-decimal pl-5 space-y-1.5 leading-relaxed">
          <li>
            Creezi căsuța (ex. <Code>contact@domeniul-nou.ro</Code>) pe serverul de mail partajat.
          </li>
          <li>
            În <SpaLink href="/site/operations" className="text-primary hover:underline">Operațiuni → Mail</SpaLink>:
            expeditor, email de suport, provider <Code>smtp</Code>, iar la host{' '}
            <strong>mail.manelecadou.ro</strong> — nu <Code>mail.domeniul-nou.ro</Code>. Certificatul
            e emis pentru primul; pe al doilea, conexiunea TLS eșuează.
          </li>
          <li>
            Utilizatorul SMTP e adresa completă de email, nu doar partea din fața lui @.
          </li>
          <li>
            În Cloudflare adaugi <strong>SPF, DKIM și DMARC</strong> pentru domeniul nou (cheia DKIM
            o iei din panoul de mail). Fără ele, Gmail trimite emailurile de livrare direct în spam —
            adică clientul plătește și nu-și primește maneaua.
          </li>
          <li>
            Dacă vrei să și citești mailul din platformă, adaugi contul IMAP în{' '}
            <SpaLink href="/inbox/accounts" className="text-primary hover:underline">Email → Conturi</SpaLink>,
            unde există și un test de conexiune.
          </li>
        </ol>
        <Note tone="info" title="Mailgun e doar pe domeniul principal">
          Celelalte site-uri trimit prin SMTP. Contul Mailgun care apare global aparține altui
          proiect — nu-l lega la un site nou.
        </Note>
        <p>
          Verificarea reală: plasezi o comandă de test pe site și te uiți în{' '}
          <SpaLink href="/emails" className="text-primary hover:underline">Emails trimise</SpaLink>{' '}
          dacă a plecat și cu ce status.
        </p>
      </Step>

      {/* ================================================================== */}
      <SectionTitle
        letter="C"
        title="Conținut și lansare"
        subtitle="Ce face diferența între un site care funcționează și unul care și vinde."
      />

      <Step {...step('content')} n={11} title="Demo-uri, articole, top" where="Admin">
        <ul className="list-disc pl-5 space-y-1.5 leading-relaxed">
          <li>
            <SpaLink href="/site-demos" className="text-primary hover:underline">Demo-uri</SpaLink> —
            10-15 manele curate pentru pagina <Code>/asculta</Code>, dintre care maximum 5 marcate
            „featured” pentru popup-ul de pe homepage. Fără ele, pagina de ascultare e goală.
          </li>
          <li>
            <SpaLink href="/seo-pages" className="text-primary hover:underline">SEO articles</SpaLink> —
            ~50 de sluguri standard per site, generate cu AI în limba site-ului.
          </li>
          <li>
            <SpaLink href="/site/top" className="text-primary hover:underline">Top săptămână</SpaLink> —
            ce apare pe <Code>/top</Code>.
          </li>
          <li>
            <SpaLink href="/ai-memory" className="text-primary hover:underline">AI Memory</SpaLink> —
            adaugă manual primele fapte critice (preț, timp de livrare, ce include fiecare pachet,
            politica de refacere). Fără ele, agentul de chat inventează prețuri.
          </li>
        </ul>
      </Step>

      <Step {...step('verify')} n={12} title="Verificare finală și lansare" where="Admin + terminal">
        <ol className="list-decimal pl-5 space-y-1.5 leading-relaxed">
          <li>
            <SpaLink href="/rollout" className="text-primary hover:underline">Lansare producție</SpaLink>{' '}
            → „Aplică lipsurile” completează doar câmpurile rămase goale, din seed. Seed-ul e în
            română — pe un site non-RO verifică după el ce a scris.
          </li>
          <li>
            <SpaLink href="/site" className="text-primary hover:underline">Privire de ansamblu</SpaLink>{' '}
            → checklist-ul „Lansare” trebuie să fie verde pe toate rândurile. El citește baza de
            date, nu formularul.
          </li>
          <li>Deschizi site-ul într-o fereastră incognito, pe telefon și pe desktop.</li>
          <li>
            Plasezi o comandă reală de test (card real, sumă mică) și verifici tot lanțul: plată →
            generare → email de livrare → pagina piesei.
          </li>
          <li>Scoți mentenanța din Operațiuni.</li>
          <li>
            Trimiți sitemap-ul la Google Search Console:{' '}
            <Code>https://domeniul-nou.ro/sitemap.xml</Code>
          </li>
        </ol>
        <p>Verificare rapidă din terminal, după ce e live:</p>
        <Cmd>{`curl -s -o /dev/null -w '%{http_code}\\n' https://domeniul-nou.ro\ncurl -s https://domeniul-nou.ro/api/public/site | head -c 400\ncurl -s https://domeniul-nou.ro/health`}</Cmd>
      </Step>

      {/* ================================================================== */}
      <SectionTitle
        letter="D"
        title="Doar dacă limba nu e printre cele opt"
        subtitle="Singura parte care cere cod și deploy. Fă-o înainte de a scoate site-ul din mentenanță."
      />

      <Step {...step('lang')} n={13} title="Adaugă limba în cod" where="Repo + deploy">
        <ol className="list-decimal pl-5 space-y-2 leading-relaxed">
          <li>
            Copiezi <Code>apps/web/messages/ro.json</Code> în{' '}
            <Code>apps/web/messages/&lt;locale&gt;.json</Code> și traduci.
          </li>
          <li>
            Adaugi codul limbii în <Code>apps/web/i18n/locales.ts</Code> — în lista{' '}
            <Code>LOCALES</Code> și în <Code>LOCALE_META</Code> (nume, steag, atribut html, locale
            OG).
          </li>
          <li>
            <strong>Dacă alfabetul nu e latin</strong> (grec, chirilic, arab): fontul designului
            „cadou” (Outfit) are doar subseturile latine. Trece limba în selectorul CSS care comută
            pe fontul cu acoperire extinsă — altfel textul se randează cu fontul de rezervă al
            sistemului și pagina arată rupt.
          </li>
          <li>
            Verifici că nu lipsesc chei:
            <Cmd className="mt-2">{`cd apps/web && pnpm run check:messages`}</Cmd>
          </li>
          <li>
            Commit doar fișierele atinse, apoi deploy:
            <Cmd className="mt-2">{`make deploy-coolify`}</Cmd>
          </li>
        </ol>
        <Note tone="danger" title="git push NU deployează">
          Repo-ul e legat prin deploy key, deci nu există webhook. Codul urcat fără comanda de mai
          sus rămâne pur și simplu nedeployat, fără niciun semn.
        </Note>
        <Note tone="warn" title="O traducere incompletă nu dă eroare">
          Cheile lipsă cad automat pe română. Efectul e o propoziție în română în mijlocul unei
          pagini în altă limbă — se vede doar dacă te uiți, sau dacă rulezi{' '}
          <Code>check:messages</Code>.
        </Note>
      </Step>

      {/* ================================================================== */}
      <SectionTitle
        letter="E"
        title="Mai multe site-uri pe aceeași limbă"
        subtitle="Se poate, nativ. Nu există nicio constrângere de unicitate pe limbă."
      />

      <Card className="mb-6">
        <CardContent className="py-4 grid gap-4 md:grid-cols-2 text-sm">
          <div>
            <div className="font-semibold mb-2 flex items-center gap-2">
              <Check className="h-4 w-4 text-success" />
              Se împart între site-uri
            </div>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground leading-relaxed">
              <li>Infrastructura (același server, același router)</li>
              <li>Contul Stripe și webhook-ul</li>
              <li>Fișierul de traduceri al limbii</li>
              <li>Serverul de mail</li>
              <li>Baza de date (partiționată logic pe site)</li>
            </ul>
          </div>
          <div>
            <div className="font-semibold mb-2 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-warning" />
              Trebuie separate
            </div>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground leading-relaxed">
              <li>Domeniul și codul intern (sunt unice)</li>
              <li>Brandul: logo, culori, tagline, SEO</li>
              <li>Adresa de expeditor</li>
              <li>Pixelii de tracking și conturile de ads</li>
              <li>Demo-urile și articolele SEO — altfel e conținut duplicat</li>
              <li>Prompturile, dacă vrei un sunet diferit</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Note tone="info" title="Un singur site poate fi „default”">
        Site-ul default e cel servit când Host-ul nu se potrivește cu niciun domeniu configurat. Nu
        marca al doilea site pe aceeași limbă ca default doar pentru că e nou.
      </Note>

      {/* ================================================================== */}
      <SectionTitle letter="F" title="Capcanele care costă timp" subtitle="Toate au fost plătite deja, cel puțin o dată." />

      <Card className="mb-6">
        <CardContent className="py-4">
          <ul className="space-y-3 text-sm">
            {[
              ['Domeniu adăugat în Coolify înainte de DNS', 'Let’s Encrypt validează spre serverul vechi, eșuează, Traefik intră în backoff. Fix: restart la coolify-proxy.'],
              ['Norul portocaliu în Cloudflare', 'Certificatul nu se emite niciodată și nu apare nicio eroare.'],
              ['Prețuri lăsate pe default într-o altă valută', '29,99 devine 29,99 € în loc de ~8 €.'],
              ['Prompturi văzute pe ecran, dar nesalvate', 'Ecranul le completează din seed în formular. Fără Salvează, motorul primește „themed for zi”.'],
              ['git push fără make deploy-coolify', 'Codul rămâne nedeployat, tăcut.'],
              ['Site configurat pe tenantul greșit', 'Verifică selectorul din bara laterală înainte să scrii.'],
              ['Pixel refolosit de la alt site', 'Conversiile se amestecă între domenii.'],
              ['SPF/DKIM lipsă pe domeniul nou', 'Emailurile de livrare ajung în spam; clientul a plătit și crede că nu a primit nimic.'],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning mt-0.5" />
                <div>
                  <span className="font-medium">{t}</span>
                  <span className="text-muted-foreground"> — {d}</span>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground pb-4">
        Pagina asta e scrisă de mână și nu citește nimic din sistem. Pentru starea reală a unui site
        folosește{' '}
        <SpaLink href="/site" className="text-primary hover:underline">
          Privire de ansamblu
        </SpaLink>{' '}
        și{' '}
        <SpaLink href="/rollout" className="text-primary hover:underline">
          Lansare producție
        </SpaLink>
        .
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function DomainReport({ result }: { result: DomainCheckResult }) {
  const navigate = useSpaNavigate();
  const { dns, tls, http, site, checks } = result;

  const missing = checks.filter((c) => c.status === 'missing');
  const partial = checks.filter((c) => c.status === 'partial');

  // Verdictul e „la ce pas din ghid ai rămas", nu o listă de simptome.
  const verdict = !dns.apex.pointsHere
    ? { tone: 'danger' as const, text: `Pasul 1 — DNS. ${dns.apex.host} nu arată spre ${result.expectedIp ?? 'serverul nostru'}.` }
    : tls.isDefaultCert
      ? { tone: 'danger' as const, text: 'Pasul 2 — Traefik servește certificatul implicit: domeniul lipsește din Coolify sau proxy-ul e în backoff.' }
      : !tls.ok
        ? { tone: 'warn' as const, text: `Pasul 2 — certificatul nu e valid${tls.error ? ` (${tls.error})` : ''}.` }
        : !site
          ? { tone: 'warn' as const, text: 'Pasul 3 — infrastructura e gata, dar nu există niciun site pe domeniul ăsta în platformă.' }
          : missing.length
            ? { tone: 'warn' as const, text: `Pașii 4-11 — site-ul există, dar mai are ${missing.length} ${missing.length === 1 ? 'lipsă' : 'lipsuri'}${partial.length ? ` și ${partial.length} parțial` : ''}.` }
            : partial.length
              ? { tone: 'tip' as const, text: `Aproape gata — ${partial.length} ${partial.length === 1 ? 'lucru' : 'lucruri'} configurate parțial.` }
              : { tone: 'tip' as const, text: 'Totul e la locul lui. Domeniul e live și complet configurat.' };

  return (
    <div className="space-y-3 pt-1">
      <Note tone={verdict.tone} title={result.domain}>
        {verdict.text}
      </Note>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-border p-3 space-y-2">
          <div className="text-xs font-semibold text-foreground">Infrastructură</div>
          <CheckRow
            status={dns.apex.pointsHere ? 'ok' : 'missing'}
            label="DNS (apex)"
            detail={
              dns.apex.addresses.length
                ? `${dns.apex.addresses.join(', ')}${dns.apex.pointsHere ? '' : ` — așteptat ${result.expectedIp ?? '?'}`}`
                : `fără A record${dns.apex.error ? ` (${dns.apex.error})` : ''}`
            }
          />
          <CheckRow
            status={dns.www.pointsHere ? 'ok' : dns.www.addresses.length ? 'partial' : 'missing'}
            label="DNS (www)"
            detail={
              dns.www.addresses.length
                ? dns.www.addresses.join(', ')
                : `fără A record${dns.www.error ? ` (${dns.www.error})` : ''}`
            }
          />
          <CheckRow
            status={tls.ok ? 'ok' : 'missing'}
            label="Certificat"
            detail={
              tls.isDefaultCert
                ? 'TRAEFIK DEFAULT CERT — vezi pasul 2'
                : tls.issuer
                  ? `${tls.issuer}${tls.validTo ? ` · până la ${tls.validTo}` : ''}`
                  : tls.error || 'necunoscut'
            }
          />
          <CheckRow
            status={http.status && http.status < 500 ? 'ok' : 'missing'}
            label="Răspuns HTTPS"
            detail={http.status ? `HTTP ${http.status}` : http.error || 'fără răspuns'}
          />
          {tls.isDefaultCert && (
            <Cmd className="mt-1">{`ssh ovh 'docker restart coolify-proxy'`}</Cmd>
          )}
        </div>

        <div className="rounded-lg border border-border p-3 space-y-2">
          <div className="text-xs font-semibold text-foreground">Site în platformă</div>
          {site ? (
            <>
              <CheckRow status="ok" label={site.name} detail={`cod ${site.slug} · ${site.locale} · ${site.currency}`} />
              <CheckRow
                status={site.active && !site.hiddenMode && !site.maintenanceMode ? 'ok' : 'partial'}
                label="Stare"
                detail={
                  !site.active
                    ? 'inactiv'
                    : site.hiddenMode
                      ? 'ascuns'
                      : site.maintenanceMode
                        ? 'mentenanță'
                        : 'live'
                }
              />
              <CheckRow
                status="info"
                label="Creat"
                detail={site.createdAt ? new Date(site.createdAt).toLocaleDateString('ro-RO') : '—'}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSelectedSiteId(site.id);
                  navigate('/site');
                }}
              >
                Deschide configul acestui site
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Niciun site pe domeniul ăsta. Îl creezi la pasul 3 — domeniul se scrie fără{' '}
                <Code>www</Code>.
              </p>
              <SpaLink href="/sites" className="text-sm text-primary hover:underline">
                Toate site-urile → Adaugă site
              </SpaLink>
            </>
          )}
        </div>
      </div>

      {checks.length > 0 && (
        <div className="rounded-lg border border-border p-3 space-y-2">
          <div className="text-xs font-semibold text-foreground">Configurare</div>
          <div className="grid gap-1.5 md:grid-cols-2">
            {checks.map((c) => (
              <div key={c.id} className="flex items-start gap-2">
                <StatusIcon status={c.status} />
                <div className="min-w-0 flex-1">
                  {c.href ? (
                    <SpaLink href={c.href} className="text-sm hover:text-primary">
                      {c.label}
                    </SpaLink>
                  ) : (
                    <span className="text-sm">{c.label}</span>
                  )}
                  <div className="text-[11px] text-muted-foreground leading-snug">{c.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: DomainCheckStatus }) {
  if (status === 'ok') return <CheckCircle2 className="h-4 w-4 shrink-0 text-success mt-0.5" />;
  if (status === 'missing') return <XCircle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />;
  if (status === 'partial') return <MinusCircle className="h-4 w-4 shrink-0 text-warning mt-0.5" />;
  return <Circle className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />;
}

function CheckRow({
  status,
  label,
  detail,
}: {
  status: DomainCheckStatus;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <StatusIcon status={status} />
      <div className="min-w-0 flex-1">
        <span className="text-sm">{label}</span>
        <div className="text-[11px] text-muted-foreground leading-snug break-words">{detail}</div>
      </div>
    </div>
  );
}

function SectionTitle({
  letter,
  title,
  subtitle,
}: {
  letter: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-4 mt-8 first:mt-0">
      <div className="flex items-center gap-2.5">
        <span className="h-6 w-6 rounded-md bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">
          {letter}
        </span>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{subtitle}</p>
    </div>
  );
}

function Step({
  n,
  title,
  where,
  done,
  onToggle,
  children,
}: {
  id: string;
  n: number;
  title: string;
  where: string;
  done: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <Card className={cn('mb-3 transition-opacity', done && 'opacity-55')}>
      <CardContent className="py-4">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onToggle}
            title={done ? 'Marchează ca nefăcut' : 'Marchează ca făcut'}
            className={cn(
              'h-7 w-7 shrink-0 rounded-full border flex items-center justify-center text-xs font-semibold transition-colors',
              done
                ? 'border-success/40 bg-success/15 text-success'
                : 'border-border bg-secondary text-muted-foreground hover:border-primary/50 hover:text-foreground',
            )}
          >
            {done ? <CheckCircle2 className="h-4 w-4" /> : n}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h3 className={cn('font-semibold', done && 'line-through')}>{title}</h3>
              <Badge variant="muted">{where}</Badge>
            </div>
            <div className="space-y-3 text-sm text-muted-foreground leading-relaxed [&_strong]:text-foreground">
              {children}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Note({
  tone,
  title,
  children,
}: {
  tone: 'info' | 'warn' | 'danger' | 'tip';
  title: string;
  children: ReactNode;
}) {
  const style = {
    info: { box: 'border-info/30 bg-info/10', text: 'text-info', Icon: Info },
    warn: { box: 'border-warning/30 bg-warning/10', text: 'text-warning', Icon: AlertTriangle },
    danger: { box: 'border-destructive/30 bg-destructive/10', text: 'text-destructive', Icon: ShieldAlert },
    tip: { box: 'border-success/30 bg-success/10', text: 'text-success', Icon: Lightbulb },
  }[tone];
  const { Icon } = style;
  return (
    <div className={cn('rounded-lg border p-3', style.box)}>
      <div className={cn('flex items-center gap-2 text-xs font-semibold mb-1', style.text)}>
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {title}
      </div>
      <div className="text-sm text-muted-foreground leading-relaxed [&_strong]:text-foreground">
        {children}
      </div>
    </div>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-secondary px-1 py-0.5 font-mono text-[12px] text-foreground">
      {children}
    </code>
  );
}

function Cmd({ children, className }: { children: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={cn('relative', className)}>
      <pre className="overflow-x-auto rounded-md border border-border bg-background/60 px-3 py-2 pr-10 font-mono text-[12px] leading-relaxed text-foreground/90">
        {children}
      </pre>
      <button
        type="button"
        title="Copiază"
        onClick={() => {
          void navigator.clipboard?.writeText(children);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute right-1.5 top-1.5 h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/40">
            {head.map((h) => (
              <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.join('|')} className="border-b border-border/60 last:border-0">
              {r.map((cell, i) => (
                <td
                  key={i}
                  className={cn(
                    'px-3 py-2 align-top',
                    i === 0 ? 'font-medium text-foreground whitespace-nowrap' : 'text-muted-foreground',
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
