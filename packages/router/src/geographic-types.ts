import type { JourneyLeg } from './types.js';

export interface Coordinate {
  readonly latitude: number;
  readonly longitude: number;
}

/** Provider-reported pedestrian route. No straight-line estimates belong here. */
export interface WalkingRoute {
  readonly origin: Coordinate;
  readonly destination: Coordinate;
  readonly durationSeconds: number;
  readonly distanceMeters: number;
}

export interface WalkingCandidate {
  readonly publicationId: string;
  readonly stopId: string;
  readonly coordinate: Coordinate;
  readonly walk: WalkingRoute;
}

interface GeographicRequestBase {
  readonly origin: Coordinate;
  readonly destination: Coordinate;
  readonly serviceDate: string;
  readonly maxTransfers?: number;
}

export interface DepartAtRequest extends GeographicRequestBase {
  /** Integer seconds from the service-day start, never modulo 86400. */
  readonly departureTime: number;
  /** Departure-time insight never suggests leaving before this. The journeys
   * themselves ignore it. */
  readonly earliestDepartureTime?: number;
}

export interface ArriveByRequest extends GeographicRequestBase {
  /** Latest acceptable arrival, service-day seconds like departureTime. */
  readonly arrivalTime: number;
  /** Arrive at least this early; the deadline is arrivalTime minus this. */
  readonly arrivalBufferSeconds?: number;
}

export type GeographicRequest = DepartAtRequest | ArriveByRequest;

export interface GeographicPolicy {
  readonly radiusMeters: number;
  /** Separate station envelope; only active rail/station service may use it. */
  readonly stationRadiusMeters?: number;
  readonly shortlistLimit?: number;
  readonly maxWalkingDurationSeconds?: number;
  readonly maxWalkingDistanceMeters?: number;
  readonly maxAccessCandidates: number;
  readonly maxEgressCandidates: number;
  readonly maxProviderCalls: number;
  readonly providerConcurrency: number;
  readonly providerTimeoutMs: number;
  readonly maxTransitSearches: number;
  readonly maxJourneys: number;
  /** Arrive-by alternatives leave at most this long before the latest option. */
  readonly arriveByWindowSeconds?: number;
  /** Arrive-by departure instants scanned per access stop. */
  readonly maxWindowDepartures?: number;
}

export interface WalkingLeg extends WalkingRoute {
  readonly kind: 'walk';
  readonly phase: 'access' | 'egress';
  readonly stopId: string;
  readonly departureTime: number;
  readonly arrivalTime: number;
}

export interface GeographicJourney {
  readonly publicationId: string;
  readonly serviceDate: string;
  readonly origin: Coordinate;
  readonly destination: Coordinate;
  readonly accessStopId: string;
  readonly egressStopId: string;
  readonly requestedDepartureTime: number;
  readonly arrivalTime: number;
  readonly durationSeconds: number;
  readonly boardingCount: number;
  readonly transferCount: number;
  /** Access + validated pedestrian interchanges + egress. */
  readonly walkingDurationSeconds: number;
  readonly walkingDistanceMeters: number;
  /** Supplied M3 interchange links have duration but no pedestrian distance. */
  readonly interchangeDurationSeconds: number;
  /** Scheduled slack shortfall, not a probability or live confidence. */
  readonly scheduledTransferRisk?: number;
  readonly legs: readonly (WalkingLeg | JourneyLeg)[];
}

/** A secondary hint beside depart-at journeys; it never replaces them. */
export interface DepartureInsight {
  readonly kind: 'leave-earlier' | 'no-rush';
  /** Suggested leave time, service-day seconds, boarding margin included. */
  readonly departureTime: number;
  /** Arrival when leaving then, minus the first journey's; negative is sooner. */
  readonly arrivalChangeSeconds: number;
}

export type GeographicCompositionResult =
  | {
      readonly status: 'ok';
      readonly journeys: readonly GeographicJourney[];
      readonly transitSearches: number;
      /** Arrive-by only: forward runs across all access stops. */
      readonly windowDepartures?: number;
    }
  | {
      readonly status: 'no-journey';
      readonly reason:
        | 'service-date-not-loaded'
        | 'no-reachable-access-stops'
        | 'no-reachable-egress-stops'
        | 'transit-unreachable';
      readonly transitSearches: number;
      readonly windowDepartures?: number;
    };
