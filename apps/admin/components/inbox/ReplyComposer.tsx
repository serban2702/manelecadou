'use client';

import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { Bold, Italic, Link2, List, ListOrdered, Loader2, Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { promptDialog } from '@/components/ui/prompt-dialog';

interface Props {
  to: string[];
  subject: string;
  initialHtml?: string;
  /** HTML cu citatul mesajului original (attribution + blockquote), atașat sub draft. */
  quotedHtml?: string;
  aiSuggestionHtml?: string | null;
  onSend: (html: string) => Promise<void>;
}

const REPLY_BODY_PLACEHOLDER = '<p></p><p></p>';

function composeInitial(initialHtml: string | undefined, quotedHtml: string | undefined): string {
  const body = initialHtml && initialHtml.trim() ? initialHtml : REPLY_BODY_PLACEHOLDER;
  return quotedHtml ? `${body}${quotedHtml}` : body;
}

export function ReplyComposer({ to, subject, initialHtml, quotedHtml, aiSuggestionHtml, onSend }: Props) {
  const [sending, setSending] = useState(false);

  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } })],
    content: composeInitial(initialHtml, quotedHtml),
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none min-h-[220px] focus:outline-none px-3 py-2',
      },
    },
  });

  // Trackuim ultima valoare a initialHtml ca să distingem un draft nou
  // (venit din AssistantPanel / sugestie AI prin composerHtml) de un re-render
  // banal. La schimbare reală, înlocuim conținutul dar păstrăm citatul.
  const lastInitialRef = useRef<string | undefined>(initialHtml);
  useEffect(() => {
    if (!editor) return;
    if (initialHtml !== lastInitialRef.current) {
      lastInitialRef.current = initialHtml;
      if (initialHtml) {
        editor.commands.setContent(composeInitial(initialHtml, quotedHtml));
      }
    }
  }, [initialHtml, quotedHtml, editor]);

  function applyAi() {
    if (!aiSuggestionHtml || !editor) return;
    editor.commands.setContent(composeInitial(aiSuggestionHtml, quotedHtml));
  }

  async function handleSend() {
    if (!editor) return;
    const html = editor.getHTML();
    if (!html || html === '<p></p>') return;
    setSending(true);
    try {
      await onSend(html);
      editor.commands.clearContent();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-muted/30 text-xs space-y-0.5">
        <div><span className="text-muted-foreground">Către:</span> {to.join(', ') || '—'}</div>
        <div><span className="text-muted-foreground">Subiect:</span> {subject}</div>
      </div>

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
        <div className="ml-auto flex items-center gap-2">
          {aiSuggestionHtml ? (
            <Button variant="outline" size="sm" onClick={applyAi}>
              <Sparkles className="h-3.5 w-3.5" /> Folosește sugestia AI
            </Button>
          ) : null}
          <Button size="sm" onClick={handleSend} disabled={sending || !editor}>
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Trimite
          </Button>
        </div>
      </div>

      <EditorContent editor={editor} />
    </div>
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
