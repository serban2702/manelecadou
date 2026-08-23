import type { SiteDto } from '@/lib/api/sites.api';
import { MASKED_SECRET, PACKAGE_TIERS } from './studio-constants';

function analyticsSecretsDirty(
  a: SiteDto['analyticsSecrets'] | undefined,
  b: SiteDto['analyticsSecrets'] | undefined,
): boolean {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  const norm = (v: unknown) => (v === MASKED_SECRET || v == null || v === '' ? '' : v);
  for (const k of keys) {
    if (norm((a as Record<string, unknown> | undefined)?.[k]) !== norm((b as Record<string, unknown> | undefined)?.[k])) {
      return true;
    }
  }
  return false;
}

function normalizePackageCents(
  v: SiteDto['packagePricesCents'] | undefined,
): SiteDto['packagePricesCents'] {
  if (!v) return null;
  const next: NonNullable<SiteDto['packagePricesCents']> = {};
  for (const tier of PACKAGE_TIERS) {
    const n = v[tier];
    if (typeof n === 'number' && n > 0) next[tier] = Math.round(n);
  }
  return Object.keys(next).length ? next : null;
}

function normalizeCompareAt(
  v: SiteDto['packageCompareAtCents'] | undefined,
  real: SiteDto['packagePricesCents'] | undefined,
): SiteDto['packageCompareAtCents'] {
  if (!v) return null;
  const next: NonNullable<SiteDto['packageCompareAtCents']> = {};
  for (const tier of PACKAGE_TIERS) {
    const n = v[tier];
    const r = real?.[tier];
    if (typeof n === 'number' && n > 0 && (r == null || n > r)) next[tier] = Math.round(n);
  }
  return Object.keys(next).length ? next : null;
}

/** Payload PATCH: strip derived + samples; omit secrete neschimbate/goale. */
export function toUpdatePayload(form: SiteDto, original?: SiteDto | null): Partial<SiteDto> {
  const payload = structuredClone(form) as unknown as Record<string, unknown>;
  delete payload.packagePrices;
  delete payload.id;
  delete payload.createdAt;
  delete payload.updatedAt;

  const suno = payload.suno;
  if (suno && typeof suno === 'object') {
    const s = suno as Record<string, unknown>;
    delete s.styleSamples;
    delete s.voiceSamples;
  }

  if (original && !analyticsSecretsDirty(form.analyticsSecrets, original.analyticsSecrets)) {
    delete payload.analyticsSecrets;
  } else if (payload.analyticsSecrets && typeof payload.analyticsSecrets === 'object') {
    const secrets = payload.analyticsSecrets as Record<string, unknown>;
    for (const k of Object.keys(secrets)) {
      const v = secrets[k];
      if (v == null || v === '' || v === MASKED_SECRET) delete secrets[k];
    }
    if (Object.keys(secrets).length === 0) delete payload.analyticsSecrets;
  }

  payload.packagePricesCents = normalizePackageCents(form.packagePricesCents);
  payload.packageCompareAtCents = normalizeCompareAt(form.packageCompareAtCents, form.packagePricesCents);

  // Nu trimite null dacă GET-ul n-a inclus câmpul — altfel un Salvează șterge default-ul din DB.
  if (form.experienceConfig == null) {
    if (original?.experienceConfig) payload.experienceConfig = null;
    else delete payload.experienceConfig;
  }

  return payload as Partial<SiteDto>;
}
