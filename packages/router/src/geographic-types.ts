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

export interface GeographicRequest {
  readonly origin: Coordinate;
  readonly destination: Coordinate;
  readonly serviceDate: string;
  /** Integer seconds from the service-day start, never modulo 86400. */
  readonly departureTime: number;
  readonly maxTransfers?: number;
}

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

export type GeographicCompositionResult =
  | {
      readonly status: 'ok';
      readonly journeys: readonly GeographicJourney[];
      readonly transitSearches: number;
    }
  | {
      readonly status: 'no-journey';
      readonly reason:
        | 'service-date-not-loaded'
        | 'no-reachable-access-stops'
        | 'no-reachable-egress-stops'
        | 'transit-unreachable';
      readonly transitSearches: number;
    };
