import type { ComponentType } from 'react';

export type AssignReason = 'url' | 'cookie' | 'fingerprint' | 'device' | 'utm' | 'default';

export interface ExperienceUtmRule {
  source?: string;
  campaign?: string;
  content?: string;
}

export interface SiteExperienceItemConfig {
  enabled: boolean;
  utmRules: ExperienceUtmRule[];
}

export interface SiteExperienceConfigLite {
  defaultSlug: string;
  items: Record<string, SiteExperienceItemConfig>;
}

export interface ResolveExperienceInput {
  uiParam?: string | null;
  cookieSlug?: string | null;
  personSlug?: string | null;
  utm?: { source?: string | null; campaign?: string | null; content?: string | null } | null;
  config?: SiteExperienceConfigLite | null;
}

export interface ResolveExperienceResult {
  slug: string;
  reason: AssignReason;
}

export interface ExperienceModule {
  slug: string;
  label: string;
  HomePage: ComponentType;
  StudioPage: ComponentType;
  SongView: ComponentType;
}
