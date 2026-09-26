import { routeToStops } from './route.js';
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
 * Each access candidate has an independent search shared across egress targets.
 * Never merge access labels before transit search: later access can mean less walk.
 */
export function composeGeographicJourneys(
  schedule: RoutingSchedule,
  request: GeographicRequest,
  access: readonly WalkingCandidate[],
  egress: readonly WalkingCandidate[],
  overrides: Partial<GeographicPolicy> = {},
  explain?: (
    journey: GeographicJourney,
    decision: 'dominated' | 'same-rides' | 'limit' | 'retained',
  ) => void,
  checkpoint?: (completedAccessSearches: number) => void,
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
  let completedAccessSearches = 0;
  for (const a of access) {
    const targets = egress.filter((e) => e.stopId !== a.stopId);
    const results = routeToStops(
      schedule,
      {
        serviceDate: request.serviceDate,
        originStopId: a.stopId,
        departureTime: Math.ceil(
          request.departureTime + a.walk.durationSeconds,
        ),
        ...(request.maxTransfers === undefined
          ? {}
          : { maxTransfers: request.maxTransfers }),
      },
      targets.map((e) => e.stopId),
    );
    for (const e of targets) {
      transitSearches++; // logical pairs; timetable scanning is shared per access
      const result = results.get(e.stopId)!;
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
            a.walk.durationSeconds +
            transit.walkingDurationSeconds +
            e.walk.durationSeconds,
          walkingDistanceMeters:
            a.walk.distanceMeters +
            transit.walkingDistanceMeters +
            e.walk.distanceMeters,
          scheduledTransferRisk: transit.scheduledTransferRisk,
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
    checkpoint?.(++completedAccessSearches);
  }
  // Pareto filtering retains a later arrival if it saves transfers or walking.
  // The walking criterion is duration only; distance is reported, not scored.
  const dominates = (a: GeographicJourney, b: GeographicJourney) =>
    a.arrivalTime <= b.arrivalTime &&
    a.transferCount <= b.transferCount &&
    a.walkingDurationSeconds <= b.walkingDurationSeconds &&
    (a.scheduledTransferRisk ?? 0) <= (b.scheduledTransferRisk ?? 0) &&
    (a.arrivalTime < b.arrivalTime ||
      a.transferCount < b.transferCount ||
      a.walkingDurationSeconds < b.walkingDurationSeconds ||
      (a.scheduledTransferRisk ?? 0) < (b.scheduledTransferRisk ?? 0));
  const key = (j: GeographicJourney) =>
    JSON.stringify([j.accessStopId, j.egressStopId, j.legs]);
  composed.sort(
    (a, b) =>
      a.arrivalTime - b.arrivalTime ||
      a.transferCount - b.transferCount ||
      a.walkingDurationSeconds - b.walkingDurationSeconds ||
      (a.scheduledTransferRisk ?? 0) - (b.scheduledTransferRisk ?? 0) ||
      compareIds(key(a), key(b)),
  );
  // Endpoint variants of the same actual rides are one rider journey. Different
  // services remain distinct even when their aggregate objectives are identical.
  const identity = (j: GeographicJourney) =>
    JSON.stringify(
      j.legs.filter((l) => l.kind === 'transit').map((l) => l.tripId),
    );
  const seen = new Set<string>();
  const frontier = composed.filter((j) => {
    if (composed.some((other) => dominates(other, j))) {
      explain?.(j, 'dominated');
      return false;
    }
    const id = identity(j);
    if (seen.has(id)) {
      explain?.(j, 'same-rides');
      return false;
    }
    seen.add(id);
    return true;
  });
  // Preserve the fastest, then useful transfer/walking extremes before filling.
  // Sorting the selected subset restores the locked rider-facing order.
  const selected = new Set<GeographicJourney>();
  if (frontier[0]) selected.add(frontier[0]);
  for (const metric of ['transferCount', 'walkingDurationSeconds'] as const) {
    if (selected.size >= policy.maxJourneys || !frontier.length) break;
    const candidate = [...frontier].sort(
      (a, b) =>
        a[metric] - b[metric] || frontier.indexOf(a) - frontier.indexOf(b),
    )[0]!;
    selected.add(candidate);
  }
  for (const j of frontier) {
    if (selected.size >= policy.maxJourneys) break;
    selected.add(j);
  }
  const journeys = frontier.filter((j) => {
    explain?.(j, selected.has(j) ? 'retained' : 'limit');
    return selected.has(j);
  });
  return journeys.length
    ? { status: 'ok', journeys, transitSearches }
    : none('transit-unreachable', transitSearches);
}
