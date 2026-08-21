'use client';

import { useEffect, useState } from 'react';
import {
  SitesApi,
  type ExperienceCatalogConfig,
  type ExperienceItemConfig,
  type ExperienceOccasionOverride,
  type ExperienceReactionClip,
  type ExperienceStyleOverride,
  type SiteDto,
} from '@/lib/api/sites.api';
import { SiteDemosApi, type SiteDemo } from '@/lib/api/site-demos.api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

type Tier = 'basic' | 'plus' | 'premium';
const TIERS: Tier[] = ['basic', 'plus', 'premium'];

function emptyItem(): ExperienceItemConfig {
  return { enabled: true, utmRules: [], packages: {}, catalog: {} };
}

function slugify(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);
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

            <CatalogEditor
              site={form}
              slug={c.slug}
              catalog={item.catalog ?? {}}
              onChange={(catalog) => patch({
                ...cfg,
                items: { ...cfg.items, [c.slug]: { ...item, catalog } },
              })}
            />

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

function CatalogEditor({
  site,
  slug,
  catalog,
  onChange,
}: {
  site: SiteDto;
  slug: string;
  catalog: ExperienceCatalogConfig;
  onChange: (c: ExperienceCatalogConfig) => void;
}) {
  const [openStyle, setOpenStyle] = useState<string | null>(null);
  const [demos, setDemos] = useState<SiteDemo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!site.id) return;
    SiteDemosApi.list(site.id).then((r) => setDemos(r.items ?? [])).catch(() => undefined);
  }, [site.id]);

  const styles = catalog.styles ?? [];
  const occasions = catalog.occasions ?? [];
  const demoIds = catalog.demoIds ?? null;

  const setStyles = (next: ExperienceStyleOverride[]) => onChange({ ...catalog, styles: next });
  const setOccasions = (next: ExperienceOccasionOverride[]) => onChange({ ...catalog, occasions: next });

  const copyFromSite = () => {
    onChange({
      ...catalog,
      styles: (site.styles ?? []).map((s) => ({
        id: s.id,
        em: s.em,
        nm: s.nm,
        ds: s.ds,
        heat: s.heat,
        sunoPrompt: s.sunoPrompt,
        lyricsHint: s.lyricsHint,
        styleWeight: s.styleWeight,
        weirdnessConstraint: s.weirdnessConstraint,
        negativeTags: s.negativeTags,
        sunoPersonaIdMale: s.sunoPersonaIdMale,
        sunoPersonaNameMale: s.sunoPersonaNameMale,
        sunoPersonaIdFemale: s.sunoPersonaIdFemale,
        sunoPersonaNameFemale: s.sunoPersonaNameFemale,
      })),
      occasions: (site.occasions ?? []).map((o) => ({ id: o.id, em: o.em, nm: o.nm })),
      voices: (site.voices ?? []).map((v) => ({ id: v.id, nm: v.nm, tg: v.tg, av: v.av })),
    });
  };

  const upload = async (kind: 'art' | 'sample', styleId: string, file: File) => {
    const key = `${kind}:${styleId}`;
    setBusy(key);
    try {
      const r = await SitesApi.uploadExperienceAsset(site.id, slug, kind, styleId, file);
      setStyles(styles.map((s) => (
        s.id === styleId
          ? (kind === 'art' ? { ...s, artUrl: r.url } : { ...s, sampleUrl: r.url })
          : s
      )));
    } catch {
      /* toast handled by http client */
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-3 rounded-md border border-dashed border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Label>Catalog (stiluri, ocazii, prompturi, demo-uri)</Label>
          <p className="text-xs text-muted-foreground">
            Gol = moștenește ce e pe tab-urile Stiluri / Ocazii / Demo-uri ale site-ului.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="text-sm text-primary" onClick={copyFromSite}>
            Copiază de pe site
          </button>
          {(styles.length > 0 || occasions.length > 0 || demoIds || (catalog.reactionClips?.length ?? 0) > 0) && (
            <button
              type="button"
              className="text-sm text-muted-foreground"
              onClick={() => onChange({ writerSystemPrompt: catalog.writerSystemPrompt })}
            >
              Resetează catalogul
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label>Stiluri</Label>
          <button
            type="button"
            className="text-sm text-primary"
            onClick={() => {
              const id = `stil-${styles.length + 1}`;
              setStyles([...styles, { id, nm: 'Stil nou', em: '🎵' }]);
              setOpenStyle(id);
            }}
          >
            + stil
          </button>
        </div>
        {styles.map((s, i) => (
          <div key={`${s.id}-${i}`} className="rounded-md border border-border p-2 grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Input className="w-28" value={s.id} onChange={(e) => {
                const id = slugify(e.target.value);
                setStyles(styles.map((x, j) => (j === i ? { ...x, id } : x)));
              }} />
              <Input className="w-14" value={s.em ?? ''} onChange={(e) => setStyles(styles.map((x, j) => (j === i ? { ...x, em: e.target.value } : x)))} />
              <Input className="flex-1 min-w-[140px]" value={s.nm} onChange={(e) => setStyles(styles.map((x, j) => (j === i ? { ...x, nm: e.target.value } : x)))} />
              <button type="button" className="text-xs" onClick={() => setOpenStyle(openStyle === s.id ? null : s.id)}>
                {openStyle === s.id ? '▲' : '▼'}
              </button>
              <button type="button" className="text-xs text-muted-foreground" onClick={() => setStyles(styles.filter((_, j) => j !== i))}>
                Șterge
              </button>
            </div>
            {openStyle === s.id && (
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Descriere</Label>
                  <Input value={s.ds ?? ''} onChange={(e) => setStyles(styles.map((x, j) => (j === i ? { ...x, ds: e.target.value } : x)))} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Prompt Suno</Label>
                  <Textarea
                    rows={3}
                    value={s.sunoPrompt ?? ''}
                    onChange={(e) => setStyles(styles.map((x, j) => (j === i ? { ...x, sunoPrompt: e.target.value } : x)))}
                  />
                </div>
                <div>
                  <Label>Persona masculin</Label>
                  <Input
                    value={s.sunoPersonaIdMale ?? ''}
                    onChange={(e) => setStyles(styles.map((x, j) => (j === i ? { ...x, sunoPersonaIdMale: e.target.value.trim() || undefined } : x)))}
                    placeholder="personaId masculin"
                  />
                </div>
                <div>
                  <Label>Nume (masculin)</Label>
                  <Input
                    value={s.sunoPersonaNameMale ?? ''}
                    onChange={(e) => setStyles(styles.map((x, j) => (j === i ? { ...x, sunoPersonaNameMale: e.target.value || undefined } : x)))}
                    placeholder="opțional"
                  />
                </div>
                <div>
                  <Label>Persona feminin</Label>
                  <Input
                    value={s.sunoPersonaIdFemale ?? ''}
                    onChange={(e) => setStyles(styles.map((x, j) => (j === i ? { ...x, sunoPersonaIdFemale: e.target.value.trim() || undefined } : x)))}
                    placeholder="personaId feminin"
                  />
                </div>
                <div>
                  <Label>Nume (feminin)</Label>
                  <Input
                    value={s.sunoPersonaNameFemale ?? ''}
                    onChange={(e) => setStyles(styles.map((x, j) => (j === i ? { ...x, sunoPersonaNameFemale: e.target.value || undefined } : x)))}
                    placeholder="opțional"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Hint versuri</Label>
                  <Textarea
                    rows={2}
                    value={s.lyricsHint ?? ''}
                    onChange={(e) => setStyles(styles.map((x, j) => (j === i ? { ...x, lyricsHint: e.target.value } : x)))}
                  />
                </div>
                <div>
                  <Label>Poză card</Label>
                  {s.artUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.artUrl} alt="" className="mt-1 h-16 w-28 rounded object-cover" />
                  )}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="mt-1 text-xs"
                    disabled={busy === `art:${s.id}`}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload('art', s.id, f);
                      e.target.value = '';
                    }}
                  />
                </div>
                <div>
                  <Label>Preview audio</Label>
                  {s.sampleUrl && <audio controls src={s.sampleUrl} className="mt-1 w-full h-8" preload="metadata" />}
                  <input
                    type="file"
                    accept="audio/mpeg,audio/wav,audio/mp4,.mp3,.wav,.m4a"
                    className="mt-1 text-xs"
                    disabled={busy === `sample:${s.id}`}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload('sample', s.id, f);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label>Ocazii</Label>
          <button
            type="button"
            className="text-sm text-primary"
            onClick={() => setOccasions([...occasions, { id: `ocazie-${occasions.length + 1}`, nm: 'Ocazie nouă', em: '✨' }])}
          >
            + ocazie
          </button>
        </div>
        {occasions.map((o, i) => (
          <div key={`${o.id}-${i}`} className="flex flex-wrap gap-2">
            <Input className="w-28" value={o.id} onChange={(e) => setOccasions(occasions.map((x, j) => (j === i ? { ...x, id: slugify(e.target.value) } : x)))} />
            <Input className="w-14" value={o.em ?? ''} onChange={(e) => setOccasions(occasions.map((x, j) => (j === i ? { ...x, em: e.target.value } : x)))} />
            <Input className="flex-1 min-w-[140px]" value={o.nm} onChange={(e) => setOccasions(occasions.map((x, j) => (j === i ? { ...x, nm: e.target.value } : x)))} />
            <button type="button" className="text-xs text-muted-foreground" onClick={() => setOccasions(occasions.filter((_, j) => j !== i))}>
              Șterge
            </button>
          </div>
        ))}
      </div>

      <div className="grid gap-2">
        <Label>Prompt writer versuri (override)</Label>
        <Textarea
          rows={4}
          placeholder="Gol = promptul site-ului (tab Suno)"
          value={catalog.writerSystemPrompt ?? ''}
          onChange={(e) => onChange({ ...catalog, writerSystemPrompt: e.target.value })}
        />
      </div>

      <div className="grid gap-2">
        <Label>Demo-uri pe această interfață</Label>
        <p className="text-xs text-muted-foreground">
          Nicio bifă = toate demo-urile site-ului. Bifează ca să arăți doar unele în popup / Ascultă.
        </p>
        {demos.length === 0 && (
          <p className="text-xs text-muted-foreground">Nu există demo-uri pe site. Adaugă-le din tab-ul Demo-uri.</p>
        )}
        <div className="grid gap-1">
          {demos.map((d) => {
            const on = !!demoIds?.includes(d.id);
            return (
              <label key={d.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => {
                    const cur = demoIds ?? [];
                    const next = e.target.checked ? [...cur, d.id] : cur.filter((id) => id !== d.id);
                    onChange({ ...catalog, demoIds: next.length ? next : null });
                  }}
                />
                {d.title}
              </label>
            );
          })}
        </div>
      </div>

      <ReactionClipsEditor
        site={site}
        slug={slug}
        clips={catalog.reactionClips ?? []}
        demos={demos}
        busy={busy}
        onBusy={setBusy}
        onChange={(reactionClips) => onChange({ ...catalog, reactionClips })}
      />
    </div>
  );
}

function ReactionClipsEditor({
  site,
  slug,
  clips,
  demos,
  busy,
  onBusy,
  onChange,
}: {
  site: SiteDto;
  slug: string;
  clips: ExperienceReactionClip[];
  demos: SiteDemo[];
  busy: string | null;
  onBusy: (k: string | null) => void;
  onChange: (clips: ExperienceReactionClip[]) => void;
}) {
  const patch = (i: number, next: Partial<ExperienceReactionClip>) =>
    onChange(clips.map((c, j) => (j === i ? { ...c, ...next } : c)));

  const add = () => {
    const id = `reactie-${clips.length + 1}`;
    onChange([
      ...clips,
      {
        id,
        platform: clips.length % 2 === 0 ? 'tiktok' : 'instagram',
        videoUrl: '',
        username: 'user',
        caption: '',
        song: '',
        likes: 12000,
        comments: 200,
        shares: 80,
      },
    ]);
  };

  const uploadVideo = async (i: number, file: File) => {
    const clip = clips[i];
    if (!clip) return;
    const key = `reaction:${clip.id}`;
    onBusy(key);
    try {
      const r = await SitesApi.uploadExperienceAsset(site.id, slug, 'reaction', clip.id, file);
      patch(i, { videoUrl: r.url, posterUrl: clip.posterUrl });
    } finally {
      onBusy(null);
    }
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <div>
          <Label>Reacții TikTok / Instagram (homepage Cadou)</Label>
          <p className="text-xs text-muted-foreground">
            Gol = cele 8 reacții default din interfață. Video + manea (demo). Scroll orizontal pe site.
          </p>
        </div>
        <button type="button" className="text-sm text-primary" onClick={add}>+ reacție</button>
      </div>
      {clips.map((c, i) => (
        <div key={`${c.id}-${i}`} className="rounded-md border border-border p-2 grid gap-2">
          <div className="flex flex-wrap gap-2">
            <Input className="w-32" value={c.id} onChange={(e) => patch(i, { id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} />
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={c.platform}
              onChange={(e) => patch(i, { platform: e.target.value as 'tiktok' | 'instagram' })}
            >
              <option value="tiktok">TikTok</option>
              <option value="instagram">Instagram</option>
            </select>
            <Input className="w-36" value={c.username} onChange={(e) => patch(i, { username: e.target.value })} placeholder="@user" />
            <button type="button" className="text-xs text-muted-foreground" onClick={() => onChange(clips.filter((_, j) => j !== i))}>
              Șterge
            </button>
          </div>
          <Input value={c.caption} onChange={(e) => patch(i, { caption: e.target.value })} placeholder="Caption" />
          <Input value={c.song} onChange={(e) => patch(i, { song: e.target.value })} placeholder="Numele piesei în UI" />
          <div className="flex flex-wrap gap-2 items-center">
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm min-w-[220px]"
              value={c.demoId ?? ''}
              onChange={(e) => {
                const demo = demos.find((d) => d.id === e.target.value);
                patch(i, {
                  demoId: e.target.value || null,
                  audioUrl: demo?.audioUrl ?? c.audioUrl,
                  previewStartSec: demo?.previewStartSec ?? c.previewStartSec,
                  song: c.song || demo?.title || '',
                });
              }}
            >
              <option value="">Manea: alege un demo…</option>
              {demos.map((d) => (
                <option key={d.id} value={d.id}>{d.title}{d.toName ? ` → ${d.toName}` : ''}</option>
              ))}
            </select>
            <label className="text-sm text-primary cursor-pointer">
              {busy === `reaction:${c.id}` ? 'Se încarcă…' : 'Încarcă video'}
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadVideo(i, f);
                  e.target.value = '';
                }}
              />
            </label>
            {c.videoUrl && <span className="text-xs text-muted-foreground truncate max-w-[180px]">{c.videoUrl}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
