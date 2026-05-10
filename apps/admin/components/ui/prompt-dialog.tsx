'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';

interface PromptState {
  title: string;
  description?: React.ReactNode;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  type?: React.HTMLInputTypeAttribute;
  confirmText?: string;
  cancelText?: string;
  resolve: (val: string | null) => void;
}

let setStateGlobal: ((s: PromptState | null) => void) | null = null;

export function promptDialog(opts: Omit<PromptState, 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => {
    if (!setStateGlobal) {
      const fallback = typeof window !== 'undefined' ? window.prompt(opts.title, opts.defaultValue ?? '') : null;
      resolve(fallback);
      return;
    }
    setStateGlobal({ ...opts, resolve });
  });
}

export function PromptDialogProvider() {
  const [state, setState] = React.useState<PromptState | null>(null);
  const [val, setVal] = React.useState('');

  React.useEffect(() => {
    setStateGlobal = setState;
    return () => {
      setStateGlobal = null;
    };
  }, []);

  React.useEffect(() => {
    if (state) setVal(state.defaultValue ?? '');
  }, [state]);

  function close(val: string | null) {
    if (state) {
      state.resolve(val);
      setState(null);
    }
  }

  return (
    <Dialog
      open={!!state}
      onOpenChange={(open) => {
        if (!open) close(null);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{state?.title}</DialogTitle>
          {state?.description && <DialogDescription>{state.description}</DialogDescription>}
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            close(val);
          }}
          className="space-y-3"
        >
          {state?.label && <Label>{state.label}</Label>}
          <Input
            autoFocus
            type={state?.type ?? 'text'}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder={state?.placeholder}
          />
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => close(null)}>
              {state?.cancelText ?? 'Anulează'}
            </Button>
            <Button type="submit">{state?.confirmText ?? 'OK'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
