import {
  isPlace,
  type GeographicRequest,
  type JourneyResponse,
  type PlaceSearchResponse,
} from '@dallas-transit/shared';
import { validDate } from './time';

export class ClientError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export interface TransitClient {
  journeys(
    request: GeographicRequest,
    signal: AbortSignal,
  ): Promise<JourneyResponse>;
  places(query: string, signal: AbortSignal): Promise<PlaceSearchResponse>;
}
export const errorMessage = (error: unknown): string => {
  const code = error instanceof ClientError ? error.code : 'NETWORK_ERROR';
  const messages: Record<string, string> = {
    INVALID_REQUEST:
      'Check your starting point, destination and departure time, then try again.',
    WALKING_NOT_CONFIGURED:
      'Trip planning is not available yet. Walking directions still need to be connected.',
    WALKING_UNAVAILABLE:
      'Walking directions are temporarily unavailable. Please try again shortly.',
    WALKING_TIMEOUT: 'Walking directions took too long. Please try again.',
    REQUEST_TIMEOUT: 'This search took too long. Please try again.',
    SERVER_BUSY:
      'A lot of trips are being planned right now. Please try again in a moment.',
    DATABASE_UNAVAILABLE:
      'Schedules are temporarily unavailable. Please try again shortly.',
    SERVICE_UNAVAILABLE:
      'Trip planning is temporarily unavailable. Please try again shortly.',
    NO_PUBLICATION:
      'Schedules are not available for this date. Try a different departure date.',
    PUBLICATION_CHANGED:
      'The schedule changed while we were searching. Find routes again for updated options.',
    REQUEST_CANCELED:
      'Search canceled. You can change your trip and search again.',
    INVALID_RESPONSE:
      'We could not read these route options. Please try again.',
    INTERNAL_ERROR: 'We could not plan this trip just now. Please try again.',
  };
  return (
    messages[code] ??
    'We could not connect. Check your connection and try again.'
  );
};
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0;
const text = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 1024;
const nullableText = (v: unknown) => v === null || text(v);
const point = (v: unknown) =>
  record(v) &&
  typeof v.latitude === 'number' &&
  Number.isFinite(v.latitude) &&
  Math.abs(v.latitude) <= 90 &&
  typeof v.longitude === 'number' &&
  Number.isFinite(v.longitude) &&
  Math.abs(v.longitude) <= 180;
const strings = (v: Record<string, unknown>, keys: string[]) =>
  keys.every((k) => text(v[k]));
const numbers = (v: Record<string, unknown>, keys: string[]) =>
  keys.every((k) => finite(v[k]));

/** Bound the browser boundary and reject broken core fields before presentation. Additive fields are tolerated. */
export function parseJourneys(value: unknown): JourneyResponse {
  const fail = () => {
    throw new ClientError('INVALID_RESPONSE');
  };
  if (
    !record(value) ||
    !strings(value, ['publicationId', 'serviceDate']) ||
    !validDate(String(value.serviceDate)) ||
    !point(value.origin) ||
    !point(value.destination) ||
    !finite(value.requestedDepartureTime) ||
    !Array.isArray(value.journeys) ||
    value.journeys.length > 3
  )
    return fail();
  if (value.status === 'no-journey') {
    if (
      value.journeys.length ||
      value.incomplete !== false ||
      ![
        'no-nearby-access-stops',
        'no-nearby-egress-stops',
        'no-reachable-access-stops',
        'no-reachable-egress-stops',
        'transit-unreachable',
      ].includes(String(value.reason))
    )
      return fail();
  } else if (value.status === 'ok') {
    if (
      !value.journeys.length ||
      typeof value.incomplete !== 'boolean' ||
      !record(value.references)
    )
      return fail();
    const refs = value.references;
    if (
      !Array.isArray(refs.stops) ||
      !Array.isArray(refs.routes) ||
      !Array.isArray(refs.trips) ||
      refs.stops.length > 100 ||
      refs.routes.length > 12 ||
      refs.trips.length > 12
    )
      return fail();
    if (
      !refs.stops.every(
        (s) =>
          record(s) &&
          strings(s, ['stopId', 'name']) &&
          point(s.coordinate) &&
          nullableText(s.platformCode),
      ) ||
      !refs.routes.every(
        (r) =>
          record(r) &&
          strings(r, ['routeId', 'agencyTimezone']) &&
          finite(r.type) &&
          ['shortName', 'longName', 'color', 'textColor'].every((k) =>
            nullableText(r[k]),
          ),
      ) ||
      !refs.trips.every(
        (t) => record(t) && text(t.tripId) && nullableText(t.headsign),
      )
    )
      return fail();
    const stops = new Set(refs.stops.map((s) => s.stopId));
    const routes = new Set(refs.routes.map((r) => r.routeId));
    const trips = new Set(refs.trips.map((t) => t.tripId));
    for (const j of value.journeys) {
      if (
        !record(j) ||
        j.publicationId !== value.publicationId ||
        j.serviceDate !== value.serviceDate ||
        !point(j.origin) ||
        !point(j.destination) ||
        !strings(j, ['accessStopId', 'egressStopId']) ||
        !numbers(j, [
          'arrivalTime',
          'requestedDepartureTime',
          'durationSeconds',
          'boardingCount',
          'transferCount',
          'walkingDurationSeconds',
          'walkingDistanceMeters',
          'interchangeDurationSeconds',
        ]) ||
        !Array.isArray(j.legs) ||
        j.legs.length > 64 ||
        !j.legs.length
      )
        return fail();
      for (const l of j.legs) {
        if (
          !record(l) ||
          !numbers(l, ['departureTime', 'arrivalTime']) ||
          Number(l.arrivalTime) < Number(l.departureTime)
        )
          return fail();
        if (l.kind === 'transit') {
          if (
            !stops.has(l.boardingStopId) ||
            !stops.has(l.alightingStopId) ||
            !routes.has(l.routeId) ||
            !trips.has(l.tripId) ||
            !numbers(l, [
              'boardingOccurrence',
              'alightingOccurrence',
              'boardingSequence',
              'alightingSequence',
            ])
          )
            return fail();
        } else if (l.kind === 'walk') {
          if (
            !['access', 'egress'].includes(String(l.phase)) ||
            !point(l.origin) ||
            !point(l.destination) ||
            !stops.has(l.stopId) ||
            !numbers(l, ['durationSeconds', 'distanceMeters'])
          )
            return fail();
        } else if (l.kind === 'transfer') {
          if (!stops.has(l.fromStopId) || !stops.has(l.toStopId)) return fail();
        } else return fail();
      }
    }
  } else return fail();
  return value as unknown as JourneyResponse;
}

async function requestJson(
  path: string,
  signal: AbortSignal,
  body?: GeographicRequest,
): Promise<unknown> {
  const timer = new AbortController();
  const timeout = setTimeout(() => timer.abort(), 35000);
  try {
    const response = await fetch(`/api/v1/${path}`, {
      method: body ? 'POST' : 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      signal: AbortSignal.any([signal, timer.signal]),
      ...(body
        ? {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        : {}),
    });
    const value: unknown = await response.json();
    if (!response.ok)
      throw new ClientError(
        record(value) && record(value.error) && text(value.error.code)
          ? value.error.code
          : 'SERVICE_UNAVAILABLE',
      );
    return value;
  } catch (error) {
    if (signal.aborted) throw new ClientError('REQUEST_CANCELED');
    if (timer.signal.aborted) throw new ClientError('REQUEST_TIMEOUT');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
export const liveClient: TransitClient = {
  async journeys(input, signal) {
    return parseJourneys(await requestJson('journeys', signal, input));
  },
  async places(query, signal) {
    const data = await requestJson(
      `places/search?q=${encodeURIComponent(query)}`,
      signal,
    );
    if (!record(data) || !Array.isArray(data.places) || data.places.length > 6)
      throw new ClientError('INVALID_RESPONSE');
    if (data.status === 'ok' && data.places.every(isPlace))
      return data as unknown as PlaceSearchResponse;
    if (
      data.status === 'unavailable' &&
      ['not-configured', 'provider-unavailable'].includes(
        String(data.reason),
      ) &&
      data.places.length === 0
    )
      return data as unknown as PlaceSearchResponse;
    throw new ClientError('INVALID_RESPONSE');
  },
};
