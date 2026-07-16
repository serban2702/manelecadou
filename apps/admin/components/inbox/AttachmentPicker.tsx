'use client';

import { useRef, useState } from 'react';
import { FileText, Image as ImageIcon, Loader2, Paperclip, X } from 'lucide-react';
import { MailApi } from '@/lib/api';
import type { StagedAttachment } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

/** Limita per fișier — trebuie să rămână în acord cu MAX_ATTACHMENT_BYTES din API. */
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Alegerea fișierelor atașate la un mail. Le urcă imediat în staging și ține doar
 * id-urile: la trimitere trec în MIME, deci ajung și la client, și în copia din
 * `Sent`. Folosit de ComposeDialog și ReplyComposer.
 */
export function AttachmentPicker({
  attachments,
  onChange,
  disabled,
}: {
  attachments: StagedAttachment[];
  onChange: (next: StagedAttachment[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const { toast } = useToast();

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const picked = Array.from(files);
    setUploading((n) => n + picked.length);
    const uploaded: StagedAttachment[] = [];
    for (const f of picked) {
      if (f.size > MAX_BYTES) {
        toast({
          variant: 'destructive',
          title: 'Fișier prea mare',
          description: `${f.name} depășește 25MB.`,
        });
        setUploading((n) => n - 1);
        continue;
      }
      try {
        uploaded.push(await MailApi.uploadOutboxAttachment(f));
      } catch (e) {
        toast({ variant: 'destructive', title: `Nu am putut încărca ${f.name}`, description: (e as Error).message });
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (uploaded.length) onChange([...attachments, ...uploaded]);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function remove(id: string) {
    onChange(attachments.filter((a) => a.id !== id));
    // Ștergerea din staging e best-effort: fișierele abandonate expiră oricum în 24h.
    MailApi.discardOutboxAttachment(id).catch(() => undefined);
  }

  return (
    <div className="space-y-1.5">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || uploading > 0}
        onClick={() => inputRef.current?.click()}
      >
        {uploading > 0 ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Paperclip className="h-3.5 w-3.5" />
        )}
        {uploading > 0 ? `Se încarcă (${uploading})…` : 'Atașează fișiere'}
      </Button>

      {attachments.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2 py-1 text-xs"
            >
              {a.mime.startsWith('image/') ? (
                <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="max-w-[180px] truncate">{a.filename}</span>
              <span className="text-[10px] text-muted-foreground">{formatSize(a.size)}</span>
              <button
                type="button"
                onClick={() => remove(a.id)}
                disabled={disabled}
                className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label={`Scoate ${a.filename}`}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
