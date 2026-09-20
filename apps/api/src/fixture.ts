import {
  buildSchedule,
  sameCoordinate,
  type GeographicRequest,
} from '@dallas-transit/router';
import type { WalkingProvider } from '@dallas-transit/transit-ingest/runtime';
import type { References, TransitRepository } from './repository.js';
import { ApiError } from './errors.js';

/** Original synthetic network for offline API validation. Never a server mode. */
export function apiFixture(offset = 0) {
  const publicationId = '11111111-1111-4111-8111-111111111111';
  const origin = { latitude: 32, longitude: -96 };
  const destination = { latitude: 32.01, longitude: -96 };
  const request: GeographicRequest = {
    origin,
    destination,
    serviceDate: '2026-09-18',
    departureTime: 28800 + offset,
  };
  const schedule = buildSchedule({
    publicationId,
    serviceDate: request.serviceDate,
    activeServiceIds: ['day'],
    stops: ['A', 'B', 'D'].map((id) => ({ id, changeSeconds: 120 })),
    trips: [
      {
        id: 'direct',
        routeId: 'bus',
        visits: [
          ['A', 28900],
          ['D', 30600],
        ],
      },
      {
        id: 'first',
        routeId: 'bus',
        visits: [
          ['A', 28900],
          ['B', 29200],
        ],
      },
      {
        id: 'second',
        routeId: 'rail',
        visits: [
          ['B', 29400],
          ['D', 30000],
        ],
      },
    ].map((t) => ({
      id: t.id,
      routeId: t.routeId,
      serviceId: 'day',
      events: t.visits.map(([id, time], i) => ({
        stopId: String(id),
        sequence: i * 10 + 1,
        arrival: Number(time) + offset,
        departure: Number(time) + offset,
        pickup: 0,
        dropOff: 0,
      })),
    })),
  });
  const references: References = {
    stops: [
      {
        stopId: 'A',
        name: 'Alpha',
        coordinate: { latitude: 32.0001, longitude: -96 },
        code: null,
        platformCode: null,
        parentStationId: null,
      },
      {
        stopId: 'B',
        name: 'Bravo',
        coordinate: { latitude: 32.005, longitude: -96 },
        code: null,
        platformCode: null,
        parentStationId: null,
      },
      {
        stopId: 'D',
        name: 'Delta',
        coordinate: { latitude: 32.0101, longitude: -96 },
        code: null,
        platformCode: null,
        parentStationId: null,
      },
    ],
    routes: ['bus', 'rail'].map((routeId) => ({
      routeId,
      shortName: routeId,
      longName: null,
      type: routeId === 'bus' ? 3 : 2,
      color: null,
      textColor: null,
      agencyTimezone: 'America/Chicago',
    })),
    trips: schedule.trips.map((t) => ({
      tripId: t.id,
      headsign: t.id,
      directionId: 0,
    })),
  };
  const provider: WalkingProvider = {
    id: 'synthetic-walking',
    async route(input, signal) {
      signal.throwIfAborted();
      return {
        status: 'ok',
        route: {
          ...input,
          durationSeconds: sameCoordinate(input.origin, origin) ? 30.25 : 40.5,
          distanceMeters: 50.5,
        },
      };
    },
  };
  const candidates = (stopId: string) => {
    const stop = references.stops.find((s) => s.stopId === stopId)!;
    return {
      publicationId,
      stopId,
      name: stop.name,
      coordinate: stop.coordinate,
      candidateDistanceMeters: 10,
    };
  };
  const repository: TransitRepository = {
    async publication(date) {
      return date === request.serviceDate ? publicationId : null;
    },
    async load(date) {
      return date === request.serviceDate
        ? { schedule, preparationMs: 0 }
        : null;
    },
    candidates: {
      async find(query, _policy, expected) {
        if (expected !== publicationId)
          return { status: 'unavailable', reason: 'publication-changed' };
        return {
          status: 'ok',
          publicationId,
          access: sameCoordinate(query.origin, origin) ? [candidates('A')] : [],
          egress: sameCoordinate(query.destination, destination)
            ? [candidates('D')]
            : [],
          originLookupMs: 0,
          destinationLookupMs: 0,
        };
      },
    },
    async references() {
      return references;
    },
    async metadata(kind, id, date, expected) {
      if (date !== request.serviceDate) throw new ApiError('NO_PUBLICATION');
      if (expected && expected !== publicationId)
        throw new ApiError('PUBLICATION_CHANGED');
      const data =
        kind === 'stop'
          ? references.stops.find((s) => s.stopId === id)
          : references.routes.find((r) => r.routeId === id);
      if (!data) throw new ApiError('NOT_FOUND');
      return { publicationId, serviceDate: date, data };
    },
    async nearby(_point, date) {
      return { publicationId, serviceDate: date, stops: [candidates('A')] };
    },
    async readiness() {
      return { database: true, schema: true, schedule: true };
    },
    async close() {},
  };
  return { request, repository, provider, schedule, references };
}
