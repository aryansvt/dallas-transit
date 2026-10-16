import { composeGeographicJourneys } from './geographic.js';
import type {
  DepartAtRequest,
  DepartureInsight,
  GeographicJourney,
  GeographicPolicy,
  WalkingCandidate,
} from './geographic-types.js';
import type { RoutingSchedule } from './types.js';

/** Leaving earlier must arrive at least this much sooner... */
export const MIN_EARLIER_SAVING_SECONDS = 600;
/** ...and may leave at most this much earlier. */
export const MAX_EARLIER_SHIFT_SECONDS = 900;
/** No need to rush: the later leave arrives at most this much later... */
export const NEAR_SAME_ARRIVAL_SECONDS = 120;
/** ...and lets the rider leave at least this much later. */
export const MIN_LATER_SHIFT_SECONDS = 300;

/** Compares the requested departure with the first depart-at journey (ADR 0007).
 * Each rule is one arrive-by search for the latest leave that meets a deadline,
 * on the same walking candidates. When that latest leave fails a guardrail,
 * every other qualifying leave is earlier still and fails it too, so one search
 * per rule is exact. `now` is service-day seconds.
 */
export function departureInsight(
  schedule: RoutingSchedule,
  request: DepartAtRequest,
  access: readonly WalkingCandidate[],
  egress: readonly WalkingCandidate[],
  journeys: readonly GeographicJourney[],
  now: number,
  overrides: Partial<GeographicPolicy> = {},
  checkpoint?: () => void,
): DepartureInsight | undefined {
  if (!Number.isFinite(now)) throw new RangeError('now must be finite');
  const best = journeys[0];
  if (!best) return undefined;
  const { departureTime, earliestDepartureTime = now, ...place } = request;
  const floor = Math.max(now, earliestDepartureTime);
  // rounding the deadline down never shrinks the saving or widens the window
  const latest = (deadline: number) => {
    const arrivalTime = Math.floor(deadline);
    if (arrivalTime < 0) return undefined;
    const result = composeGeographicJourneys(
      schedule,
      { ...place, arrivalTime },
      access,
      egress,
      overrides,
      undefined,
      checkpoint,
    );
    return result.status === 'ok' ? result.journeys[0] : undefined;
  };
  const option = (
    kind: DepartureInsight['kind'],
    j: GeographicJourney,
  ): DepartureInsight => ({
    kind,
    departureTime: j.requestedDepartureTime,
    arrivalChangeSeconds: j.arrivalTime - best.arrivalTime,
  });
  const earlier = latest(best.arrivalTime - MIN_EARLIER_SAVING_SECONDS);
  if (
    earlier &&
    earlier.requestedDepartureTime >= floor &&
    departureTime - earlier.requestedDepartureTime <= MAX_EARLIER_SHIFT_SECONDS
  )
    return option('leave-earlier', earlier);
  const later = latest(best.arrivalTime + NEAR_SAME_ARRIVAL_SECONDS);
  if (
    later &&
    later.requestedDepartureTime >= floor &&
    later.requestedDepartureTime - departureTime >= MIN_LATER_SHIFT_SECONDS
  )
    return option('no-rush', later);
  return undefined;
}
