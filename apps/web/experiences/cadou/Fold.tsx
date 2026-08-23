'use client';

import { useState, type ReactNode } from 'react';

export function CadouFold({
  title,
  defaultOpen = true,
  className,
  id,
  badge,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  className?: string;
  id?: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      id={id}
      className={`cadou-song-card cadou-fold${className ? ` ${className}` : ''}`}
      open={open}
      onToggle={(e) => {
        const next = e.currentTarget.open;
        if (next !== open) setOpen(next);
      }}
    >
      <summary>
        <span>{title}</span>
        {badge}
      </summary>
      <div className="cadou-fold-body">{children}</div>
    </details>
  );
}
