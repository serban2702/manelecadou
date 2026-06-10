'use client';

import { useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';

/**
 * Terminal de operare — Claude Code rulând în containerul `ops` de pe VPS.
 *
 * iframe-ul lovește /ops/ (same-origin, proxy-at de Caddy către ttyd). ttyd cere
 * Basic Auth (OPS_TERMINAL_CREDENTIAL) — browserul afișează prompt-ul nativ o
 * singură dată, apoi ține minte credențialele pentru sesiune.
 *
 * Sesiunea din spate e tmux: închiderea paginii NU omoară taskurile — la
 * următoarea deschidere te reatașezi exact unde ai rămas.
 */
export default function OpsTerminal() {
  // Remount iframe la cerere (dacă WebSocket-ul a picat după idle lung).
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      <PageHeader
        title="Claude Ops"
        description="Claude Code pe VPS — regenerări, investigații, DB. Sesiunea (tmux) supraviețuiește închiderii paginii."
      />

      <div className="flex items-center gap-2 mb-3 -mt-2">
        <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
          <RefreshCw className="h-4 w-4" />
          Reconectează
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.open('/ops/', '_blank')}>
          <ExternalLink className="h-4 w-4" />
          Deschide full-screen
        </Button>
        <span className="text-xs text-muted-foreground hidden md:inline">
          Prima dată: rulează <code className="bg-secondary px-1 rounded">claude</code>, apoi{' '}
          <code className="bg-secondary px-1 rounded">/login</code> cu contul Claude (abonament Max).
        </span>
      </div>

      <iframe
        key={reloadKey}
        src="/ops/"
        title="Claude Ops Terminal"
        className="flex-1 w-full rounded-lg border border-border bg-black min-h-[420px]"
        // clipboard-write: ca să meargă copy/paste din terminal în pagina admin.
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
