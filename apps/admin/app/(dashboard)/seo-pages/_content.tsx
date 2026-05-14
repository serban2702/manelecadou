'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { FileText, RefreshCw, Sparkles, Trash2, ExternalLink } from 'lucide-react';
import { SeoPagesApi, type AdminSeoPage } from '@/lib/api';
import { useAsync } from '@/lib/hooks/use-async';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { confirmDialog } from '@/components/ui/confirm-dialog';
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
  const [bulkRunning, setBulkRunning] = useState(false);
  const [regenSlug, setRegenSlug] = useState<string | null>(null);

  async function runBulk(regenerate: boolean) {
    const label = regenerate
      ? 'REGENERĂM TOATE paginile (inclusiv cele existente)'
      : 'Generăm DOAR paginile lipsă';
    const ok = await confirmDialog({
      title: `Sigur?`,
      description: `${label}. Folosește OpenAI — costă ~3-5$ pentru 50 pagini. Durează 3-5 minute.`,
    });
    if (!ok) return;
    setBulkRunning(true);
    try {
      const result = await SeoPagesApi.regenerateAll({ regenerate });
      toast({
        title: 'Generare gata',
        description: `${result.created} create, ${result.updated} actualizate, ${result.skipped} sărite, ${result.failed.length} eșuate`,
      });
      await refetch();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Eroare',
        description: (err as Error).message,
      });
    } finally {
      setBulkRunning(false);
    }
  }

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
          {bulkRunning ? 'Se generează...' : `Generează lipsă (${missingTemplates.length})`}
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
                    href={`/articole/${p.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-primary hover:underline inline-flex items-center gap-1"
                  >
                    {p.slug}
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
    </div>
  );
}
