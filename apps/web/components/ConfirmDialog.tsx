'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

interface ConfirmState {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
  resolve: (ok: boolean) => void;
}

let setStateGlobal: ((s: ConfirmState | null) => void) | null = null;

export function confirmDialog(opts: Omit<ConfirmState, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    if (!setStateGlobal) {
      resolve(typeof window !== 'undefined' ? window.confirm(opts.title) : false);
      return;
    }
    setStateGlobal({ ...opts, resolve });
  });
}

export function ConfirmDialogProvider() {
  const t = useTranslations('common');
  const [state, setState] = useState<ConfirmState | null>(null);

  useEffect(() => {
    setStateGlobal = setState;
    return () => {
      setStateGlobal = null;
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function close(ok: boolean) {
    if (state) {
      state.resolve(ok);
      setState(null);
    }
  }

  if (!state) return null;

  const destructive = state.variant === 'destructive';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) close(false);
      }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div
        className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#170a0a] p-5 text-[#fff5dc] shadow-2xl"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}
      >
        <h2
          className="mb-2 text-lg font-extrabold tracking-tight"
          style={{
            color: destructive ? '#ff6cb0' : 'var(--gold)',
          }}
        >
          {state.title}
        </h2>
        {state.description && (
          <p className="mb-4 text-sm leading-relaxed text-[#fff5dc]/80">
            {state.description}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => close(false)}
          >
            {state.cancelText ?? t('cancel')}
          </button>
          <button
            type="button"
            autoFocus
            className={destructive ? 'btn btn-rose btn-sm' : 'btn btn-gold btn-sm'}
            onClick={() => close(true)}
          >
            {state.confirmText ?? t('confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
