'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError, resolveMediaUrl, type GenerationDto } from '@/lib/api';
import { track } from '@/lib/tracking';
import { track as trackEvent } from '@/lib/tracker';
import { prettifyLyrics } from '@/lib/lyrics-display';
import { getPagePath } from '@/lib/page-slugs';
import { siteSupportEmail, siteUrl } from '@/lib/site-shared';
import { useSite } from '@/lib/site-context';
import { ChorusClipsSection, chorusClipUrls } from '@/components/ChorusClipsSection';
import { SocialImagesSection } from '@/components/SocialImagesSection';
import { OwnerPasswordControl, UnlockPrompt, useUnlockPassword } from '@/components/UnlockPassword';
import { CadouShell } from './Shell';
import { CadouDemoPlayer } from './DemoPlayer';
import { CadouVideoSection } from './VideoSection';
import { CadouRemakeCard } from './RemakeCard';
import { CadouUpsellModal, upsellAlreadySeen } from './UpsellModal';
import { CadouFollowCard } from './FollowCard';
import { CadouFold } from './Fold';
import { cadouStyleArt } from './style-art';
import { useCadouFromName } from './from-name';
import { clearCadouWizard, readCadouWizard } from './wizard-storage';
import { useExperienceCatalog } from '../use-experience-catalog';
import { usePackage } from '@/experiences/use-packages';
import { Picture } from '@/components/Picture';

const IN_PROGRESS = new Set([
  'pending', 'queued', 'writing_lyrics', 'checking_lyrics', 'generating_audio', 'running',
]);

const AVG_SEC = 6 * 60;
const LINEAR_SEC = 5 * 60;
const RING = 2 * Math.PI * 46;

const NO_VALUE = '—';

/** Câte cicluri de polling mai insistăm pe o generare picată (3s fiecare) până
 *  să recunoaștem că nu se mai repară singură. ~2 minute: destul cât să prindem
 *  un auto-retry reușit, dar nu un cronometru fals la nesfârșit. */
const FAILED_POLL_MAX = 40;

/** Câte încercări facem ca plata să apară `paid` după redirectul de la Stripe
 *  (webhook-ul poate întârzia câteva secunde). Identic cu interfața clasică. */
const PAY_CONFIRM_TRIES = 10;
/** Câte runde de confirmare (10 încercări fiecare) înainte să renunțăm. */
const PAY_CONFIRM_ROUNDS = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fmtRemain(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function waitEta(elapsedSec: number): { remainSec: number; progress: number; stretch: boolean } {
  if (elapsedSec < LINEAR_SEC) {
    return {
      remainSec: Math.max(60, AVG_SEC - elapsedSec),
      progress: elapsedSec / AVG_SEC,
      stretch: false,
    };
  }
  const extra = elapsedSec - LINEAR_SEC;
  const remainSec = Math.max(12, 60 * Math.exp(-extra / 210));
  const progress = 5 / 6 + (1 / 6) * 0.82 * (1 - Math.exp(-extra / 360));
  return { remainSec, progress: Math.min(0.97, progress), stretch: true };
}

/** `variant` = `main` / `bonus` / `variation`, exact eticheta pe care o pune și
 *  `ManeaPlayer` pe interfața clasică în `song_play` / `song_download`. */
type Playable = { id: string; label: string; audioUrl: string; variant: string };

function CadouWaitCard({
  cover,
  createdAt,
  hasLyrics,
}: {
  cover: string;
  createdAt: string;
  hasLyrics: boolean;
}) {
  const t = useTranslations('cadou.song');
  const [now, setNow] = useState(() => Date.now());
  const startMs = useMemo(() => {
    const parsed = new Date(createdAt).getTime();
    return Number.isFinite(parsed) ? parsed : Date.now();
  }, [createdAt]);

  const working = useMemo(
    () => [t('workingLyrics'), t('workingRhyme'), t('workingMusic'), t('workingVoice')],
    [t],
  );
  const stretchLines = useMemo(
    () => [t('stretchMix'), t('stretchPolish'), t('stretchAlmost')],
    [t],
  );

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const elapsed = Math.max(0, (now - startMs) / 1000);
  const { remainSec, progress, stretch } = waitEta(elapsed);
  const phrase = stretch
    ? stretchLines[Math.floor(now / 2800) % stretchLines.length]
    : hasLyrics
      ? t('waitOnLyrics')
      : working[Math.floor(now / 2800) % working.length];
  const remainRound = stretch
    ? Math.min(59, Math.max(12, Math.ceil(remainSec)))
    : Math.max(1, Math.ceil(remainSec));

  return (
    <div className={`cadou-wait${stretch ? ' is-stretch' : ''}`} aria-live="polite">
      <div className="cadou-wait-dial">
        <svg className="cadou-wait-ring" viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r="46" className="cadou-wait-track" />
          <circle
            cx="50"
            cy="50"
            r="46"
            className="cadou-wait-fill"
            style={{
              strokeDasharray: RING,
              strokeDashoffset: RING * (1 - progress),
            }}
          />
        </svg>
        <div className="cadou-wait-disc">
          <Picture src={cover} alt="" priority />
        </div>
      </div>
      <div className="cadou-wait-time" aria-label={t('waitRemaining', { time: fmtRemain(remainRound) })}>
        {fmtRemain(remainRound)}
      </div>
      <span className="cadou-wait-eq" aria-hidden>
        <i /><i /><i /><i /><i />
      </span>
      <div className="cadou-wait-lab">
        {stretch ? t('waitLabelAlmost') : t('waitLabelEta')}
      </div>
      <strong>
        {stretch ? t('waitTitleAlmost') : hasLyrics ? t('waitTitleLyrics') : t('waitTitleMaking')}
      </strong>
      <span>{phrase}</span>
      <div className="cadou-wait-bar" aria-hidden>
        <i style={{ width: `${Math.max(6, progress * 100)}%` }} />
      </div>
    </div>
  );
}

function CadouLyrics({ text }: { text: string }) {
  const site = useSite();
  const pretty = prettifyLyrics(text, site.locale);
  return (
    <div className="cadou-song-lyrics">
      {pretty.split('\n').map((line, i) => {
        const tag = line.match(/^\[(.+)\]\s*$/);
        if (tag) return <div key={i} className="cadou-song-tag">{tag[1]}</div>;
        if (!line.trim()) return <div key={i} className="cadou-song-gap" />;
        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}

/**
 * Generarea a picat și nu există audio. Nu-i mai arătăm cronometrul „aproape
 * gata" (minte), ci ce s-a întâmplat + drumul spre noi. Chatul e deja montat în
 * `CadouShell`, așa că butonul apasă lansatorul lui; dacă lipsește, cade pe
 * emailul de suport.
 */
function CadouFailedCard({ stalled }: { stalled: boolean }) {
  const t = useTranslations('cadou.song');
  const site = useSite();
  const support = siteSupportEmail(site);

  const openSupport = () => {
    const launcher = document.querySelector<HTMLButtonElement>('.chat-launcher');
    if (launcher) {
      launcher.click();
      return;
    }
    window.location.href = `mailto:${support}`;
  };

  return (
    <div className="cadou-song-card cadou-song-failed" role="alert">
      <span className="cadou-song-failed-ico" aria-hidden>⚠️</span>
      <strong>{t('failedTitle')}</strong>
      <p>{stalled ? t('failedStalled') : t('failedRetrying')}</p>
      <button type="button" className="cadou-cta" onClick={openSupport}>{t('failedChat')}</button>
      <a className="cadou-song-failed-mail" href={`mailto:${support}`}>{support}</a>
    </div>
  );
}

/**
 * Contact pe pagina piesei — aceeași nevoie ca pe `classic`: cine deschide
 * pagina din emailul de livrare, pe alt dispozitiv sau după zile, trebuie să
 * aibă unde să scrie fără să caute prin site.
 *
 * Adresa e a TENANTULUI (`site.supportEmail`, fallback pe domeniu), nu una
 * hardcodată. Card simplu, nu `CadouFold`: dacă ar fi pliabil, pe un card
 * închis emailul n-ar mai fi pe pagină — exact ce trebuia rezolvat.
 */
function CadouContactCard() {
  const t = useTranslations('cadou.song');
  const site = useSite();
  const email = siteSupportEmail(site);

  return (
    <div className="cadou-song-card cadou-song-contact">
      <strong>{t('contactTitle')}</strong>
      <p>{t('contactLead')}</p>
      <a className="cadou-cta" href={`mailto:${email}`}>✉️ {email}</a>
    </div>
  );
}

/**
 * Share pe piesa livrată — produsul e un CADOU, clientul trebuie să-l poată
 * trimite cuiva fără să treacă prin colaj. Fiecare canal raportează
 * `song_share` (panoul Engagement din admin), cu aceleași nume de canal ca pe
 * interfața clasică.
 */
function CadouShareCard({
  generationId,
  name,
  imageUrl,
  defaultOpen,
}: {
  generationId: string;
  name: string;
  /** Poza de share (dacă există) — o atașăm la share-ul nativ. */
  imageUrl?: string | null;
  defaultOpen: boolean;
}) {
  const t = useTranslations('cadou.song');
  const site = useSite();
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  // `navigator.share` se verifică DUPĂ mount — pe server nu există, iar un
  // markup diferit ar rupe hidratarea.
  const [hasNative, setHasNative] = useState(false);
  useEffect(() => {
    setHasNative(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  // Linkul canonic al site-ului CURENT (nu `window.location.href`, care poate
  // căra `?paymentId=…` din redirectul Stripe).
  const url = `${siteUrl(site)}/m/${generationId}`;
  const text = t('shareText', { name });

  const trackShare = (channel: string) =>
    trackEvent({ type: 'song_share', props: { generationId, channel } });

  const buildFile = async (): Promise<File | null> => {
    if (!imageUrl || typeof fetch === 'undefined') return null;
    try {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      return new File([blob], `manea-${generationId}.${ext}`, { type: blob.type });
    } catch {
      return null;
    }
  };

  const nativeShare = async () => {
    const payload: ShareData = { title: site.name, text, url };
    const file = await buildFile();
    if (file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      (payload as ShareData & { files: File[] }).files = [file];
    }
    try {
      await navigator.share(payload);
      trackShare('native');
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {
      /* anulat de user */
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      trackShare('copy_link');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocat */
    }
  };

  return (
    <CadouFold title={t('shareTitle')} className="cadou-share" defaultOpen={defaultOpen}>
      <p className="cadou-share-lead">{t('shareLead')}</p>
      {hasNative && (
        <button type="button" className="cadou-cta" onClick={() => void nativeShare()}>
          {shared ? t('shareNativeDone') : t('shareNative')}
        </button>
      )}
      <div className="cadou-share-grid">
        <a
          className="cadou-share-btn is-wa"
          href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackShare('whatsapp')}
        >
          {t('shareWhatsapp')}
        </a>
        <a
          className="cadou-share-btn is-fb"
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackShare('facebook')}
        >
          {t('shareFacebook')}
        </a>
        <button type="button" className="cadou-share-btn" onClick={() => void copyLink()}>
          {copied ? t('shareCopied') : t('shareCopy')}
        </button>
      </div>
      <p className="cadou-share-hint">{t('shareHintInstagram')}</p>
    </CadouFold>
  );
}

function CadouOrderCard({ generation }: { generation: GenerationDto }) {
  const t = useTranslations('cadou.song');
  const fromName = useCadouFromName();
  const catalog = useExperienceCatalog();
  const g = generation;
  const packLabel = usePackage(g.packageTier)?.label ?? null;
  const rec = fromName.displayRecipient(g.recipientName);
  const noDedic = !g.recipientName?.trim() || g.recipientName.trim() === NO_VALUE;
  const from = fromName.senderOf(g);
  const styleNm = catalog.styles.find((s) => s.id === g.style)?.nm ?? g.style ?? NO_VALUE;
  const occNm = catalog.occasions.find((o) => o.id === g.occasion)?.nm ?? (g.occasion && g.occasion !== 'altul' ? g.occasion : NO_VALUE);
  const voiceNm = catalog.voices.find((v) => v.id === g.voiceArtist)?.nm
    ?? (g.voiceArtist === 'female' ? t('voiceFemale') : t('voiceMale'));
  // Numele pachetului din admin (interfața curentă). Lookup-ul acceptă și
  // pachetele oprite între timp — o comandă veche trebuie să-și arate pachetul.
  const pack = packLabel ?? g.packageTier ?? NO_VALUE;
  const story = fromName.stripFromLine(g.message);
  const rows: Array<[string, string]> = [
    [t('orderStyle'), styleNm],
    [t('orderOccasion'), occNm || NO_VALUE],
    [t('orderVoice'), voiceNm],
    [t('orderFor'), noDedic ? t('orderNoDedication') : rec],
    [t('orderFrom'), from || NO_VALUE],
    [t('orderPackage'), pack],
  ];
  if (story) rows.push([t('orderStory'), story]);
  if (g.customLyrics?.trim()) rows.push([t('orderCustomLyrics'), g.customLyrics.trim()]);

  return (
    <CadouFold title={t('orderTitle')} className="cadou-order" defaultOpen={false}>
      <div className="cadou-order-body">
        {rows.map(([k, v]) => (
          <div key={k} className="cadou-order-row">
            <b>{k}</b>
            <span>{v}</span>
          </div>
        ))}
      </div>
    </CadouFold>
  );
}

export default function CadouSongView() {
  return (
    <CadouShell>
      <Suspense fallback={<CadouSongFallback />}>
        <CadouSongInner />
      </Suspense>
    </CadouShell>
  );
}

function CadouSongFallback() {
  const t = useTranslations('cadou.song');
  return (
    <div className="cadou-wrap cadou-song-wrap">
      <div className="cadou-panel cadou-song"><p className="cadou-hint">{t('loading')}</p></div>
    </div>
  );
}

function CadouSongInner() {
  const t = useTranslations('cadou.song');
  const fromName = useCadouFromName();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const site = useSite();
  const id = params?.id;
  const mine = getPagePath(site.locale, 'manelele-mele');
  const studio = getPagePath(site.locale, 'studio');

  const [g, setG] = useState<GenerationDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  // Valoarea pentru Meta = prețul PACHETULUI comenzii. `basePriceCents` e câmpul
  // dinaintea pachetelor și nu taxează nimic: pe bg/gr raporta 5,99 € pentru
  // comenzi de 7,99–29,99 €. Meta optimizează pe valoarea primită.
  const trackedValue = (usePackage(g?.packageTier)?.priceCents ?? site.basePriceCents) / 100;
  const [upsellOpen, setUpsellOpen] = useState(false);
  // Câte cicluri de polling am ars pe o generare picată. Vezi `FAILED_POLL_MAX`.
  const [failedPolls, setFailedPolls] = useState(0);
  // A câta rundă de confirmare a plății rulează. Vezi `PAY_CONFIRM_ROUNDS`.
  const [payRound, setPayRound] = useState(0);
  const viewTracked = useRef(false);
  const purchaseTracked = useRef(false);
  // `paymentId`-ul pentru care rulează deja confirmarea (evită o a doua rundă
  // pornită de re-render).
  const confirmingFor = useRef<string | null>(null);
  // Parola de privacy peste conținutul vechi privat (poza încărcată de owner +
  // colaje). Owner-ul nu are nevoie de ea; vizitatorul o introduce o dată.
  const { password, unlock } = useUnlockPassword(id);

  const refresh = useCallback(async (): Promise<GenerationDto | null> => {
    if (!id) return null;
    try {
      const fresh = await api.getGeneration(id, password ?? undefined);
      setG(fresh);
      setError(null);
      return fresh;
    } catch (e) {
      setError(
        e instanceof ApiError && (e.status === 401 || e.status === 403)
          ? t('errForbidden')
          : t('errLoad'),
      );
      return null;
    }
  }, [id, password, t]);

  useEffect(() => { void refresh(); }, [refresh]);

  const failedNoAudio = !!g && g.status === 'failed' && !g.audioUrl;
  const failedStalled = failedPolls >= FAILED_POLL_MAX;

  // Ieșirea din starea „picată" (auto-retry reușit) resetează contorul.
  useEffect(() => {
    if (!failedNoAudio) setFailedPolls(0);
  }, [failedNoAudio]);

  useEffect(() => {
    if (!g) return;
    const enriching = g.status === 'succeeded' && g.deliverablesReady === false;
    const remaking = (g.workingVariants?.length ?? 0) > 0;
    const remakePaid = search.get('remakePaid') === '1';
    const stillFailing = g.status === 'failed' && !g.audioUrl;
    if (!IN_PROGRESS.has(g.status) && !stillFailing && !enriching && !remaking && !remakePaid) return;
    // O generare picată definitiv nu se repară dând refresh la infinit: după
    // `FAILED_POLL_MAX` cicluri oprim polling-ul și îi spunem clientului.
    if (stillFailing && failedStalled) return;
    const timer = setInterval(() => {
      if (stillFailing) setFailedPolls((n) => n + 1);
      void refresh();
    }, 3000);
    return () => clearInterval(timer);
  }, [g?.status, g?.audioUrl, g?.deliverablesReady, g?.workingVariants?.length, failedStalled, refresh, search]);

  // ViewContent — identic cu interfața clasică (`app/m/[id]/view.tsx`).
  useEffect(() => {
    if (!g || viewTracked.current) return;
    viewTracked.current = true;
    track('ViewContent', {
      content_id: g.id,
      content_name: `Manea pentru ${g.recipientName}`,
      content_type: 'product',
      value: trackedValue,
      currency: site.currency,
    });
  }, [g, trackedValue, site.currency]);

  // ── Confirmarea plății după Stripe ──────────────────────────────────────
  // Webhook-ul poate întârzia câteva secunde. Întâi AȘTEPTĂM ca plata să devină
  // `paid` (până la 10 încercări), abia apoi deblocăm. Cât timp plata nu e
  // confirmată, `paymentId` RĂMÂNE în URL: un refresh reia confirmarea în loc
  // să-i arate „Reia plata" unui om care tocmai a plătit.
  useEffect(() => {
    const paymentId = search.get('paymentId');
    if (!id || !paymentId || search.get('success') !== '1') return;
    if (confirmingFor.current === paymentId) return;
    confirmingFor.current = paymentId;
    let alive = true;
    setUnlocking(true);
    (async () => {
      let paid: { amount: number; currency: string; amountRonCents?: number | null } | null = null;
      for (let i = 0; i < PAY_CONFIRM_TRIES && alive; i++) {
        try {
          const p = await api.getPayment(paymentId);
          if (p?.status === 'paid') {
            paid = { amount: p.amount, currency: p.currency, amountRonCents: p.amountRonCents ?? null };
            break;
          }
        } catch {
          /* plata nu e încă vizibilă — reîncercăm */
        }
        await sleep(1000);
      }
      if (!alive) return;
      let unlocked = false;
      try {
        await api.unlockGeneration(id, paymentId);
        unlocked = true;
      } catch {
        /* plata încă neconfirmată server-side / checkout gratuit */
      }
      const fresh = await refresh();
      if (!alive) return;
      if (paid && !purchaseTracked.current) {
        purchaseTracked.current = true;
        // Raportăm în RON (curs BNR, calculat server-side) ca valoarea din
        // browser să fie identică cu cea trimisă server-side pe același
        // event_id → dedup corect. Fallback pe valuta nativă dacă lipsește.
        const ronCents = paid.amountRonCents ?? null;
        track('Purchase', {
          content_id: id,
          content_name: 'Manea Cadou',
          content_type: 'product',
          value: ronCents != null ? ronCents / 100 : paid.amount / 100,
          currency: ronCents != null ? 'RON' : paid.currency,
          // event_id MATCH cu server-side webhook (`pay-${paymentId}`).
          event_id: `pay-${paymentId}`,
        });
      }
      setUnlocking(false);
      const confirmed = unlocked || !!paid || fresh?.paidUnlocked === true;
      if (confirmed) {
        window.history.replaceState({}, '', `/m/${id}`);
        return;
      }
      // Nici după ~10s plata nu e confirmată: NU ștergem `paymentId` din URL
      // (un refresh ar arăta „Reia plata" unui om care tocmai a plătit) și mai
      // încercăm câteva runde.
      confirmingFor.current = null;
      if (payRound + 1 < PAY_CONFIRM_ROUNDS) {
        setTimeout(() => { if (alive) setPayRound((r) => r + 1); }, 5000);
      }
    })();
    return () => { alive = false; };
  }, [search, id, refresh, payRound]);

  // Snapshotul wizardului trebuie să dispară după plată. Altfel următoarea
  // vizită pe /studio îl repune pe client în pasul 4 cu datele comenzii DEJA
  // plătite, iar la „Plătește" garda anti-dublă-plată îl trimite înapoi aici —
  // fix pe upsell-ul „a doua manea".
  useEffect(() => {
    if (!g?.isOwner || g.paidUnlocked !== true) return;
    const snap = readCadouWizard();
    if (snap?.generationId === g.id) clearCadouWizard();
  }, [g?.id, g?.isOwner, g?.paidUnlocked]);

  const titleName = fromName.displayRecipient(g?.recipientName);
  const from = g ? fromName.senderOf(g) : null;
  const cover = g
    ? (resolveMediaUrl(g.coverUrl) ?? cadouStyleArt(g.style))
    : cadouStyleArt('iubire');

  const trackMain = t('trackMain');
  const trackBonus = t('trackBonus');
  const tracks: Playable[] = useMemo(() => {
    if (!g) return [];
    if (g.variants?.length) {
      return g.variants
        .filter((v) => v.audioUrl)
        .map((v) => ({
          id: v.kind === 'bonus' ? `${g.id}-bonus` : v.kind === 'variation' ? v.id : `${g.id}-main`,
          label: v.label,
          audioUrl: v.audioUrl,
          variant: v.kind,
        }));
    }
    return [
      ...(g.audioUrl ? [{ id: `${g.id}-main`, label: trackMain, audioUrl: g.audioUrl, variant: 'main' }] : []),
      ...(g.bonusAudioUrl ? [{ id: `${g.id}-bonus`, label: trackBonus, audioUrl: g.bonusAudioUrl, variant: 'bonus' }] : []),
    ];
  }, [g, trackMain, trackBonus]);

  // Upsell: o singură dată per generare, doar pentru owner, doar după ce piesa
  // e livrată. Conținutul vine din pachetul rezolvat (admin) — vezi UpsellModal.
  useEffect(() => {
    if (!g?.isOwner || !g.id) return;
    const delivered = g.status === 'succeeded' && (g.type === 'full' || g.paidUnlocked);
    if (!delivered || upsellAlreadySeen(g.id)) return;
    setUpsellOpen(true);
  }, [g?.id, g?.isOwner, g?.status, g?.type, g?.paidUnlocked]);

  const lyrics = g?.lyrics || g?.lyricsDraft || '';
  const paid = !!g && (g.type === 'full' || g.paidUnlocked);
  const justPaid = search.get('success') === '1' || !!search.get('paymentId');
  const awaitingPay = g?.status === 'pending' && !g.paidUnlocked && !justPaid;
  const making = !!g && !awaitingPay && IN_PROGRESS.has(g.status);
  // Picată fără audio: NU mai intră pe cardul de așteptare (contorul fals), ci
  // pe cardul de eroare cu drum spre suport.
  const showFailed = failedNoAudio && !awaitingPay;
  const ready = tracks.length > 0;
  const remaking = (g?.workingVariants?.length ?? 0) > 0;
  const showPlay = ready;
  // Cadoul trebuie să poată fi trimis — nu doar din secțiunea de colaj.
  const showShare = ready;
  const showVideo = ready && paid;
  const showRemake = ready && paid && !!g?.isOwner;
  const showFollow = ready && paid && !!g?.isOwner;
  const showLyrics = !!lyrics;
  const showOrder = !!g?.isOwner;
  // ── Livrabile vechi (nu se mai vând, dar comenzile plătite înainte le au) ──
  // Le afișăm STRICT când generarea chiar are datele — comenzile noi nu le au,
  // deci pentru ele nu apare nicio secțiune goală.
  const clips = g ? chorusClipUrls(g) : [];
  const socialImages = g?.socialImages ?? [];
  const showClips = ready && clips.length > 0;
  const showSocial = g?.status === 'succeeded' && socialImages.length > 0;
  // Parola de privacy: doar unde există conținut privat vechi (poze de share)
  // sau unde owner-ul a setat deja una.
  const showPin = !!g?.isOwner && paid && g?.status === 'succeeded'
    && (socialImages.length > 0 || !!g?.socialImageUploaded || !!g?.hasUnlockPassword);
  const locked = !!g && !g.isOwner && !!g.hasUnlockPassword && !g.unlocked;
  const last = showOrder
    ? 'order'
    : showLyrics
      ? 'lyrics'
      : showFollow
        ? 'follow'
        : showRemake
          ? 'remake'
          : showPin
            ? 'pin'
            : showSocial
              ? 'social'
              : showVideo
                ? 'video'
                : showClips
                  ? 'clips'
                  : showShare
                    ? 'share'
                    : 'play';

  return (
    <>
      {upsellOpen && g?.id && (
        <CadouUpsellModal
          generationId={g.id}
          currentTier={g.packageTier === 'plus' || g.packageTier === 'premium' ? g.packageTier : 'basic'}
          onClose={() => setUpsellOpen(false)}
        />
      )}
      <div className="cadou-wrap cadou-song-wrap cadou-song">
          <Link href={mine} className="cadou-song-back">{t('back')}</Link>

          {error && <p className="cadou-err" role="alert">{error}</p>}
          {!g && !error && <p className="cadou-hint">{t('loading')}</p>}

          {g && (
            <>
              {unlocking && (
                <div className="cadou-song-card cadou-song-note">{t('confirmingPayment')}</div>
              )}

              {awaitingPay && (
                <div className="cadou-song-card cadou-song-status">
                  <p>{t('awaitingPay')}</p>
                  <Link href={`${studio}?paymentCanceled=1&genId=${g.id}`} className="cadou-cta">{t('resumePayment')}</Link>
                </div>
              )}

              {making && (
                <div className="cadou-song-card">
                  <CadouWaitCard cover={cover} createdAt={g.createdAt} hasLyrics={!!lyrics} />
                </div>
              )}

              {showFailed && <CadouFailedCard stalled={failedStalled} />}

              {/* Manea privată (livrabil vechi): vizitatorul cere parola de la
                  cel care a comandat-o ca să vadă poza încărcată + colajele. */}
              {locked && (
                <UnlockPrompt skin="cadou" generationId={g.id} onUnlocked={unlock} />
              )}

              <div className="cadou-song-stack">
                {showPlay && (
                  <CadouFold
                    title={tracks.length > 1 ? t('playTitleMany') : t('playTitleOne')}
                    className="cadou-song-play"
                    defaultOpen={last !== 'play'}
                  >
                    <div className="cadou-song-play-head">
                      <Picture src={cover} alt="" />
                      <div>
                        <div className="ttl">{t('forName', { name: titleName })}</div>
                        <div className="who">{from ? t('fromName', { from }) : t('personalized')}</div>
                      </div>
                    </div>
                    {tracks.map((v) => (
                      <div key={v.id} className="cadou-song-track">
                        <CadouDemoPlayer
                          audioUrl={v.audioUrl}
                          label={tracks.length > 1 ? v.label : undefined}
                          trackContext={{ generationId: g.id, variant: v.variant }}
                        />
                      </div>
                    ))}
                    {g.workingVariants?.map((v) => (
                      <div key={v.id} className="cadou-song-pending" aria-live="polite">
                        <div className="cadou-song-track-lab">{v.label}</div>
                        <strong>{t('pendingTitle')}</strong>
                        <span>{t('pendingSub')}</span>
                      </div>
                    ))}
                  </CadouFold>
                )}

                {showShare && (
                  <CadouShareCard
                    generationId={g.id}
                    name={titleName}
                    imageUrl={resolveMediaUrl(g.socialImageUploaded ?? g.socialImageSelected ?? g.coverUrl)}
                    defaultOpen={last !== 'share'}
                  />
                )}

                {/* Clipurile pe refren — livrabil vechi (premium), separat de
                    colajele din `CadouVideoSection`. */}
                {showClips && (
                  <ChorusClipsSection
                    generation={g}
                    skin="cadou"
                    posterFallback={cover}
                    defaultOpen={last !== 'clips'}
                  />
                )}

                {showVideo && (
                  <CadouVideoSection
                    generation={g}
                    cover={cover}
                    password={password ?? undefined}
                    defaultOpen={last !== 'video'}
                  />
                )}

                {/* Poza de share — livrabil vechi (plus/premium). */}
                {showSocial && (
                  <SocialImagesSection
                    generation={g}
                    isOwner={!!g.isOwner}
                    skin="cadou"
                    defaultOpen={last !== 'social'}
                    // Endpoint-urile select/upload întorc un obiect PARȚIAL —
                    // facem merge ca să nu golim restul câmpurilor.
                    onUpdated={(fresh) => setG((prev) => (prev ? { ...prev, ...fresh } : prev))}
                  />
                )}

                {/* Parola peste pozele private (livrabil vechi) — doar owner. */}
                {showPin && (
                  <OwnerPasswordControl
                    skin="cadou"
                    generationId={g.id}
                    hasPassword={!!g.hasUnlockPassword}
                    currentPin={g.unlockPin ?? null}
                    defaultOpen={last !== 'pin'}
                    onChanged={() => void refresh()}
                  />
                )}

                {showRemake && (
                  <CadouRemakeCard
                    generationId={g.id}
                    remaining={g.freeRemakeRemaining ?? (g.freeRemakeUsedAt ? 0 : 1)}
                    quota={g.freeRemakeQuota ?? 1}
                    paidCents={g.paidRemakeCents}
                    busy={remaking}
                    canceled={search.get('remakeCanceled') === '1'}
                    defaultOpen={last !== 'remake'}
                    onStarted={() => void refresh()}
                  />
                )}

                {showFollow && <CadouFollowCard defaultOpen={last !== 'follow'} />}

                {showLyrics && (
                  <CadouFold title={t('lyricsTitle')} className="cadou-song-sheet" defaultOpen={last !== 'lyrics'}>
                    <CadouLyrics text={lyrics} />
                  </CadouFold>
                )}

                {showOrder && (
                  <CadouOrderCard generation={g} />
                )}

                <CadouContactCard />
              </div>
            </>
          )}
      </div>
    </>
  );
}
