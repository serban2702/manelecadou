'use client';

import { useEffect, useState } from 'react';

interface ToastItem {
  id: number;
  message: string;
  variant: 'default' | 'success' | 'error';
}

let pushGlobal: ((t: Omit<ToastItem, 'id'>) => void) | null = null;
let idCounter = 0;

export function toast(message: string, variant: ToastItem['variant'] = 'default') {
  if (pushGlobal) {
    pushGlobal({ message, variant });
  } else if (typeof window !== 'undefined') {
    window.alert(message);
  }
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    pushGlobal = (t) => {
      const id = ++idCounter;
      setItems((prev) => [...prev, { ...t, id }]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== id)), 3500);
    };
    return () => {
      pushGlobal = null;
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 bottom-3 z-[150] mx-auto flex max-w-md flex-col gap-2 sm:inset-x-auto sm:right-4 sm:left-auto"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto rounded-xl border border-white/10 bg-black/90 px-4 py-3 text-sm text-white shadow-2xl backdrop-blur-md"
          style={{
            borderColor:
              t.variant === 'success'
                ? 'rgba(62,224,126,0.4)'
                : t.variant === 'error'
                  ? 'rgba(255,45,126,0.4)'
                  : 'rgba(241,200,77,0.3)',
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
