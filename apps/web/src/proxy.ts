import { NextResponse, type NextRequest } from 'next/server';
import { securityHeaders } from './server/security';

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const security = securityHeaders(
    nonce,
    process.env.NODE_ENV === 'production',
  );
  const headers = new Headers(request.headers);
  headers.set('Content-Security-Policy', security['Content-Security-Policy']);
  const response = NextResponse.next({ request: { headers } });
  for (const [key, value] of Object.entries(security))
    response.headers.set(key, value);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|icons/|manifest.webmanifest|favicon.ico|mapbox-logo.svg).*)',
  ],
};
