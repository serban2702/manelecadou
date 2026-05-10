'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { Eye, ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  html: string | null;
  text: string | null;
}

/** Render mail HTML într-un iframe sandboxed cu imaginile blocate by default. */
export function HtmlBody({ html, text }: Props) {
  const [showImages, setShowImages] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const sanitized = useMemo(() => {
    if (!html) return null;
    if (typeof window === 'undefined') return null;
    let s = DOMPurify.sanitize(html, {
      WHOLE_DOCUMENT: false,
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'object', 'embed'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick'],
    }) as string;
    if (!showImages) {
      s = s.replace(/<img\b[^>]*?\bsrc\s*=\s*"([^"]*)"/gi, (m, src) => {
        if (/^cid:/i.test(src) || /^data:/i.test(src)) return m;
        return m.replace(src, 'about:blank');
      });
    }
    return s;
  }, [html, showImages]);

  useEffect(() => {
    if (!iframeRef.current) return;
    const doc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">
<style>
  body { font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #1f1d1a; padding: 4px 2px; word-wrap: break-word; }
  a { color: #b07c1e; }
  img { max-width: 100%; height: auto; }
  blockquote { border-left: 3px solid #ddd; margin: 0 0 8px; padding-left: 12px; color: #555; }
  pre, code { background: #f6f4ee; padding: 2px 4px; border-radius: 3px; }
  table { max-width: 100%; }
</style></head><body>${sanitized ?? `<pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(text ?? '')}</pre>`}</body></html>`;
    iframeRef.current.srcdoc = doc;
  }, [sanitized, text]);

  const hasImages = !!html && /<img\b/i.test(html);
  const onLoad = () => {
    const f = iframeRef.current;
    if (!f) return;
    try {
      const body = f.contentDocument?.body;
      if (body) {
        const h = Math.min(body.scrollHeight + 16, 1500);
        f.style.height = h + 'px';
      }
    } catch { /* ignore cross-origin */ }
  };

  return (
    <div className="space-y-2">
      {hasImages && !showImages && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300">
          <ImageOff className="h-3.5 w-3.5" />
          <span className="flex-1">Imaginile remote sunt blocate pentru protecție.</span>
          <Button variant="outline" size="sm" onClick={() => setShowImages(true)}>
            <Eye className="h-3.5 w-3.5" /> Afișează imaginile
          </Button>
        </div>
      )}
      <iframe
        ref={iframeRef}
        sandbox="allow-same-origin allow-popups"
        className="w-full bg-white rounded-md border border-border min-h-[200px]"
        onLoad={onLoad}
        title="email body"
      />
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
