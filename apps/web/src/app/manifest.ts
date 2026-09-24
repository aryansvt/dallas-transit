import type { MetadataRoute } from 'next';
import { PROJECT_LABEL, PRODUCT_DESCRIPTION } from '../lib/product';

// Manifest foundation only. Icons, service worker, and installability come later.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PROJECT_LABEL,
    short_name: PROJECT_LABEL,
    description: PRODUCT_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f5f0',
    theme_color: '#192c3c',
  };
}
