import { route } from './route.js';
import { compareIds, integer } from './validation.js';
import {
  geographicPolicy,
  sameCoordinate,
  validateGeographicRequest,
  validateCoordinate,
  validateWalkingRoute,
} from './geographic-validation.js';
import type {
  GeographicCompositionResult,
  GeographicJourney,
  GeographicPolicy,
  GeographicRequest,
  WalkingCandidate,
} from './geographic-types.js';
import type { RoutingSchedule } from './types.js';

/** Pure composition: walking routes have already been obtained and validated.
 * Separate pair queries keep each pair's walking cost constant under M3 dominance.
 * Never merge access labels before transit search: later access can mean less walk.
 */
export function composeGeographicJourneys(
  schedule: RoutingSchedule,
  request: GeographicRequest,
  access: readonly WalkingCandidate[],
  egress: readonly WalkingCandidate[],
  overrides: Partial<GeographicPolicy> = {},
): GeographicCompositionResult {
  validateGeographicRequest(request);
  const policy = geographicPolicy(overrides);
  if (
    access.length > policy.maxAccessCandidates ||
    egress.length > policy.maxEgressCandidates
  )
    throw new Error('Walking candidates exceed configured limits');
  const stopIds = new Set(schedule.stops.map((stop) => stop.id));
  for (const [phase, candidates] of [
    ['access', access],
    ['egress', egress],
  ] as const) {
    const seen = new Set<string>();
    for (const candidate of candidates) {
      if (
        candidate.publicationId !== schedule.publicationId ||
        !stopIds.has(candidate.stopId)
      )
        throw new Error(
          'Walking candidate does not belong to the loaded publication',
        );
      if (seen.has(candidate.stopId))
        throw new Error('Duplicate walking candidate');
      seen.add(candidate.stopId);
      validateCoordinate(candidate.coordinate);
      validateWalkingRoute(candidate.walk);
      const origin = phase === 'access' ? request.origin : candidate.coordinate;
      const destination =
        phase === 'access' ? candidate.coordinate : request.destination;
      if (
        !sameCoordinate(candidate.walk.origin, origin) ||
        !sameCoordinate(candidate.walk.destination, destination)
      )
        throw new Error(
          'Walking candidate endpoints do not match request/stop',
        );
      if (phase === 'access')
        integer(
          Math.ceil(request.departureTime + candidate.walk.durationSeconds),
          'access arrival',
        );
    }
  }
  const none = (
    reason: Extract<
      GeographicCompositionResult,
      { status: 'no-journey' }
    >['reason'],
    transitSearches = 0,
  ): GeographicCompositionResult => ({
    status: 'no-journey',
    reason,
    transitSearches,
  });
  if (schedule.serviceDate !== request.serviceDate)
    return none('service-date-not-loaded');
  if (!access.length) return none('no-reachable-access-stops');
  if (!egress.length) return none('no-reachable-egress-stops');
  let transitSearches = 0;
  const composed: GeographicJourney[] = [];
  for (const a of access)
    for (const e of egress) {
      // M3 same-stop queries return zero legs. Walking-only alternatives are deferred.
      if (a.stopId === e.stopId) continue;
      transitSearches++;
      const result = route(schedule, {
        serviceDate: request.serviceDate,
        originStopId: a.stopId,
        destinationStopId: e.stopId,
        departureTime: Math.ceil(
          request.departureTime + a.walk.durationSeconds,
        ),
        ...(request.maxTransfers === undefined
          ? {}
          : { maxTransfers: request.maxTransfers }),
      });
      if (result.status !== 'ok') continue;
      for (const transit of result.journeys) {
        const arrivalTime = transit.arrivalTime + e.walk.durationSeconds;
        if (!Number.isSafeInteger(Math.ceil(arrivalTime)))
          throw new Error('Journey time overflow');
        composed.push({
          publicationId: schedule.publicationId,
          serviceDate: schedule.serviceDate,
          origin: request.origin,
          destination: request.destination,
          accessStopId: a.stopId,
          egressStopId: e.stopId,
          requestedDepartureTime: request.departureTime,
          arrivalTime,
          durationSeconds: arrivalTime - request.departureTime,
          boardingCount: transit.boardingCount,
          transferCount: transit.transferCount,
          walkingDurationSeconds:
            a.walk.durationSeconds + e.walk.durationSeconds,
          walkingDistanceMeters: a.walk.distanceMeters + e.walk.distanceMeters,
          interchangeDurationSeconds: transit.legs.reduce(
            (sum, leg) =>
              sum +
              (leg.kind === 'transfer'
                ? leg.arrivalTime - leg.departureTime
                : 0),
            0,
          ),
          legs: [
            {
              ...a.walk,
              kind: 'walk',
              phase: 'access',
              stopId: a.stopId,
              departureTime: request.departureTime,
              arrivalTime: request.departureTime + a.walk.durationSeconds,
            },
            ...transit.legs,
            {
              ...e.walk,
              kind: 'walk',
              phase: 'egress',
              stopId: e.stopId,
              departureTime: transit.arrivalTime,
              arrivalTime,
            },
          ],
        });
      }
    }
  // Pareto filtering retains a later arrival if it saves transfers or walking.
  // The walking criterion is duration only; distance is reported, not scored.
  const dominates = (a: GeographicJourney, b: GeographicJourney) =>
    a.arrivalTime <= b.arrivalTime &&
    a.transferCount <= b.transferCount &&
    a.walkingDurationSeconds <= b.walkingDurationSeconds &&
    (a.arrivalTime < b.arrivalTime ||
      a.transferCount < b.transferCount ||
      a.walkingDurationSeconds < b.walkingDurationSeconds);
  const key = (j: GeographicJourney) =>
    JSON.stringify([j.accessStopId, j.egressStopId, j.legs]);
  composed.sort(
    (a, b) =>
      a.arrivalTime - b.arrivalTime ||
      a.transferCount - b.transferCount ||
      a.walkingDurationSeconds - b.walkingDurationSeconds ||
      compareIds(key(a), key(b)),
  );
  const seen = new Set<string>();
  const journeys = composed
    .filter((j) => {
      if (composed.some((other) => dominates(other, j))) return false;
      // One canonical representative for equivalent ranking metrics.
      const metrics = JSON.stringify([
        j.arrivalTime,
        j.transferCount,
        j.walkingDurationSeconds,
      ]);
      if (seen.has(metrics)) return false;
      seen.add(metrics);
      return true;
    })
    .slice(0, policy.maxJourneys);
  return journeys.length
    ? { status: 'ok', journeys, transitSearches }
    : none('transit-unreachable', transitSearches);
}
