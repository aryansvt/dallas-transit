import { scheduleIndexes } from './schedule.js';
import type {
  Journey,
  JourneyLeg,
  RoutingRequest,
  RoutingResult,
  RoutingSchedule,
  WindowRequest,
} from './types.js';
import { integer, serviceDate } from './validation.js';

/** Four rides is a bounded local-journey default; callers may explicitly raise it. */
export const DEFAULT_MAX_TRANSFERS = 3;

interface Label {
  readonly time: number;
  readonly previous: Label | null;
  readonly leg: JourneyLeg | null;
  readonly walking: number;
  readonly distance: number;
  readonly risk: number;
  readonly boardings: number;
  readonly linkState: 'none' | 'legacy' | 'pedestrian';
  readonly identity: string;
}

/** routeWindow refuses larger sets: every departure is a full round loop. */
export const MAX_WINDOW_DEPARTURES = 64;

/** Without a requested departure, a window journey departs at its first boarding. */
function reconstruct(
  schedule: RoutingSchedule,
  originStopId: string,
  destinationStopId: string,
  label: Label,
  requested?: number,
): Journey {
  const legs: JourneyLeg[] = [];
  for (
    let cursor: Label | null = label;
    cursor !== null;
    cursor = cursor.previous
  )
    if (cursor.leg)
      // a later boarding keeps the risk it added; the first adds none
      legs.push(
        cursor.leg.kind === 'transit' && cursor.boardings > 1
          ? {
              ...cursor.leg,
              scheduledTransferRisk: cursor.risk - cursor.previous!.risk,
            }
          : cursor.leg,
      );
  legs.reverse();
  const departure = requested ?? legs[0]?.departureTime ?? label.time;
  const boardings = label.boardings;
  return {
    publicationId: schedule.publicationId,
    serviceDate: schedule.serviceDate,
    originStopId,
    destinationStopId,
    requestedDepartureTime: departure,
    arrivalTime: label.time,
    durationSeconds: label.time - departure,
    boardingCount: boardings,
    transferCount: Math.max(0, boardings - 1),
    walkingDurationSeconds: label.walking,
    walkingDistanceMeters: label.distance,
    scheduledTransferRisk: label.risk,
    legs,
  };
}

/** Five minutes of spare time is a policy threshold, not predicted reliability. */
export const SCHEDULED_SLACK_SECONDS = 300;
const dominates = (a: Label, b: Label) =>
  a.time <= b.time &&
  a.walking <= b.walking &&
  a.risk <= b.risk &&
  a.boardings <= b.boardings;
const profileDominates = (a: Journey, b: Journey) =>
  a.requestedDepartureTime >= b.requestedDepartureTime &&
  a.arrivalTime <= b.arrivalTime &&
  a.boardingCount <= b.boardingCount &&
  a.walkingDurationSeconds <= b.walkingDurationSeconds &&
  a.scheduledTransferRisk <= b.scheduledTransferRisk &&
  (a.requestedDepartureTime > b.requestedDepartureTime ||
    a.arrivalTime < b.arrivalTime ||
    a.boardingCount < b.boardingCount ||
    a.walkingDurationSeconds < b.walkingDurationSeconds ||
    a.scheduledTransferRisk < b.scheduledTransferRisk);
const equivalent = (a: Label, b: Label) =>
  a.time === b.time &&
  a.walking === b.walking &&
  a.risk === b.risk &&
  a.boardings === b.boardings;

/** Round-based multicriteria search. Pruning compares every monotone objective;
 * earlier arrival alone cannot discard a less-walking or safer predecessor.
 * Equal states have identical future eligibility. Keep up to three distinct ride
 * signatures at each equal state for alternatives; this never changes objectives.
 */
export function route(
  schedule: RoutingSchedule,
  request: RoutingRequest,
): RoutingResult {
  return routeToStops(schedule, request, [request.destinationStopId]).get(
    request.destinationStopId,
  )!;
}

/** Share one scan across egress stops for the same access state. A destination
 * bound may prune only when EVERY target already dominates the continuation. */
export function routeToStops(
  schedule: RoutingSchedule,
  request: Omit<RoutingRequest, 'destinationStopId'>,
  destinationStopIds: readonly string[],
): ReadonlyMap<string, RoutingResult> {
  integer(request.departureTime, 'departureTime');
  return search(
    schedule,
    request,
    destinationStopIds,
    [request.departureTime],
    Infinity,
    false,
  );
}

/** Range RAPTOR over the given departure instants, latest first. Label bags
 * persist between runs: a label found from a later departure stays reachable
 * from an earlier one (the rider can wait), so an earlier run keeps only what
 * beats every later departure. Each run's new destination labels join the
 * profile; journeys depart at their first boarding, latest first.
 */
export function routeWindow(
  schedule: RoutingSchedule,
  request: WindowRequest,
  destinationStopIds: readonly string[],
): ReadonlyMap<string, RoutingResult> {
  const count = request.departureTimes.length;
  if (count < 1 || count > MAX_WINDOW_DEPARTURES)
    throw new RangeError(
      `departureTimes needs 1 to ${MAX_WINDOW_DEPARTURES} instants`,
    );
  for (const time of request.departureTimes) integer(time, 'departureTime');
  const deadline = request.arrivalDeadline ?? Infinity;
  if (
    request.arrivalDeadline !== undefined &&
    !(Number.isFinite(deadline) && deadline >= 0)
  )
    throw new RangeError('arrivalDeadline must be finite and nonnegative');
  const departures = [...new Set(request.departureTimes)]
    .filter((time) => time <= deadline)
    .sort((a, b) => b - a);
  return search(
    schedule,
    request,
    destinationStopIds,
    departures,
    deadline,
    true,
  );
}

function search(
  schedule: RoutingSchedule,
  request: Pick<
    RoutingRequest,
    'serviceDate' | 'originStopId' | 'maxTransfers'
  >,
  destinationStopIds: readonly string[],
  departures: readonly number[],
  deadline: number,
  profile: boolean,
): ReadonlyMap<string, RoutingResult> {
  serviceDate(request.serviceDate);
  const maxTransfers = request.maxTransfers ?? DEFAULT_MAX_TRANSFERS;
  integer(maxTransfers, 'maxTransfers', Number.MAX_SAFE_INTEGER - 1);
  const results = new Map<string, RoutingResult>();
  const index = scheduleIndexes(schedule),
    origin = index.stopIndex.get(request.originStopId);
  const start = (time: number): Label => ({
    time,
    previous: null,
    leg: null,
    walking: 0,
    distance: 0,
    risk: 0,
    boardings: 0,
    linkState: 'none',
    identity: '',
  });
  // depart-at journeys keep the requested time; window journeys their boarding
  const requested = profile ? undefined : departures[0];
  const destinations = new Map<number, Label[]>();
  const found = new Map<number, Label[]>();
  const ids = new Map<number, string>();
  for (const id of destinationStopIds) {
    const destination = index.stopIndex.get(id);
    if (request.serviceDate !== schedule.serviceDate)
      results.set(id, {
        status: 'no-journey',
        reason: 'service-date-not-loaded',
      });
    else if (origin === undefined || destination === undefined)
      results.set(id, { status: 'no-journey', reason: 'unknown-stop' });
    else if (origin === destination)
      results.set(
        id,
        departures[0] === undefined
          ? { status: 'no-journey', reason: 'unreachable' }
          : {
              status: 'ok',
              journeys: [
                reconstruct(
                  schedule,
                  request.originStopId,
                  id,
                  start(departures[0]),
                  requested,
                ),
              ],
            },
      );
    else if (!schedule.trips.length)
      results.set(id, { status: 'no-journey', reason: 'no-service' });
    else if (!index.canReach(origin, destination))
      results.set(id, { status: 'no-journey', reason: 'unreachable' });
    else {
      destinations.set(destination, []);
      found.set(destination, []);
      ids.set(destination, id);
    }
  }
  if (!destinations.size || origin === undefined) return results;
  const best = new Map<number, Label[]>();
  // hot path: plain loop, no per-call array allocation
  const bounded = (
    time: number,
    boardings: number,
    walking: number,
    risk: number,
  ) => {
    for (const labels of destinations.values())
      if (
        !labels.some(
          (d) =>
            d.time < time &&
            d.boardings <= boardings &&
            d.walking <= walking &&
            d.risk <= risk,
        )
      )
        return false;
    return true;
  };
  function insert(
    frontier: Label[],
    label: Label,
    compareState = true,
  ): boolean {
    const comparable = (a: Label) =>
      !compareState || a.linkState === label.linkState;
    // one pass: reject a repeated signature, a fourth equal state, or a dominator
    let equal = 0;
    for (const a of frontier) {
      if (!comparable(a)) continue;
      if (equivalent(a, label)) {
        if (a.identity === label.identity || ++equal >= 3) return false;
      } else if (dominates(a, label)) return false;
    }
    for (let i = frontier.length - 1; i >= 0; i--)
      if (
        comparable(frontier[i]!) &&
        dominates(label, frontier[i]!) &&
        !equivalent(label, frontier[i]!)
      )
        frontier.splice(i, 1);
    frontier.push(label);
    return true;
  }
  const reported = new Set<Label>();
  for (const departure of departures) {
    let previous = new Map<number, Label[]>([[origin, [start(departure)]]]);
    for (let round = 1; round <= maxTransfers + 1 && previous.size; round++) {
      const marked = new Set<number>();
      for (const stop of previous.keys())
        for (const p of index.patternsAtStop[stop]!) marked.add(p);
      const current = new Map<number, Label[]>();
      const queue: { stop: number; label: Label }[] = [];
      const reach = (stop: number, label: Label) => {
        // past the deadline every continuation is too late as well
        if (label.time > deadline) return;
        // Any continuation needs another ride and cannot reduce time, walking or
        // accumulated risk. A destination already strictly better bounds the scan.
        if (bounded(label.time, label.boardings + 1, label.walking, label.risk))
          return;
        const frontier = best.get(stop) ?? [];
        if (!insert(frontier, label)) return;
        best.set(stop, frontier);
        const labels = current.get(stop) ?? [];
        labels.push(label);
        current.set(stop, labels);
        queue.push({ stop, label });
      };
      for (const p of [...marked].sort((a, b) => a - b)) {
        const pattern = schedule.patterns[p]!;
        // Trips in a pattern share stop occurrences. Serialize signature fragments
        // once per occurrence pair, rather than for every label on every trip.
        const rideKeys = new Map<number, string>();
        const boardingKeys = new Map<number, string>();
        for (const ti of pattern.tripIndexes) {
          const trip = schedule.trips[ti]!,
            tripStops = index.tripStops[ti]!;
          const onboard: {
            label: Label;
            occurrence: number;
            risk: number;
            identity: string;
          }[] = [];
          for (
            let occurrence = 0;
            occurrence < trip.events.length;
            occurrence++
          ) {
            const event = trip.events[occurrence]!,
              stop = tripStops[occurrence]!;
            // known times never fall along a trip, so the rest is late too
            if ((event.arrival ?? event.departure ?? -Infinity) > deadline)
              break;
            if (event.dropOff === 0 && event.arrival !== null)
              for (const boarding of onboard) {
                const boarded = trip.events[boarding.occurrence]!;
                const pair =
                  boarding.occurrence * trip.events.length + occurrence;
                let rideKey = rideKeys.get(pair);
                if (rideKey === undefined) {
                  rideKey = JSON.stringify([
                    trip.routeId,
                    boarded.stopId,
                    event.stopId,
                  ]);
                  rideKeys.set(pair, rideKey);
                }
                const label: Label = {
                  time: event.arrival,
                  previous: boarding.label,
                  walking: boarding.label.walking,
                  distance: boarding.label.distance,
                  risk: boarding.risk,
                  boardings: round,
                  linkState: 'none',
                  identity: boarding.label.identity + rideKey,
                  leg: {
                    kind: 'transit',
                    tripId: trip.id,
                    routeId: trip.routeId,
                    patternId: pattern.id,
                    boardingStopId: boarded.stopId,
                    boardingOccurrence: boarding.occurrence,
                    boardingSequence: boarded.sequence,
                    departureTime: boarded.departure!,
                    alightingStopId: event.stopId,
                    alightingOccurrence: occurrence,
                    alightingSequence: event.sequence,
                    arrivalTime: event.arrival,
                  },
                };
                if (destinations.has(stop))
                  insert(destinations.get(stop)!, label, false);
                reach(stop, label);
              }
            if (event.pickup !== 0 || event.departure === null) continue;
            for (const label of previous.get(stop) ?? []) {
              const ready =
                label.time +
                (round === 1 ? 0 : schedule.stops[stop]!.changeSeconds);
              if (ready > event.departure) continue;
              const risk =
                label.risk +
                (round === 1
                  ? 0
                  : Math.max(
                      0,
                      SCHEDULED_SLACK_SECONDS - (event.departure - ready),
                    ));
              if (bounded(event.departure, round, label.walking, risk))
                continue;
              // All onboard states now have identical future event times. Compare
              // walking/risk, not boarding time; retain distinct equal signatures.
              let boardingKey = boardingKeys.get(occurrence);
              if (boardingKey === undefined) {
                boardingKey = JSON.stringify([trip.routeId, event.stopId]);
                boardingKeys.set(occurrence, boardingKey);
              }
              const identity = label.identity + boardingKey;
              if (
                onboard.some(
                  (b) =>
                    b.label.walking <= label.walking &&
                    b.risk <= risk &&
                    (b.label.walking < label.walking ||
                      b.risk < risk ||
                      b.identity === identity),
                )
              )
                continue;
              for (let i = onboard.length - 1; i >= 0; i--)
                if (
                  label.walking <= onboard[i]!.label.walking &&
                  risk <= onboard[i]!.risk &&
                  (label.walking < onboard[i]!.label.walking ||
                    risk < onboard[i]!.risk)
                )
                  onboard.splice(i, 1);
              onboard.push({ label, occurrence, risk, identity });
            }
          }
        }
      }
      for (let head = 0; head < queue.length; head++) {
        const { stop: from, label } = queue[head]!;
        if (!best.get(from)?.includes(label)) continue;
        for (const li of index.transfersAtStop[from]!) {
          const link = schedule.transfers[li]!;
          // A pedestrian link is a complete validated path. Never concatenate it
          // with other links to evade the validated per-interchange envelope.
          if (
            label.linkState === 'pedestrian' ||
            (link.pedestrian && label.linkState !== 'none')
          )
            continue;
          reach(index.stopIndex.get(link.toStopId)!, {
            time: label.time + link.durationSeconds,
            previous: label,
            walking:
              label.walking + (link.pedestrian ? link.durationSeconds : 0),
            distance: label.distance + (link.pedestrian?.distanceMeters ?? 0),
            risk: label.risk,
            boardings: round,
            linkState: link.pedestrian ? 'pedestrian' : 'legacy',
            identity: label.identity,
            leg: {
              kind: 'transfer',
              transferId: link.id,
              fromStopId: link.fromStopId,
              toStopId: link.toStopId,
              departureTime: label.time,
              arrivalTime: label.time + link.durationSeconds,
              ...(link.pedestrian ? { pedestrian: link.pedestrian } : {}),
            },
          });
        }
      }
      previous = new Map(
        [...current]
          .map(([stop, labels]): [number, Label[]] => [
            stop,
            labels.filter((l) => best.get(stop)?.includes(l)),
          ])
          .filter(([, labels]) => labels.length) as [number, Label[]][],
      );
    }
    // later runs may replace these bag labels, but they stay in the profile
    if (profile)
      for (const [destination, labels] of destinations)
        for (const label of labels)
          if (!reported.has(label)) {
            reported.add(label);
            found.get(destination)!.push(label);
          }
  }
  for (const [destination, labels] of profile ? found : destinations) {
    const id = ids.get(destination)!;
    let journeys = labels.map((l) =>
      reconstruct(schedule, request.originStopId, id, l, requested),
    );
    // an earlier run can still add an equal-metric label with an earlier departure
    if (profile)
      journeys = journeys.filter(
        (b) => !journeys.some((a) => profileDominates(a, b)),
      );
    journeys.sort(
      (a, b) =>
        b.requestedDepartureTime - a.requestedDepartureTime ||
        a.arrivalTime - b.arrivalTime ||
        a.transferCount - b.transferCount ||
        a.walkingDurationSeconds - b.walkingDurationSeconds ||
        a.scheduledTransferRisk - b.scheduledTransferRisk,
    );
    results.set(
      id,
      journeys.length
        ? { status: 'ok', journeys }
        : { status: 'no-journey', reason: 'unreachable' },
    );
  }
  return results;
}
