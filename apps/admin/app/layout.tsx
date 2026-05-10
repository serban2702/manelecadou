import type { Metadata } from 'next';
import { Providers } from '@/lib/providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Manele Cadou — Admin',
  description: 'Panou administrativ',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
