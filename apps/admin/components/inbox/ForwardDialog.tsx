'use client';

import { useEffect, useState } from 'react';
import { Forward, Loader2, Paperclip } from 'lucide-react';
import { MailApi, type MailMessageRow } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';

const LOOSE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmails(raw: string): string[] {
  return Array.from(new Set(raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)));
}

/**
 * Redirecționează un mesaj primit. Comentariul adminului merge deasupra, iar
 * serverul atașează dedesubt mesajul original citat.
 */
export function ForwardDialog({
  open,
  onOpenChange,
  message,
  attachmentCount,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: MailMessageRow;
  attachmentCount: number;
  onSent?: () => void;
}) {
  const { toast } = useToast();
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [includeAttachments, setIncludeAttachments] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTo('');
    setNote('');
    setIncludeAttachments(true);
  }, [open]);

  async function handleSend() {
    const toList = parseEmails(to);
    if (!toList.length) {
      toast({ variant: 'destructive', title: 'Lipsește destinatarul' });
      return;
    }
    const invalid = toList.find((e) => !LOOSE_EMAIL.test(e));
    if (invalid) {
      toast({ variant: 'destructive', title: 'Email invalid', description: invalid });
      return;
    }
    setSending(true);
    try {
      await MailApi.forward(message.id, {
        to: toList,
        html: note.trim() ? `<p>${note.trim().replace(/\n/g, '<br>')}</p>` : undefined,
        includeAttachments: includeAttachments && attachmentCount > 0,
      });
      toast({ variant: 'success', title: 'Mesaj redirecționat', description: `Către ${toList.join(', ')}` });
      onSent?.();
      onOpenChange(false);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare la redirecționare', description: (e as Error).message });
    } finally {
      setSending(false);
    }
  }

  const canIncludeAttachments = attachmentCount > 0 && !message.attachmentsPurged;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Redirecționează mesajul</DialogTitle>
          <DialogDescription className="truncate">{message.subject || '(fără subiect)'}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Către</Label>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="adresa@exemplu.ro"
              className="h-9"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Notă (opțional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Un rând de context pentru destinatar…"
              rows={3}
            />
          </div>

          {canIncludeAttachments && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={includeAttachments}
                onChange={(e) => setIncludeAttachments(e.target.checked)}
                className="accent-primary"
              />
              <Paperclip className="h-3.5 w-3.5" />
              Include cele {attachmentCount} atașamente
            </label>
          )}
          {attachmentCount > 0 && message.attachmentsPurged && (
            <p className="text-xs text-muted-foreground">
              Atașamentele au fost șterse la arhivare — se redirecționează doar textul.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Anulează
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Forward className="h-4 w-4" />}
            Trimite
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
