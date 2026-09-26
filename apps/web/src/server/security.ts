export function securityHeaders(nonce: string, production: boolean) {
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${production ? '' : " 'unsafe-eval'"}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://api.mapbox.com",
      `connect-src 'self' https://api.mapbox.com${production ? '' : ' ws: wss:'}`,
      "worker-src 'self' blob:",
      "font-src 'self'",
      "manifest-src 'self'",
      ...(production ? ['upgrade-insecure-requests'] : []),
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    // Mapbox URL-restricted public tokens need the requesting web origin.
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy':
      'geolocation=(self), camera=(), microphone=(), payment=()',
    ...(production ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}),
  };
}
