'use client';

import { useEffect, useState } from 'react';
import { SitesApi, type SiteDto } from '@/lib/api/sites.api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

type Tier = 'basic' | 'plus' | 'premium';
const TIERS: Tier[] = ['basic', 'plus', 'premium'];

function emptyItem() {
  return { enabled: true, utmRules: [] as Array<{ source?: string; campaign?: string; content?: string }>, packages: {} as NonNullable<NonNullable<SiteDto['experienceConfig']>['items'][string]['packages']> };
}

export function ExperiencesTab({
  form,
  setForm,
}: {
  form: SiteDto;
  setForm: (f: SiteDto) => void;
}) {
  const [catalog, setCatalog] = useState<Array<{ slug: string; label: string }>>([
    { slug: 'classic', label: 'Classic' },
    { slug: 'cadou', label: 'Cadou' },
  ]);
  useEffect(() => {
    SitesApi.listExperiences().then(setCatalog).catch(() => undefined);
  }, []);

  const cfg = form.experienceConfig ?? { defaultSlug: 'classic', items: {} };

  const patch = (next: NonNullable<SiteDto['experienceConfig']>) => {
    setForm({ ...form, experienceConfig: next });
  };

  const itemOf = (slug: string) => cfg.items[slug] ?? emptyItem();

  return (
    <div className="grid gap-6">
      <div className="grid gap-2 max-w-sm">
        <Label>Interfață default</Label>
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={cfg.defaultSlug}
          onChange={(e) => patch({ ...cfg, defaultSlug: e.target.value })}
        >
          {catalog.map((c) => (
            <option key={c.slug} value={c.slug}>{c.label}</option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Folosită când vizitatorul n-are cookie, fingerprint sau UTM mapate. Ads: pune <code>?ui=cadou</code> pe link.
        </p>
      </div>

      {catalog.map((c) => {
        const item = itemOf(c.slug);
        return (
          <div key={c.slug} className="rounded-lg border border-border p-4 grid gap-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{c.label}</div>
                <div className="text-xs text-muted-foreground">slug: {c.slug}</div>
              </div>
              {c.slug !== 'classic' && (
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={item.enabled}
                    onCheckedChange={(on) => patch({
                      ...cfg,
                      items: { ...cfg.items, [c.slug]: { ...item, enabled: on } },
                    })}
                  />
                  Activă (UTM / default)
                </label>
              )}
            </div>

            <div className="grid gap-2">
              <Label>Reguli UTM</Label>
              {(item.utmRules ?? []).map((rule, i) => (
                <div key={i} className="flex flex-wrap gap-2">
                  <Input placeholder="utm_source" value={rule.source ?? ''} onChange={(e) => {
                    const utmRules = [...(item.utmRules ?? [])];
                    utmRules[i] = { ...utmRules[i], source: e.target.value };
                    patch({ ...cfg, items: { ...cfg.items, [c.slug]: { ...item, utmRules } } });
                  }} />
                  <Input placeholder="utm_campaign" value={rule.campaign ?? ''} onChange={(e) => {
                    const utmRules = [...(item.utmRules ?? [])];
                    utmRules[i] = { ...utmRules[i], campaign: e.target.value };
                    patch({ ...cfg, items: { ...cfg.items, [c.slug]: { ...item, utmRules } } });
                  }} />
                  <Input placeholder="utm_content" value={rule.content ?? ''} onChange={(e) => {
                    const utmRules = [...(item.utmRules ?? [])];
                    utmRules[i] = { ...utmRules[i], content: e.target.value };
                    patch({ ...cfg, items: { ...cfg.items, [c.slug]: { ...item, utmRules } } });
                  }} />
                  <button
                    type="button"
                    className="text-xs text-muted-foreground"
                    onClick={() => {
                      const utmRules = (item.utmRules ?? []).filter((_, j) => j !== i);
                      patch({ ...cfg, items: { ...cfg.items, [c.slug]: { ...item, utmRules } } });
                    }}
                  >
                    Șterge
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="text-sm text-primary text-left"
                onClick={() => patch({
                  ...cfg,
                  items: { ...cfg.items, [c.slug]: { ...item, utmRules: [...(item.utmRules ?? []), {}] } },
                })}
              >
                + regulă UTM
              </button>
            </div>

            {c.slug !== 'classic' && (
              <div className="grid gap-3">
                <Label>Livrabile per pachet</Label>
                {TIERS.map((tier) => {
                  const p = item.packages?.[tier] ?? {};
                  const setP = (patchP: typeof p) => patch({
                    ...cfg,
                    items: {
                      ...cfg.items,
                      [c.slug]: { ...item, packages: { ...item.packages, [tier]: { ...p, ...patchP } } },
                    },
                  });
                  return (
                    <div key={tier} className="rounded-md border border-border p-3 grid gap-2">
                      <div className="text-sm font-medium capitalize">{tier === 'basic' ? 'Standard' : tier}</div>
                      <div className="flex flex-wrap gap-4 text-sm">
                        {(['video', 'socialImage', 'instrumental', 'premiumPage'] as const).map((k) => (
                          <label key={k} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={!!p[k]}
                              onChange={(e) => setP({ [k]: e.target.checked })}
                            />
                            {k}
                          </label>
                        ))}
                      </div>
                      <Textarea
                        placeholder="Un bullet pe linie"
                        value={(p.features ?? []).join('\n')}
                        onChange={(e) => setP({ features: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean) })}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
