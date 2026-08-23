'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { ExperienceReactionClip, SiteDto } from '@/lib/api/sites.api';
import { SitesApi } from '@/lib/api/sites.api';
import type { SiteDemo } from '@/lib/api/site-demos.api';
import { Field } from '../studio-primitives';

export function ReactionClipsEditor({
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
      patch(i, { videoUrl: r.url });
    } finally {
      onBusy(null);
    }
  };

  return (
    <div className="space-y-2" data-field="interfaces.reactions">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground leading-snug">
          Gol = cele 8 reacții default din interfața Cadou. Video + manea (demo). Scroll orizontal pe site.
        </p>
        <Button type="button" size="sm" variant="outline" onClick={add}>
          <Plus className="h-3.5 w-3.5" />
          Adaugă reacție
        </Button>
      </div>
      {clips.map((c, i) => (
        <Card key={`${c.id}-${i}`}>
          <CardContent className="p-3 grid gap-2">
            <div className="flex flex-wrap gap-2 items-center">
              <Input
                className="w-32"
                value={c.id}
                onChange={(e) => patch(i, { id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
              />
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={c.platform}
                onChange={(e) => patch(i, { platform: e.target.value as 'tiktok' | 'instagram' })}
              >
                <option value="tiktok">TikTok</option>
                <option value="instagram">Instagram</option>
              </select>
              <Input
                className="w-36"
                value={c.username}
                onChange={(e) => patch(i, { username: e.target.value })}
                placeholder="@user"
              />
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="ml-auto"
                onClick={() => onChange(clips.filter((_, j) => j !== i))}
                title="Șterge"
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
            <Field label="Caption">
              <Input value={c.caption} onChange={(e) => patch(i, { caption: e.target.value })} placeholder="Caption" />
            </Field>
            <Field label="Numele piesei în UI">
              <Input value={c.song} onChange={(e) => patch(i, { song: e.target.value })} placeholder="Numele piesei" />
            </Field>
            <div className="flex flex-wrap gap-2 items-center">
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm min-w-[220px] flex-1"
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
                  <option key={d.id} value={d.id}>
                    {d.title}
                    {d.toName ? ` → ${d.toName}` : ''}
                  </option>
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
            </div>
            <Field label="URL video">
              <Input
                value={c.videoUrl}
                onChange={(e) => patch(i, { videoUrl: e.target.value })}
                placeholder="https://…"
              />
            </Field>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
