'use client';

import { useEffect, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { DirtyChange } from './dirty';
import { SITE_NAV, type StudioNavId } from './studio-nav';

const SCREEN_ORDER = SITE_NAV.map((n) => n.id);

export function DirtyChangesBadge({
  count,
  changes,
  onGo,
}: {
  count: number;
  changes: DirtyChange[];
  onGo: (href: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, []);

  function openNow() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setOpen(true);
  }

  function closeSoon() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 160);
  }

  const groups = groupChanges(changes);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-xs font-medium text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded-md px-2 py-1 cursor-default"
          onMouseEnter={openNow}
          onMouseLeave={closeSoon}
          onClick={(e) => {
            e.preventDefault();
            setOpen(true);
          }}
          aria-label={`${count} ${count === 1 ? 'modificare nesalvată' : 'modificări nesalvate'}`}
        >
          {count} {count === 1 ? 'modificare' : 'modificări'}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        className="w-80 p-0"
        onMouseEnter={openNow}
        onMouseLeave={closeSoon}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="px-3 py-2 border-b border-border">
          <div className="text-xs font-semibold">Nesalvate</div>
          <div className="text-[11px] text-muted-foreground">
            {count} {count === 1 ? 'câmp schimbat' : 'câmpuri schimbate'}. Click te duce la ecran.
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {groups.map((group) => (
            <div key={group.screen} className="px-1.5 py-1">
              <div className="px-1.5 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                {group.label}
              </div>
              {group.items.map((item) => (
                <button
                  key={item.path}
                  type="button"
                  className="w-full text-left rounded-md px-1.5 py-1.5 hover:bg-secondary/70"
                  onClick={() => {
                    setOpen(false);
                    onGo(item.href);
                  }}
                >
                  <div className="text-xs font-medium truncate">{item.label}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
                    <span className="line-through decoration-white/30">{item.from}</span>
                    <span className="mx-1 text-foreground/50">→</span>
                    <span className="text-amber-200">{item.to}</span>
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function groupChanges(changes: DirtyChange[]): Array<{
  screen: StudioNavId;
  label: string;
  items: DirtyChange[];
}> {
  const map = new Map<StudioNavId, DirtyChange[]>();
  for (const change of changes) {
    const list = map.get(change.screen) ?? [];
    list.push(change);
    map.set(change.screen, list);
  }
  return SCREEN_ORDER.filter((id) => map.has(id)).map((screen) => ({
    screen,
    label: map.get(screen)?.[0]?.screenLabel ?? screen,
    items: map.get(screen) ?? [],
  }));
}
