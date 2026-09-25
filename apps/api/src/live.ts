import { randomUUID } from 'node:crypto';
import {
  overlayJourney,
  serviceAnchor,
  type SnapshotSource,
} from '@dallas-transit/realtime';
import type {
  Coordinate,
  GeographicJourney,
  JourneyResponse,
  References,
} from '@dallas-transit/shared';
import { ApiError } from './errors.js';
import type { JourneyService } from './service.js';

interface Session {
  journey: GeographicJourney;
  references: References;
  expires: number;
  nextReplan: number;
  replanning: boolean;
}
export class LiveJourneys {
  private readonly sessions = new Map<string, Session>();
  constructor(
    private readonly service: JourneyService,
    private readonly source?: SnapshotSource,
    private readonly now = () => Date.now() / 1000,
    private readonly agencyIds: readonly string[] = [],
    private readonly observe?: (diagnostics: Record<string, number>) => void,
  ) {}
  register(response: JourneyResponse): JourneyResponse {
    this.prune();
    if (response.status !== 'ok') return response;
    const ids = response.journeys.map((journey) => {
      const id = randomUUID();
      this.sessions.set(id, {
        journey,
        references: response.references,
        expires: this.now() + 3600,
        nextReplan: 0,
        replanning: false,
      });
      while (this.sessions.size > 256)
        this.sessions.delete(this.sessions.keys().next().value!);
      return id;
    });
    return { ...response, liveJourneyIds: ids };
  }
  private prune() {
    for (const [id, s] of this.sessions)
      if (s.expires <= this.now()) this.sessions.delete(id);
  }
  private get(id: string) {
    this.prune();
    const session = this.sessions.get(id);
    if (!session) throw new ApiError('NOT_FOUND');
    return session;
  }
  async state(id: string, signal: AbortSignal) {
    const session = this.get(id);
    const { schedule } = await this.service.schedules.get(
      session.journey.serviceDate,
      signal,
    );
    signal.throwIfAborted();
    if (schedule.publicationId !== session.journey.publicationId)
      throw new ApiError('PUBLICATION_CHANGED');
    return overlayJourney(
      session.journey,
      schedule,
      this.source?.current(schedule.publicationId) ?? null,
      this.now(),
      serviceAnchor(schedule.serviceDate, 'America/Chicago'),
      this.agencyIds,
      this.observe,
    );
  }
  async replan(
    id: string,
    input: { coordinate?: Coordinate; confirmedStopId?: string },
    signal: AbortSignal,
  ) {
    const session = this.get(id);
    signal.throwIfAborted();
    if (session.replanning || this.now() < session.nextReplan)
      return {
        status: 'cooldown' as const,
        retryAfterSeconds: Math.ceil(
          Math.max(1, session.nextReplan - this.now()),
        ),
      };
    // An explicit location or rider-confirmed stop is required. Vehicle proximity
    // and elapsed schedule time are never treated as rider position.
    const supportedStops = new Set(
      session.journey.legs.flatMap((l) =>
        l.kind === 'transit' ? [l.boardingStopId, l.alightingStopId] : [],
      ),
    );
    const stop =
      input.confirmedStopId && supportedStops.has(input.confirmedStopId)
        ? session.references.stops.find(
            (s) => s.stopId === input.confirmedStopId,
          )
        : undefined;
    const origin = input.coordinate ?? stop?.coordinate;
    if (!origin) throw new ApiError('INVALID_REQUEST');
    session.replanning = true;
    session.nextReplan = this.now() + 60;
    try {
      const state = await this.state(id, signal);
      const departureTime = Math.floor(
        this.now() -
          serviceAnchor(session.journey.serviceDate, 'America/Chicago'),
      );
      if (departureTime < 0 || departureTime > 172800)
        throw new ApiError('INVALID_REQUEST');
      const result = await this.service.journey(
        {
          origin,
          destination: session.journey.destination,
          serviceDate: session.journey.serviceDate,
          departureTime,
        },
        signal,
        {},
        undefined,
        this.source,
      );
      signal.throwIfAborted();
      const reason =
        state.replan.reasons.join(' ') ||
        'You requested new options from your confirmed location.';
      return { status: 'ok' as const, reason, result: this.register(result) };
    } finally {
      session.replanning = false;
    }
  }
  clear() {
    this.sessions.clear();
  }
}
