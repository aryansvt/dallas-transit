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
import type { CandidateSource, NearbyResult } from './nearby-stops.js';
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
  readonly rejection?:
    'no-pedestrian-route' | 'walking-budget' | 'provider-unavailable';
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
    readonly signal?: AbortSignal;
  },
  overrides: Partial<GeographicPolicy> = {},
): Promise<GeographicPlanningResult> {
  validateGeographicRequest(request);
  const signal = dependencies.signal;
  signal?.throwIfAborted();
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
    signal,
  );
  signal?.throwIfAborted();
  if (candidates.status !== 'ok')
    return finish({ status: 'no-journey', reason: candidates.reason });
  if (candidates.publicationId !== schedule.publicationId)
    throw new Error('Candidate publication mismatch');
  if (
    candidates.access.length > (policy.shortlistLimit ?? 32) ||
    candidates.egress.length > (policy.shortlistLimit ?? 32)
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
        c.candidateDistanceMeters >
          Math.max(policy.radiusMeters, policy.stationRadiusMeters ?? 2200)
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
  const access: WalkingCandidate[] = [],
    egress: WalkingCandidate[] = [];
  const providerStarted = performance.now();
  let timedOut = false;
  const phaseAttempts: WalkingAttempt[][] = [[], []];
  const runPhase = async (phase: 'access' | 'egress', phaseIndex: number) => {
    const selected = phase === 'access' ? access : egress;
    const target =
      phase === 'access'
        ? policy.maxAccessCandidates
        : policy.maxEgressCandidates;
    // Reserve each endpoint's initial allocation; divide the remaining refill
    // budget deterministically so response timing cannot change selection.
    const extra =
      policy.maxProviderCalls -
      policy.maxAccessCandidates -
      policy.maxEgressCandidates;
    const budget =
      target +
      (phaseIndex === 0 ? Math.ceil(extra / 2) : Math.floor(extra / 2));
    for (const stop of candidates!.status === 'ok' ? candidates![phase] : []) {
      if (
        selected.length >= target ||
        phaseAttempts[phaseIndex]!.length >= budget
      )
        break;
      signal?.throwIfAborted();
      const started = performance.now();
      let result: WalkingResult = { status: 'unavailable', reason: 'timeout' };
      if (!timedOut) {
        metrics.providerCalls++;
        result = await requestWalkingRoute(
          provider,
          {
            origin: phase === 'access' ? request.origin : stop.coordinate,
            destination:
              phase === 'access' ? stop.coordinate : request.destination,
          },
          policy.providerTimeoutMs,
          signal,
        );
      }
      metrics.providerCallMs.push(performance.now() - started);
      if (result.status === 'unavailable' && result.reason === 'timeout')
        timedOut = true;
      let overBudget = false;
      if (
        result.status === 'ok' &&
        (result.route.durationSeconds >
          (policy.maxWalkingDurationSeconds ?? 1800) ||
          result.route.distanceMeters >
            (policy.maxWalkingDistanceMeters ?? 2500))
      ) {
        overBudget = true;
        result = { status: 'no-route' };
      }
      phaseAttempts[phaseIndex]!.push({
        phase,
        stopId: stop.stopId,
        result,
        ...(result.status === 'ok'
          ? {}
          : {
              rejection: overBudget
                ? 'walking-budget'
                : result.status === 'unavailable'
                  ? 'provider-unavailable'
                  : 'no-pedestrian-route',
            }),
      });
      if (result.status === 'ok')
        selected.push({ ...stop, walk: result.route });
    }
  };
  if (policy.providerConcurrency === 1) {
    await runPhase('access', 0);
    await runPhase('egress', 1);
  } else await Promise.all([runPhase('access', 0), runPhase('egress', 1)]);
  walkingAttempts.push(...phaseAttempts.flat());
  metrics.providerBatchMs = performance.now() - providerStarted;
  signal?.throwIfAborted();
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
  signal?.throwIfAborted();
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
