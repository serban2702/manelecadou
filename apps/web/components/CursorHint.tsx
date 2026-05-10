'use client';

import { useEffect, useState } from 'react';

interface Pos {
  x: number;
  y: number;
  label: string;
}

const HINT_INTERVAL_MS = 6500;
const VISIBLE_MS = 2200;

export function CursorHint() {
  const [pos, setPos] = useState<Pos | null>(null);
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastIdx = -1;

    function tick() {
      if (!alive) return;
      const targets = Array.from(
        document.querySelectorAll<HTMLElement>('[data-hint]'),
      ).filter((el) => isVisible(el));
      if (targets.length === 0) {
        timer = setTimeout(tick, HINT_INTERVAL_MS);
        return;
      }
      lastIdx = (lastIdx + 1) % targets.length;
      const el = targets[lastIdx];
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const label = el.getAttribute('data-hint-label') ?? 'Apasă aici';
      setPos({ x, y, label });
      setPressed(false);

      // simulate press
      const pressTimeout = setTimeout(() => setPressed(true), 1100);
      const fadeTimeout = setTimeout(() => {
        setPos(null);
        setPressed(false);
      }, VISIBLE_MS);

      timer = setTimeout(() => {
        clearTimeout(pressTimeout);
        clearTimeout(fadeTimeout);
        tick();
      }, HINT_INTERVAL_MS);
    }

    timer = setTimeout(tick, 3000);

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!pos) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        transform: `translate(-12px, -12px) scale(${pressed ? 0.85 : 1})`,
        transition: 'left 0.6s cubic-bezier(.2,.7,.2,1), top 0.6s cubic-bezier(.2,.7,.2,1), transform 0.18s ease',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    >
      <div style={{ position: 'relative' }}>
        <svg width="42" height="42" viewBox="0 0 64 64" style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.5))' }}>
          <defs>
            <linearGradient id="handGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffe28a" />
              <stop offset="100%" stopColor="#b07c1e" />
            </linearGradient>
          </defs>
          <path
            d="M22 8 L22 34 L18 30 C16 28 14 28 12 30 C10 32 10 34 12 36 L22 48 C24 54 30 56 36 56 L44 56 C50 56 54 52 54 46 L54 26 C54 23 51 21 48 22 C46 22 44 24 44 26 L44 18 C44 15 41 13 38 14 C36 14 34 16 34 18 L34 12 C34 9 31 7 28 8 C26 8 24 10 24 12 L24 8 C24 6 22 6 22 8 Z"
            fill="url(#handGrad)"
            stroke="#3a2807"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            top: '110%',
            left: 36,
            background: 'linear-gradient(180deg,#ffe28a,#b07c1e)',
            color: '#2a1a04',
            padding: '4px 10px',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 10px rgba(0,0,0,0.4)',
          }}
        >
          👉 {pos.label}
        </div>
      </div>
    </div>
  );
}

function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
  if (rect.right < 0 || rect.left > window.innerWidth) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  return true;
}
