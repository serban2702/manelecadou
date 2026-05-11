import Image from 'next/image';
import type { SiteConfig } from '@/lib/site-shared';

// Mesaje default pe locale — folosite dacă admin nu a setat un mesaj custom
// în `site.maintenanceMessage[locale]`.
const DEFAULT_MESSAGES: Record<string, { title: string; sub: string }> = {
  ro: { title: 'Lucrăm la ceva tare.', sub: 'Revenim foarte curând. Mulțumim de răbdare.' },
  bg: { title: 'Подготвяме нещо страхотно.', sub: 'Скоро се връщаме. Благодарим за търпението.' },
  sr: { title: 'Pripremamo nešto sjajno.', sub: 'Vraćamo se uskoro. Hvala na strpljenju.' },
  tr: { title: 'Harika bir şey hazırlıyoruz.', sub: 'Yakında geri döneceğiz. Sabrınız için teşekkürler.' },
  el: { title: 'Ετοιμάζουμε κάτι όμορφο.', sub: 'Επιστρέφουμε σύντομα. Ευχαριστούμε για την υπομονή.' },
  hr: { title: 'Pripremamo nešto sjajno.', sub: 'Vraćamo se uskoro. Hvala na strpljenju.' },
  sl: { title: 'Pripravljamo nekaj odličnega.', sub: 'Vrnemo se kmalu. Hvala za potrpljenje.' },
  bs: { title: 'Pripremamo nešto sjajno.', sub: 'Vraćamo se uskoro. Hvala na strpljenju.' },
  en: { title: 'We\'re working on something great.', sub: 'Back very soon. Thanks for your patience.' },
};

function resolveMessage(site: SiteConfig, locale: string): { title: string; sub: string } {
  // 1) custom message setat din admin pentru locale-ul curent
  const customCurrent = site.maintenanceMessage?.[locale];
  if (customCurrent) return splitTitleSub(customCurrent);
  // 2) custom message pentru locale-ul site-ului
  const customSite = site.maintenanceMessage?.[site.locale];
  if (customSite) return splitTitleSub(customSite);
  // 3) default i18n pentru locale-ul curent
  if (DEFAULT_MESSAGES[locale]) return DEFAULT_MESSAGES[locale];
  // 4) default pentru locale-ul site-ului
  if (DEFAULT_MESSAGES[site.locale]) return DEFAULT_MESSAGES[site.locale];
  // 5) fallback final
  return DEFAULT_MESSAGES.ro;
}

function splitTitleSub(text: string): { title: string; sub: string } {
  const parts = text.split('\n').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return { title: parts[0], sub: parts.slice(1).join(' ') };
  return { title: parts[0] || '', sub: '' };
}

export function MaintenancePage({ site, locale }: { site: SiteConfig; locale: string }) {
  const { title, sub } = resolveMessage(site, locale);
  const primary = site.brand.primaryColor || '#d4af37';
  const accent = site.brand.accentColor || '#f5d271';
  const logo = site.brand.logoUrl;
  const name = site.name || 'Manele Cadou';

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        textAlign: 'center',
        background: 'radial-gradient(ellipse at center, #0d0a08 0%, #050302 100%)',
        color: '#fff',
        fontFamily: 'var(--font-manrope), system-ui, sans-serif',
      }}
    >
      <style>{`
        @keyframes maint-spin {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes maint-pulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50%      { opacity: 1;   transform: scale(1.05); }
        }
        @keyframes maint-glow {
          0%, 100% { box-shadow: 0 0 30px rgba(212,175,55,0.3), 0 0 60px rgba(212,175,55,0.15); }
          50%      { box-shadow: 0 0 50px rgba(212,175,55,0.5), 0 0 100px rgba(212,175,55,0.25); }
        }
        @keyframes maint-fadeup {
          0%   { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Logo + spinner gold în jurul lui */}
      <div
        style={{
          position: 'relative',
          width: 140,
          height: 140,
          marginBottom: '2.5rem',
          animation: 'maint-fadeup 0.6s ease-out',
        }}
      >
        {/* spinner gold (cerc cu gradient + rotate) */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '3px solid transparent',
            borderTopColor: primary,
            borderRightColor: accent,
            animation: 'maint-spin 1.6s linear infinite, maint-glow 2.4s ease-in-out infinite',
          }}
        />
        {/* inner content: logo sau inițială */}
        <div
          style={{
            position: 'absolute',
            inset: 14,
            borderRadius: '50%',
            background: 'rgba(13,10,8,0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'maint-pulse 2.4s ease-in-out infinite',
          }}
        >
          {logo ? (
            <Image
              src={logo}
              alt={name}
              width={80}
              height={80}
              style={{ objectFit: 'contain', borderRadius: '50%' }}
              unoptimized
            />
          ) : (
            <span
              style={{
                fontFamily: 'var(--font-cinzel), serif',
                fontSize: 42,
                fontWeight: 900,
                color: primary,
                letterSpacing: '0.05em',
              }}
            >
              {name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* Brand name */}
      <h2
        style={{
          fontFamily: 'var(--font-cinzel), serif',
          fontSize: 'clamp(20px, 3vw, 28px)',
          fontWeight: 700,
          letterSpacing: '0.08em',
          margin: 0,
          marginBottom: '2rem',
          color: primary,
          animation: 'maint-fadeup 0.8s ease-out',
        }}
      >
        {name.toUpperCase()}
      </h2>

      {/* Title */}
      <h1
        style={{
          fontFamily: 'var(--font-cinzel), serif',
          fontSize: 'clamp(28px, 5vw, 44px)',
          fontWeight: 900,
          lineHeight: 1.15,
          margin: 0,
          marginBottom: '1rem',
          maxWidth: 720,
          background: `linear-gradient(135deg, ${primary} 0%, ${accent} 50%, ${primary} 100%)`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          animation: 'maint-fadeup 1s ease-out',
        }}
      >
        {title}
      </h1>

      {/* Subtitle */}
      {sub && (
        <p
          style={{
            fontSize: 'clamp(15px, 2.5vw, 18px)',
            color: 'rgba(255,255,255,0.7)',
            margin: 0,
            maxWidth: 560,
            lineHeight: 1.6,
            animation: 'maint-fadeup 1.2s ease-out',
          }}
        >
          {sub}
        </p>
      )}

      {/* Small footer cu domeniul */}
      <div
        style={{
          marginTop: '3rem',
          fontSize: 12,
          color: 'rgba(255,255,255,0.3)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          animation: 'maint-fadeup 1.4s ease-out',
        }}
      >
        {site.domain}
      </div>
    </div>
  );
}
