import { configuredRealtime } from './realtime-config.js';

// Explicit/manual only. Never imported by application startup or ordinary CI.
if (
  process.env.DART_REALTIME_AUTHORIZED !== 'true' ||
  process.env.DART_REALTIME_SMOKE !== 'true'
)
  throw new Error(
    'An authorized operator must explicitly enable the live smoke test.',
  );
const source = configuredRealtime(process.env, (event) =>
  console.info(JSON.stringify(event)),
);
if (!source) throw new Error('Realtime configuration missing');
try {
  await source.refresh();
  const snapshot = source.current(process.env.DART_REALTIME_PUBLICATION_ID!);
  if (!snapshot) throw new Error('No valid feed received');
  console.info(
    JSON.stringify({
      sourceTimestamp: snapshot.sourceTimestamp,
      receivedAt: snapshot.receivedAt,
      trips: snapshot.trips.length,
      vehicles: snapshot.vehicles.length,
      alerts: snapshot.alerts.length,
    }),
  );
} finally {
  await source.close();
}
