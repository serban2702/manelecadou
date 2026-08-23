'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { GenerationDto } from '@/lib/api';

/**
 * Eticheta RO rămâne mereu acceptată la parsare: comenzile deja salvate (și
 * site-urile RO) au linia „De la X" scrisă în `message`, indiferent de locale-ul
 * cu care e afișată azi pagina.
 */
const LEGACY_FROM_LABEL = 'De la';

const NO_NAME = '—';

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Alternativa de etichete „de la" — cea tradusă + cea RO (legacy). */
function labelAlternatives(label: string): string {
  return [label.trim(), LEGACY_FROM_LABEL]
    .filter((v, i, all) => !!v && all.indexOf(v) === i)
    .map(escapeRe)
    .join('|');
}

/** Linia „<etichetă> X" din poveste — grupul 1 e numele expeditorului. */
export function fromLineRe(label: string): RegExp {
  return new RegExp(`(?:^|\\n)\\s*(?:${labelAlternatives(label)})\\s+(.+?)\\s*$`, 'im');
}

/** Scoate linia „<etichetă> X" din poveste, ca să rămână doar textul clientului. */
export function stripFromLine(message: string | null | undefined, label: string): string {
  return (message ?? '')
    .replace(new RegExp(`(?:^|\\n)\\s*(?:${labelAlternatives(label)})\\s+.+\\s*$`, 'im'), '')
    .trim();
}

type SenderSource = Pick<GenerationDto, 'recipientName' | 'message' | 'dedication'> & {
  dedicatorName?: string | null;
};

/** Sender from wizard (`<etichetă> X`), never the recipient stuffed into dedication. */
export function senderOf(g: SenderSource, label: string): string | null {
  const rec = (g.recipientName ?? '').trim();
  const named = (g.dedicatorName ?? '').trim();
  if (named && named !== rec && named !== NO_NAME) return named;
  const m = g.message?.match(fromLineRe(label));
  const fromMsg = m?.[1]?.trim();
  if (fromMsg && fromMsg !== rec && fromMsg !== NO_NAME) return fromMsg;
  const d = (g.dedication ?? '').trim();
  if (d && d !== rec && d !== NO_NAME) return d;
  return null;
}

export function displayRecipient(name: string | null | undefined, you: string): string {
  const n = (name ?? '').trim();
  if (!n || n === NO_NAME) return you;
  return n;
}

export interface CadouFromName {
  /** Eticheta tradusă pentru linia „de la" (ex. `De la`). */
  label: string;
  senderOf: (g: SenderSource) => string | null;
  displayRecipient: (name: string | null | undefined) => string;
  stripFromLine: (message: string | null | undefined) => string;
}

export function useCadouFromName(): CadouFromName {
  const t = useTranslations('cadou.from');
  const label = t('label');
  const you = t('you');
  return useMemo(
    () => ({
      label,
      senderOf: (g: SenderSource) => senderOf(g, label),
      displayRecipient: (name: string | null | undefined) => displayRecipient(name, you),
      stripFromLine: (message: string | null | undefined) => stripFromLine(message, label),
    }),
    [label, you],
  );
}
