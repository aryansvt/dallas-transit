import { transitProxy } from '../../../../server/transit-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return transitProxy(request, (await context.params).path);
}
export { handle as GET, handle as POST };
