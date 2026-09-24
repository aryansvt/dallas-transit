import { serviceDayEpoch, type OtpItinerary } from './compare.js';
import type { ReferenceCase } from './corpus.js';

export async function graphql<T>(
  endpoint: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`OTP HTTP ${response.status}`);
  const result = (await response.json()) as { data?: T; errors?: unknown[] };
  if (result.errors?.length || !result.data)
    throw new Error(`OTP GraphQL failure: ${JSON.stringify(result.errors)}`);
  return result.data;
}

export async function queryOtp(
  endpoint: string,
  test: ReferenceCase,
  rawOtpLimit = test.maxTransfers + 1,
) {
  const instant = new Date(
    (serviceDayEpoch(test.date) + test.departure) * 1000,
  );
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const p = (name: string) => parts.find((p) => p.type === name)!.value;
  // OTP 2.7's legacy GraphQL maxTransfers actually bounds boardings:
  // 0 returns no transit, 1 direct only, 2 allows one change. The pinned
  // reference probes and witness replay protect this version-specific mapping.
  const variables = {
    from: `dart:${test.from}`,
    to: `dart:${test.to}`,
    date: `${p('year')}-${p('month')}-${p('day')}`,
    time: `${p('hour')}:${p('minute')}:${p('second')}`,
    maxTransfers: rawOtpLimit,
  };
  // OTP 2.7's deprecated plan field is intentionally pinned; no floating schema.
  const result = await graphql<{
    plan: {
      itineraries: OtpItinerary[];
      routingErrors: { code: string; description: string }[];
      searchWindowUsed: number;
    };
  }>(
    endpoint,
    `
      query Reference(
        $from: String!
        $to: String!
        $date: String!
        $time: String!
        $maxTransfers: Int!
      ) {
        plan(
          fromPlace: $from
          toPlace: $to
          date: $date
          time: $time
          maxTransfers: $maxTransfers
          numItineraries: 100
          searchWindow: 7200
          boardSlack: 0
          alightSlack: 0
          minTransferTime: 120
          ignoreRealtimeUpdates: true
          debugItineraryFilter: true
          transportModes: [{ mode: TRANSIT }]
        ) {
          searchWindowUsed
          routingErrors {
            code
            description
          }
          itineraries {
            startTime
            endTime
            numberOfTransfers
            legs {
              transitLeg
              startTime
              endTime
              serviceDate
              from {
                stop {
                  gtfsId
                }
              }
              to {
                stop {
                  gtfsId
                }
              }
              trip {
                gtfsId
              }
              route {
                gtfsId
              }
            }
          }
        }
      }
    `,
    variables,
  );
  if (result.plan.routingErrors.some((e) => e.code !== 'NO_TRANSIT_CONNECTION'))
    throw new Error(
      `OTP routing errors: ${JSON.stringify(result.plan.routingErrors)}`,
    );
  return { ...result.plan, variables };
}
