import { performance } from 'node:perf_hooks';
import {
  composeGeographicJourneys,
  geographicPolicy,
  validateCoordinate,
  validateGeographicRequest,
  type GeographicCompositionResult,
  type GeographicPolicy,
  type GeographicRequest,
  type RoutingSchedule,
  type WalkingCandidate,
} from '@dallas-transit/router';
import type {
  CandidateSource,
  NearbyResult,
  NearbyStop,
} from './nearby-stops.js';
import {
  requestWalkingRoute,
  type WalkingProvider,
  type WalkingResult,
} from './walking-provider.js';

export interface PlanningMetrics {
  originLookupMs: number;
  destinationLookupMs: number;
  accessCandidates: number;
  egressCandidates: number;
  providerCalls: number;
  providerBatchMs: number;
  providerCallMs: number[];
  transitSearches: number;
  compositionMs: number;
  totalMs: number;
}
export interface WalkingAttempt {
  readonly phase: 'access' | 'egress';
  readonly stopId: string;
  readonly result: WalkingResult;
}
type NoJourneyReason =
  | Extract<GeographicCompositionResult, { status: 'no-journey' }>['reason']
  | 'no-publication'
  | 'publication-changed'
  | 'no-nearby-access-stops'
  | 'no-nearby-egress-stops'
  | 'walking-provider-unavailable';
export type GeographicPlanningResult = {
  readonly metrics: PlanningMetrics;
  readonly candidates: NearbyResult | null;
  readonly walkingAttempts: readonly WalkingAttempt[];
  /** Provider failure may hide a better journey even when usable journeys remain. */
  readonly incomplete: boolean;
} & (
  | Extract<GeographicCompositionResult, { status: 'ok' }>
  | { readonly status: 'no-journey'; readonly reason: NoJourneyReason }
);

/** Application orchestration only: the transit core never calls these providers. */
export async function planGeographicJourney(
  schedule: RoutingSchedule,
  request: GeographicRequest,
  dependencies: {
    readonly candidates: CandidateSource;
    readonly walkingProvider?: WalkingProvider;
  },
  overrides: Partial<GeographicPolicy> = {},
): Promise<GeographicPlanningResult> {
  validateGeographicRequest(request);
  const policy = geographicPolicy(overrides);
  const started = performance.now();
  const metrics: PlanningMetrics = {
    originLookupMs: 0,
    destinationLookupMs: 0,
    accessCandidates: 0,
    egressCandidates: 0,
    providerCalls: 0,
    providerBatchMs: 0,
    providerCallMs: [],
    transitSearches: 0,
    compositionMs: 0,
    totalMs: 0,
  };
  let candidates: NearbyResult | null = null;
  const walkingAttempts: WalkingAttempt[] = [];
  const finish = (
    result:
      | GeographicCompositionResult
      | { status: 'no-journey'; reason: NoJourneyReason },
  ): GeographicPlanningResult => {
    metrics.totalMs = performance.now() - started;
    return {
      ...result,
      metrics,
      candidates,
      walkingAttempts,
      incomplete: walkingAttempts.some(
        (a) => a.result.status === 'unavailable',
      ),
    };
  };
  if (schedule.serviceDate !== request.serviceDate)
    return finish({ status: 'no-journey', reason: 'service-date-not-loaded' });
  candidates = await dependencies.candidates.find(
    request,
    policy,
    schedule.publicationId,
  );
  if (candidates.status !== 'ok')
    return finish({ status: 'no-journey', reason: candidates.reason });
  if (candidates.publicationId !== schedule.publicationId)
    throw new Error('Candidate publication mismatch');
  if (
    candidates.access.length > policy.maxAccessCandidates ||
    candidates.egress.length > policy.maxEgressCandidates
  )
    throw new Error('Candidate source exceeded policy');
  const stopIds = new Set(schedule.stops.map((s) => s.id));
  for (const group of [candidates.access, candidates.egress]) {
    const seen = new Set<string>();
    for (const c of group) {
      validateCoordinate(c.coordinate);
      if (
        c.publicationId !== schedule.publicationId ||
        !stopIds.has(c.stopId) ||
        seen.has(c.stopId) ||
        !Number.isFinite(c.candidateDistanceMeters) ||
        c.candidateDistanceMeters < 0 ||
        c.candidateDistanceMeters > policy.radiusMeters
      )
        throw new Error('Invalid nearby candidate');
      seen.add(c.stopId);
    }
  }
  metrics.originLookupMs = candidates.originLookupMs;
  metrics.destinationLookupMs = candidates.destinationLookupMs;
  metrics.accessCandidates = candidates.access.length;
  metrics.egressCandidates = candidates.egress.length;
  if (!candidates.access.length)
    return finish({ status: 'no-journey', reason: 'no-nearby-access-stops' });
  if (!candidates.egress.length)
    return finish({ status: 'no-journey', reason: 'no-nearby-egress-stops' });
  const provider = dependencies.walkingProvider;
  if (!provider)
    return finish({
      status: 'no-journey',
      reason: 'walking-provider-unavailable',
    });
  const jobs: { phase: 'access' | 'egress'; stop: NearbyStop }[] = [
    ...candidates.access.map((stop) => ({ phase: 'access' as const, stop })),
    ...candidates.egress.map((stop) => ({ phase: 'egress' as const, stop })),
  ];
  let next = 0;
  let timedOut = false;
  const providerStarted = performance.now();
  await Promise.all(
    Array.from(
      { length: Math.min(policy.providerConcurrency, jobs.length) },
      async () => {
        for (;;) {
          const index = next++;
          const job = jobs[index];
          if (!job) break;
          const callStarted = performance.now();
          // Do not start more work after a timeout: an uncooperative provider may
          // still be running despite abort. The total in-flight bound remains intact.
          let result: WalkingResult = {
            status: 'unavailable',
            reason: 'timeout',
          };
          if (!timedOut) {
            metrics.providerCalls++;
            result = await requestWalkingRoute(
              provider,
              {
                origin:
                  job.phase === 'access' ? request.origin : job.stop.coordinate,
                destination:
                  job.phase === 'access'
                    ? job.stop.coordinate
                    : request.destination,
              },
              policy.providerTimeoutMs,
            );
            metrics.providerCallMs[index] = performance.now() - callStarted;
          } else metrics.providerCallMs[index] = 0;
          if (result.status === 'unavailable' && result.reason === 'timeout')
            timedOut = true;
          walkingAttempts[index] = {
            phase: job.phase,
            stopId: job.stop.stopId,
            result,
          };
        }
      },
    ),
  );
  metrics.providerBatchMs = performance.now() - providerStarted;
  const access: WalkingCandidate[] = [];
  const egress: WalkingCandidate[] = [];
  for (let i = 0; i < jobs.length; i++) {
    const attempt = walkingAttempts[i]!;
    if (attempt.result.status !== 'ok') continue;
    const job = jobs[i]!;
    (job.phase === 'access' ? access : egress).push({
      ...job.stop,
      walk: attempt.result.route,
    });
  }
  for (const [phase, reachable] of [
    ['access', access],
    ['egress', egress],
  ] as const) {
    if (reachable.length) continue;
    // Mixed no-route and outage responses cannot prove that nothing is reachable.
    const unavailable = walkingAttempts.some(
      (a) => a.phase === phase && a.result.status === 'unavailable',
    );
    return finish({
      status: 'no-journey',
      reason: unavailable
        ? 'walking-provider-unavailable'
        : phase === 'access'
          ? 'no-reachable-access-stops'
          : 'no-reachable-egress-stops',
    });
  }
  const compositionStarted = performance.now();
  const result = composeGeographicJourneys(
    schedule,
    request,
    access,
    egress,
    policy,
  );
  metrics.compositionMs = performance.now() - compositionStarted;
  metrics.transitSearches = result.transitSearches;
  // Failed candidates might have supplied the missing transit connection.
  if (
    result.status === 'no-journey' &&
    walkingAttempts.some((a) => a.result.status === 'unavailable')
  )
    return finish({
      status: 'no-journey',
      reason: 'walking-provider-unavailable',
    });
  return finish(result);
}
