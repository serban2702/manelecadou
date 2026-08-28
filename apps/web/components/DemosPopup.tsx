'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api, type SiteDemoDto } from '@/lib/api';
import { useSite } from '@/lib/site-context';
import { getPagePath } from '@/lib/page-slugs';
import { useWizardReachedPackage } from '@/lib/wizard';
import { useExperienceCatalog } from '@/experiences/use-experience-catalog';
import { ManeaPlayer } from './ManeaPlayer';

/**
 * Pop-up cu max 5 demo-uri marcate `featuredOnHome` în admin. Scopul e ca
 * userul să rămână pe homepage și să nu se ducă pe /asculta (poate nu se
 * întoarce să plătească). Popup-ul are totuși un link discret „vezi toate
 * demo-urile" către /asculta pentru cei care vor mai multe variante.
 */
export function DemosPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('demosPopup');
  const site = useSite();
  const asculta = getPagePath(site.locale, 'asculta');
  // La pasul de pachet/plată nu mai oferim ieșirea către /asculta — userul
  // rămâne în pop-up (cerință: aproape de plată, „doar pop-up", fără navigare).
  const reachedPackage = useWizardReachedPackage();

  // Lock scroll când e deschis. Cleanup la unmount + la close.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const { data, isLoading } = useQuery({
    queryKey: ['site-demos-featured'],
    queryFn: () => api.siteDemosFeatured(),
    enabled: open,
    staleTime: 60_000,
  });

  const { demoIds } = useExperienceCatalog();
  const items = useMemo(() => {
    const all = data?.items ?? [];
    if (!demoIds?.length) return all;
    return all.filter((d) => demoIds.includes(d.id));
  }, [data?.items, demoIds]);

  if (!open) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(8,4,4,0.78)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          background: '#120a0a',
          border: '1px solid var(--gold-deep)',
          borderRadius: 16,
          maxWidth: 560,
          width: '100%',
          maxHeight: '88vh',
          overflowY: 'auto',
          boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid var(--line)',
            position: 'sticky',
            top: 0,
            background: '#120a0a',
            zIndex: 2,
          }}
        >
          <div>
            <h3
              className="gold-text"
              style={{ margin: 0, fontSize: 18, fontWeight: 800 }}
            >
              {t('title')}
            </h3>
            <p
              style={{
                margin: '2px 0 0',
                fontSize: 12,
                color: 'rgba(255,245,220,0.55)',
              }}
            >
              {t('sub')}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t('close')}
            style={{
              background: 'transparent',
              border: '1px solid var(--line)',
              color: 'var(--cream)',
              width: 32,
              height: 32,
              borderRadius: '50%',
              fontSize: 18,
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: 16 }}>
          {isLoading ? (
            <p
              className="ld"
              style={{ textAlign: 'center', padding: 24, margin: 0 }}
            >
              {t('loading')}
            </p>
          ) : items.length === 0 ? (
            <p
              style={{
                textAlign: 'center',
                padding: 24,
                margin: 0,
                fontSize: 13,
                color: 'rgba(255,245,220,0.6)',
              }}
            >
              {t('empty')}
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {items.map((d) => (
                <PopupDemoCard key={d.id} demo={d} t={t} />
              ))}
            </div>
          )}

          {!reachedPackage && (
            <div
              style={{
                marginTop: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <Link
                href={asculta}
                onClick={onClose}
                style={{
                  fontSize: 13,
                  color: 'rgba(255,245,220,0.7)',
                  textDecoration: 'underline',
                }}
              >
                {t('viewAll')}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PopupDemoCard({
  demo,
  t,
}: {
  demo: SiteDemoDto;
  t: ReturnType<typeof useTranslations>;
}) {
  // Lazy mount: WaveSurfer descarcă MP3-ul complet + face decode pentru waveform
  // la mount. Cu 5 card-uri simultane = 5 descărcări paralele = timp mort lung
  // la deschiderea popup-ului. Așa că randăm doar un buton Play „static" și
  // montăm player-ul real DOAR la primul click. ManeaPlayer pornește atunci
  // automat (autoPlay) ca să nu fie nevoie de a doua apăsare.
  const [activated, setActivated] = useState(false);

  const dedication = useMemo(() => {
    if (demo.fromName && demo.toName)
      return t('dedicationFromTo', { from: demo.fromName, to: demo.toName });
    if (demo.toName) return t('dedicationTo', { to: demo.toName });
    if (demo.fromName) return t('dedicationFrom', { from: demo.fromName });
    return '';
  }, [demo.fromName, demo.toName, t]);

  return (
    <div
      style={{
        background: 'rgba(241,200,77,0.04)',
        border: '1px solid var(--line)',
        borderRadius: 12,
        padding: 12,
      }}
    >
      <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
        {demo.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={demo.thumbnailUrl}
            alt=""
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              objectFit: 'cover',
              border: '1px solid var(--gold-deep)',
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              flexShrink: 0,
              background:
                'var(--avatar-fill)',
              border: '1px solid var(--gold-deep)',
            }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="gold-text"
            style={{
              fontWeight: 700,
              fontSize: 14,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {demo.title}
          </div>
          {dedication && (
            <div
              style={{
                fontSize: 11,
                color: 'rgba(255,245,220,0.6)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {dedication}
            </div>
          )}
        </div>
      </div>
      {activated ? (
        <ManeaPlayer
          audioUrl={demo.audioUrl}
          compact
          startSec={demo.previewStartSec}
          autoPlay
        />
      ) : (
        <PlayPlaceholder onClick={() => setActivated(true)} label={t('play')} />
      )}
    </div>
  );
}

/**
 * Placeholder static pentru un demo neîncărcat. Click → activează player-ul
 * real care preia de aici. Mimează vizual layout-ul wavesurfer (înălțime
 * identică, gradient subtil pe locul waveform-ului) ca să nu sară layout-ul
 * la activare.
 */
function PlayPlaceholder({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: '8px 12px',
        background: 'rgba(241,200,77,0.04)',
        border: '1px solid rgba(241,200,77,0.2)',
        borderRadius: 10,
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
      }}
    >
      <span
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background:
            'radial-gradient(circle at 35% 35%, #ffe28a, #f1c84d 60%, #b07c1e)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#2a1a04',
          fontSize: 14,
          flexShrink: 0,
          boxShadow: '0 2px 8px rgba(241,200,77,0.25)',
        }}
      >
        ▶
      </span>
      <span
        style={{
          flex: 1,
          height: 32,
          background:
            'repeating-linear-gradient(90deg, rgba(241,200,77,0.18) 0 2px, transparent 2px 5px)',
          borderRadius: 4,
          opacity: 0.5,
        }}
      />
      <span
        style={{
          fontSize: 11,
          color: 'rgba(255,245,220,0.55)',
          fontWeight: 600,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
    </button>
  );
}
