/** All IDs are local to publicationId, never cross-publication identities. */
export interface RoutingStop {
  readonly id: string;
  /** Required policy input; applies before every boarding after the first. */
  readonly changeSeconds: number;
}

/** 0 regular, 1 prohibited, 2 phone agency, 3 coordinate with driver. */
export type StopPermission = 0 | 1 | 2 | 3;

export interface StopEvent {
  readonly stopId: string;
  /** Original ordered sequence, not necessarily consecutive. */
  readonly sequence: number;
  /** Integer service-day seconds; may exceed 86400. Null is not interpolated. */
  readonly arrival: number | null;
  readonly departure: number | null;
  readonly pickup: StopPermission;
  readonly dropOff: StopPermission;
}

export interface ScheduledTrip {
  readonly id: string;
  readonly routeId: string;
  readonly serviceId: string;
  readonly events: readonly StopEvent[];
}

/** Explicit directed link between transit stops, usable only between rides. */
export interface TransferLink {
  readonly id: string;
  readonly fromStopId: string;
  readonly toStopId: string;
  readonly durationSeconds: number;
}

export interface ScheduleInput {
  readonly publicationId: string;
  readonly serviceDate: string;
  readonly activeServiceIds: readonly string[];
  readonly stops: readonly RoutingStop[];
  readonly trips: readonly ScheduledTrip[];
  readonly transfers?: readonly TransferLink[];
}

export interface RoutePattern {
  /** Deterministic within this service-date view, not a persisted global ID. */
  readonly id: string;
  readonly routeId: string;
  readonly stopIds: readonly string[];
  readonly tripIndexes: readonly number[];
}

/** Construct with buildSchedule; all nested data is copied and frozen. */
export interface RoutingSchedule {
  readonly publicationId: string;
  readonly serviceDate: string;
  readonly activeServiceIds: readonly string[];
  readonly stops: readonly RoutingStop[];
  readonly trips: readonly ScheduledTrip[];
  readonly patterns: readonly RoutePattern[];
  readonly transfers: readonly TransferLink[];
  readonly eventCount: number;
}

export interface RoutingRequest {
  readonly serviceDate: string;
  readonly originStopId: string;
  readonly destinationStopId: string;
  readonly departureTime: number;
  /** Zero means direct transit only; the default is DEFAULT_MAX_TRANSFERS. */
  readonly maxTransfers?: number;
}

export interface TransitLeg {
  readonly kind: 'transit';
  readonly tripId: string;
  readonly routeId: string;
  readonly patternId: string;
  readonly boardingStopId: string;
  readonly boardingOccurrence: number;
  readonly boardingSequence: number;
  readonly departureTime: number;
  readonly alightingStopId: string;
  readonly alightingOccurrence: number;
  readonly alightingSequence: number;
  readonly arrivalTime: number;
}

export interface TransferLeg {
  readonly kind: 'transfer';
  readonly transferId: string;
  readonly fromStopId: string;
  readonly toStopId: string;
  readonly departureTime: number;
  readonly arrivalTime: number;
}

export type JourneyLeg = TransitLeg | TransferLeg;

export interface Journey {
  readonly publicationId: string;
  readonly serviceDate: string;
  readonly originStopId: string;
  readonly destinationStopId: string;
  readonly requestedDepartureTime: number;
  readonly arrivalTime: number;
  /** Includes initial waiting and all connection waiting. */
  readonly durationSeconds: number;
  readonly boardingCount: number;
  readonly transferCount: number;
  readonly legs: readonly JourneyLeg[];
}

export type RoutingResult =
  | { readonly status: 'ok'; readonly journeys: readonly Journey[] }
  | {
      readonly status: 'no-journey';
      readonly reason:
        | 'service-date-not-loaded'
        | 'unknown-stop'
        | 'no-service'
        | 'unreachable';
    };
