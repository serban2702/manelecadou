'use client';

import { renderSiteIcon } from '@/components/icon-picker';
import type { SiteIconConfig } from '@/lib/api/sites.api';
import { cn } from '@/lib/cn';

export function slugifyId(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, '');
}

export function EntryGlyph({
  ic,
  emoji,
  size = 32,
  className,
}: {
  ic?: SiteIconConfig;
  emoji?: string;
  size?: number;
  className?: string;
}) {
  const icon = ic ? renderSiteIcon(ic, Math.max(16, size - 10)) : null;
  return (
    <span
      className={cn('flex items-center justify-center shrink-0 rounded-md bg-secondary/40', className)}
      style={{ width: size, height: size }}
    >
      {icon ? icon : emoji ? <span className="text-lg leading-none">{emoji}</span> : <span className="text-muted-foreground text-xs">—</span>}
    </span>
  );
}

export function setI18nValue<T extends Record<string, string | undefined>>(
  i18n: Record<string, T> | undefined,
  locale: string,
  key: keyof T & string,
  value: string,
): Record<string, T> | undefined {
  const loc = { ...(i18n?.[locale] ?? {}) } as T;
  if (value.trim() === '') delete loc[key];
  else (loc as Record<string, string>)[key] = value;
  const next = { ...(i18n ?? {}) };
  if (Object.keys(loc).length === 0) delete next[locale];
  else next[locale] = loc;
  return Object.keys(next).length ? next : undefined;
}

/** Limba site-ului scrie pe câmpul top-level și curăță overlay-ul i18n[locale]. */
export function applyDefaultLocaleField<T extends Record<string, string | undefined>>(
  i18n: Record<string, T> | undefined,
  siteLocale: string,
  key: keyof T & string,
): Record<string, T> | undefined {
  return setI18nValue(i18n, siteLocale, key, '');
}
