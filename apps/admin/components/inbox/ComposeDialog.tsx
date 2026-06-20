'use client';

import { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { Bold, Italic, Link2, List, ListOrdered, Loader2, Send } from 'lucide-react';
import { MailApi, type MailAccountSafe } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { promptDialog } from '@/components/ui/prompt-dialog';
import { useToast } from '@/components/ui/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: MailAccountSafe[];
  /** Contul preselectat (ex: contul activ din inbox). */
  defaultAccountId?: string | null;
  /** Apelat după trimiterea cu succes (pentru refetch listă mesaje). */
  onSent?: () => void;
}

/** Sparge un string în adrese de email (separator: virgulă / punct-virgulă / spațiu). */
function parseEmails(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
}

const LOOSE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ComposeDialog({ open, onOpenChange, accounts, defaultAccountId, onSent }: Props) {
  const { toast } = useToast();
  const [accountId, setAccountId] = useState<string>('');
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [subject, setSubject] = useState('');
  const [sending, setSending] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
    ],
    content: '<p></p>',
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none min-h-[200px] focus:outline-none px-3 py-2',
      },
    },
  });

  // La fiecare deschidere: resetează câmpurile + preselectează contul.
  useEffect(() => {
    if (!open) return;
    const preferred =
      (defaultAccountId && accounts.some((a) => a.id === defaultAccountId) ? defaultAccountId : null) ??
      accounts[0]?.id ??
      '';
    setAccountId(preferred);
    setTo('');
    setCc('');
    setBcc('');
    setShowCcBcc(false);
    setSubject('');
    editor?.commands.setContent('<p></p>');
  }, [open, defaultAccountId, accounts, editor]);

  async function handleSend() {
    if (!editor) return;
    const toList = parseEmails(to);
    const ccList = parseEmails(cc);
    const bccList = parseEmails(bcc);

    if (!accountId) {
      toast({ variant: 'destructive', title: 'Alege contul', description: 'Selectează adresa din care trimiți.' });
      return;
    }
    if (!toList.length) {
      toast({ variant: 'destructive', title: 'Lipsește destinatarul', description: 'Adaugă cel puțin un email în „Către".' });
      return;
    }
    const invalid = [...toList, ...ccList, ...bccList].find((e) => !LOOSE_EMAIL.test(e));
    if (invalid) {
      toast({ variant: 'destructive', title: 'Email invalid', description: `Verifică adresa: ${invalid}` });
      return;
    }
    if (!subject.trim()) {
      toast({ variant: 'destructive', title: 'Lipsește subiectul', description: 'Adaugă un subiect pentru email.' });
      return;
    }
    const html = editor.getHTML();
    if (!html || html === '<p></p>') {
      toast({ variant: 'destructive', title: 'Mesaj gol', description: 'Scrie conținutul email-ului.' });
      return;
    }

    setSending(true);
    try {
      await MailApi.compose({
        accountId,
        to: toList,
        cc: ccList.length ? ccList : undefined,
        bcc: bccList.length ? bccList : undefined,
        subject: subject.trim(),
        html,
      });
      toast({ variant: 'success', title: 'Email trimis', description: `Către ${toList.join(', ')}` });
      onSent?.();
      onOpenChange(false);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Eroare la trimitere', description: (e as Error).message });
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Scrie un email nou</DialogTitle>
          <DialogDescription>
            Mesajul se trimite prin Mailgun, împachetat în șablonul brandat al site-ului.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* De la (cont) */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">De la</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Alege contul expeditor..." />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.fromName ? `${a.fromName} · ` : ''}{a.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Către + toggle Cc/Bcc */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Către</Label>
              <button
                type="button"
                onClick={() => setShowCcBcc((v) => !v)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {showCcBcc ? 'Ascunde Cc/Bcc' : 'Cc/Bcc'}
              </button>
            </div>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="adresa@exemplu.ro, alta@exemplu.ro"
              className="h-9"
            />
          </div>

          {showCcBcc && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Cc</Label>
                <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="cc@exemplu.ro" className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Bcc</Label>
                <Input value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="bcc@exemplu.ro" className="h-9" />
              </div>
            </div>
          )}

          {/* Subiect */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Subiect</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subiectul email-ului"
              className="h-9"
            />
          </div>

          {/* Editor corp */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Mesaj</Label>
            <div className="border border-border rounded-lg bg-card overflow-hidden">
              <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border bg-muted/20">
                <ToolBtn active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold className="h-3.5 w-3.5" /></ToolBtn>
                <ToolBtn active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic className="h-3.5 w-3.5" /></ToolBtn>
                <ToolBtn active={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List className="h-3.5 w-3.5" /></ToolBtn>
                <ToolBtn active={editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-3.5 w-3.5" /></ToolBtn>
                <ToolBtn
                  active={editor?.isActive('link')}
                  onClick={async () => {
                    const existing = editor?.getAttributes('link').href as string | undefined;
                    const url = await promptDialog({
                      title: 'Adaugă link',
                      label: 'URL',
                      placeholder: 'https://exemplu.ro',
                      defaultValue: existing ?? '',
                      type: 'url',
                      confirmText: 'Aplică',
                    });
                    if (!url) return;
                    editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
                  }}
                >
                  <Link2 className="h-3.5 w-3.5" />
                </ToolBtn>
              </div>
              <EditorContent editor={editor} />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Anulează
          </Button>
          <Button onClick={handleSend} disabled={sending || !editor}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Trimite
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ToolBtn({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 w-7 inline-flex items-center justify-center rounded-md text-sm transition-colors ${active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-secondary'}`}
    >
      {children}
    </button>
  );
}
