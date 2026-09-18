import type { MetadataRoute } from 'next';

// Manifest foundation only. Icons, service worker, and installability come later.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Dallas Transit Navigator',
    short_name: 'Dallas Transit',
    description:
      'An open-source Dallas transit navigator, currently in development.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#0f172a',
  };
}
