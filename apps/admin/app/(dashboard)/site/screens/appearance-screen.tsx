'use client';

import type { SiteDto } from '@/lib/api/sites.api';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { BrandAssetUploader } from '../brand-asset-uploader';
import { Field, StudioSection } from '../studio-primitives';
import { TestimonialsSection } from '../testimonials-section';

const PRIMARY_FALLBACK = '#d4af37';
const ACCENT_FALLBACK = '#f5d271';

function pickerHex(value: string | undefined, fallback: string): string {
  const t = (value ?? '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(t)) {
    const r = t[1];
    const g = t[2];
    const b = t[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

function ColorField({
  label,
  fieldId,
  description,
  value,
  fallback,
  onChange,
}: {
  label: string;
  fieldId?: string;
  description?: string;
  value: string;
  fallback: string;
  onChange: (hex: string) => void;
}) {
  const hex = pickerHex(value, fallback);
  return (
    <Field label={label} fieldId={fieldId} description={description}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-11 shrink-0 cursor-pointer rounded-md border border-border bg-background p-1"
          aria-label={label}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => {
            const t = value.trim();
            if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(t)) {
              const n = pickerHex(t, fallback);
              if (n !== value) onChange(n);
            }
          }}
          placeholder={fallback}
          spellCheck={false}
          className="font-mono uppercase"
        />
      </div>
    </Field>
  );
}

function PalettePreview({
  name,
  tagline,
  logoUrl,
  primary,
  accent,
}: {
  name: string;
  tagline: string;
  logoUrl: string;
  primary: string;
  accent: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${primary}, ${accent})` }} />
      <div className="flex items-center gap-3 bg-zinc-950 px-3 py-2.5">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            className="h-8 w-8 rounded border border-border bg-white object-contain"
          />
        ) : (
          <span
            className="flex h-8 w-8 items-center justify-center rounded border border-border text-[10px] font-semibold"
            style={{ color: primary, borderColor: primary }}
          >
            {(name || '?').slice(0, 2).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{name || 'Numele site-ului'}</div>
          <div className="truncate text-[11px]" style={{ color: accent }}>
            {tagline || 'Tagline-ul apare aici'}
          </div>
        </div>
        <span
          className="shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium text-zinc-950"
          style={{ background: primary }}
        >
          Generează
        </span>
      </div>
      <div className="grid grid-cols-2 font-mono text-[10px] uppercase tracking-wider">
        <div className="px-3 py-1.5" style={{ background: primary, color: '#111' }}>
          Primară {primary}
        </div>
        <div className="px-3 py-1.5" style={{ background: accent, color: '#111' }}>
          Accent {accent}
        </div>
      </div>
    </div>
  );
}

export function AppearanceScreen({
  siteId,
  form,
  setForm,
}: {
  siteId: string;
  form: SiteDto;
  setForm: (f: SiteDto) => void;
}) {
  const brand = form.brand ?? {};
  const primary = pickerHex(brand.primaryColor, PRIMARY_FALLBACK);
  const accent = pickerHex(brand.accentColor, ACCENT_FALLBACK);

  function patchBrand(patch: Partial<SiteDto['brand']>) {
    setForm({ ...form, brand: { ...form.brand, ...patch } });
  }

  return (
    <div className="grid gap-6">
      <StudioSection
        title="Culori și tagline"
        help="Culoarea primară e aurul butoanelor și al accentelor de brand. Accentul e hover și highlight. Preview-ul e o schiță, nu site-ul live."
      >
        <Card>
          <CardContent className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
            <ColorField
              label="Culoare primară"
              fieldId="appearance.colors"
              description="Butoane, prețuri, accente principale."
              value={brand.primaryColor ?? PRIMARY_FALLBACK}
              fallback={PRIMARY_FALLBACK}
              onChange={(primaryColor) => patchBrand({ primaryColor })}
            />
            <ColorField
              label="Culoare accent"
              description="Hover, highlight, tagline."
              value={brand.accentColor ?? ACCENT_FALLBACK}
              fallback={ACCENT_FALLBACK}
              onChange={(accentColor) => patchBrand({ accentColor })}
            />
            <div className="sm:col-span-2">
              <Field
                label="Tagline"
                fieldId="appearance.tagline"
                description="O frază sub logo, pe homepage și în share."
              >
                <Input
                  value={brand.tagline ?? ''}
                  onChange={(e) => patchBrand({ tagline: e.target.value })}
                  placeholder="Manea personalizată, cadou de neuitat."
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <PalettePreview
                name={form.name}
                tagline={brand.tagline ?? ''}
                logoUrl={brand.logoUrl ?? ''}
                primary={primary}
                accent={accent}
              />
            </div>
          </CardContent>
        </Card>
      </StudioSection>

      <StudioSection
        title="Sigle și imagini"
        help="Upload-ul se salvează imediat pe server, independent de bara Salvează. Poți lipi și un URL public."
      >
        <Card>
          <CardContent className="grid gap-4 p-4">
            <Field
              label="Logo"
              fieldId="appearance.logo"
              description="PNG, JPG, WEBP sau SVG, max 5 MB. Folosit în header, mail și preview."
            >
              <BrandAssetUploader
                siteId={siteId}
                field="logoUrl"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                value={brand.logoUrl ?? ''}
                onChange={(logoUrl) => patchBrand({ logoUrl })}
              />
            </Field>
            <Field
              label="Imagine de share (OG)"
              fieldId="appearance.og"
              description="1200×630, PNG/JPG/WEBP, max 5 MB. Ce apare pe Facebook, WhatsApp, iMessage."
            >
              <BrandAssetUploader
                siteId={siteId}
                field="ogImageUrl"
                accept="image/png,image/jpeg,image/webp"
                value={brand.ogImageUrl ?? ''}
                onChange={(ogImageUrl) => patchBrand({ ogImageUrl })}
              />
            </Field>
            <Field
              label="Favicon"
              fieldId="appearance.favicon"
              description="ICO, PNG sau SVG, max 1 MB. Iconița din tab-ul browserului."
            >
              <BrandAssetUploader
                siteId={siteId}
                field="faviconUrl"
                accept="image/x-icon,image/vnd.microsoft.icon,image/png,image/svg+xml,.ico"
                value={brand.faviconUrl ?? ''}
                onChange={(faviconUrl) => patchBrand({ faviconUrl })}
              />
            </Field>
            <Field
              label="Banner email"
              fieldId="appearance.banner"
              description="600×200, PNG/JPG/WEBP, opțional. Gol = logo; gol și acolo = banner-ul implicit Manele Cadou."
            >
              <BrandAssetUploader
                siteId={siteId}
                field="emailBannerUrl"
                accept="image/png,image/jpeg,image/webp"
                value={brand.emailBannerUrl ?? ''}
                onChange={(emailBannerUrl) => patchBrand({ emailBannerUrl })}
                placeholder="Lasă gol = folosește logo; gol și acolo = banner implicit"
              />
            </Field>
          </CardContent>
        </Card>
      </StudioSection>

      <StudioSection
        title="SEO"
        help="Titlul și descrierea din tab și din Google. Keywords e un hint intern, nu meta magic."
      >
        <Card>
          <CardContent className="grid gap-4 p-4">
            <Field
              label="Titlu pagină"
              fieldId="appearance.seo"
              description="Apare în tab și la share. Gol = numele site-ului."
            >
              <Input
                value={form.seo?.title ?? ''}
                onChange={(e) => setForm({ ...form, seo: { ...form.seo, title: e.target.value } })}
                placeholder={form.name}
              />
            </Field>
            <Field label="Descriere" description="Una-două fraze. Max ~160 caractere pentru snippet.">
              <Textarea
                value={form.seo?.description ?? ''}
                onChange={(e) => setForm({ ...form, seo: { ...form.seo, description: e.target.value } })}
                rows={2}
                placeholder="Manea personalizată cu numele lui, gata în câteva minute."
              />
            </Field>
            <Field label="Cuvinte cheie" description="Separate prin virgulă. Opțional.">
              <Input
                value={form.seo?.keywords ?? ''}
                onChange={(e) => setForm({ ...form, seo: { ...form.seo, keywords: e.target.value } })}
                placeholder="manea personalizată, cadou, zi de naștere"
              />
            </Field>
          </CardContent>
        </Card>
      </StudioSection>

      <StudioSection
        title="Social"
        help="Linkuri din footer și din pagina de contact. Telefonul e textul afișat; WhatsApp e URL-ul wa.me."
      >
        <Card>
          <CardContent className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
            <Field label="Instagram" fieldId="appearance.social">
              <Input
                value={form.social?.instagram ?? ''}
                onChange={(e) => setForm({ ...form, social: { ...form.social, instagram: e.target.value } })}
                placeholder="https://instagram.com/…"
              />
            </Field>
            <Field label="Facebook">
              <Input
                value={form.social?.facebook ?? ''}
                onChange={(e) => setForm({ ...form, social: { ...form.social, facebook: e.target.value } })}
                placeholder="https://facebook.com/…"
              />
            </Field>
            <Field label="TikTok">
              <Input
                value={form.social?.tiktok ?? ''}
                onChange={(e) => setForm({ ...form, social: { ...form.social, tiktok: e.target.value } })}
                placeholder="https://tiktok.com/@…"
              />
            </Field>
            <Field label="YouTube">
              <Input
                value={form.social?.youtube ?? ''}
                onChange={(e) => setForm({ ...form, social: { ...form.social, youtube: e.target.value } })}
                placeholder="https://youtube.com/…"
              />
            </Field>
            <Field label="WhatsApp" description="URL complet, de forma https://wa.me/4074…">
              <Input
                value={form.social?.whatsapp ?? ''}
                onChange={(e) => setForm({ ...form, social: { ...form.social, whatsapp: e.target.value } })}
                placeholder="https://wa.me/40…"
              />
            </Field>
            <Field
              label="Telefon"
              fieldId="appearance.phone"
              description="Afișat pe site. Exemplu: +40 7xx xxx xxx."
            >
              <Input
                value={form.social?.phone ?? ''}
                onChange={(e) => setForm({ ...form, social: { ...form.social, phone: e.target.value } })}
                placeholder="+40 …"
              />
            </Field>
          </CardContent>
        </Card>
      </StudioSection>

      <TestimonialsSection
        list={form.testimonials ?? []}
        onChange={(testimonials) => setForm({ ...form, testimonials })}
        locale={form.locale}
        help="Librărie tenant. Interfețele moștenesc lista sau își fac una proprie la Interfețe → Testimoniale."
        fieldId="appearance.testimonials"
      />
    </div>
  );
}
