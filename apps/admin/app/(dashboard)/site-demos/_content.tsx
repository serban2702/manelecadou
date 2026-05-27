'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Music2, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import {
  SiteDemosApi,
  SITE_DEMO_CATEGORIES,
  SITE_DEMO_CATEGORY_LABELS,
  type SiteDemo,
  type SiteDemoCategory,
} from '@/lib/api/site-demos.api';
import { ALL_SITES, getSelectedSiteId } from '@/lib/api/sites.api';
import { useAsync } from '@/lib/hooks/use-async';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Empty } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';

/**
 * Pagină admin pentru demo-urile manelelor curate (cele afișate pe /asculta și
 * în popup-ul homepage). E o pagină per-site — nu există vizualizare cross-tenant
 * pentru demos (ar fi confuz, fiecare site are propria selecție curată).
 */
export default function SiteDemosPage() {
  const { toast } = useToast();
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);

  useEffect(() => {
    const onChange = () => setSelectedSiteId(getSelectedSiteId());
    onChange();
    window.addEventListener('mc:site-changed', onChange);
    return () => window.removeEventListener('mc:site-changed', onChange);
  }, []);

  const isAll = selectedSiteId === ALL_SITES;
  const effectiveSiteId = isAll ? undefined : selectedSiteId ?? undefined;

  const {
    data: listing,
    loading,
    refetch,
  } = useAsync(
    () => SiteDemosApi.list(effectiveSiteId),
    [effectiveSiteId],
  );

  const items = listing?.items ?? [];

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<SiteDemo | null>(null);
  const [deleting, setDeleting] = useState<SiteDemo | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function toggleField(
    demo: SiteDemo,
    field: 'active' | 'featuredOnHome',
    value: boolean,
  ) {
    try {
      await SiteDemosApi.update(demo.id, { [field]: value });
      refetch();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Eroare',
        description: (e as Error).message,
      });
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await SiteDemosApi.delete(deleting.id);
      toast({ variant: 'success', title: 'Demo șters' });
      setDeleting(null);
      refetch();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Eroare',
        description: (e as Error).message,
      });
    } finally {
      setDeleteBusy(false);
    }
  }

  if (isAll || !effectiveSiteId) {
    return (
      <div>
        <PageHeader
          title='Demo-uri „Ascultă"'
          description="Manele curate afișate pe /asculta și în popup-ul de pe homepage"
        />
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Selectează un site din selectorul de sus pentru a gestiona demo-urile.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title='Demo-uri „Ascultă"'
        description="Manele curate pentru pagina /asculta (10-15) și popup-ul homepage (max 5 marcate featured)"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Adaugă demo
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Music2 className="h-4 w-4 text-primary" />
            <CardTitle>Demo-uri ({items.length})</CardTitle>
          </div>
          <CardDescription>
            Sortate după sort order ascendent. Bifează „featured" ca să apară în
            popup-ul homepage (max 5 sunt servite).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-40" />
          ) : items.length === 0 ? (
            <Empty
              icon={<Music2 className="h-8 w-8" />}
              title="Niciun demo încă"
              description='Apasă „Adaugă demo" pentru a încărca prima manea curată.'
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Ordine</TableHead>
                  <TableHead>Demo</TableHead>
                  <TableHead>Categorie</TableHead>
                  <TableHead>Durată</TableHead>
                  <TableHead className="text-center">Activ</TableHead>
                  <TableHead className="text-center">Home</TableHead>
                  <TableHead className="text-right">Acțiuni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-xs">
                      {d.sortOrder}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {d.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={absUrl(d.thumbnailUrl)}
                            alt=""
                            className="w-12 h-12 rounded object-cover bg-muted"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                            <Music2 className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium truncate">{d.title}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {formatFromTo(d.fromName, d.toName) || (
                              <span className="opacity-50">fără dedicație</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {SITE_DEMO_CATEGORY_LABELS[d.category] ?? d.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {d.audioDurationSec
                        ? `${Math.floor(d.audioDurationSec / 60)}:${String(
                            d.audioDurationSec % 60,
                          ).padStart(2, '0')}`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={d.active}
                        onCheckedChange={(v) => toggleField(d, 'active', !!v)}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={d.featuredOnHome}
                        onCheckedChange={(v) =>
                          toggleField(d, 'featuredOnHome', !!v)
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(d)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleting(d)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {creating && (
        <DemoFormDialog
          siteId={effectiveSiteId}
          mode="create"
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            refetch();
          }}
        />
      )}
      {editing && (
        <DemoFormDialog
          siteId={effectiveSiteId}
          mode="edit"
          demo={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refetch();
          }}
        />
      )}

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Șterge demo</DialogTitle>
            <DialogDescription>
              Sigur ștergi „{deleting?.title}"? Acțiune ireversibilă.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Anulează
            </Button>
            <Button
              variant="destructive"
              disabled={deleteBusy}
              onClick={confirmDelete}
            >
              {deleteBusy ? 'Se șterge…' : 'Șterge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DemoFormDialog({
  siteId,
  mode,
  demo,
  onClose,
  onSaved,
}: {
  siteId: string;
  mode: 'create' | 'edit';
  demo?: SiteDemo;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState(demo?.title ?? '');
  const [fromName, setFromName] = useState(demo?.fromName ?? '');
  const [toName, setToName] = useState(demo?.toName ?? '');
  const [category, setCategory] = useState<SiteDemoCategory>(
    demo?.category ?? 'altele',
  );
  const [lyrics, setLyrics] = useState(demo?.lyrics ?? '');
  const [previewStartSec, setPreviewStartSec] = useState(
    String(demo?.previewStartSec ?? 0),
  );
  const [sortOrder, setSortOrder] = useState(String(demo?.sortOrder ?? 0));
  const [active, setActive] = useState(demo?.active ?? true);
  const [featuredOnHome, setFeaturedOnHome] = useState(
    demo?.featuredOnHome ?? false,
  );
  const audioRef = useRef<HTMLInputElement>(null);
  const thumbRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);

  // Determină durata audio-ului încărcat (pentru câmpul audioDurationSec — UX
  // nice-to-have, nu critic; dacă nu poate fi citită, las null și API o acceptă).
  const [detectedDuration, setDetectedDuration] = useState<number | null>(null);
  useEffect(() => {
    if (!audioFile) return;
    const url = URL.createObjectURL(audioFile);
    const el = document.createElement('audio');
    el.preload = 'metadata';
    el.src = url;
    el.onloadedmetadata = () => {
      if (Number.isFinite(el.duration)) {
        setDetectedDuration(Math.round(el.duration));
      }
      URL.revokeObjectURL(url);
    };
    el.onerror = () => URL.revokeObjectURL(url);
  }, [audioFile]);

  async function submit() {
    if (!title.trim()) {
      toast({ variant: 'destructive', title: 'Titlu obligatoriu' });
      return;
    }
    if (mode === 'create' && !audioFile) {
      toast({ variant: 'destructive', title: 'Fișier audio obligatoriu' });
      return;
    }
    setBusy(true);
    try {
      const fields = {
        title: title.trim(),
        fromName: fromName.trim() || null,
        toName: toName.trim() || null,
        category,
        lyrics: lyrics.trim() || null,
        previewStartSec: parseInt(previewStartSec, 10) || 0,
        audioDurationSec: detectedDuration ?? undefined,
        sortOrder: parseInt(sortOrder, 10) || 0,
        active,
        featuredOnHome,
        siteId,
      };
      if (mode === 'create') {
        await SiteDemosApi.create(fields, {
          audio: audioFile!,
          thumbnail: thumbFile,
        });
        toast({ variant: 'success', title: 'Demo creat' });
      } else if (demo) {
        await SiteDemosApi.update(demo.id, fields, {
          audio: audioFile ?? undefined,
          thumbnail: thumbFile ?? undefined,
        });
        toast({ variant: 'success', title: 'Demo actualizat' });
      }
      onSaved();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Eroare',
        description: (e as Error).message,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Adaugă demo' : `Editează „${demo?.title}"`}
          </DialogTitle>
          <DialogDescription>
            Încarcă un MP3 (max 15MB) + opțional thumbnail (max 2MB, jpg/png/webp).
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Titlu *" full>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ex. Pentru tata la 60 de ani"
            />
          </Field>
          <Field label="De la (fromName)">
            <Input
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="ex. Mihai"
            />
          </Field>
          <Field label="Pentru (toName)">
            <Input
              value={toName}
              onChange={(e) => setToName(e.target.value)}
              placeholder="ex. Tata Ion"
            />
          </Field>
          <Field label="Categorie">
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as SiteDemoCategory)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SITE_DEMO_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {SITE_DEMO_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Preview start (secunde)">
            <Input
              type="number"
              min={0}
              value={previewStartSec}
              onChange={(e) => setPreviewStartSec(e.target.value)}
            />
          </Field>
          <Field label="Sort order">
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </Field>
          <Field label="Versuri (lyrics)" full>
            <Textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              rows={4}
              placeholder="Versurile melodiei, afișate sub player…"
            />
          </Field>
          <Field
            label={
              mode === 'create'
                ? 'Audio MP3 *'
                : 'Audio MP3 (lasă gol = păstrează existent)'
            }
            full
          >
            <input
              ref={audioRef}
              type="file"
              accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/mp4,audio/x-m4a"
              onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
            />
            {audioFile && (
              <p className="text-xs text-muted-foreground mt-1">
                {audioFile.name} · {(audioFile.size / 1024 / 1024).toFixed(2)} MB
                {detectedDuration ? ` · ${detectedDuration}s` : ''}
              </p>
            )}
          </Field>
          <Field
            label={
              mode === 'create'
                ? 'Thumbnail (opțional)'
                : 'Thumbnail (lasă gol = păstrează existent)'
            }
            full
          >
            <input
              ref={thumbRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setThumbFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
            />
          </Field>
          <Field label="Activ (vizibil pe site)">
            <Switch checked={active} onCheckedChange={(v) => setActive(!!v)} />
          </Field>
          <Field label="Featured pe homepage (max 5 servite)">
            <Switch
              checked={featuredOnHome}
              onCheckedChange={(v) => setFeaturedOnHome(!!v)}
            />
          </Field>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Anulează
          </Button>
          <Button onClick={submit} disabled={busy}>
            <Upload className="h-4 w-4 mr-2" />
            {busy ? 'Se salvează…' : mode === 'create' ? 'Creează' : 'Salvează'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  full = false,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function formatFromTo(from: string | null, to: string | null): string {
  if (from && to) return `de la ${from} pentru ${to}`;
  if (to) return `pentru ${to}`;
  if (from) return `de la ${from}`;
  return '';
}

function absUrl(rel: string): string {
  if (rel.startsWith('http')) return rel;
  const base = process.env.NEXT_PUBLIC_API_URL ?? '';
  return `${base}${rel}`;
}
