'use client';

import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { Edit3, FileText, RefreshCw, Save, Sparkles, Trash2, ExternalLink } from 'lucide-react';
import { SeoPagesApi, type AdminSeoPage, type SeoBulkJob } from '@/lib/api';
import { useAsync } from '@/lib/hooks/use-async';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const CATEGORY_LABEL: Record<string, string> = {
  ocazii: 'Ocazii',
  destinatari: 'Pentru cine',
  stiluri: 'Stiluri',
  cadou: 'Cadou',
  'cum-functioneaza': 'Cum funcționează',
  'long-tail': 'Long-tail',
};

export default function SeoPagesContent() {
  const { toast } = useToast();
  const { data: pages, loading, refetch } = useAsync(() => SeoPagesApi.list(), []);
  const { data: templates } = useAsync(() => SeoPagesApi.templates(), []);
  const [bulkJob, setBulkJob] = useState<SeoBulkJob | null>(null);
  const [regenSlug, setRegenSlug] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminSeoPage | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // La mount: dacă există deja un job rulând pe server (pornit din alt tab /
  // refresh), îl pickăm și pornim polling-ul automat.
  useEffect(() => {
    SeoPagesApi.regenerateStatus()
      .then((j) => {
        if ('total' in j && j.status === 'running') {
          setBulkJob(j);
          startPolling();
        }
      })
      .catch(() => {});
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const j = await SeoPagesApi.regenerateStatus();
        if (!('total' in j)) {
          // status 'idle' — job-ul a fost curățat (puțin probabil mid-run)
          if (pollRef.current) clearInterval(pollRef.current);
          setBulkJob(null);
          return;
        }
        setBulkJob(j);
        if (j.status !== 'running') {
          if (pollRef.current) clearInterval(pollRef.current);
          toast({
            title: j.status === 'done' ? 'Generare gata' : 'Eroare',
            description:
              j.status === 'done'
                ? `${j.created} create, ${j.updated} actualizate, ${j.skipped} sărite, ${j.failed.length} eșuate`
                : j.errorMessage ?? 'Job eșuat',
            variant: j.status === 'done' ? 'default' : 'destructive',
          });
          await refetch();
        }
      } catch (err) {
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 3000);
  }

  async function runBulk(regenerate: boolean) {
    const label = regenerate
      ? 'REGENERĂM TOATE paginile (inclusiv cele existente)'
      : 'Generăm DOAR paginile lipsă';
    const ok = await confirmDialog({
      title: `Sigur?`,
      description: `${label}. Folosește OpenAI — costă ~3-5$ pentru 50 pagini. Durează 3-5 minute. Poți închide pagina — job-ul continuă în background.`,
    });
    if (!ok) return;
    try {
      const initial = await SeoPagesApi.regenerateAll({ regenerate });
      setBulkJob(initial);
      startPolling();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Eroare',
        description: (err as Error).message,
      });
    }
  }

  const bulkRunning = bulkJob?.status === 'running';

  async function regenOne(slug: string) {
    setRegenSlug(slug);
    try {
      await SeoPagesApi.regenerateOne(slug);
      toast({ title: 'Regenerat', description: slug });
      await refetch();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Eroare',
        description: (err as Error).message,
      });
    } finally {
      setRegenSlug(null);
    }
  }

  async function togglePublished(p: AdminSeoPage) {
    try {
      await SeoPagesApi.update(p.id, { published: !p.published });
      await refetch();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Eroare', description: (err as Error).message });
    }
  }

  async function deleteOne(p: AdminSeoPage) {
    const ok = await confirmDialog({
      title: `Șterge "${p.slug}"?`,
      description: 'Va fi recreată data viitoare la „Generează lipsă". Poți și să o regenerezi singular.',
      variant: 'destructive',
    });
    if (!ok) return;
    await SeoPagesApi.delete(p.id);
    await refetch();
  }

  const existingSlugs = new Set((pages ?? []).map((p) => p.slug));
  const missingTemplates = (templates ?? []).filter((t) => !existingSlugs.has(t.slug));

  return (
    <div>
      <PageHeader
        title="SEO articles"
        description="Pagini /articole/<slug> generate cu AI pentru SEO. ~50 sluguri standard per site."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Button onClick={() => runBulk(false)} disabled={bulkRunning} variant="default">
          <Sparkles className="h-4 w-4" />
          {bulkRunning
            ? `Generează ${bulkJob!.processed}/${bulkJob!.total}...`
            : `Generează lipsă (${missingTemplates.length})`}
        </Button>
        <Button
          onClick={() => runBulk(true)}
          disabled={bulkRunning}
          variant="outline"
          className="text-amber-500 border-amber-500/40"
        >
          <RefreshCw className="h-4 w-4" />
          Regenerează TOATE
        </Button>
        <div className="text-xs text-muted-foreground self-center ml-2">
          {pages?.length ?? 0} / {templates?.length ?? 50} existente
        </div>
      </div>
      {bulkJob && (
        <div className="mb-4 rounded-md border border-border bg-muted/30 p-3 text-xs">
          <div className="flex justify-between mb-1">
            <span>
              Status: <b>{bulkJob.status}</b> · {bulkJob.processed}/{bulkJob.total} procesate
            </span>
            <span className="text-muted-foreground">
              {bulkJob.created} create · {bulkJob.updated} actualizate · {bulkJob.skipped} sărite · {bulkJob.failed.length} eșuate
            </span>
          </div>
          <div className="h-1 w-full rounded bg-border overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.round((bulkJob.processed / Math.max(1, bulkJob.total)) * 100)}%` }}
            />
          </div>
          {bulkJob.errorMessage && (
            <div className="mt-2 text-destructive">{bulkJob.errorMessage}</div>
          )}
        </div>
      )}

      {loading ? (
        <Skeleton className="h-72 w-full" />
      ) : (pages ?? []).length === 0 ? (
        <Empty
          icon={<FileText className="h-5 w-5" />}
          title="Nicio pagină generată încă"
          description={'Apasă „Generează lipsă" ca să creezi cele 50 de pagini cu AI.'}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Slug</TableHead>
              <TableHead>Categorie</TableHead>
              <TableHead>Titlu</TableHead>
              <TableHead className="w-[100px]">Sursă</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead className="w-[140px]">Actualizat</TableHead>
              <TableHead className="w-[200px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(pages ?? []).map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <a
                    href={`/articole/${p.localizedSlug || p.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-primary hover:underline inline-flex items-center gap-1"
                    title={p.localizedSlug && p.localizedSlug !== p.slug ? `Slug master: ${p.slug}` : undefined}
                  >
                    {p.localizedSlug || p.slug}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {CATEGORY_LABEL[p.category] ?? p.category}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs max-w-[300px] truncate" title={p.title}>
                  {p.title}
                </TableCell>
                <TableCell>
                  <Badge variant={p.source === 'manual' ? 'success' : 'muted'} className="text-xs">
                    {p.source}
                  </Badge>
                </TableCell>
                <TableCell>
                  <button
                    onClick={() => togglePublished(p)}
                    className={
                      p.published
                        ? 'text-xs text-emerald-500 hover:underline'
                        : 'text-xs text-muted-foreground hover:underline'
                    }
                  >
                    {p.published ? 'published' : 'draft'}
                  </button>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {format(new Date(p.updatedAt), 'd MMM HH:mm', { locale: ro })}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditing(p)}
                      title="Editează manual"
                    >
                      <Edit3 className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => regenOne(p.slug)}
                      disabled={regenSlug === p.slug}
                      title="Regenerează cu AI"
                    >
                      <RefreshCw className="h-3 w-3" />
                      {regenSlug === p.slug ? '...' : ''}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteOne(p)}
                      className="text-destructive hover:text-destructive"
                      title="Șterge"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <EditDialog
        page={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await refetch();
        }}
      />
    </div>
  );
}

function EditDialog({
  page,
  onClose,
  onSaved,
}: {
  page: AdminSeoPage | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    title: '',
    metaDescription: '',
    h1: '',
    excerpt: '',
    contentMd: '',
    published: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (page) {
      setForm({
        title: page.title,
        metaDescription: page.metaDescription,
        h1: page.h1,
        excerpt: page.excerpt ?? '',
        contentMd: page.contentMd,
        published: page.published,
      });
    }
  }, [page]);

  if (!page) return null;

  async function save() {
    if (!page) return;
    setSaving(true);
    try {
      await SeoPagesApi.update(page.id, form);
      toast({ title: 'Salvat', description: 'Pagina a devenit „manual" — nu va fi suprascrisă la regenerare.' });
      onSaved();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Eroare', description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  const charCount = (s: string, max?: number) =>
    `${s.length}${max ? ` / ${max}` : ''}`;

  return (
    <Dialog open={!!page} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit3 className="h-4 w-4" /> Editează pagina SEO
          </DialogTitle>
          <DialogDescription>
            <code className="text-xs">/articole/{page.localizedSlug || page.slug}</code> · categoria{' '}
            <Badge variant="outline" className="text-xs ml-1">
              {page.category}
            </Badge>
            {page.source === 'manual' && (
              <Badge variant="success" className="text-xs ml-2">manual</Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Title (browser tab + Google SERP)</Label>
              <span className="text-[10px] text-muted-foreground">{charCount(form.title, 70)}</span>
            </div>
            <Input
              value={form.title}
              maxLength={200}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Meta description (Google SERP)</Label>
              <span className="text-[10px] text-muted-foreground">{charCount(form.metaDescription, 160)}</span>
            </div>
            <Textarea
              value={form.metaDescription}
              maxLength={320}
              rows={2}
              onChange={(e) => setForm({ ...form, metaDescription: e.target.value })}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">H1 (titlul mare de pe pagină)</Label>
              <span className="text-[10px] text-muted-foreground">{charCount(form.h1)}</span>
            </div>
            <Input
              value={form.h1}
              maxLength={200}
              onChange={(e) => setForm({ ...form, h1: e.target.value })}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Excerpt (sub H1 + meta OG)</Label>
              <span className="text-[10px] text-muted-foreground">{charCount(form.excerpt, 180)}</span>
            </div>
            <Textarea
              value={form.excerpt}
              maxLength={320}
              rows={2}
              onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs">Conținut (Markdown — H2 cu ##, listă cu -, etc.)</Label>
              <span className="text-[10px] text-muted-foreground">{charCount(form.contentMd)}</span>
            </div>
            <Textarea
              value={form.contentMd}
              rows={18}
              onChange={(e) => setForm({ ...form, contentMd: e.target.value })}
              className="font-mono text-xs"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="published"
              checked={form.published}
              onChange={(e) => setForm({ ...form, published: e.target.checked })}
            />
            <Label htmlFor="published" className="text-xs cursor-pointer">
              Publicată (vizibilă pe site)
            </Label>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Renunță
          </Button>
          <a
            href={`/articole/${page.localizedSlug || page.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground self-center mr-auto inline-flex items-center gap-1"
          >
            <ExternalLink className="h-3 w-3" /> Vezi live
          </a>
          <Button onClick={save} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? 'Salvez...' : 'Salvează'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
