import type { NextConfig } from 'next';
import { resolve } from 'node:path';
import { proxyConfig } from './src/server/config';
import { mapboxStyle } from './src/lib/map-config';

// `next typegen` loads production config but needs no deployment credentials.
if (!process.argv.includes('typegen')) {
  proxyConfig();
  mapboxStyle(
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
    process.env.NODE_ENV === 'production',
  );
}

const nextConfig: NextConfig = {
  // Project instructions are maintained at the repository root.
  agentRules: false,
  logging: { incomingRequests: false },
  poweredByHeader: false,
  // Include workspace packages when Vercel traces server-function dependencies.
  outputFileTracingRoot: resolve(import.meta.dirname, '../..'),
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
