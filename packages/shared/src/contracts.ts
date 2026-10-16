import type {
  Coordinate,
  DepartureInsight,
  GeographicJourney,
  GeographicRequest,
} from '@dallas-transit/router';

// Wire contracts only. Importing these types never imports the router into the browser.
export type {
  Coordinate,
  DepartureInsight,
  GeographicJourney,
  GeographicRequest,
};
export type { TransitLeg } from '@dallas-transit/router';
export interface StopDetails {
  stopId: string;
  name: string;
  coordinate: Coordinate;
  code: string | null;
  platformCode: string | null;
  parentStationId: string | null;
}
export interface RouteDetails {
  routeId: string;
  shortName: string | null;
  longName: string | null;
  type: number;
  color: string | null;
  textColor: string | null;
  agencyTimezone: string;
}
export interface TripDetails {
  tripId: string;
  headsign: string | null;
  directionId: number | null;
}
export interface References {
  stops: StopDetails[];
  routes: RouteDetails[];
  trips: TripDetails[];
}
/** Depart-at echoes the requested departure; arrive-by echoes the deadline. */
export type JourneyContext = {
  publicationId: string;
  serviceDate: string;
  origin: Coordinate;
  destination: Coordinate;
} & (
  | { requestedDepartureTime: number }
  | { requestedArrivalTime: number; arrivalBufferMinutes: number }
);
export type NoJourneyReason =
  | 'no-nearby-access-stops'
  | 'no-nearby-egress-stops'
  | 'no-reachable-access-stops'
  | 'no-reachable-egress-stops'
  | 'transit-unreachable';
export type ReplanResponse =
  | { status: 'cooldown'; retryAfterSeconds: number }
  | { status: 'ok'; reason: string; result: JourneyResponse };
export type JourneyResponse = JourneyContext &
  (
    | {
        status: 'ok';
        incomplete: boolean;
        journeys: readonly GeographicJourney[];
        references: References;
        liveJourneyIds?: readonly string[];
        /** Depart-at only: a secondary hint, never a replacement journey. */
        departureInsight?: DepartureInsight;
      }
    | {
        status: 'no-journey';
        incomplete: false;
        journeys: readonly [];
        reason: NoJourneyReason;
      }
  );
