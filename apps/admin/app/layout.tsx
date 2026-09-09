import type { Metadata, Viewport } from 'next';
import { Providers } from '@/lib/providers';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import { IosInstallHint } from '@/components/IosInstallHint';
import './globals.css';

export const metadata: Metadata = {
  title: 'Manele Cadou — Admin',
  description: 'Panou administrativ',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  // Fără asta iOS deschide aplicația în chromeul Safari chiar și de pe ecranul
  // principal, iar push-ul rămâne indisponibil.
  appleWebApp: {
    capable: true,
    title: 'MC Admin',
    statusBarStyle: 'black-translucent',
  },
  other: {
    // Next 15 emite din `appleWebApp.capable` doar `mobile-web-app-capable`,
    // varianta standardizată. iOS o citește abia în versiuni recente, iar dacă
    // aplicația pornește în modul obișnuit de browser, `Notification` nici nu
    // există — adică push zero, fără niciun mesaj de eroare. Meta-ul de mai jos
    // e cel documentat de Apple; îl scriem explicit.
    'apple-mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  themeColor: '#0b0e14',
  // Aplicația instalată trebuie să intre sub notch / bara de jos, altfel rămân
  // benzi negre în jurul conținutului pe iPhone.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      <body>
        <ServiceWorkerRegister />
        <Providers>{children}</Providers>
        <IosInstallHint />
      </body>
    </html>
  );
}
