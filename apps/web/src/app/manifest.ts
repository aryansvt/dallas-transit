import type { MetadataRoute } from 'next';
import { PROJECT_LABEL, PRODUCT_DESCRIPTION } from '../lib/product';

// Menu installation on supported browsers; intentionally no service-worker cache.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PROJECT_LABEL,
    short_name: PROJECT_LABEL,
    description: PRODUCT_DESCRIPTION,
    id: '/',
    scope: '/',
    lang: 'en',
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f5f0',
    theme_color: '#f6f5f0',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
