import type {
  GeographicJourney,
  GeographicRequest,
  JourneyResponse,
  Place,
  References,
  TransitLeg,
} from '@dallas-transit/shared';
import { ClientError, errorMessage, type TransitClient } from '../lib/api';
import type { PreviewSetup } from '../components/transit-app';

// Original synthetic presentation fixtures. Names provide Dallas context; times,
// connections and coordinates are examples, not travel advice or copied feed rows.
export const previewOrigin: Place = {
  name: 'Current location',
  latitude: 32.7788,
  longitude: -96.8079,
};
export const previewPlaces: Place[] = [
  {
    name: 'Dallas Museum of Art',
    context: 'Arts District, Dallas',
    latitude: 32.7876,
    longitude: -96.8009,
  },
  {
    name: 'Perot Museum of Nature and Science',
    context: 'Victory Park, Dallas',
    latitude: 32.7869,
    longitude: -96.8066,
  },
  {
    name: 'West End Station',
    context: 'Downtown Dallas',
    latitude: 32.7809,
    longitude: -96.8054,
  },
  {
    name: 'Klyde Warren Park',
    context: 'Woodall Rodgers Freeway, Dallas',
    latitude: 32.789,
    longitude: -96.8017,
  },
];
export const previewDestination = previewPlaces[0]!;
const references: References = {
  stops: [
    {
      stopId: 'west',
      name: 'West End Station',
      coordinate: { latitude: 32.7809, longitude: -96.8054 },
      code: null,
      platformCode: null,
      parentStationId: null,
    },
    {
      stopId: 'akard',
      name: 'Akard Station',
      coordinate: { latitude: 32.7813, longitude: -96.7976 },
      code: null,
      platformCode: null,
      parentStationId: null,
    },
    {
      stopId: 'paul',
      name: 'St. Paul Station',
      coordinate: { latitude: 32.7841, longitude: -96.7948 },
      code: null,
      platformCode: null,
      parentStationId: null,
    },
  ],
  routes: [
    {
      routeId: 'red',
      shortName: 'RED',
      longName: 'Red Line',
      color: 'C63532',
      textColor: 'FFFFFF',
      type: 0,
      agencyTimezone: 'America/Chicago',
    },
    {
      routeId: 'blue',
      shortName: 'BLUE',
      longName: 'Blue Line',
      color: '196599',
      textColor: 'FFFFFF',
      type: 0,
      agencyTimezone: 'America/Chicago',
    },
    {
      routeId: 'bus',
      shortName: '17',
      longName: 'Arts District',
      color: null,
      textColor: null,
      type: 3,
      agencyTimezone: 'America/Chicago',
    },
    {
      routeId: 'orange',
      shortName: 'ORANGE',
      longName: 'Orange Line',
      color: 'DB761E',
      textColor: 'FFFFFF',
      type: 0,
      agencyTimezone: 'America/Chicago',
    },
  ],
  trips: [
    { tripId: 'red-trip', headsign: 'Parker Road', directionId: 0 },
    { tripId: 'blue-trip', headsign: 'Downtown Rowlett', directionId: 1 },
    { tripId: 'bus-trip', headsign: 'Arts District', directionId: 0 },
    { tripId: 'orange-trip', headsign: 'Parker Road', directionId: 0 },
  ],
};
export function previewResponse(
  overnight = false,
): Extract<JourneyResponse, { status: 'ok' }> {
  const offset = overnight ? 57600 : 0;
  const base = {
    publicationId: '11111111-1111-4111-8111-111111111111',
    serviceDate: '2026-09-18',
    origin: {
      latitude: previewOrigin.latitude,
      longitude: previewOrigin.longitude,
    },
    destination: {
      latitude: previewDestination.latitude,
      longitude: previewDestination.longitude,
    },
    requestedDepartureTime: 28800 + offset,
  };
  const transit = (
    routeId: string,
    from: string,
    to: string,
    departure: number,
    arrival: number,
    stops: number,
  ): TransitLeg => ({
    kind: 'transit',
    tripId: `${routeId}-trip`,
    routeId,
    patternId: `fixture-${routeId}`,
    boardingStopId: from,
    alightingStopId: to,
    boardingOccurrence: 0,
    alightingOccurrence: stops,
    boardingSequence: 1,
    alightingSequence: stops * 10 + 1,
    departureTime: departure + offset,
    arrivalTime: arrival + offset,
  });
  const make = (
    rides: TransitLeg[],
    accessSeconds: number,
    egressSeconds: number,
  ): GeographicJourney => {
    const last = rides.at(-1)!;
    const arrivalTime = last.arrivalTime + egressSeconds;
    return {
      ...base,
      accessStopId: 'west',
      egressStopId: 'paul',
      arrivalTime,
      durationSeconds: arrivalTime - base.requestedDepartureTime,
      boardingCount: rides.length,
      transferCount: rides.length - 1,
      walkingDurationSeconds: accessSeconds + egressSeconds,
      walkingDistanceMeters: (accessSeconds + egressSeconds) * 1.2,
      interchangeDurationSeconds: 0,
      legs: [
        {
          kind: 'walk',
          phase: 'access',
          stopId: 'west',
          origin: base.origin,
          destination: references.stops[0]!.coordinate,
          departureTime: base.requestedDepartureTime,
          arrivalTime: base.requestedDepartureTime + accessSeconds,
          durationSeconds: accessSeconds,
          distanceMeters: accessSeconds * 1.2,
        },
        ...rides,
        {
          kind: 'walk',
          phase: 'egress',
          stopId: 'paul',
          origin: references.stops[2]!.coordinate,
          destination: base.destination,
          departureTime: last.arrivalTime,
          arrivalTime,
          durationSeconds: egressSeconds,
          distanceMeters: egressSeconds * 1.2,
        },
      ],
    };
  };
  return {
    ...base,
    status: 'ok',
    incomplete: false,
    references,
    journeys: [
      make(
        [
          transit('red', 'west', 'akard', 29160, 29700, 2),
          transit('blue', 'akard', 'paul', 30000, 30540, 3),
        ],
        180,
        180,
      ),
      make([transit('bus', 'west', 'paul', 29280, 30840, 8)], 180, 300),
      make([transit('orange', 'west', 'paul', 29820, 31200, 4)], 60, 120),
    ],
  };
}
export const scenarios = {
  granted: '01 · Home — location granted',
  manual: '02 · Home — manual origin',
  search: '03 · Place search',
  loading: '04 · Finding routes',
  results: '05 · Three route alternatives',
  empty: '06 · No journey',
  failure: '07 · Service failure',
  direct: '08 · Direct journey',
  transfer: '09 · Transfer journey',
  overnight: '10 · After midnight',
  partial: '11 · Incomplete options',
  expanded: '12 · Expanded map',
  long: '13 · Long destination name',
} as const;
export type Scenario = keyof typeof scenarios;
export function previewSetup(scenario: Scenario): PreviewSetup {
  const response = previewResponse(scenario === 'overnight');
  const setup: PreviewSetup = {
    origin: previewOrigin,
    destination: previewDestination,
    saved: {
      version: 1,
      recent: [previewDestination, previewPlaces[1]!],
      saved: [previewPlaces[3]!],
    },
  };
  if (scenario === 'granted') return { ...setup, destination: null };
  if (scenario === 'manual')
    return { ...setup, origin: null, destination: null };
  if (scenario === 'search')
    return { ...setup, destination: null, search: true };
  if (scenario === 'loading') return { ...setup, loading: true };
  if (scenario === 'failure')
    return {
      ...setup,
      error: errorMessage(new ClientError('WALKING_UNAVAILABLE')),
    };
  if (scenario === 'empty')
    return {
      ...setup,
      data: {
        ...response,
        status: 'no-journey',
        journeys: [],
        incomplete: false,
        reason: 'transit-unreachable',
      },
    };
  if (scenario === 'long')
    return {
      ...setup,
      destination: {
        ...previewDestination,
        name: 'Dallas Museum of Art — Center for Creative Connections and Family Experiences',
      },
      data: response,
      detail: 0,
    };
  return {
    ...setup,
    data: { ...response, incomplete: scenario === 'partial' },
    ...(['direct', 'transfer', 'overnight', 'expanded'].includes(scenario)
      ? { detail: scenario === 'direct' ? 1 : 0 }
      : {}),
    ...(scenario === 'expanded' ? { expanded: true } : {}),
  };
}
function delay(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(new ClientError('REQUEST_CANCELED'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, 450);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}
export const previewClient: TransitClient = {
  async places(q, signal) {
    await delay(signal);
    return {
      status: 'ok',
      places: previewPlaces.filter((p) =>
        `${p.name} ${p.context}`.toLowerCase().includes(q.toLowerCase()),
      ),
    };
  },
  async journeys(_request: GeographicRequest, signal) {
    await delay(signal);
    return previewResponse();
  },
};
