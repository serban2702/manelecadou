'use client';

import { type ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog';
import { PromptDialogProvider } from '@/components/ui/prompt-dialog';

/**
 * Providers minimaliste pentru admin după migrarea de la TanStack Query → axios + useAsync.
 * State-ul de fetch trăiește în hook-uri locale (lib/hooks/use-async.ts), nu mai e nevoie
 * de QueryClient global. Auth interceptor + redirect 401 sunt în lib/http/client.ts.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={150}>
      {children}
      <Toaster />
      <ConfirmDialogProvider />
      <PromptDialogProvider />
    </TooltipProvider>
  );
}
