import {
  SnapshotGroup,
  SnapshotLifecycle,
  httpFeedProvider,
  type FeedObservation,
} from '@dallas-transit/realtime';

/** Opt-in server configuration only after the operator verifies DART access.
 * No default endpoint, no credential discovery, no automatic smoke test.
 */
export function configuredRealtime(
  env: NodeJS.ProcessEnv,
  observe: (event: FeedObservation) => void,
): SnapshotGroup | undefined {
  if (env.DART_REALTIME_AUTHORIZED !== 'true') return undefined;
  const publication = env.DART_REALTIME_PUBLICATION_ID;
  const urls = env.DART_REALTIME_FEED_URLS?.split(',');
  const intervalMs = Number(env.DART_REALTIME_INTERVAL_MS ?? 60000);
  if (
    !publication ||
    !/^[0-9a-f-]{36}$/i.test(publication) ||
    !urls?.length ||
    urls.length > 3 ||
    !Number.isSafeInteger(intervalMs) ||
    intervalMs < 60000 ||
    intervalMs > 3600000
  )
    throw new Error('Invalid authorized realtime configuration');
  const headerName = env.DART_REALTIME_AUTH_HEADER;
  const key = env.DART_REALTIME_KEY;
  if (
    Boolean(headerName) !== Boolean(key) ||
    (headerName && !/^[a-zA-Z0-9-]+$/.test(headerName))
  )
    throw new Error('Invalid realtime authentication configuration');
  const headers = headerName && key ? { [headerName]: key } : {};
  return new SnapshotGroup(
    urls.map(
      (url) =>
        new SnapshotLifecycle(httpFeedProvider(url, headers), publication, {
          intervalMs,
          observe,
        }),
    ),
  );
}
