import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { PROJECT_LABEL, PRODUCT_DESCRIPTION } from '../lib/product';

export const metadata: Metadata = {
  title: PROJECT_LABEL,
  description: PRODUCT_DESCRIPTION,
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
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
