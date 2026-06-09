import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Pagina de dezabonare nu trebuie indexată (linkuri cu token personal).
export const metadata: Metadata = {
  title: 'Dezabonare',
  robots: { index: false, follow: false },
};

export default function UnsubscribeLayout({ children }: { children: ReactNode }) {
  return children;
}
