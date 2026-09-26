import {
  planGeographicJourney,
  type WalkingProvider,
} from '@dallas-transit/transit-ingest/runtime';
import type { GeographicRequest } from '@dallas-transit/router';
import {
  adjustedSchedule,
  scheduledBase,
  serviceAnchor,
  type SnapshotSource,
} from '@dallas-transit/realtime';
import type { JourneyResponse } from '@dallas-transit/shared';
import { API_POLICY, type ApiConfig } from './config.js';
import { ApiError } from './errors.js';
import type { TransitRepository } from './repository.js';
import { PreparedSchedules } from './schedules.js';

export interface JourneyObservation {
  providerFailure?: string;
  cache?: 'hit' | 'miss' | 'shared';
  scheduleLookupMs?: number;
  preparationMs?: number;
  candidateMs?: number;
  providerMs?: number;
  compositionMs?: number;
  referenceMs?: number;
  retries?: number;
  stage?: 'candidates' | 'walking' | 'composition' | 'complete';
  providerCalls?: number;
  completedAccessSearches?: number;
}
export class JourneyService {
  readonly schedules: PreparedSchedules;
  readonly shutdown = new AbortController();
  constructor(
    readonly repository: TransitRepository,
    config: ApiConfig,
    readonly walkingProvider?: WalkingProvider,
  ) {
    this.schedules = new PreparedSchedules(repository, {
      sourceKey: config.sourceKey,
      changeSeconds: config.changeSeconds,
      maximum: config.scheduleEntries,
      ttlMs: config.scheduleTtlMs,
    });
  }
  async journey(
    request: GeographicRequest,
    signal: AbortSignal,
    observation: JourneyObservation,
    checkpoint = () => signal.throwIfAborted(),
    realtime?: SnapshotSource,
  ): Promise<JourneyResponse> {
    if (!this.walkingProvider) throw new ApiError('WALKING_NOT_CONFIGURED');
    for (let attempt = 0; attempt < 2; attempt++) {
      let key: string | undefined;
      try {
        signal.throwIfAborted();
        const started = performance.now();
        const loaded = await this.schedules.get(request.serviceDate, signal);
        checkpoint();
        key = loaded.key;
        Object.assign(observation, {
          cache: loaded.cache,
          scheduleLookupMs: performance.now() - started,
          preparationMs: loaded.cache === 'miss' ? loaded.preparationMs : 0,
          retries: attempt,
        });
        const result = await planGeographicJourney(
          realtime
            ? adjustedSchedule(
                loaded.schedule,
                realtime.current(loaded.schedule.publicationId),
                Date.now() / 1000,
                serviceAnchor(request.serviceDate, 'America/Chicago'),
              )
            : loaded.schedule,
          request,
          {
            candidates: this.repository.candidates,
            walkingProvider: this.walkingProvider,
            signal,
            onProgress(progress) {
              Object.assign(observation, progress);
            },
            checkpoint,
          },
          API_POLICY,
        );
        checkpoint();
        Object.assign(observation, {
          candidateMs:
            result.metrics.originLookupMs + result.metrics.destinationLookupMs,
          providerMs: result.metrics.providerBatchMs,
          compositionMs: result.metrics.compositionMs,
        });
        const failedWalk = result.walkingAttempts.find(
          (a) => a.result.status === 'unavailable',
        );
        if (failedWalk?.result.status === 'unavailable')
          observation.providerFailure = failedWalk.result.reason;
        const context = {
          publicationId: loaded.schedule.publicationId,
          serviceDate: request.serviceDate,
          origin: request.origin,
          destination: request.destination,
          requestedDepartureTime: request.departureTime,
        };
        if (result.status === 'ok') {
          const baseJourneys = realtime
            ? result.journeys.map((j) => scheduledBase(j, loaded.schedule))
            : result.journeys;
          const refsStarted = performance.now();
          const references = await this.repository.references(
            loaded.schedule.publicationId,
            baseJourneys,
            signal,
          );
          observation.referenceMs = performance.now() - refsStarted;
          return {
            ...context,
            status: 'ok',
            journeys: baseJourneys,
            incomplete: result.incomplete,
            references,
          };
        }
        switch (result.reason) {
          case 'publication-changed':
            throw new ApiError('PUBLICATION_CHANGED');
          case 'no-publication':
            this.schedules.invalidate(key);
            throw new ApiError('NO_PUBLICATION');
          case 'service-date-not-loaded':
            throw new ApiError('INTERNAL_ERROR');
          case 'walking-provider-unavailable':
            throw new ApiError(
              result.walkingAttempts.some(
                (a) =>
                  a.result.status === 'unavailable' &&
                  a.result.reason === 'timeout',
              )
                ? 'WALKING_TIMEOUT'
                : 'WALKING_UNAVAILABLE',
            );
          default:
            return {
              ...context,
              status: 'no-journey',
              reason: result.reason,
              journeys: [],
              incomplete: false,
            };
        }
      } catch (error) {
        signal.throwIfAborted();
        if (error instanceof ApiError && error.code === 'PUBLICATION_CHANGED') {
          if (key) this.schedules.invalidate(key);
          if (attempt === 0) continue;
        }
        throw error;
      }
    }
    throw new ApiError('PUBLICATION_CHANGED');
  }
  stop() {
    this.shutdown.abort(new ApiError('SERVICE_UNAVAILABLE'));
  }
  async close() {
    this.stop();
    await this.schedules.close();
    await this.repository.close();
  }
}
