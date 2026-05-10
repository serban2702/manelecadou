'use client';

import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { Button, type ButtonProps } from './button';
import { cn } from '@/lib/cn';

interface ConfirmState {
  title: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: ButtonProps['variant'];
  resolve: (ok: boolean) => void;
}

let setStateGlobal: ((s: ConfirmState | null) => void) | null = null;

export function confirmDialog(opts: Omit<ConfirmState, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    if (!setStateGlobal) {
      // Fallback dacă provider-ul nu e mountat — folosim window.confirm
      resolve(typeof window !== 'undefined' ? window.confirm(opts.title) : false);
      return;
    }
    setStateGlobal({ ...opts, resolve });
  });
}

export function ConfirmDialogProvider() {
  const [state, setState] = React.useState<ConfirmState | null>(null);

  React.useEffect(() => {
    setStateGlobal = setState;
    return () => {
      setStateGlobal = null;
    };
  }, []);

  function close(ok: boolean) {
    if (state) {
      state.resolve(ok);
      setState(null);
    }
  }

  return (
    <Dialog
      open={!!state}
      onOpenChange={(open) => {
        if (!open) close(false);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'mt-0.5 flex h-9 w-9 items-center justify-center rounded-full',
                state?.variant === 'destructive'
                  ? 'bg-destructive/15 text-destructive'
                  : 'bg-warning/15 text-warning',
              )}
            >
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <DialogTitle>{state?.title}</DialogTitle>
              {state?.description && (
                <DialogDescription className="mt-1.5">{state.description}</DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => close(false)}>
            {state?.cancelText ?? 'Anulează'}
          </Button>
          <Button variant={state?.variant ?? 'default'} onClick={() => close(true)} autoFocus>
            {state?.confirmText ?? 'Confirmă'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
