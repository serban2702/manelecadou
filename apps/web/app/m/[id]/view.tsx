'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { api, ApiError, resolveMediaUrl, type GenerationDto, type CollageAspect, type CollageDto } from '@/lib/api';
import type { PackageTier } from '@/lib/packages';
import { track } from '@/lib/tracking';
import { track as trackEvent } from '@/lib/tracker';
import { usePackage } from '@/experiences/use-packages';
import { ManeaPlayer } from '@/components/ManeaPlayer';
import { VideoPlayer } from '@/components/VideoPlayer';
import { ChorusClipsSection } from '@/components/ChorusClipsSection';
import { SocialImagesSection } from '@/components/SocialImagesSection';
import { OwnerPasswordControl, UnlockPrompt, useUnlockPassword } from '@/components/UnlockPassword';
import { STYLES, VOICES, OCC } from '@/lib/seed-data';
import { useSite } from '@/lib/site-context';
import { useSession } from '@/lib/providers';
import { formatPrice, siteSupportEmail } from '@/lib/site-shared';
import { getPagePath } from '@/lib/page-slugs';
import { prettifyLyrics } from '@/lib/lyrics-display';
import { RotatingStatus } from '@/components/RotatingStatus';
import { FollowPromoSection, FollowPromoModal } from '@/components/FollowPromo';
import { useFollowPromo, useFollowPromoPopup } from '@/lib/follow-promo';

export default function ShareGenerationView() {
  return (
    <Suspense fallback={null}>
      <ShareGenerationViewInner />
    </Suspense>
  );
}

const IN_PROGRESS_STATUSES = new Set([
  'pending', 'queued', 'writing_lyrics', 'checking_lyrics', 'generating_audio', 'running',
]);

/** O variantă redabilă pe pagină (vine din payload-ul backend, câmpul `variants`). */
type PlayableVariant = { id: string; kind: 'main' | 'bonus' | 'variation'; label: string; audioUrl: string };

function ShareGenerationViewInner() {
  // Limba COMENZII, nu a domeniului vizitat. Pe pagina de livrare, next-intl
  // primește deja limba comenzii (vezi lib/active-locale.ts), deci `useLocale()`
  // e aceeași sursă cu textele de mai jos — numele de stil/ocazie/voce și
  // versurile nu pot ieși în altă limbă decât restul paginii.
  //
  // URL-urile rămân pe `site.locale`: slug-ul „manelele-mele" trebuie să existe
  // pe domeniul pe care e omul, altfel linkul de întoarcere dă 404.
  const contentLocale = useLocale();
  const t = useTranslations('mViewPage');
  const tLive = useTranslations('generator.live');
  const tStatus = useTranslations('generator.live.status');
  const tStyles = useTranslations('styles');
  const tOcc = useTranslations('occasions');
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const site = useSite();
  const [g, setG] = useState<GenerationDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  // Parola de privacy (non-owner) — persistată în localStorage ca refresh-ul să
  // păstreze accesul. `null` = neintrodusă / owner.
  const { password: unlockPw, unlock } = useUnlockPassword(params.id);
  const viewTrackedRef = useRef(false);
  const purchaseTrackedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const fresh = await api.getGeneration(params.id, unlockPw ?? undefined);
      setG(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errUnknown'));
    }
  }, [params.id, unlockPw, t]);

  useEffect(() => {
    refresh();
  }, [params.id, unlockPw]); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling cât timp generation e încă în lucru — UX identic cu pasul demo
  // din Generator (progress bar + statusuri vii).
  useEffect(() => {
    if (!g) return;
    // Continuăm polling-ul cât timp generarea e în lucru SAU melodia e gata dar
    // livrabilele extra (imagini/videoclip) încă se generează în fundal.
    const stillEnriching = g.status === 'succeeded' && g.deliverablesReady === false;
    if (!IN_PROGRESS_STATUSES.has(g.status) && !stillEnriching) return;
    const id = setInterval(refresh, 2500);
    return () => clearInterval(id);
  }, [g?.status, g?.deliverablesReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Valoarea raportată la Meta e prețul PACHETULUI comenzii, nu `basePriceCents`
  // — un câmp dinaintea pachetelor, care nu taxează nimic. Cu el, un Premium de
  // 99,99 lei se raporta ca 29,99, iar pe bg/gr TOT traficul se raporta la 5,99 €
  // în loc de 7,99–29,99. Meta optimizează pe valoarea primită, deci era bani
  // aruncați pe licitații calibrate greșit.
  const trackedPack = usePackage(g?.packageTier);
  const trackedValue = (trackedPack?.priceCents ?? site.basePriceCents) / 100;

  useEffect(() => {
    if (!g || viewTrackedRef.current) return;
    viewTrackedRef.current = true;
    track('ViewContent', {
      content_id: g.id,
      content_name: `Manea pentru ${g.recipientName}`,
      content_type: 'product',
      value: trackedValue,
      currency: site.currency,
    });
  }, [g, trackedValue, site.currency]);

  useEffect(() => {
    const paymentId = search.get('paymentId');
    const success = search.get('success');
    if (!paymentId || success !== '1' || unlocking) return;
    setUnlocking(true);
    (async () => {
      let paid: { amount: number; currency: string; amountRonCents?: number | null } | null = null;
      for (let i = 0; i < 10; i++) {
        try {
          const p = await api.getPayment(paymentId);
          if (p?.status === 'paid') {
            paid = { amount: p.amount, currency: p.currency, amountRonCents: p.amountRonCents ?? null };
            break;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 1000));
      }
      try {
        await api.unlockGeneration(params.id, paymentId);
        await refresh();
        if (paid && !purchaseTrackedRef.current) {
          purchaseTrackedRef.current = true;
          // Raportăm în RON (curs BNR, calculat server-side) ca valoarea din
          // browser să fie identică cu cea trimisă server-side pe același
          // event_id → dedup corect. Fallback pe valuta nativă dacă lipsește.
          const ronCents = paid.amountRonCents ?? null;
          track('Purchase', {
            content_id: params.id,
            content_name: 'Manea Cadou',
            content_type: 'product',
            value: ronCents != null ? ronCents / 100 : paid.amount / 100,
            currency: ronCents != null ? 'RON' : paid.currency,
            // event_id MATCH cu server-side webhook (`pay-${paymentId}`).
            // Dedup OK în Events Manager → un singur Purchase per achiziție.
            event_id: `pay-${paymentId}`,
          });
        }
      } catch (e) {
        setError(`${t('unlockFailed')} ${(e as Error).message}`);
      } finally {
        setUnlocking(false);
        window.history.replaceState({}, '', `/m/${params.id}`);
      }
    })();
  }, [search, params.id, unlocking]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow ⇒ reducere. Hook-urile stau ÎNAINTE de early return-urile de mai jos:
  // altfel primul render fără generare le-ar sări, iar React ar cădea pe
  // „rendered more hooks than during the previous render".
  const followPromo = useFollowPromo();
  const followEligible = !!g && (
    // owner care a plătit…
    ((g.type === 'full' || g.paidUnlocked) && (g.isOwner ?? !!(g.ownerUserId || g.ownerGuestId)))
    // …sau vizitatorul care a deschis melodia cu parola ei.
    || !!g.unlocked
  );
  const followPopup = useFollowPromoPopup({
    generationId: g?.id,
    eligible: followEligible,
    hasCode: !!followPromo.code,
  });

  if (error) return <main style={{ padding: 40, textAlign: 'center' }}><p>{error}</p></main>;
  if (!g) return <main style={{ padding: 40, textAlign: 'center' }}><p className="ld">{t('loading')}</p></main>;

  const isPaid = g.type === 'full' || g.paidUnlocked;
  // Pay-first (site.demoEnabled=false): generation se creează cu type='full' +
  // status='pending' + paidUnlocked=false ÎNAINTE de plată. Dacă userul
  // abandonează Stripe Checkout fără să apese butonul „cancel" (închide tabul,
  // back din browser, sesiune expirată), nu trece prin cancel_url, iar mai
  // târziu aterizează aici din „Manelele mele" pe o piesă care PARE „Deblocată +
  // în lucru" → loader infinit fals (status nu avansează niciodată, generarea
  // nu a pornit). O detectăm ca „plată neterminată" și-i oferim reluarea plății.
  // Excludem flow-ul de success (?success=1 / ?paymentId=…) unde generation e
  // legitim pending câteva secunde până vine webhook-ul Stripe.
  const justPaid = search.get('success') === '1' || !!search.get('paymentId');
  const awaitingPayment = g.status === 'pending' && !g.paidUnlocked && !justPaid;
  // Owner-ul (user logat sau aceeași sesiune guest) e singurul care primește
  // owner ids în payload — payload-ul public le omite. Folosit ca să afișăm
  // colajul DOAR pentru cine a generat maneaua (backend-ul oricum impune 403).
  const isOwner = g.isOwner ?? !!(g.ownerUserId || g.ownerGuestId);
  // Owner SAU vizitator care a deblocat cu parola → poate vedea conținutul privat.
  const canSeePrivate = isOwner || !!g.unlocked;
  // Cât așteptăm plata, NU arătăm progress bar-ul „Acum compunem…" (generarea
  // nu a pornit) — afișăm în schimb secțiunea de reluare a plății.
  const inProgress = IN_PROGRESS_STATUSES.has(g.status) && !awaitingPayment;
  // Ce i s-a VÂNDUT comenzii — calculat server-side din `packageSnapshot`
  // (înghețat la plată). Decidem livrabilele din drepturi, nu din tier: Plus
  // include colaj, iar oferta se poate schimba oricând sub o comandă veche.
  // Dacă `entitlements` lipsește (API vechi / răspuns parțial), `ent` e null și
  // fiecare secțiune cade pe comparația veche pe tier — mai bine o secțiune în
  // plus decât un livrabil plătit și ascuns.
  const ent = g.entitlements ?? null;
  const tier = g.packageTier ?? 'basic';
  // Cât `deliverablesReady` e false, backend-ul încă montează livrabile vândute
  // pe comanda asta — arătăm placeholder-e „se generează", altfel clientul care
  // a plătit nu vede nimic din ce a cumpărat. Semnalul e al backend-ului; nu-l
  // mai ghicim din tier.
  const enriching = isPaid && g.deliverablesReady === false;
  // Lookup chain: admin-defined config per site (cu i18n localizare) → seed-data
  //               → traduceri next-intl (pentru seed-data ids) → literal id.
  const adminStyle = site.styles?.find((s) => s.id === g.style);
  const adminOcc = site.occasions?.find((o) => o.id === g.occasion);
  const adminVoice = site.voices?.find((v) => v.id === g.voiceArtist);
  const styleNm =
    adminStyle?.i18n?.[contentLocale]?.nm ||
    adminStyle?.nm ||
    ((tStyles as any).has?.(`${g.style}.nm`) ? tStyles(`${g.style}.nm` as any) : null) ||
    STYLES.find((s) => s.id === g.style)?.nm ||
    g.style;
  const occNm =
    adminOcc?.i18n?.[contentLocale]?.nm ||
    adminOcc?.nm ||
    ((tOcc as any).has?.(g.occasion) ? tOcc(g.occasion as any) : null) ||
    OCC.find((o) => o.id === g.occasion)?.nm ||
    g.occasion;
  const voiceNm =
    adminVoice?.i18n?.[contentLocale]?.nm ||
    adminVoice?.nm ||
    VOICES.find((v) => v.id === g.voiceArtist)?.nm ||
    g.voiceArtist;

  return (
    <main style={{ maxWidth: 600, margin: '40px auto', padding: 20 }}>
      <Link href={getPagePath(site.locale, 'manelele-mele')} style={{
        display: 'inline-block', marginBottom: 14, fontSize: 12,
        color: 'var(--gold)', textDecoration: 'none',
      }}>
        {t('backToMine')}
      </Link>

      <h1 className="gold-text serif" style={{ fontSize: 28 }}>{`"${t('forSomeone', { name: g.recipientName })}"`}</h1>
      <p className="ld" style={{ marginTop: 4 }}>
        {styleNm} · {occNm} · {t('voiceLabel')}: {voiceNm}
      </p>
      {g.dedication && (
        <p className="ld" style={{ marginTop: 2, fontSize: 13 }}>{t('fromSomeone', { from: g.dedication })}</p>
      )}
      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {awaitingPayment ? (
          // Plată neterminată — NU arătăm „Deblocată"/„PREMIUM" (ar fi înșelător:
          // piesa nu e plătită încă).
          <span style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 999,
            background: 'rgba(255,150,40,0.15)', color: '#ffce9a', fontWeight: 600,
          }}>
            ⏳ {t('paymentIncompleteBadge')}
          </span>
        ) : (
          <>
            <span style={{
              fontSize: 11, padding: '3px 10px', borderRadius: 999,
              background: isPaid ? 'rgba(62,224,126,0.15)' : 'rgba(241,200,77,0.15)',
              color: isPaid ? '#bff5d2' : '#f1c84d', fontWeight: 600,
            }}>
              {isPaid ? t('unlockedBadge') : t('demoBadge')}
            </span>
            {/* Coroana marchează pachetul de top — dreptul la pagina premium,
                nu numele tier-ului (o interfață poate redenumi pachetele). */}
            {(ent ? ent.premiumPage : tier === 'premium') && (
              <span style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 999,
                background: 'linear-gradient(180deg,#ffe28a,#f1c84d,#b07c1e)',
                color: '#2a1a04', fontWeight: 800, letterSpacing: '0.04em',
              }}>
                👑 {(ent?.label ?? 'Premium').toUpperCase()}
              </span>
            )}
          </>
        )}
        {g.status === 'failed' && (
          <span style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 999,
            background: 'rgba(255,90,90,0.15)', color: '#ffb3b3', fontWeight: 600,
          }}>
            ⚠️ {t('statusLabel')} {g.status}
          </span>
        )}
      </div>

      {unlocking && (
        <div style={{
          marginTop: 14, padding: 12, borderRadius: 8,
          background: 'rgba(241,200,77,0.1)', border: '1px solid rgba(241,200,77,0.4)',
        }}>
          {t('confirmingPayment')}
        </div>
      )}

      {/* Privacy: non-owner cu manea privată — cere parola. */}
      {!isOwner && g.hasUnlockPassword && !g.unlocked && (
        <UnlockPrompt
          skin="classic"
          // refresh se declanșează automat via effect [unlockPw].
          onUnlocked={unlock}
          generationId={params.id}
        />
      )}

      {/* Privacy: owner setează/șterge parola peste pozele private. Are sens
          doar dacă poate încărca poze, adică dacă a cumpărat colajul. */}
      {isOwner && isPaid && g.status === 'succeeded' && (ent ? ent.collage : tier === 'plus' || tier === 'premium') && (
        <OwnerPasswordControl
          skin="classic"
          generationId={g.id}
          hasPassword={!!g.hasUnlockPassword}
          currentPin={g.unlockPin ?? null}
          onChanged={() => refresh()}
        />
      )}

      {awaitingPayment && (
        <PaymentRetrySection
          generation={g}
          promoCode={search.get('promo')}
          promoOff={search.get('off')}
        />
      )}

      {inProgress && (
        <GenerationProgress
          generation={g}
          locale={contentLocale}
          tLive={tLive}
          tStatus={tStatus}
        />
      )}

      {(() => {
        // Lista variantelor afișate clientului: din backend (`variants` = piesa
        // principală + bonus + toate variațiile puse de admin) cu fallback pe
        // câmpurile clasice. Clientul le ascultă pe toate și o alege pe care vrea.
        const variantList = (g as typeof g & { variants?: PlayableVariant[] }).variants;
        const list: PlayableVariant[] = variantList && variantList.length > 0
          ? variantList
          : [
              ...(g.audioUrl ? [{ id: g.id, kind: 'main' as const, label: 'main', audioUrl: g.audioUrl }] : []),
              ...(g.bonusAudioUrl ? [{ id: g.id, kind: 'bonus' as const, label: 'bonus', audioUrl: g.bonusAudioUrl }] : []),
            ];
        if (list.length === 0) return null;
        // „Versiunea" derivat din traducere (scoatem cifra finală) ca să
        // numerotăm 1..N în orice limbă, fără chei i18n noi.
        const versionWord = t('version1').replace(/[\s\d]+$/u, '').trim() || t('version1');
        const single = list.length === 1;
        return list.map((v, i) => (
          <div key={`${v.id}:${v.kind}:${i}`} style={{ marginTop: i === 0 ? 16 : 12 }}>
            <ManeaPlayer
              audioUrl={resolveMediaUrl(v.audioUrl)!}
              title={single ? t('version1') : `${versionWord} ${i + 1}`}
              subtitle={isPaid ? t('full') : t('demo30')}
              trackContext={{ generationId: g.id, variant: v.kind }}
            />
          </div>
        ));
      })()}

      {!isPaid && g.status === 'succeeded' && g.audioUrl && (
        <PaywallSection generationId={g.id} tier={g.packageTier ?? null} />
      )}

      {/* Videoclipurile sunt clipuri SCURTE verticale (refren, stil TikTok).
          Le afișăm UNUL LÂNGĂ ALTUL — 2 coloane, inclusiv pe mobil (verticale
          înguste). Dacă există doar unul, e afișat singur (flex se descurcă).
          `pending`: cât livrabilele premium se montează și încă nu există niciun
          video. */}
      <ChorusClipsSection
        generation={g}
        skin="classic"
        pending={enriching && (ent ? ent.chorusClip : tier === 'premium')}
      />

      {/* Colaj video din pozele tale, după plată și melodie finalizată. Owner SAU
          vizitator deblocat poate VEDEA colajele; doar owner-ul cu dreptul din
          pachet poate CREA (backend impune 403 și plafonează numărul de poze).
          Galeria rămâne montată chiar fără dreptul de creare — un colaj deja
          livrat nu se ascunde niciodată. */}
      {canSeePrivate && isPaid && g.status === 'succeeded' && (
        <CollageSection
          generation={g}
          isOwner={isOwner}
          password={unlockPw ?? undefined}
          canCreate={ent ? ent.collage : tier === 'premium'}
          maxImages={ent?.collagePhotoLimit ?? DEFAULT_COLLAGE_IMAGES}
        />
      )}

      {g.status === 'succeeded' && !!(g.socialImages && g.socialImages.length) ? (
        <SocialImagesSection
          generation={g}
          isOwner={isOwner}
          skin="classic"
          // BUG FIX: endpoint-urile select/upload întorc un obiect PARȚIAL
          // (ex. `{ ok, socialImageSelected }`). Înlocuirea totală a obiectului
          // golea pagina (titlu fără nume, „Demo — preview"). Facem MERGE ca să
          // păstrăm restul câmpurilor (recipientName, type, audioUrl, videoUrl…).
          onUpdated={(fresh) => setG((prev) => (prev ? { ...prev, ...fresh } : prev))}
          renderExtra={(selected) => (
            <ImageVideoLauncher
              generation={g}
              isOwner={isOwner}
              selected={selected}
              password={unlockPw ?? undefined}
            />
          )}
        />
      ) : enriching && (ent ? ent.shareImages : true) ? (
        // Placeholder doar dacă pozele de share chiar i-au fost vândute — altfel
        // i-am promite un livrabil pe care nu-l primește niciodată.
        <div style={{
          marginTop: 16, padding: 16, borderRadius: 12,
          border: '1px solid rgba(241,200,77,0.25)', background: 'rgba(241,200,77,0.04)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 8 }}>
            📸 Poza ta de share
          </div>
          <div className="ld" style={{ fontSize: 13, opacity: 0.85 }}>
            ⏳ Se generează pozele pentru share… (apar automat în câteva momente)
          </div>
        </div>
      ) : null}

      {g.status === 'succeeded' && (
        <ShareSection
          generationId={g.id}
          recipientName={g.recipientName ?? 'cadou'}
          imageUrl={resolveMediaUrl(g.socialImageUploaded ?? g.socialImageSelected ?? g.coverUrl)}
        />
      )}

      {followEligible && <FollowPromoSection state={followPromo} />}

      <ContactSection />

      {g.lyrics && (
        <details style={{ marginTop: 18 }}>
          <summary style={{ fontSize: 13, color: 'var(--gold)', cursor: 'pointer', fontWeight: 600 }}>
            {t('lyricsToggle')}
          </summary>
          <pre style={{
            whiteSpace: 'pre-wrap', marginTop: 10, color: 'var(--gold-2)',
            background: 'rgba(241,200,77,0.05)', padding: 12, borderRadius: 8,
            fontSize: 13, lineHeight: 1.6,
          }}>{prettifyLyrics(g.lyrics, contentLocale)}</pre>
        </details>
      )}

      <FollowPromoModal state={followPromo} open={followPopup.open} onClose={followPopup.close} />
    </main>
  );
}

/** Progress bar time-based — replică din Generator.tsx (`useTimeBasedProgress`).
 *  În primele 180s urcă liniar până la 90%, apoi încet spre 99% până la finalizare. */
function useTimeBasedProgress(generation: GenerationDto): number {
  const startMs = useMemo(() => {
    const t = new Date(generation.createdAt).getTime();
    return Number.isFinite(t) ? t : Date.now();
  }, [generation.createdAt]);

  const computePct = useCallback((): number => {
    if (generation.status === 'succeeded' || generation.status === 'failed') return 100;
    const elapsedSec = Math.max(0, (Date.now() - startMs) / 1000);
    if (elapsedSec <= 180) return (elapsedSec / 180) * 90;
    return Math.min(99, 90 + (elapsedSec - 180) / 60);
  }, [generation.status, startMs]);

  const [pct, setPct] = useState<number>(computePct);

  useEffect(() => {
    setPct(computePct());
    if (generation.status === 'succeeded' || generation.status === 'failed') return;
    const id = setInterval(() => setPct(computePct()), 1000);
    return () => clearInterval(id);
  }, [computePct, generation.status]);

  return Math.min(100, Math.max(0, pct));
}

/** UI „live" pentru generation în curs — identic vizual cu pasul demo din
 *  Generator.tsx (titlu working, status, progress bar, ciornă/versuri verificate). */
function GenerationProgress({
  generation,
  locale,
  tLive,
  tStatus,
}: {
  generation: GenerationDto;
  locale: string;
  tLive: ReturnType<typeof useTranslations>;
  tStatus: ReturnType<typeof useTranslations>;
}) {
  const pct = useTimeBasedProgress(generation);
  // Pe „generating_audio" rotim mai multe fraze cu mică animație, ca la Claude Code.
  // Pe celelalte statusuri afișăm un singur label din `generator.live.status.*`.
  const rotation: string[] | null = (() => {
    if (generation.status !== 'generating_audio') return null;
    try {
      const raw = tLive.raw('statusRotation.generating_audio');
      return Array.isArray(raw) && raw.length > 0 ? (raw as string[]) : null;
    } catch { return null; }
  })();
  const fallbackLabel = (() => {
    try { return tStatus(generation.status as any); } catch { return generation.status; }
  })();

  return (
    <div style={{ marginTop: 18 }}>
      <h3 style={{ margin: 0, fontSize: 18, color: 'var(--gold-2)' }}>
        {tLive('workingTitle')}
      </h3>
      <p className="ld" style={{ marginTop: 4, minHeight: '1.4em' }}>
        {rotation ? <RotatingStatus phrases={rotation} /> : fallbackLabel}
      </p>

      <div style={{
        marginTop: 14, height: 6, borderRadius: 999,
        background: 'rgba(241,200,77,0.1)', overflow: 'hidden',
      }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: 'linear-gradient(90deg,#ffe28a,#f1c84d,#b07c1e)',
            transition: 'width 1s linear',
          }}
        />
      </div>

      {generation.lyrics && (
        <div style={{
          marginTop: 18, padding: 14, borderRadius: 10,
          background: 'rgba(241,200,77,0.05)',
          border: '1px solid rgba(241,200,77,0.2)',
        }}>
          <div style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
            {tLive('lyricsVerified')}
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--gold-2)', fontSize: 13, lineHeight: 1.6 }}>
            {prettifyLyrics(generation.lyrics, locale)}
          </pre>
        </div>
      )}
      {!generation.lyrics && generation.lyricsDraft && (
        <div style={{
          marginTop: 18, padding: 14, borderRadius: 10,
          background: 'rgba(255,255,255,0.02)',
          border: '1px dashed rgba(241,200,77,0.2)',
        }}>
          <div style={{ fontSize: 11, color: 'rgba(255,245,220,0.5)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
            {tLive('lyricsDraft')}
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', color: 'rgba(255,245,220,0.7)', fontSize: 12, lineHeight: 1.5 }}>
            {prettifyLyrics(generation.lyricsDraft, locale)}
          </pre>
        </div>
      )}
    </div>
  );
}

function PaywallSection({ generationId, tier }: { generationId: string; tier: string | null }) {
  const t = useTranslations('mViewPage');
  const tg = useTranslations('generator');
  const site = useSite();
  const session = useSession();
  const fmt = (cents: number) => formatPrice(site, cents);
  const [submittingPay, setSubmittingPay] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState<{ code: string; discountCents: number } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [validatingPromo, setValidatingPromo] = useState(false);

  // Prețul pachetului comenzii; `basePriceCents` rămâne doar ca plasă dacă
  // pachetul nu s-a încărcat încă. (Secțiunea asta e din fluxul cu demo, care
  // nu mai rulează pe niciun site — toate sunt pay-first.)
  const paywallPack = usePackage(tier);
  const basePrice = paywallPack?.priceCents ?? site.basePriceCents;
  const finalTotal = Math.max(0, basePrice - (promoApplied?.discountCents ?? 0));

  function translatePromoReason(reason: string | undefined): string {
    switch (reason) {
      case 'invalid': return tg('promo.errInvalid');
      case 'expired': return tg('promo.errExpired');
      case 'not_yet_valid': return tg('promo.errNotYet');
      case 'used_up': return tg('promo.errUsedUp');
      case 'wrong_email': return tg('promo.errWrongEmail');
      case 'empty': return tg('promo.errEmpty');
      default: return tg('promo.errGeneric');
    }
  }

  async function applyPromo() {
    if (!promoCode.trim()) return;
    setPromoError(null);
    setValidatingPromo(true);
    try {
      const r = await api.validatePromo(promoCode.trim(), session.email ?? undefined, basePrice);
      if (r.ok && r.appliedDiscountCents) {
        setPromoApplied({ code: promoCode.trim(), discountCents: r.appliedDiscountCents });
      } else {
        setPromoError(translatePromoReason(r.reason));
      }
    } catch {
      setPromoError(t('errCheckout'));
    } finally {
      setValidatingPromo(false);
    }
  }

  async function startCheckout() {
    setSubmittingPay(true);
    setPayError(null);
    try {
      track('InitiateCheckout', {
        content_id: generationId,
        content_name: 'Manea Cadou',
        content_type: 'product',
        value: basePrice / 100,
        currency: site.currency,
        // event_id stabil pe generație — dacă userul apasă de 2x, Meta dedup-uiește
        // și contează un singur intent (nu 2 InitiateCheckout fake).
        event_id: generationId ? `init-${generationId}` : undefined,
      });
      const { url } = await api.createCheckoutSession({
        generationId,
        promoCode: promoApplied?.code,
      });
      window.location.href = url;
    } catch (e) {
      setPayError(e instanceof ApiError ? e.message : t('errCheckout'));
      setSubmittingPay(false);
    }
  }

  return (
    <div style={{
      marginTop: 22, padding: 16, borderRadius: 12,
      background: 'linear-gradient(135deg, rgba(90,13,24,0.4), rgba(40,12,18,0.4))',
      border: '1px solid var(--gold)',
    }}>
      <h3 style={{ marginTop: 0, fontSize: 18, color: 'var(--gold-2)' }}>
        {t('paywallTitle')}
      </h3>
      <p className="ld" style={{ fontSize: 13, marginTop: 4 }}>
        {t('paywallSub')}
      </p>

      {promoApplied && (
        <div style={{
          marginTop: 10, padding: 10, borderRadius: 8,
          background: 'rgba(62,224,126,0.08)', border: '1px solid rgba(62,224,126,0.4)',
          fontSize: 13,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{t('priceLine')}</span>
            <span>{fmt(basePrice)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--green)', marginTop: 4 }}>
            <span>{tg('step5PayFirst.promoLine')} <code>{promoApplied.code}</code></span>
            <span>−{fmt(promoApplied.discountCents)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.1)', fontWeight: 700 }}>
            <span>{t('totalLine')}</span>
            <span className="gold-text">{fmt(finalTotal)}</span>
          </div>
        </div>
      )}

      <button
        onClick={startCheckout}
        disabled={submittingPay}
        className="btn"
        style={{
          marginTop: 12, width: '100%', padding: '12px 16px', fontWeight: 700,
          background: 'linear-gradient(180deg,#fff5cc 0%,#ffe28a 30%,#f1c84d 60%,#b07c1e 100%)',
          color: '#2a1a04', cursor: submittingPay ? 'wait' : 'pointer',
          opacity: submittingPay ? 0.7 : 1,
        }}
      >
        {submittingPay
          ? t('checkoutLoading')
          : promoApplied
            ? t('unlockCta', { amount: fmt(finalTotal) })
            : t('unlockCtaNoPrice')}
      </button>

      {payError && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#ff8888' }}>{payError}</div>
      )}

      <div style={{ marginTop: 10 }}>
        {!promoApplied ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              placeholder={tg('step5PayFirst.promoPlaceholder')}
              value={promoCode}
              onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoError(null); }}
              style={{
                flex: 1, padding: '8px 10px', borderRadius: 8,
                background: 'rgba(0,0,0,0.3)', border: '1px solid var(--line)',
                color: 'var(--gold-2)', fontFamily: 'inherit', fontSize: 13,
                fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
              }}
            />
            <button
              type="button"
              onClick={applyPromo}
              disabled={!promoCode.trim() || validatingPromo}
              className="btn btn-ghost btn-sm"
              style={{ padding: '8px 14px', fontSize: 13 }}
            >
              {validatingPromo ? t('applying') : t('applyPromo')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setPromoApplied(null); setPromoCode(''); }}
            style={{
              background: 'transparent', border: 'none',
              color: 'rgba(255,245,220,0.5)', cursor: 'pointer', fontSize: 12,
              textDecoration: 'underline',
            }}
          >
            {t('removePromo')}
          </button>
        )}
        {promoError && <div style={{ marginTop: 6, fontSize: 12, color: '#ff8888' }}>{promoError}</div>}
      </div>
    </div>
  );
}

/**
 * Plată neterminată (pay-first): generation rămas „pending" + neplătit fiindcă
 * userul a abandonat Stripe Checkout fără să treacă prin cancel_url. Reia plata
 * pentru ACEEAȘI generație (refolosește generationId + packageTier → preț
 * corect), apoi redirect la Stripe. La success se întoarce pe
 * /m/<id>?success=1 și pornește generarea reală.
 */
function PaymentRetrySection({
  generation,
  promoCode,
  promoOff,
}: {
  generation: GenerationDto;
  // Cod promo + procent (din `?promo=…&off=…`, ex. link de recovery): se aplică
  // automat la reluarea plății, fără ca userul să-l tasteze.
  promoCode?: string | null;
  promoOff?: string | null;
}) {
  const t = useTranslations('mViewPage');
  const site = useSite();
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [price, setPrice] = useState<{ total: number; currency: string } | null>(null);

  // Prețul corect al pachetului (premium ≠ basic) — pentru afișare pe buton.
  useEffect(() => {
    let alive = true;
    const tier: PackageTier = generation.packageTier ?? 'basic';
    api
      .priceQuote(tier)
      .then((q) => { if (alive) setPrice({ total: q.total, currency: q.currency }); })
      .catch(() => {/* afișăm butonul fără sumă */});
    return () => { alive = false; };
  }, [generation.packageTier]);

  async function retry() {
    setSubmitting(true);
    setErr(null);
    try {
      track('InitiateCheckout', {
        content_id: generation.id,
        content_name: 'Manea Cadou',
        content_type: 'product',
        value: (price?.total ?? site.basePriceCents) / 100,
        currency: price?.currency ?? site.currency,
        // event_id stabil pe generație — Meta dedup-uiește reîncercările.
        event_id: `init-${generation.id}`,
      });
      const { url } = await api.createCheckoutSession({
        generationId: generation.id,
        packageTier: generation.packageTier,
        promoCode: promoCode || undefined,
      });
      window.location.href = url;
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t('errCheckout'));
      setSubmitting(false);
    }
  }

  const amount = price ? formatPrice(site, price.total) : null;

  return (
    <div style={{
      marginTop: 18, padding: 18, borderRadius: 12,
      background: 'linear-gradient(135deg, rgba(120,60,10,0.30), rgba(60,28,10,0.30))',
      border: '1px solid rgba(241,200,77,0.55)',
    }}>
      <h3 style={{ marginTop: 0, fontSize: 18, color: 'var(--gold-2)' }}>
        ⏳ {t('paymentIncompleteTitle')}
      </h3>
      <p className="ld" style={{ fontSize: 14, marginTop: 6, lineHeight: 1.5 }}>
        {t('paymentIncompleteSub')}
      </p>
      {promoCode && promoOff && (
        <div style={{
          marginTop: 12, padding: '10px 12px', borderRadius: 10,
          background: 'rgba(62,224,126,0.12)', border: '1px solid rgba(62,224,126,0.45)',
          color: '#bff5d2', fontSize: 13, fontWeight: 600,
        }}>
          🎁 {t('promoApplied', { percent: promoOff, code: promoCode })}
        </div>
      )}
      <button
        type="button"
        onClick={retry}
        disabled={submitting}
        className="btn"
        style={{
          marginTop: 14, width: '100%', padding: '12px 16px', fontWeight: 700,
          background: 'linear-gradient(180deg,#fff5cc 0%,#ffe28a 30%,#f1c84d 60%,#b07c1e 100%)',
          color: '#2a1a04', cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1,
        }}
      >
        {submitting
          ? t('checkoutLoading')
          : amount
            ? t('retryPaymentCtaPrice', { amount })
            : t('retryPaymentCta')}
      </button>
      {err && <div style={{ marginTop: 8, fontSize: 12, color: '#ff8888' }}>{err}</div>}
    </div>
  );
}

/**
 * Buton share: Web Share API pe mobile, fallback grid pentru desktop
 * (Facebook, WhatsApp, X/Twitter, Copy link).
 */
function ShareSection({ generationId, recipientName, imageUrl }: { generationId: string; recipientName: string; imageUrl?: string | null }) {
  const t = useTranslations('mViewPage');
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  // Raportăm fiecare share la analytics-ul intern (vizibil în admin → Engagement).
  const trackShare = (channel: string) =>
    trackEvent({ type: 'song_share', props: { generationId, channel } });

  function getUrl() {
    if (typeof window === 'undefined') return '';
    return window.location.href;
  }
  function getText() {
    return t('shareText', { name: recipientName });
  }

  /** Încearcă să atașeze poza de share la Web Share API (share nativ cu fișier).
   *  Dacă browserul nu suportă fișiere, cade pe share doar cu link+text. */
  async function buildShareFile(): Promise<File | null> {
    if (!imageUrl || typeof fetch === 'undefined') return null;
    try {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      return new File([blob], `manea-${recipientName}.${ext}`, { type: blob.type });
    } catch {
      return null;
    }
  }

  async function tryNativeShare() {
    if (typeof navigator === 'undefined' || !('share' in navigator)) return false;
    const payload: ShareData = { title: t('shareNativeTitle'), text: getText(), url: getUrl() };
    const file = await buildShareFile();
    if (file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      (payload as ShareData & { files: File[] }).files = [file];
    }
    try {
      await navigator.share(payload);
      setShared(true);
      trackShare('native');
      setTimeout(() => setShared(false), 2000);
      return true;
    } catch {
      return false;
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(getUrl());
      setCopied(true);
      trackShare('copy_link');
      setTimeout(() => setCopied(false), 2000);
    } catch {/* ignore */}
  }

  const hasNative = typeof navigator !== 'undefined' && 'share' in navigator;

  return (
    <div style={{
      marginTop: 20, padding: 16, borderRadius: 12,
      background: 'rgba(241,200,77,0.06)',
      border: '1px solid rgba(241,200,77,0.2)',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 8 }}>
        {t('shareTitle')}
      </div>
      <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 12 }}>
        {t('shareSub')}
      </div>

      {hasNative && (
        <button
          type="button"
          onClick={tryNativeShare}
          className="btn btn-gold"
          style={{ width: '100%', marginBottom: 10 }}
        >
          {shared ? t('shareSent') : t('shareNativeCta')}
        </button>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(getUrl())}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackShare('facebook')}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '10px 12px', borderRadius: 8,
            background: '#1877f2', color: '#fff',
            textDecoration: 'none', fontSize: 13, fontWeight: 600,
          }}
        >
          📘 Facebook
        </a>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(getText() + ' ' + getUrl())}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackShare('whatsapp')}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '10px 12px', borderRadius: 8,
            background: '#25d366', color: '#fff',
            textDecoration: 'none', fontSize: 13, fontWeight: 600,
          }}
        >
          💬 WhatsApp
        </a>
        <a
          href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(getText())}&url=${encodeURIComponent(getUrl())}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackShare('twitter')}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '10px 12px', borderRadius: 8,
            background: '#000', color: '#fff',
            textDecoration: 'none', fontSize: 13, fontWeight: 600,
          }}
        >
          𝕏 Twitter
        </a>
        <button
          type="button"
          onClick={copyLink}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '10px 12px', borderRadius: 8,
            background: 'rgba(241,200,77,0.15)', color: 'var(--gold)',
            border: '1px solid rgba(241,200,77,0.4)',
            cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}
        >
          {copied ? t('shareCopied') : t('shareCopyCta')}
        </button>
      </div>

      <div style={{ fontSize: 11, opacity: 0.6, marginTop: 10, lineHeight: 1.4 }}>
        {t('shareInstagramHint')}
      </div>
    </div>
  );
}

/**
 * Contact — cardul de sub share. Pagina piesei era singurul loc din flux fără
 * niciun drum spre noi în afara chatului: cine o deschide din emailul de
 * livrare, pe alt dispozitiv sau la zile după comandă, n-avea unde să scrie.
 *
 * Adresa vine din TENANT (`site.supportEmail`, cu fallback pe domeniu prin
 * `siteSupportEmail`) — nu e hardcodată, deci fiecare site își arată propriul
 * email, exact ca footerul și pagina de contact.
 */
function ContactSection() {
  const t = useTranslations('mViewPage');
  const site = useSite();
  const email = siteSupportEmail(site);

  return (
    <div style={{
      marginTop: 20, padding: 16, borderRadius: 12,
      background: 'rgba(241,200,77,0.06)',
      border: '1px solid rgba(241,200,77,0.2)',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 8 }}>
        {t('contactTitle')}
      </div>
      <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 12 }}>
        {t('contactSub')}
      </div>
      {/* `.btn` are `white-space: nowrap` — pe un ecran îngust o adresă lungă ar
          ieși din card. Aici textul E adresa, deci lăsăm rândul să se rupă. */}
      <a
        href={`mailto:${email}`}
        className="btn btn-gold"
        style={{ width: '100%', whiteSpace: 'normal', wordBreak: 'break-word', textDecoration: 'none' }}
      >
        ✉️ {email}
      </a>
    </div>
  );
}

/**
 * Butonul „🎬 Fă videoclip cu imaginea asta" + panoul image→video (owner-only),
 * randate sub galeria de poze de share prin `renderExtra`. Pe rând separat +
 * text pe mai multe linii (butonul auriu trunchia textul când era pe același
 * rând cu download).
 */
function ImageVideoLauncher({
  generation,
  isOwner,
  selected,
  password,
}: {
  generation: GenerationDto;
  isOwner: boolean;
  /** Poza aleasă în galerie (URL ORIGINAL, nu resolved). */
  selected: string | null;
  password?: string;
}) {
  const t = useTranslations('mViewPage');
  const [iv2Open, setIv2Open] = useState(false);
  if (!isOwner || !selected) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setIv2Open((v) => !v)}
        className="btn btn-gold"
        style={{
          width: '100%', marginTop: 8, whiteSpace: 'normal', height: 'auto',
          minHeight: 46, lineHeight: 1.25, padding: '11px 14px', textAlign: 'center',
        }}
      >
        {t('ivCta')}
      </button>

      {iv2Open && (
        <ImageVideoPanel
          generation={generation}
          imageUrl={selected}
          password={password}
        />
      )}
    </>
  );
}

const IV_ASPECTS: { value: CollageAspect; label: string }[] = [
  { value: '9x16', label: '9:16 · TikTok / Story' },
  { value: '1x1', label: '1:1 · Postare IG' },
  { value: '16x9', label: '16:9 · YouTube' },
];

/**
 * Image→video: animă o singură imagine (poza selectată — URL-ul ORIGINAL
 * `/uploads/...`, NU resolved) peste melodia 1/2, în formatul ales. Pornește
 * jobul și face polling la `listCollages` până la succeeded/failed.
 */
function ImageVideoPanel({
  generation,
  imageUrl,
  password,
}: {
  generation: GenerationDto;
  // URL-ul ORIGINAL al imaginii (entry din socialImages / socialImageSelected /
  // socialImageUploaded). Backend-ul validează apartenența pe acest string exact.
  imageUrl: string;
  password?: string;
}) {
  const t = useTranslations('mViewPage');
  const g = generation;
  const hasBonus = !!(g.bonusAudioUrl || g.videoUrlBonus);
  const [trackChoice, setTrackChoice] = useState<'main' | 'bonus'>('main');
  const [aspect, setAspect] = useState<CollageAspect>('9x16');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [job, setJob] = useState<CollageDto | null>(null);
  const [polling, setPolling] = useState(false);

  // Polling la ~4s cât jobul e în lucru — selectăm cel mai nou image_video.
  useEffect(() => {
    if (!polling) return;
    const tick = async () => {
      const list = await api.listCollages(g.id, password);
      const latest = list.find((c) => (job ? c.id === job.id : c.kind === 'image_video')) ?? list[0] ?? null;
      if (latest) {
        setJob(latest);
        if (latest.status === 'succeeded' || latest.status === 'failed') setPolling(false);
      }
    };
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  }, [polling, g.id, password, job]);

  async function generate() {
    setSubmitting(true);
    setErr(null);
    try {
      const r = await api.createImageVideo(g.id, { track: trackChoice, aspect, imageUrl });
      setJob({ id: r.collageId, status: (r.status as CollageDto['status']) ?? 'pending', kind: 'image_video' });
      setPolling(true);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t('ivErrStart'));
    } finally {
      setSubmitting(false);
    }
  }

  const panelStyle: React.CSSProperties = {
    marginTop: 12, padding: 14, borderRadius: 10,
    background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(241,200,77,0.25)',
  };

  // Rezultat gata.
  if (job?.status === 'succeeded' && job.videoUrl) {
    const resolved = resolveMediaUrl(job.videoUrl)!;
    return (
      <div style={panelStyle}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', marginBottom: 8 }}>{t('ivDoneTitle')}</div>
        <VideoPlayer src={resolved} poster={resolveMediaUrl(imageUrl) ?? undefined} />
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <a href={resolved} download onClick={() => trackEvent({ type: 'image_download', props: { generationId: g.id, kind: 'video' } })} className="btn btn-gold" style={{ flex: '1 1 140px', textAlign: 'center', textDecoration: 'none' }}>
            {t('download')}
          </a>
          <button type="button" onClick={() => { setJob(null); setPolling(false); }} className="btn btn-ghost" style={{ flex: '1 1 140px' }}>
            {t('ivAgain')}
          </button>
        </div>
      </div>
    );
  }

  // În lucru.
  if (job && (job.status === 'pending' || job.status === 'processing')) {
    return (
      <div style={panelStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12, padding: '12px 8px' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            border: '4px solid rgba(241,200,77,0.18)', borderTopColor: 'var(--gold)',
            animation: 'spin 0.9s linear infinite',
          }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold-2)' }}>{t('ivWorking')}</div>
          <div style={{
            width: '100%', maxWidth: 320, height: 8, borderRadius: 999, overflow: 'hidden',
            background: 'rgba(241,200,77,0.12)', position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: 0, bottom: 0, width: '45%', borderRadius: 999,
              background: 'linear-gradient(90deg, transparent, var(--gold), transparent)',
              animation: 'collageShimmer 1.4s ease-in-out infinite',
            }} />
          </div>
          <div style={{ fontSize: 12.5, color: 'rgba(255,245,220,0.6)' }}>
            {t('ivWorkingHint')}
          </div>
        </div>
        <style>{`@keyframes collageShimmer { 0% { left: -45%; } 100% { left: 100%; } }`}</style>
      </div>
    );
  }

  if (job?.status === 'failed') {
    return (
      <div style={panelStyle}>
        <div style={{ fontSize: 13, color: '#ffb3b3', marginBottom: 10 }}>
          {t('ivFailed')}
        </div>
        <button type="button" onClick={() => { setJob(null); setPolling(false); }} className="btn btn-gold" style={{ width: '100%' }}>
          {t('ivRetry')}
        </button>
      </div>
    );
  }

  // Formular.
  return (
    <div style={panelStyle}>
      {hasBonus && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>{t('trackQuestion')}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {([
              { value: 'main', label: t('version1') },
              { value: 'bonus', label: t('version2') },
            ] as const).map((opt) => {
              const active = trackChoice === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTrackChoice(opt.value)}
                  style={{
                    flex: 1, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    border: `2px solid ${active ? 'var(--gold)' : 'var(--line)'}`,
                    background: active ? 'rgba(241,200,77,0.12)' : 'rgba(0,0,0,0.25)',
                    color: active ? 'var(--gold)' : 'var(--gold-2)',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>{t('formatLabel')}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {IV_ASPECTS.map((opt) => {
            const active = aspect === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setAspect(opt.value)}
                style={{
                  flex: '1 1 90px', padding: '8px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  border: `2px solid ${active ? 'var(--gold)' : 'var(--line)'}`,
                  background: active ? 'rgba(241,200,77,0.12)' : 'rgba(0,0,0,0.25)',
                  color: active ? 'var(--gold)' : 'var(--gold-2)',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={generate}
        disabled={submitting}
        className="btn btn-gold"
        style={{ width: '100%', cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1 }}
      >
        {submitting ? t('submitting') : t('ivGenerate')}
      </button>

      {err && <div style={{ marginTop: 8, fontSize: 12, color: '#ff8888' }}>{err}</div>}
    </div>
  );
}

/** Plafonul de poze folosit doar când comanda nu are drepturi în payload. */
const DEFAULT_COLLAGE_IMAGES = 15;
const MAX_COLLAGE_FILE_BYTES = 10 * 1024 * 1024; // 10MB / fișier
const MAX_COLLAGE_FILE_MB = MAX_COLLAGE_FILE_BYTES / (1024 * 1024);

/**
 * UI „Fă-ți un colaj video" — userul alege una dintre cele 2 melodii, încarcă
 * pozele (≤10MB fiecare) și backend-ul montează un colaj video. Numărul de poze
 * e plafonat de pachetul CUMPĂRAT (`maxImages`), exact ca la validarea din API —
 * altfel clientul încarcă 15 poze și primește eroare abia după upload.
 * După submit facem polling la `getLatestCollage` până la succeeded/failed.
 * Degradare grațioasă: dacă endpoint-urile lipsesc, secțiunea nu crapă pagina.
 */
function CollageSection({
  generation,
  isOwner,
  password,
  canCreate,
  maxImages,
}: {
  generation: GenerationDto;
  isOwner: boolean;
  password?: string;
  /** Pachetul cumpărat include colajul → arătăm formularul de creare. */
  canCreate: boolean;
  /** Câte poze acceptă pachetul cumpărat. */
  maxImages: number;
}) {
  const t = useTranslations('mViewPage');
  const g = generation;
  // Plafon efectiv: fără drept de colaj n-are sens un formular, deci limita
  // scade la 0 și formularul nu se randează (vezi gardul de mai jos).
  const limit = Math.max(0, maxImages);
  // A 2-a melodie există dacă avem audio/video bonus.
  const hasBonus = !!(g.bonusAudioUrl || g.videoUrlBonus);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [trackChoice, setTrackChoice] = useState<'main' | 'bonus'>('main');
  const [aspect, setAspect] = useState<CollageAspect>('9x16');
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // TOATE colajele/clipurile generării (nu doar ultimul — clientul poate face
  // mai multe: colaj cu poze + image-video). Le arătăm pe toate ca galerie.
  const [collages, setCollages] = useState<CollageDto[]>([]);
  const [polling, setPolling] = useState(false);

  // La mount: încarcă lista completă de colaje.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await api.listCollages(g.id, password);
      if (cancelled) return;
      setCollages(list);
      if (list.some((c) => c.status === 'pending' || c.status === 'processing')) setPolling(true);
    })();
    return () => { cancelled = true; };
  }, [g.id, password]);

  // Polling la ~4s cât vreun colaj e în lucru.
  useEffect(() => {
    if (!polling) return;
    const tick = async () => {
      const list = await api.listCollages(g.id, password);
      setCollages(list);
      if (!list.some((c) => c.status === 'pending' || c.status === 'processing')) setPolling(false);
    };
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  }, [polling, g.id, password]);

  // Curăță object URL-urile de preview la unmount / re-pick.
  useEffect(() => {
    return () => { previews.forEach((u) => URL.revokeObjectURL(u)); };
  }, [previews]);

  // Validează + acceptă o listă de fișiere (folosit de input ȘI de drag&drop).
  function acceptFiles(all: File[]) {
    const picked = all.filter((f) => f.type.startsWith('image/'));
    if (picked.length === 0) {
      if (all.length > 0) setErr(t('collageErrImagesOnly'));
      return;
    }
    setErr(null);
    if (limit > 0 && picked.length > limit) {
      setErr(t('collageErrTooMany', { limit, picked: picked.length }));
      return;
    }
    const tooBig = picked.find((f) => f.size > MAX_COLLAGE_FILE_BYTES);
    if (tooBig) {
      setErr(t('collageErrTooBig', { name: tooBig.name, mb: MAX_COLLAGE_FILE_MB }));
      return;
    }
    // Eliberează preview-urile vechi și creează altele noi.
    previews.forEach((u) => URL.revokeObjectURL(u));
    setFiles(picked);
    setPreviews(picked.map((f) => URL.createObjectURL(f)));
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ''; // permite re-pick aceleași fișiere
    if (picked.length > 0) acceptFiles(picked);
  }

  async function submit() {
    if (files.length === 0) { setErr(t('collageErrNone')); return; }
    setSubmitting(true);
    setErr(null);
    try {
      const r = await api.createCollage(g.id, trackChoice, files, aspect);
      setCollages((prev) => [
        { id: r.collageId, status: (r.status as CollageDto['status']) ?? 'pending', kind: 'collage', imageCount: files.length },
        ...prev,
      ]);
      setPolling(true);
      // Eliberăm fișierele după submit (rămâne starea de polling).
      previews.forEach((u) => URL.revokeObjectURL(u));
      setFiles([]);
      setPreviews([]);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t('collageErrStart'));
    } finally {
      setSubmitting(false);
    }
  }

  const sectionStyle: React.CSSProperties = {
    marginTop: 20, padding: 16, borderRadius: 12,
    background: 'rgba(241,200,77,0.06)', border: '1px solid rgba(241,200,77,0.2)',
  };
  const headerStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 8,
  };

  // Colajele gata (cu poze primele), cele în lucru și eticheta pe fiecare.
  const rankKind = (c: CollageDto) => (c.kind === 'image_video' ? 1 : 0);
  const done = [...collages]
    .filter((c) => c.status === 'succeeded' && c.videoUrl)
    .sort((a, b) => rankKind(a) - rankKind(b));
  const working = collages.filter((c) => c.status === 'pending' || c.status === 'processing');
  const collageLabel = (c: CollageDto) =>
    c.kind === 'image_video'
      ? t('collageLabelImageVideo')
      : c.imageCount
        ? t('collageLabelCollageCount', { count: c.imageCount })
        : t('collageLabelCollage');

  // Formularul de creare apare doar owner-ului care a cumpărat colajul.
  const showForm = isOwner && canCreate && limit > 0;
  // Nimic de arătat și fără formular → nu randăm nimic. Galeria colajelor deja
  // făcute rămâne vizibilă chiar dacă pachetul nu (mai) dă dreptul de creare.
  if (done.length === 0 && working.length === 0 && !showForm) return null;

  return (
    <>
      {/* Galerie: TOATE colajele gata (cele cu poze primele). */}
      {done.length > 0 && (
        <div style={sectionStyle}>
          <div style={headerStyle}>{t('collageGalleryTitle')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {done.map((c) => {
              const resolved = resolveMediaUrl(c.videoUrl!)!;
              return (
                <div key={c.id}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--gold-2)', marginBottom: 6 }}>
                    {collageLabel(c)}
                  </div>
                  <VideoPlayer src={resolved} />
                  <a
                    href={resolved}
                    download
                    onClick={() => trackEvent({ type: 'image_download', props: { generationId: g.id, kind: 'video' } })}
                    className="btn btn-gold"
                    style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 8 }}
                  >
                    {t('download')}
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Colaj(e) în lucru — card animat. */}
      {working.length > 0 && (
        <div style={sectionStyle}>
          <div style={headerStyle}>{t('collageWorkingTitle')}</div>
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
            padding: '22px 12px 18px', gap: 14,
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              border: '4px solid rgba(241,200,77,0.18)', borderTopColor: 'var(--gold)',
              animation: 'spin 0.9s linear infinite',
            }} />
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: 17, fontWeight: 700, color: 'var(--gold-2)' }}>
              {t('collageWorking')}
            </div>
            <div style={{
              width: '100%', maxWidth: 320, height: 8, borderRadius: 999, overflow: 'hidden',
              background: 'rgba(241,200,77,0.12)', position: 'relative',
            }}>
              <div style={{
                position: 'absolute', top: 0, bottom: 0, width: '45%', borderRadius: 999,
                background: 'linear-gradient(90deg, transparent, var(--gold), transparent)',
                animation: 'collageShimmer 1.4s ease-in-out infinite',
              }} />
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'rgba(255,245,220,0.6)', maxWidth: 340 }}>
              {t('collageWorkingSteps')}<br />
              {t.rich('collageWorkingHint', {
                b: (chunks) => <b style={{ color: 'var(--gold-2)' }}>{chunks}</b>,
              })}
            </div>
          </div>
          <style>{`
            @keyframes collageShimmer {
              0% { left: -45%; }
              100% { left: 100%; }
            }
          `}</style>
        </div>
      )}

      {/* Formular de creare (owner cu drept din pachet) — mereu disponibil ca să poată face altul. */}
      {showForm && (
    <div style={sectionStyle}>
      <div style={headerStyle}>{done.length > 0 ? t('collageFormTitleMore') : t('collageFormTitle')}</div>
      <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 12 }}>
        {t('collageFormSub')}
      </div>

      {/* Alegerea melodiei */}
      {hasBonus && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>{t('trackQuestion')}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {([
              { value: 'main', label: t('version1') },
              { value: 'bonus', label: t('version2') },
            ] as const).map((opt) => {
              const active = trackChoice === opt.value;
              return (
                <label
                  key={opt.value}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '8px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    border: `2px solid ${active ? 'var(--gold)' : 'var(--line)'}`,
                    background: active ? 'rgba(241,200,77,0.12)' : 'rgba(0,0,0,0.25)',
                    color: active ? 'var(--gold)' : 'var(--gold-2)',
                  }}
                >
                  <input
                    type="radio"
                    name="collage-track"
                    value={opt.value}
                    checked={active}
                    onChange={() => setTrackChoice(opt.value)}
                    style={{ accentColor: 'var(--gold)' }}
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Format (raport de aspect) — obligatoriu. */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>{t('formatLabel')}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {IV_ASPECTS.map((opt) => {
            const active = aspect === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setAspect(opt.value)}
                style={{
                  flex: '1 1 90px', padding: '8px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  border: `2px solid ${active ? 'var(--gold)' : 'var(--line)'}`,
                  background: active ? 'rgba(241,200,77,0.12)' : 'rgba(0,0,0,0.25)',
                  color: active ? 'var(--gold)' : 'var(--gold-2)',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onPick}
        style={{ display: 'none' }}
      />
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          acceptFiles(Array.from(e.dataTransfer.files ?? []));
        }}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 6, padding: '26px 16px', cursor: 'pointer', textAlign: 'center',
          borderRadius: 12,
          border: `2px dashed ${dragOver ? 'var(--gold)' : 'rgba(241,200,77,0.35)'}`,
          background: dragOver ? 'rgba(241,200,77,0.12)' : 'rgba(0,0,0,0.2)',
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        <div style={{ fontSize: 28, lineHeight: 1 }}>{dragOver ? '📥' : '🖼️'}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold-2)' }}>
          {files.length > 0
            ? t('collageDropSelected', { count: files.length })
            : dragOver ? t('collageDropActive') : t('collageDropIdle')}
        </div>
        <div style={{ fontSize: 11.5, color: 'rgba(255,245,220,0.5)' }}>
          {t('collageDropHint', { count: limit, mb: MAX_COLLAGE_FILE_MB })}
        </div>
      </div>

      {previews.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginTop: 10 }}>
          {previews.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src + i}
              src={src}
              alt={t('imageAlt', { n: i + 1 })}
              style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 6, display: 'block', background: '#000' }}
            />
          ))}
        </div>
      )}

      {files.length > 0 && (
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="btn btn-gold"
          style={{ width: '100%', marginTop: 12, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1 }}
        >
          {submitting ? t('submitting') : t('collageSubmit')}
        </button>
      )}

      {err && <div style={{ marginTop: 8, fontSize: 12, color: '#ff8888' }}>{err}</div>}
    </div>
      )}
    </>
  );
}
