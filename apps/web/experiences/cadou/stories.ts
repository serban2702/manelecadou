'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

export type CadouStory = { em: string; label: string; msg: string; occ?: string };

/** Structura poveștilor: doar ID + emoji + ocazie. Textele vin din `cadou.stories`. */
type CadouStorySeed = { id: string; em: string; occ?: string };

/**
 * Traducătorul textelor, primit EXPLICIT de la componenta care randează.
 * Fără stare de modul: pe server modulele sunt partajate între cereri, iar o
 * variabilă globală „armată" înainte de randare poate fi suprascrisă de altă
 * cerere (React întrerupe randarea la orice graniță `Suspense`) — adică un
 * vizitator ar primi poveștile în limba altuia.
 */
export type CadouStoryText = (key: string) => string;

const BY_ID: Record<string, CadouStorySeed[]> = {
  iubire: [
    { id: 'iubit', em: '❤️', occ: 'dragoste' },
    { id: 'iubita', em: '💕', occ: 'dragoste' },
    { id: 'sot', em: '💍', occ: 'cuplu' },
    { id: 'sotie', em: '👰', occ: 'cuplu' },
    { id: 'ziIubire', em: '🎂', occ: 'zi' },
    { id: 'copil', em: '👶', occ: 'zi' },
  ],
  romantica: [
    { id: 'plecat', em: '🕯️', occ: 'altul' },
    { id: 'tata', em: '💔', occ: 'altul' },
    { id: 'mama', em: '🌙', occ: 'altul' },
    { id: 'inimaFranta', em: '😢', occ: 'dragoste' },
    { id: 'departe', em: '✈️', occ: 'altul' },
    { id: 'neuitat', em: '🤍', occ: 'dragoste' },
  ],
  clasic: [
    { id: 'frate', em: '🎂', occ: 'zi' },
    { id: 'prieten', em: '🥂', occ: 'zi' },
    { id: 'tata', em: '👨', occ: 'zi' },
    { id: 'sotieZi', em: '👰', occ: 'zi' },
    { id: 'nas', em: '🤝', occ: 'nas' },
    { id: 'familie', em: '🏡', occ: 'altul' },
  ],
  opulenta: [
    { id: 'sef', em: '💼', occ: 'sef' },
    { id: 'nas', em: '🤝', occ: 'nas' },
    { id: 'frate', em: '👊', occ: 'zi' },
    { id: 'ziSefu', em: '👑', occ: 'zi' },
    { id: 'reusit', em: '💰', occ: 'altul' },
    { id: 'tata', em: '👨', occ: 'zi' },
  ],
  trompeta: [
    { id: 'nunta', em: '💒', occ: 'nunta' },
    { id: 'prieten', em: '🥂', occ: 'zi' },
    { id: 'aniversare', em: '💍', occ: 'cuplu' },
    { id: 'baiat', em: '🎂', occ: 'zi' },
    { id: 'nas', em: '🤝', occ: 'nunta' },
    { id: 'familie', em: '🎺', occ: 'altul' },
  ],
  oriental: [
    { id: 'sotie', em: '👰', occ: 'cuplu' },
    { id: 'sot', em: '💍', occ: 'cuplu' },
    { id: 'ziFamilie', em: '🎂', occ: 'zi' },
    { id: 'iubireDeparte', em: '💕', occ: 'dragoste' },
    { id: 'copil', em: '👶', occ: 'zi' },
    { id: 'strainatate', em: '🌍', occ: 'altul' },
  ],
};

/** Stiluri care împrumută lista altui stil (`pahar` = aceleași povești ca `clasic`). */
const ALIAS: Record<string, string> = { pahar: 'clasic' };

const FALLBACK_STYLE = 'iubire';

/** Povestea preselectată — cea mai cerută pe stil, din comenzile reale. */
const DEFAULT_ID: Record<string, string> = {
  iubire: 'ziIubire',
  romantica: 'plecat',
  clasic: 'frate',
  opulenta: 'frate',
  trompeta: 'nunta',
  oriental: 'ziFamilie',
};

function groupOf(styleId: string): string {
  const alias = ALIAS[styleId] ?? styleId;
  return BY_ID[alias] ? alias : FALLBACK_STYLE;
}

function toStory(group: string, seed: CadouStorySeed, text: CadouStoryText): CadouStory {
  return {
    em: seed.em,
    label: text(`${group}.${seed.id}.label`),
    msg: text(`${group}.${seed.id}.msg`),
    occ: seed.occ,
  };
}

export function storiesForStyle(styleId: string, text: CadouStoryText): CadouStory[] {
  const group = groupOf(styleId);
  return BY_ID[group].map((seed) => toStory(group, seed, text));
}

export function defaultStoryForStyle(styleId: string, text: CadouStoryText): CadouStory {
  const group = groupOf(styleId);
  const list = BY_ID[group];
  const seed = list.find((s) => s.id === DEFAULT_ID[group]) ?? list[0];
  return toStory(group, seed, text);
}

export function isPresetStoryMsg(msg: string, text: CadouStoryText): boolean {
  const trimmed = msg.trim();
  if (!trimmed) return false;
  return Object.entries(BY_ID).some(([group, list]) =>
    list.some((seed) => text(`${group}.${seed.id}.msg`) === trimmed),
  );
}

export interface CadouStories {
  forStyle: (styleId: string) => CadouStory[];
  defaultForStyle: (styleId: string) => CadouStory;
  isPresetMsg: (msg: string) => boolean;
}

/** Poveștile preset, cu textele locale-ului curent (`cadou.stories`). */
export function useCadouStories(): CadouStories {
  const t = useTranslations('cadou.stories');
  return useMemo(() => {
    const text: CadouStoryText = (key) => t(key as never);
    return {
      forStyle: (styleId: string) => storiesForStyle(styleId, text),
      defaultForStyle: (styleId: string) => defaultStoryForStyle(styleId, text),
      isPresetMsg: (msg: string) => isPresetStoryMsg(msg, text),
    };
  }, [t]);
}
