import type { Coordinate } from '@dallas-transit/router';

export type Freshness =
  'LIVE' | 'AGING' | 'STALE' | 'SCHEDULED_FALLBACK' | 'UNAVAILABLE';
export interface TripIdentity {
  tripId: string;
  routeId: string | null;
  date: string | null;
  startTime: number | null;
  relationship: number;
}
export interface EventPrediction {
  time: number | null;
  delay: number | null;
  uncertainty: number | null;
}
export interface StopUpdate {
  stopId: string | null;
  sequence: number | null;
  relationship: number;
  arrival: EventPrediction | null;
  departure: EventPrediction | null;
}
export interface TripUpdate {
  identity: TripIdentity;
  timestamp: number | null;
  stops: StopUpdate[];
}
export interface Vehicle {
  identity: TripIdentity;
  timestamp: number | null;
  vehicleId: string | null;
  coordinate: Coordinate | null;
  sequence: number | null;
  stopId: string | null;
  status: 'INCOMING' | 'STOPPED' | 'IN_TRANSIT';
}
export interface AlertSelector {
  agencyId: string | null;
  routeId: string | null;
  stopId: string | null;
  trip: TripIdentity | null;
}
export interface ServiceAlert {
  id: string;
  title: string;
  description: string;
  periods: { start: number | null; end: number | null }[];
  selectors: AlertSelector[];
}
export interface Snapshot {
  publicationId: string;
  sourceTimestamp: number | null;
  receivedAt: number;
  trips: TripUpdate[];
  vehicles: Vehicle[];
  alerts: ServiceAlert[];
  diagnostics: Record<string, number>;
  metrics: { parseMs: number; normalizeMs: number };
}
export interface LiveLeg {
  legIndex: number;
  freshness: Freshness;
  updatedAt: number | null;
  departureTime: number | null;
  arrivalTime: number | null;
  departureDelay: number | null;
  cancelled: boolean;
  boardingSkipped: boolean;
  alightingSkipped: boolean;
  vehicle: (Vehicle & { freshness: Freshness }) | null;
  stopsRemaining: number | null;
  boarding: 'UPCOMING' | 'DEPARTED' | 'UNKNOWN';
}
export interface TransferRisk {
  inboundLeg: number;
  outboundLeg: number;
  status: 'FEASIBLE' | 'AT_RISK' | 'INFEASIBLE' | 'UNKNOWN';
  requiredSeconds: number;
  remainingSeconds: number | null;
  reason: string;
}
export interface LiveJourney {
  publicationId: string;
  serviceDate: string;
  checkedAt: number;
  validUntil: number;
  freshness: Freshness;
  legs: LiveLeg[];
  transfers: TransferRisk[];
  alerts: { id: string; title: string; description: string }[];
  replan: { suggested: boolean; reasons: string[] };
}
