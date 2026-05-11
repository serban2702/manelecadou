import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export interface SiteBrand {
  primaryColor?: string;
  accentColor?: string;
  logoUrl?: string;
  ogImageUrl?: string;
  tagline?: string;
  faviconUrl?: string;
}

export interface SiteSeo {
  title?: string;
  description?: string;
  keywords?: string;
}

export interface SiteAnalytics {
  ga4Id?: string;
  metaPixelId?: string;
  tiktokPixelId?: string;
}

export interface SiteStripe {
  // Toate site-urile folosesc același cont Stripe (un singur SECRET_KEY global).
  // Aici stocăm doar configurația per-site (preț + metadata de raportare).
  priceId?: string | null; // dacă vrei un Stripe Price preconfigurat, altfel folosim price_data dinamic
  productName?: string; // ce apare în statementul Stripe + factură
  statementDescriptor?: string; // max 22 chars, ce vede clientul pe extras
}

export interface SiteSocial {
  instagram?: string; // URL complet
  facebook?: string;
  tiktok?: string;
  youtube?: string;
  whatsapp?: string; // URL gen wa.me/40123...
  phone?: string; // ex: '+40 758 972 277'
}

export interface SiteCompanyInfo {
  legalName?: string; // ex: "Manele Cadou SRL"
  cui?: string; // ex: "RO12345678"
  regCom?: string; // ex: "J40/12345/2024"
  address?: string; // adresa fiscală
  iban?: string;
  ownerName?: string;
}

export interface SiteSuno {
  // === Suno style tags (audio generation) ===
  // Promptul de bază pentru Suno (overwrites buildStyleTag default behavior)
  basePrompt?: string;
  // Override per-stil (cheie = style slug, valoare = tag-uri Suno)
  stylePromptMap?: Record<string, string>;

  // === OpenAI lyrics writer (replaces default Romanian-centric system prompt) ===
  /**
   * System prompt complet pentru OpenAI writer, în limba site-ului. Dacă e
   * setat, înlocuiește system prompt-ul default (gândit pentru manele românești).
   * Folosește când vrei vocabular, atitudine și sub-genuri NATIVE (ex. chalga
   * pentru BG, turbofolk pentru RS, arabesk pentru TR). Lasă gol = fallback RO.
   */
  writerSystemPrompt?: string;
  /**
   * System prompt pentru OpenAI critic. La fel — gol = fallback RO.
   */
  criticSystemPrompt?: string;
  // Voice mapping per-site (dacă vrei voci diferite pe BG vs RO)
  voiceMap?: Record<string, string>;
  // Limba lyricsului (default = locale-ul site-ului)
  lyricsLocale?: string;

  /** Mostre audio per stil — URL public (S3, MinIO, sau uploads/). */
  styleSamples?: Record<string, SiteSampleEntry>;
  /** Mostre audio per voce. Aceeași structură. */
  voiceSamples?: Record<string, SiteSampleEntry>;
}

export interface SiteSampleEntry {
  audioUrl: string;
  generatedAt: string; // ISO date
  sunoTaskId?: string;
}

@Entity({ name: 'sites' })
export class Site {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  slug!: string; // ex. "ro", "ro2", "bg", "rs", folosit ca prefix metadata Stripe

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 253 })
  domain!: string; // ex. "manelecadou.ro" — UNIQUE — folosit de Caddy /ask

  @Column({ type: 'varchar', length: 120 })
  name!: string; // brand display name, ex. "Manele Cadou"

  @Column({ type: 'varchar', length: 8, default: 'ro' })
  locale!: string; // ro|bg|rs|tr|el|hr|sl|bs|sq|mk|hu|en — UNA per site

  @Column({ type: 'varchar', length: 8, default: 'RON' })
  currency!: string; // RON|EUR|BGN|RSD|TRY|HUF...

  @Column({ type: 'integer', default: 4900 })
  basePriceCents!: number; // preț de bază în cele mai mici unități ale monedei

  @Column({ type: 'integer', default: 0 })
  giftPriceCents!: number; // preț cod cadou single

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  brand!: SiteBrand;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  seo!: SiteSeo;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  analytics!: SiteAnalytics;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  stripe!: SiteStripe;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  suno!: SiteSuno;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  social!: SiteSocial;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  companyInfo!: SiteCompanyInfo;

  @Column({ type: 'varchar', length: 320, nullable: true })
  fromEmail!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  supportEmail!: string | null;

  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  adminEmails!: string[];

  @Column({ type: 'boolean', default: true })
  active!: boolean; // dacă false, Caddy /ask refuză + web returnează 503

  @Column({ type: 'boolean', default: false })
  isDefault!: boolean; // fallback pentru request-uri pe Host necunoscut (rar — doar dev)

  @Column({ type: 'boolean', default: true })
  sslEnabled!: boolean; // permite Caddy să emită cert pentru domeniu

  @Column({ type: 'boolean', default: false })
  maintenanceMode!: boolean;

  @Column({ type: 'boolean', default: false })
  hiddenMode!: boolean; // dacă true, Caddy/Next.js închid conexiunea cu 444 (ERR_EMPTY_RESPONSE)

  /**
   * Mesaj custom pentru pagina de mentenanță, JSON cu cheie = locale.
   * Ex: { ro: "Revenim curând.", en: "Back soon." }
   * Dacă lipsește pentru locale-ul curent, web app cade pe site.locale, apoi pe text default i18n.
   */
  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  maintenanceMessage!: Record<string, string>;

  @Column({ type: 'text', nullable: true })
  notes!: string | null; // note interne admin

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
