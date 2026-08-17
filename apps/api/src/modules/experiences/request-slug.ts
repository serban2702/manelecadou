import type { Request } from 'express';
import { isKnownExperienceSlug } from './catalog';

export function experienceSlugFromRequest(req: Request): string | null {
  const raw = req.headers['x-mc-experience'];
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v === 'string' && isKnownExperienceSlug(v.trim())) return v.trim();
  return null;
}
