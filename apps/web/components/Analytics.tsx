'use client';

import Script from 'next/script';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { trackPageView } from '@/lib/tracking';
import { useSite } from '@/lib/site-context';

function PageViewOnNavigate() {
  const pathname = usePathname();
  useEffect(() => {
    // Primul PageView e trimis de scriptul inline. La fiecare navigare
    // ulterioară (SPA), trimitem explicit.
    if (typeof window === 'undefined') return;
    trackPageView();
    if (window.gtag) {
      window.gtag('event', 'page_view', {
        page_path: pathname,
        page_location: window.location.href,
      });
    }
  }, [pathname]);
  return null;
}

/**
 * Advanced Matching pentru Meta Pixel — fetchează userul curent (sau guest) și
 * re-inițializează fbq cu email-ul hash-uit + external_id. Aceasta crește EMQ
 * de la ~3.0 la ~8+ și ajută Meta să găsească audiențe similare mai precis.
 *
 * Notă: pixel-ul Facebook acceptă MULTIPLE apeluri `fbq('init', PIXEL_ID, {...})`
 * — fiecare suprascrie/adăugă în Advanced Matching dictionary. Documentat oficial.
 *
 * Refacem fetch-ul la mount (Token poate să apară după login). Re-init pixel
 * doar dacă obținem date noi (evită calls inutile).
 */
async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text.trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function MetaAdvancedMatching({ pixelId }: { pixelId: string }) {
  useEffect(() => {
    if (typeof window === 'undefined' || !pixelId) return;
    let cancelled = false;
    let lastSig: string | null = null;

    const fetchAndIdentify = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';

        // 1. Citește guest_id din cookie (folosit pentru external_id chiar și
        //    pe vizitatori anonimi — Meta poate face audiențe similare).
        const guestId = (document.cookie.match(/(?:^|; *)mc_guest_id=([^;]+)/) ?? [])[1] || null;

        let email: string | null = null;
        let userId: string | null = null;

        // 2. /api/auth/me — user logat (JWT cookie via credentials: include).
        try {
          const res = await fetch(`${apiUrl}/api/auth/me`, { credentials: 'include' });
          if (res.ok) {
            const me = await res.json();
            email = (me?.email as string | null) ?? null;
            userId = (me?.id as string | null) ?? null;
          }
        } catch {
          /* user anonim — încercăm guest mai jos */
        }

        // 3. Dacă nu-i logat, încearcă /api/guest-sessions/me cu X-Guest-Id header.
        if (!email && guestId) {
          try {
            const res = await fetch(`${apiUrl}/api/guest-sessions/me`, {
              credentials: 'include',
              headers: { 'X-Guest-Id': guestId },
            });
            if (res.ok) {
              const me = await res.json();
              if (me?.email) email = me.email as string;
            }
          } catch {
            /* silent */
          }
        }

        if (cancelled || !window.fbq) return;

        const externalId = userId ?? guestId;
        if (!email && !externalId) return;

        const sig = `${email ?? ''}|${externalId ?? ''}`;
        if (sig === lastSig) return;
        lastSig = sig;

        const am: Record<string, string> = {};
        if (email) am.em = await sha256Hex(email);
        if (externalId) am.external_id = await sha256Hex(externalId);
        // NOTĂ: pentru phone vom extinde când entitatea User va avea câmpul phone
        // și endpoint /api/auth/me îl va returna. Stripe webhook deja trimite phone
        // hash-uit la Purchase prin customer_details.phone — coverage acoperită acolo.

        // Re-init pixel cu Advanced Matching. Meta merge cu multiple init calls.
        try {
          window.fbq('init', pixelId, am);
        } catch {
          /* ignore */
        }
      } catch {
        /* silent */
      }
    };

    // Inițial + repeat la 30s ca să prind login-uri ulterioare.
    void fetchAndIdentify();
    const id = setInterval(() => void fetchAndIdentify(), 30_000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pixelId]);

  return null;
}

/**
 * Analytics per-site: pixel IDs sunt citite din site config (Site.analytics),
 * nu din env vars. Asta permite ca fiecare domeniu să aibă propriile pixel-uri
 * pentru raportare separată în GA4 / Meta / TikTok Ads.
 */
export function Analytics() {
  const site = useSite();
  const GA_ID = site.analytics?.ga4Id ?? '';
  const META_PIXEL_ID = site.analytics?.metaPixelId ?? '';
  const TIKTOK_PIXEL_ID = site.analytics?.tiktokPixelId ?? '';

  return (
    <>
      {GA_ID && (
        <>
          <Script
            key={`ga4-loader-${GA_ID}`}
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga4" key={`ga4-init-${GA_ID}`} strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_ID}', { send_page_view: true });
            `}
          </Script>
        </>
      )}

      {META_PIXEL_ID && (
        <Script id="meta-pixel" key={`meta-${META_PIXEL_ID}`} strategy="afterInteractive">
          {`
            // ============== fbclid → _fbc cookie capture ==============
            // Meta nu setează _fbc automat în toate browser-ele (Safari/iOS ITP
            // îl strip-uiește). Capturăm noi manual cu cookie first-party 90 zile.
            // Critic pentru fbc coverage pe Purchase (Meta diagnostics).
            try {
              var params = new URLSearchParams(window.location.search);
              var fbclid = params.get('fbclid');
              if (fbclid) {
                var hasFbc = document.cookie.indexOf('_fbc=') !== -1;
                if (!hasFbc) {
                  var fbc = 'fb.1.' + Date.now() + '.' + fbclid;
                  var host = window.location.hostname.replace(/^www\\./, '');
                  document.cookie = '_fbc=' + fbc + '; max-age=7776000; path=/; domain=.' + host + '; SameSite=Lax' + (window.location.protocol === 'https:' ? '; Secure' : '');
                }
              }
            } catch (e) { /* ignore */ }

            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${META_PIXEL_ID}');
            fbq('track', 'PageView');
          `}
        </Script>
      )}

      {META_PIXEL_ID && <MetaAdvancedMatching pixelId={META_PIXEL_ID} />}
      {(TIKTOK_PIXEL_ID || META_PIXEL_ID) && <PageViewOnNavigate />}

      {TIKTOK_PIXEL_ID && (
        <Script id="tiktok-pixel" key={`tiktok-${TIKTOK_PIXEL_ID}`} strategy="afterInteractive">
          {`
            !function (w, d, t) {
              w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
              ttq.load('${TIKTOK_PIXEL_ID}');
              ttq.page();
            }(window, document, 'ttq');
          `}
        </Script>
      )}
    </>
  );
}
