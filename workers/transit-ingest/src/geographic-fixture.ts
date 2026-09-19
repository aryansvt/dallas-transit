import {
  buildSchedule,
  sameCoordinate,
  type Coordinate,
  type GeographicRequest,
  type WalkingRoute,
} from '@dallas-transit/router';
import type { CandidateSource, NearbyStop } from './nearby-stops.js';
import { fixtureWalkingProvider } from './walking-provider.js';

/** Entirely artificial network. Distances below are fixture inputs, not a map. */
export function geographicFixture() {
  const publicationId = 'geographic-fixture-v1';
  const origin = { latitude: 32, longitude: -96 };
  const destination = { latitude: 32.01, longitude: -96 };
  const request: GeographicRequest = {
    origin,
    destination,
    serviceDate: '2026-09-18',
    departureTime: 28800,
  };
  const stop = (
    stopId: string,
    coordinate: Coordinate,
    candidateDistanceMeters: number,
  ): NearbyStop => ({
    publicationId,
    stopId,
    name: stopId,
    coordinate,
    candidateDistanceMeters,
  });
  const access = [
    stop('A', { latitude: 32.0001, longitude: -96 }, 10),
    stop('X', { latitude: 32.0002, longitude: -96 }, 20),
    stop('B', { latitude: 32.001, longitude: -96 }, 110),
  ];
  const egress = [
    stop('C', { latitude: 32.0101, longitude: -96 }, 10),
    stop('D', { latitude: 32.011, longitude: -96 }, 110),
  ];
  const schedule = buildSchedule({
    publicationId,
    serviceDate: request.serviceDate,
    activeServiceIds: ['day'],
    stops: [...access, ...egress].map((s) => ({
      id: s.stopId,
      changeSeconds: 120,
    })),
    trips: [
      {
        id: 'missed',
        routeId: 'a',
        serviceId: 'day',
        events: [
          ['A', 29040],
          ['C', 29400],
        ].map(([id, t], i) => ({
          stopId: String(id),
          sequence: i + 1,
          arrival: Number(t),
          departure: Number(t),
          pickup: 0,
          dropOff: 0,
        })),
      },
      {
        id: 'later',
        routeId: 'a',
        serviceId: 'day',
        events: [
          ['A', 29520],
          ['C', 30600],
        ].map(([id, t], i) => ({
          stopId: String(id),
          sequence: i + 1,
          arrival: Number(t),
          departure: Number(t),
          pickup: 0,
          dropOff: 0,
        })),
      },
      {
        id: 'farther-faster',
        routeId: 'b',
        serviceId: 'day',
        events: [
          ['B', 29160],
          ['C', 29700],
          ['D', 29940],
        ].map(([id, t], i) => ({
          stopId: String(id),
          sequence: i + 1,
          arrival: Number(t),
          departure: Number(t),
          pickup: 0,
          dropOff: 0,
        })),
      },
    ],
  });
  const routes: WalkingRoute[] = [
    {
      origin,
      destination: access[0]!.coordinate,
      durationSeconds: 600,
      distanceMeters: 700,
    },
    {
      origin,
      destination: access[2]!.coordinate,
      durationSeconds: 180,
      distanceMeters: 220,
    },
    {
      origin: egress[0]!.coordinate,
      destination,
      durationSeconds: 600,
      distanceMeters: 700,
    },
    {
      origin: egress[1]!.coordinate,
      destination,
      durationSeconds: 60,
      distanceMeters: 80,
    },
  ];
  const candidates: CandidateSource = {
    async find(query, policy, expected) {
      if (query.serviceDate !== request.serviceDate)
        return { status: 'unavailable', reason: 'no-publication' };
      if (expected !== publicationId)
        return { status: 'unavailable', reason: 'publication-changed' };
      return {
        status: 'ok',
        publicationId,
        access: sameCoordinate(query.origin, origin)
          ? access
              .filter((s) => s.candidateDistanceMeters <= policy.radiusMeters)
              .slice(0, policy.maxAccessCandidates)
          : [],
        egress: sameCoordinate(query.destination, destination)
          ? egress
              .filter((s) => s.candidateDistanceMeters <= policy.radiusMeters)
              .slice(0, policy.maxEgressCandidates)
          : [],
        originLookupMs: 0,
        destinationLookupMs: 0,
      };
    },
  };
  return {
    schedule,
    request,
    candidates,
    routes,
    provider: fixtureWalkingProvider(routes),
    access,
    egress,
  };
}
