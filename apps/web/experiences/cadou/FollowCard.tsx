'use client';

import { useTranslations } from 'next-intl';
import { FollowPromoSection } from '@/components/FollowPromo';
import type { FollowPromoState } from '@/lib/follow-promo';
import { CadouFold } from './Fold';

/**
 * „Follow ⇒ reducere la manea următoare", în ambalajul pliabil al interfeței
 * `cadou`. Conținutul e componenta comună (`FollowPromoSection`), aceeași ca pe
 * classic; aici se schimbă doar rama și tema, prin jetoanele `--fp-*` remapate
 * în `theme.css`. Starea vine de sus, ca pop-up-ul și cardul să nu se
 * desincronizeze.
 */
export function CadouFollowCard({
  state,
  defaultOpen = true,
}: {
  state: FollowPromoState;
  defaultOpen?: boolean;
}) {
  const t = useTranslations('followPromo');
  if (!state.available) return null;

  return (
    <CadouFold
      title={t('title')}
      className="cadou-follow"
      defaultOpen={defaultOpen}
      badge={
        state.percent !== null && !state.done ? (
          <span className="fp-badge">{t('badge', { pct: String(state.percent) })}</span>
        ) : null
      }
    >
      <FollowPromoSection state={state} />
    </CadouFold>
  );
}
