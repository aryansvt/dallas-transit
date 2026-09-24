import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Project instructions are maintained at the repository root.
  agentRules: false,
  logging: { incomingRequests: false },
  async rewrites() {
    const api = new URL(
      process.env.TRANSIT_API_ORIGIN ?? 'http://127.0.0.1:3001',
    );
    if (
      !['http:', 'https:'].includes(api.protocol) ||
      api.username ||
      api.password ||
      api.search ||
      api.hash ||
      api.pathname !== '/'
    )
      throw new Error(
        'TRANSIT_API_ORIGIN must be an HTTP(S) origin without credentials or a path.',
      );
    return [
      { source: '/api/v1/:path*', destination: `${api.origin}/v1/:path*` },
    ];
  },
};

export default nextConfig;
