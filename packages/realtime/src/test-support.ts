import {
  buildSchedule,
  route,
  type GeographicJourney,
} from '@dallas-transit/router';
import { serviceAnchor } from './freshness.js';
import { encodeFixture, parseFeed } from './parse.js';

export const date = '2026-09-18';
export const anchor = serviceAnchor(date, 'America/Chicago');
export const now = anchor + 28000;
export const publicationId = '11111111-1111-4111-8111-111111111111';
export const schedule = buildSchedule({
  publicationId,
  serviceDate: date,
  activeServiceIds: ['day'],
  stops: ['A', 'B', 'C', 'D'].map((id) => ({ id, changeSeconds: 120 })),
  trips: [
    {
      id: 'first',
      routeId: 'bus',
      serviceId: 'day',
      events: [
        ['A', 28800],
        ['B', 29400],
      ].map(([s, t], i) => ({
        stopId: String(s),
        sequence: (i + 1) * 10,
        arrival: Number(t),
        departure: Number(t),
        pickup: 0,
        dropOff: 0,
      })),
    },
    {
      id: 'second',
      routeId: 'rail',
      serviceId: 'day',
      events: [
        ['B', 29700],
        ['D', 30300],
      ].map(([s, t], i) => ({
        stopId: String(s),
        sequence: (i + 1) * 10,
        arrival: Number(t),
        departure: Number(t),
        pickup: 0,
        dropOff: 0,
      })),
    },
    {
      id: 'loop',
      routeId: 'loop',
      serviceId: 'day',
      events: [
        ['A', 28800],
        ['B', 29400],
        ['A', 30000],
        ['D', 30600],
      ].map(([s, t], i) => ({
        stopId: String(s),
        sequence: (i + 1) * 10,
        arrival: Number(t),
        departure: Number(t),
        pickup: 0,
        dropOff: 0,
      })),
    },
  ],
});
const routed = route(schedule, {
  serviceDate: date,
  originStopId: 'A',
  destinationStopId: 'D',
  departureTime: 28000,
});
if (routed.status !== 'ok') throw new Error('fixture route missing');
const base = routed.journeys.find((j) =>
  j.legs.some((l) => l.kind === 'transit' && l.tripId === 'first'),
)!;
export const journey: GeographicJourney = {
  ...base,
  origin: { latitude: 32, longitude: -96 },
  destination: { latitude: 32.01, longitude: -96 },
  accessStopId: 'A',
  egressStopId: 'D',
  walkingDistanceMeters: 0,
  walkingDurationSeconds: 0,
  interchangeDurationSeconds: 0,
};
export const descriptor = (tripId = 'first') => ({
  tripId,
  startDate: '20260918',
});
export const tripEntity = (delay = 0, tripId = 'first') => ({
  id: tripId,
  tripUpdate: {
    trip: descriptor(tripId),
    timestamp: now,
    stopTimeUpdate: (tripId === 'first' ? ['A', 'B'] : ['B', 'D']).map(
      (stopId, i) => ({
        stopId,
        stopSequence: (i + 1) * 10,
        arrival: { delay },
        departure: { delay },
      }),
    ),
  },
});
export const vehicleEntity = () => ({
  id: 'vehicle',
  vehicle: {
    trip: descriptor(),
    timestamp: now,
    currentStopSequence: 20,
    stopId: 'B',
    currentStatus: 2,
    position: { latitude: 32, longitude: -96 },
    vehicle: { id: 'v1' },
  },
});
export const wire = (
  entities: object[] = [tripEntity(), tripEntity(0, 'second')],
  timestamp: number | undefined = now,
) =>
  encodeFixture({
    header: {
      gtfsRealtimeVersion: '2.0',
      ...(timestamp === undefined ? {} : { timestamp }),
    },
    entity: entities,
  });
export const snapshot = (entities?: object[], timestamp = now) =>
  parseFeed(wire(entities, timestamp), publicationId, now);
