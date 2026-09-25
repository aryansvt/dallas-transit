import { describe, expect, it } from 'vitest';
import { buildSchedule } from '@dallas-transit/router';
import { freshness, serviceAnchor } from './freshness.js';
import { matchSnapshot } from './match.js';
import { adjustedSchedule, overlayJourney, scheduledBase } from './overlay.js';
import { encodeFixture, MAX_FEED_BYTES, parseFeed } from './parse.js';
import {
  anchor,
  date,
  descriptor,
  journey,
  now,
  publicationId,
  schedule,
  snapshot,
  tripEntity,
  vehicleEntity,
  wire,
} from './test-support.js';

describe('official protobuf boundary and publication-scoped matching', () => {
  it('decodes and overlays a matched trip without mutating the itinerary', () => {
    const before = JSON.stringify(journey);
    const live = overlayJourney(
      journey,
      schedule,
      snapshot([tripEntity(120)]),
      now,
      anchor,
    );
    expect(live.legs[0]).toMatchObject({
      departureTime: 28920,
      departureDelay: 120,
      freshness: 'LIVE',
      vehicle: null,
    });
    expect(JSON.stringify(journey)).toBe(before);
  });
  it.each(['tripId', 'routeId', 'startDate', 'startTime'] as const)(
    'rejects incompatible %s',
    (field) => {
      const e = tripEntity();
      Object.assign(e.tripUpdate.trip, {
        [field]:
          field === 'startDate'
            ? '20260917'
            : field === 'startTime'
              ? '07:00:00'
              : 'unknown',
      });
      expect(
        matchSnapshot(snapshot([e]), schedule, anchor, now).trips.size,
      ).toBe(0);
    },
  );
  it('does not attach the same raw IDs across publications', () => {
    const feed = snapshot();
    feed.publicationId = 'other';
    expect(matchSnapshot(feed, schedule, anchor, now).trips.size).toBe(0);
  });
  it('requires a service date to distinguish overlapping overnight runs', () => {
    const e = tripEntity();
    Reflect.deleteProperty(e.tripUpdate.trip, 'startDate');
    expect(
      matchSnapshot(snapshot([e]), schedule, anchor, now).diagnostics[
        'unmatched-trip'
      ],
    ).toBe(1);
  });
  it('rejects unknown stops and mismatched stop sequence', () => {
    const e = tripEntity();
    e.tripUpdate.stopTimeUpdate[0]!.stopId = 'unknown';
    const matched = matchSnapshot(snapshot([e]), schedule, anchor, now);
    expect(matched.trips.size).toBe(0);
    expect(matched.diagnostics['invalid-stops-or-chronology']).toBe(1);
  });
  it('repeated stop needs an occurrence sequence', () => {
    const entity = {
      id: 'loop',
      tripUpdate: {
        trip: descriptor('loop'),
        stopTimeUpdate: [{ stopId: 'A', arrival: { delay: 10 } }],
      },
    };
    expect(
      matchSnapshot(snapshot([entity]), schedule, anchor, now).trips.size,
    ).toBe(0);
    Object.assign(entity.tripUpdate.stopTimeUpdate[0]!, { stopSequence: 30 });
    expect(
      matchSnapshot(snapshot([entity]), schedule, anchor, now).trips.size,
    ).toBe(1);
  });
  it('rejects duplicate entities, duplicate trip identities, and duplicate stop sequences', () => {
    expect(snapshot([tripEntity(), tripEntity()]).trips).toHaveLength(0);
    expect(
      matchSnapshot(
        snapshot([tripEntity(), { ...tripEntity(), id: 'other' }]),
        schedule,
        anchor,
        now,
      ).trips.size,
    ).toBe(0);
    const e = tripEntity();
    e.tripUpdate.stopTimeUpdate.push(e.tripUpdate.stopTimeUpdate[0]!);
    expect(matchSnapshot(snapshot([e]), schedule, anchor, now).trips.size).toBe(
      0,
    );
  });
  it('rejects reversed sequence and malformed prediction chronology', () => {
    const e = tripEntity();
    e.tripUpdate.stopTimeUpdate.reverse();
    expect(matchSnapshot(snapshot([e]), schedule, anchor, now).trips.size).toBe(
      0,
    );
    e.tripUpdate.stopTimeUpdate.reverse();
    e.tripUpdate.stopTimeUpdate[0]!.departure.delay = 1000;
    expect(matchSnapshot(snapshot([e]), schedule, anchor, now).trips.size).toBe(
      0,
    );
  });
  it('handles absolute timestamps and unsupported update uncertainty honestly', () => {
    const e = {
      id: 'first',
      tripUpdate: {
        trip: descriptor(),
        stopTimeUpdate: [
          {
            stopSequence: 10,
            departure: { time: anchor + 28900, uncertainty: 30 },
          },
        ],
      },
    };
    const live = overlayJourney(journey, schedule, snapshot([e]), now, anchor);
    expect(live.legs[0]?.departureTime).toBe(28900);
    expect(live.transfers[0]?.status).toBe('UNKNOWN');
  });
  it('supports cancellation and skipped stop without vehicle data', () => {
    const e = {
      id: 'cancel',
      tripUpdate: { trip: { ...descriptor(), scheduleRelationship: 3 } },
    };
    expect(
      overlayJourney(journey, schedule, snapshot([e]), now, anchor),
    ).toMatchObject({
      replan: { suggested: true },
      legs: [{ cancelled: true }, { cancelled: false }],
    });
    const skipped = {
      id: 'skip',
      tripUpdate: {
        trip: descriptor(),
        stopTimeUpdate: [{ stopSequence: 20, scheduleRelationship: 1 }],
      },
    };
    expect(
      overlayJourney(journey, schedule, snapshot([skipped]), now, anchor)
        .transfers[0]?.status,
    ).toBe('INFEASIBLE');
  });
  it('supports vehicle-only progress without fabricating predictions', () => {
    const live = overlayJourney(
      journey,
      schedule,
      snapshot([vehicleEntity()]),
      now,
      anchor,
    );
    expect(live.legs[0]).toMatchObject({
      departureTime: null,
      arrivalTime: null,
      stopsRemaining: 1,
      boarding: 'DEPARTED',
      vehicle: { vehicleId: 'v1' },
    });
    expect(live.transfers[0]?.status).toBe('UNKNOWN');
  });
  it('rejects unknown vehicle stop, future observation and missing observation time', () => {
    for (const change of [
      { stopId: 'unknown' },
      { timestamp: now + 31 },
      { timestamp: undefined },
    ]) {
      const e = vehicleEntity();
      Object.assign(e.vehicle, change);
      expect(
        overlayJourney(journey, schedule, snapshot([e]), now, anchor).legs[0]
          ?.vehicle,
      ).toBeNull();
    }
  });
  it('rejects malformed protobuf, oversize, future envelopes and differential mode', () => {
    for (const bytes of [
      new Uint8Array([255]),
      new Uint8Array(MAX_FEED_BYTES + 1),
      wire([], now + 31),
      encodeFixture({
        header: { gtfsRealtimeVersion: '2.0', incrementality: 1 },
        entity: [],
      }),
    ])
      expect(() => parseFeed(bytes, publicationId, now)).toThrow();
  });
  it('keeps a valid entity from a partial feed and diagnoses invalid values', () => {
    const e = vehicleEntity();
    e.vehicle.position.latitude = 100;
    const feed = snapshot([tripEntity(), e]);
    expect(feed.trips).toHaveLength(1);
    expect(feed.vehicles).toHaveLength(0);
    expect(feed.diagnostics['invalid-entity']).toBe(1);
  });
});

describe('freshness and deterministic transfer allowance', () => {
  it('does not label an empty trip update as a timing prediction', () => {
    const feed = snapshot([
      { id: 'empty', tripUpdate: { trip: descriptor() } },
    ]);
    expect(overlayJourney(journey, schedule, feed, now, anchor)).toMatchObject({
      freshness: 'SCHEDULED_FALLBACK',
      legs: [
        { freshness: 'SCHEDULED_FALLBACK', departureTime: null },
        { freshness: 'SCHEDULED_FALLBACK', departureTime: null },
      ],
    });
  });
  it.each([
    [0, 'LIVE'],
    [120, 'LIVE'],
    [121, 'AGING'],
    [300, 'AGING'],
    [301, 'STALE'],
  ] as const)('classifies age %s as %s', (age, state) =>
    expect(freshness(snapshot(), now + age)).toBe(state),
  );
  it('uses source and entity age, never receipt alone', () => {
    const feed = snapshot();
    feed.receivedAt = now + 400;
    expect(freshness(feed, now + 400)).toBe('STALE');
    expect(freshness(snapshot(), now, now - 400)).toBe('STALE');
  });
  it('missing feed timestamp is scheduled fallback and null snapshot is unavailable', () => {
    const feed = parseFeed(
      encodeFixture({
        header: { gtfsRealtimeVersion: '2.0' },
        entity: [tripEntity()],
      }),
      publicationId,
      now,
    );
    expect(freshness(feed, now)).toBe('SCHEDULED_FALLBACK');
    expect(freshness(null, now)).toBe('UNAVAILABLE');
    expect(
      overlayJourney(journey, schedule, feed, now, anchor).legs[0]
        ?.departureTime,
    ).toBeNull();
  });
  it.each([
    [0, 'FEASIBLE', 180],
    [150, 'AT_RISK', 30],
    [181, 'INFEASIBLE', -1],
  ] as const)(
    'evaluates inbound delay %s',
    (delay, status, remainingSeconds) => {
      const live = overlayJourney(
        journey,
        schedule,
        snapshot([tripEntity(delay), tripEntity(0, 'second')]),
        now,
        anchor,
      );
      expect(live.transfers[0]).toMatchObject({
        status,
        requiredSeconds: 120,
        remainingSeconds,
      });
    },
  );
  it('uses updated outbound departure and avoids invented safe probabilities', () => {
    expect(
      overlayJourney(
        journey,
        schedule,
        snapshot([tripEntity(300), tripEntity(300, 'second')]),
        now,
        anchor,
      ).transfers[0]?.status,
    ).toBe('FEASIBLE');
  });
  it('aging or missing either side makes transfer timing unknown', () => {
    expect(
      overlayJourney(journey, schedule, snapshot(), now + 121, anchor)
        .transfers[0]?.status,
    ).toBe('UNKNOWN');
    expect(
      overlayJourney(journey, schedule, snapshot([tripEntity()]), now, anchor)
        .transfers[0]?.status,
    ).toBe('UNKNOWN');
    const stale = overlayJourney(
      journey,
      schedule,
      snapshot(),
      now + 301,
      anchor,
    );
    expect(
      stale.legs.every(
        (l) => l.departureTime === null && l.arrivalTime === null,
      ),
    ).toBe(true);
  });
  it('respects explicit interchange duration in addition to change allowance', () => {
    const changed = buildSchedule({
      ...schedule,
      transfers: [
        { id: 'link', fromStopId: 'B', toStopId: 'C', durationSeconds: 90 },
      ],
      trips: schedule.trips.map((t) =>
        t.id === 'second'
          ? {
              ...t,
              events: t.events.map((e, i) =>
                i === 0 ? { ...e, stopId: 'C' } : e,
              ),
            }
          : t,
      ),
    });
    const j = {
      ...journey,
      legs: [
        journey.legs[0]!,
        {
          kind: 'transfer' as const,
          transferId: 'link',
          fromStopId: 'B',
          toStopId: 'C',
          departureTime: 29400,
          arrivalTime: 29490,
        },
        { ...journey.legs[1]!, boardingStopId: 'C' },
      ],
    };
    const second = tripEntity(0, 'second');
    second.tripUpdate.stopTimeUpdate[0]!.stopId = 'C';
    expect(
      overlayJourney(j, changed, snapshot([tripEntity(), second]), now, anchor)
        .transfers[0],
    ).toMatchObject({
      requiredSeconds: 210,
      remainingSeconds: 90,
      status: 'FEASIBLE',
    });
  });
  it('uses noon-minus-twelve anchor on Dallas DST dates', () => {
    expect(
      new Date(
        serviceAnchor('2026-03-08', 'America/Chicago') * 1000,
      ).toISOString(),
    ).toBe('2026-03-08T05:00:00.000Z');
    expect(
      new Date(
        serviceAnchor('2026-11-01', 'America/Chicago') * 1000,
      ).toISOString(),
    ).toBe('2026-11-01T06:00:00.000Z');
  });
});

describe('alerts and replan schedule view', () => {
  it('associates, deduplicates and expires readable alerts; unsupported selectors are not broadened', () => {
    const alert = {
      headerText: {
        translation: [{ text: 'Service disruption', language: 'en' }],
      },
      informedEntity: [{ routeId: 'bus' }],
      activePeriod: [{ start: now - 10, end: now + 10 }],
    };
    const feed = snapshot([
      { id: 'a', alert },
      { id: 'b', alert },
      {
        id: 'irrelevant',
        alert: { ...alert, informedEntity: [{ routeId: 'other' }] },
      },
      {
        id: 'unsupported',
        alert: { ...alert, informedEntity: [{ routeType: 3 }] },
      },
    ]);
    expect(
      overlayJourney(journey, schedule, feed, now, anchor).alerts,
    ).toHaveLength(1);
    expect(
      overlayJourney(journey, schedule, feed, now + 10, anchor).alerts,
    ).toHaveLength(0);
  });
  it('agency alerts require explicit agency mapping', () => {
    const feed = snapshot([
      {
        id: 'agency',
        alert: {
          headerText: { translation: [{ text: 'Network alert' }] },
          informedEntity: [{ agencyId: 'dart' }],
        },
      },
    ]);
    expect(
      overlayJourney(journey, schedule, feed, now, anchor).alerts,
    ).toHaveLength(0);
    expect(
      overlayJourney(journey, schedule, feed, now, anchor, ['dart']).alerts,
    ).toHaveLength(1);
  });
  it('excludes cancellations, disables skipped stops and expires changes without mutating base', () => {
    const feed = snapshot([
      {
        id: 'cancel',
        tripUpdate: { trip: { ...descriptor(), scheduleRelationship: 3 } },
      },
      {
        id: 'skip',
        tripUpdate: {
          trip: descriptor('second'),
          stopTimeUpdate: [{ stopSequence: 10, scheduleRelationship: 1 }],
        },
      },
    ]);
    const adjusted = adjustedSchedule(schedule, feed, now, anchor);
    expect(adjusted.trips.some((t) => t.id === 'first')).toBe(false);
    expect(
      adjusted.trips.find((t) => t.id === 'second')?.events[0]?.pickup,
    ).toBe(1);
    expect(schedule.trips).toHaveLength(3);
    expect(
      adjustedSchedule(schedule, feed, now + 301, anchor).trips,
    ).toHaveLength(3);
  });
  it('does not fabricate propagation when a partial update contradicts remaining schedule', () => {
    const feed = snapshot([
      {
        id: 'first',
        tripUpdate: {
          trip: descriptor(),
          stopTimeUpdate: [{ stopSequence: 10, departure: { delay: 1000 } }],
        },
      },
    ]);
    expect(
      adjustedSchedule(schedule, feed, now, anchor).trips.some(
        (t) => t.id === 'first',
      ),
    ).toBe(false);
  });
  it('restores genuine scheduled fallback after routing through adjusted inputs', () => {
    const altered = {
      ...journey,
      legs: journey.legs.map((l) => ({
        ...l,
        departureTime: l.departureTime + 120,
        arrivalTime: l.arrivalTime + 120,
      })),
    };
    expect(scheduledBase(altered, schedule).legs).toEqual(journey.legs);
  });
  it('measures parse, normalization and overlay on a deterministic feed', () => {
    const bytes = wire();
    const started = performance.now();
    for (let i = 0; i < 100; i++)
      overlayJourney(
        journey,
        schedule,
        parseFeed(bytes, publicationId, now),
        now,
        anchor,
      );
    const feed = parseFeed(bytes, publicationId, now);
    console.info(
      JSON.stringify({
        benchmark: 'realtime-fixture',
        iterations: 100,
        totalMs: performance.now() - started,
        ...feed.metrics,
      }),
    );
    expect(feed.metrics.parseMs).toBeGreaterThanOrEqual(0);
    expect(date).toBe(journey.serviceDate);
  });
});
