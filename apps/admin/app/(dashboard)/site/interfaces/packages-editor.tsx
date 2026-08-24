'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { ExperienceItemConfig, SiteDto } from '@/lib/api/sites.api';
import { PACKAGE_DEFAULTS, PACKAGE_FLAG_DEFAULTS, PACKAGE_TIERS, type PackageTier } from '../studio-constants';
import { MoneyInput } from '../fields/money-input';
import { centsToMajor } from '../money';
import { Field } from '../studio-primitives';
import { itemOf, patchItem } from './config';

type Pkg = NonNullable<NonNullable<ExperienceItemConfig['packages']>[PackageTier]>;

const TIER_LABEL: Record<PackageTier, string> = {
  basic: 'Standard',
  plus: 'Plus',
  premium: 'Premium',
};

export function PackagesEditor({
  form,
  setForm,
  slug,
}: {
  form: SiteDto;
  setForm: (f: SiteDto) => void;
  slug: string;
}) {
  const item = itemOf(form, slug);
  const packages = item.packages ?? {};
  const currency = form.currency || 'RON';

  function setTier(tier: PackageTier, next: Pkg) {
    setForm(patchItem(form, slug, { packages: { ...packages, [tier]: next } }));
  }

  function patch(tier: PackageTier, field: keyof Pkg, value: Pkg[keyof Pkg]) {
    setTier(tier, { ...(packages[tier] ?? {}), [field]: value });
  }

  return (
    <div className="grid gap-3" data-field="interfaces.packages">
      {PACKAGE_TIERS.map((tier) => {
        const p = packages[tier] ?? {};
        const flags = PACKAGE_FLAG_DEFAULTS[tier];
        const enabled = p.enabled !== false;
        const collageOn = p.collage ?? flags.collage;
        return (
          <Card key={tier} data-field={`price.${tier}`} className="scroll-mt-24">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium">{p.label?.trim() || TIER_LABEL[tier]}</div>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={enabled} onCheckedChange={(on) => patch(tier, 'enabled', on)} />
                  În vitrină
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Nume afișat">
                  <Input
                    value={p.label ?? ''}
                    placeholder={TIER_LABEL[tier]}
                    onChange={(e) => patch(tier, 'label', e.target.value)}
                  />
                </Field>
                <Field label="Preț">
                  <MoneyInput
                    cents={p.priceCents}
                    currency={currency}
                    placeholder={centsToMajor(form.packagePricesCents?.[tier] ?? PACKAGE_DEFAULTS[tier].priceCents)}
                    onChange={(cents) => patch(tier, 'priceCents', cents ?? undefined)}
                  />
                </Field>
                <Field
                  label="Preț tăiat (opțional)"
                  // Ancora de căutare „Preț tăiat pachet" — o singură dată, pe primul pachet.
                  fieldId={tier === 'basic' ? 'price.compare' : undefined}
                >
                  <MoneyInput
                    cents={p.compareAtCents}
                    currency={currency}
                    onChange={(cents) => patch(tier, 'compareAtCents', cents)}
                  />
                </Field>
                <Field label="Durată piesă (secunde)">
                  <Input
                    type="number"
                    min={30}
                    value={p.durationSec ?? flags.durationSec}
                    onChange={(e) => patch(tier, 'durationSec', Number(e.target.value) || flags.durationSec)}
                  />
                </Field>
              </div>

              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ce include</div>
              <div className="grid gap-2">
                <Flag
                  label="Generare piesă"
                  hint="Maneaua personalizată. Lăsat pornit."
                  checked={p.generation !== false}
                  onChange={(on) => patch(tier, 'generation', on)}
                />
                <div className="rounded-md border border-border px-3 py-2 space-y-2">
                  <Flag
                    label="Refaceri gratuite"
                    hint="Câte ori poate cere refacerea fără plată."
                    checked={(p.remakes ?? flags.remakes) > 0}
                    onChange={(on) => patch(tier, 'remakes', on ? flags.remakes || 1 : 0)}
                  />
                  {(p.remakes ?? flags.remakes) > 0 && (
                    <Field label="Număr refaceri">
                      <Input
                        type="number"
                        min={0}
                        max={20}
                        value={p.remakes ?? flags.remakes}
                        onChange={(e) => patch(tier, 'remakes', Math.max(0, Math.round(Number(e.target.value) || 0)))}
                      />
                    </Field>
                  )}
                </div>
                <div className="rounded-md border border-border px-3 py-2 space-y-2">
                  <Flag
                    label="Colaj video"
                    hint="Slideshow din pozele clientului."
                    checked={collageOn}
                    onChange={(on) => patch(tier, 'collage', on)}
                  />
                  {collageOn && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Field label="Limită poze">
                        <Input
                          type="number"
                          min={1}
                          max={40}
                          value={p.collagePhotoLimit ?? flags.collagePhotoLimit}
                          onChange={(e) =>
                            patch(tier, 'collagePhotoLimit', Math.max(1, Math.round(Number(e.target.value) || 1)))
                          }
                        />
                      </Field>
                      <label className="flex items-center justify-between gap-2 text-sm px-1">
                        <span>Tot track-ul (altfel doar refren)</span>
                        <Switch
                          checked={p.collageFullTrack ?? flags.collageFullTrack}
                          onCheckedChange={(on) => patch(tier, 'collageFullTrack', on)}
                        />
                      </label>
                    </div>
                  )}
                </div>
                <Flag
                  label="Clip de urare AI (Veo)"
                  hint="Personaj generat care spune o urare. Generarea se leagă mai târziu — acum e doar setarea."
                  checked={p.greetingClip ?? flags.greetingClip}
                  onChange={(on) => patch(tier, 'greetingClip', on)}
                />
                <Flag
                  label="Instrumental"
                  checked={p.instrumental ?? flags.instrumental}
                  onChange={(on) => patch(tier, 'instrumental', on)}
                />
                <Flag
                  label="Pagină premium de ascultare"
                  checked={p.premiumPage ?? flags.premiumPage}
                  onChange={(on) => patch(tier, 'premiumPage', on)}
                />
                <Flag
                  label="Felicitare"
                  checked={p.greetingCard ?? flags.greetingCard}
                  onChange={(on) => patch(tier, 'greetingCard', on)}
                />
                <Flag
                  label="Postare Facebook / TikTok"
                  checked={p.socialPost ?? flags.socialPost}
                  onChange={(on) => patch(tier, 'socialPost', on)}
                />
                <Field label="Discount la următoarea manea (%)">
                  <Input
                    type="number"
                    min={0}
                    max={90}
                    value={p.nextSongDiscountPercent ?? flags.nextSongDiscountPercent}
                    onChange={(e) =>
                      patch(tier, 'nextSongDiscountPercent', Math.max(0, Math.round(Number(e.target.value) || 0)))
                    }
                  />
                </Field>
              </div>

              <Field label="Livrare (text)">
                <Input
                  value={p.deliveryLabel ?? ''}
                  placeholder={flags.deliveryLabel}
                  onChange={(e) => patch(tier, 'deliveryLabel', e.target.value)}
                />
              </Field>
              <Field label="Lista din vitrină" description="Un punct pe linie. Ce vede clientul pe card.">
                <Textarea
                  rows={5}
                  value={(p.features ?? []).join('\n')}
                  placeholder={'Manea personalizată\nO refacere gratuită'}
                  onChange={(e) => {
                    const lines = e.target.value.split('\n').map((l) => l.trim()).filter(Boolean);
                    patch(tier, 'features', lines);
                  }}
                />
              </Field>
              {tier !== 'premium' && (
                <Field
                  label="Propunere de upgrade (opțional)"
                  description="Se arată o singură dată pe pagina melodiei, după livrare, cui a cumpărat pachetul ăsta. Gol = text generat automat din pachetul următor."
                >
                  <div className="grid gap-2">
                    <Input
                      value={p.upsell?.title ?? ''}
                      placeholder="Vrei și colajul cu pozele voastre?"
                      onChange={(e) =>
                        patch(tier, 'upsell', upsellPatch(p.upsell, { title: e.target.value }, tier))
                      }
                    />
                    <Textarea
                      rows={3}
                      value={p.upsell?.body ?? ''}
                      placeholder="Treci pe Premium și primești colajul pe toată melodia, plus felicitarea."
                      onChange={(e) =>
                        patch(tier, 'upsell', upsellPatch(p.upsell, { body: e.target.value }, tier))
                      }
                    />
                    <select
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      value={p.upsell?.targetTier ?? (tier === 'basic' ? 'plus' : 'premium')}
                      onChange={(e) =>
                        patch(
                          tier,
                          'upsell',
                          upsellPatch(p.upsell, { targetTier: e.target.value as 'plus' | 'premium' }, tier),
                        )
                      }
                    >
                      <option value="plus">propune Plus</option>
                      <option value="premium">propune Premium</option>
                    </select>
                  </div>
                </Field>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function Flag({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-3 px-3 py-2 rounded-md border border-border cursor-pointer hover:bg-secondary/30">
      <span className="min-w-0">
        <span className="text-sm">{label}</span>
        {hint && <span className="block text-[11px] text-muted-foreground mt-0.5 leading-snug">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5 shrink-0" />
    </label>
  );
}

/**
 * Construiește obiectul `upsell` dintr-o modificare parțială.
 *
 * Câmpul exista în contract și era consumat de interfață, dar nu avea niciun
 * control în admin — deci singura cale să-l setezi era editarea manuală a
 * jsonb-ului din baza de date. Titlul și textul goale înseamnă „neconfigurat":
 * întoarcem `null`, iar interfața cade pe textul generat din pachetul următor.
 */
function upsellPatch(
  current: { title?: string; body?: string; targetTier?: 'plus' | 'premium' } | null | undefined,
  change: Partial<{ title: string; body: string; targetTier: 'plus' | 'premium' }>,
  tier: PackageTier,
): { title: string; body: string; targetTier: 'plus' | 'premium' } | null {
  const next = {
    title: change.title ?? current?.title ?? '',
    body: change.body ?? current?.body ?? '',
    targetTier: change.targetTier ?? current?.targetTier ?? (tier === 'basic' ? 'plus' : 'premium'),
  };
  if (!next.title.trim() && !next.body.trim()) return null;
  return next;
}
