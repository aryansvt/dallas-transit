import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { connection } from 'next/server';
import './globals.css';
import { PROJECT_LABEL, PRODUCT_DESCRIPTION } from '../lib/product';

export const metadata: Metadata = {
  title: PROJECT_LABEL,
  description: PRODUCT_DESCRIPTION,
  appleWebApp: {
    capable: true,
    title: PROJECT_LABEL,
    statusBarStyle: 'default',
  },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  // Fresh CSP nonces require request-time rendering; do not cache HTML/RSC.
  await connection();
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f6f5f0',
};
