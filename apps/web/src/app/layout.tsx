import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { connection } from 'next/server';
import localFont from 'next/font/local';
import './globals.css';
import { PROJECT_LABEL, PRODUCT_DESCRIPTION } from '../lib/product';

const barlow = localFont({
  src: [
    { path: '../fonts/barlow-400.woff2', weight: '400' },
    { path: '../fonts/barlow-500.woff2', weight: '500' },
    { path: '../fonts/barlow-600.woff2', weight: '600' },
    { path: '../fonts/barlow-700.woff2', weight: '700' },
  ],
  variable: '--font-sans',
  display: 'swap',
});
const barlowCondensed = localFont({
  src: [
    { path: '../fonts/barlow-semi-condensed-600.woff2', weight: '600' },
    { path: '../fonts/barlow-semi-condensed-700.woff2', weight: '700' },
  ],
  variable: '--font-board',
  display: 'swap',
});

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
    <html
      lang="en"
      className={`${barlow.variable} ${barlowCondensed.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: '#0e1c28',
};
