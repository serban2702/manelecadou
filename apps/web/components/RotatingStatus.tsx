'use client';

import { useEffect, useState } from 'react';

/**
 * Ciclează printr-o listă de texte cu un mic fade între ele (gen Claude Code:
 * „Cooking…", „Brewing…", „Whisking…"). Folosit la status-ul `generating_audio`
 * unde vrem să dăm sentiment de live + uman, nu un singur text static.
 */
export function RotatingStatus({
  phrases,
  intervalMs = 2800,
  className,
  style,
}: {
  phrases: readonly string[];
  intervalMs?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const safe = phrases.length > 0 ? phrases : [''];
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (safe.length <= 1) return;
    const id = setInterval(() => {
      setVisible(false);
      const t = setTimeout(() => {
        setIdx((i) => (i + 1) % safe.length);
        setVisible(true);
      }, 280);
      return () => clearTimeout(t);
    }, intervalMs);
    return () => clearInterval(id);
  }, [safe.length, intervalMs]);

  return (
    <span
      className={className}
      style={{
        display: 'inline-block',
        transition: 'opacity 260ms ease, transform 260ms ease',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(-4px)',
        ...style,
      }}
    >
      {safe[idx]}
    </span>
  );
}
