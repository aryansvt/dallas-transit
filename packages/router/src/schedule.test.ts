import { describe, expect, it } from 'vitest';
import { buildSchedule } from './index.js';
import { input, trip, visit } from './test-support.js';

describe('immutable schedule and pattern construction', () => {
  it('groups equal ordered stop/permission behavior, preserving branches and loops under one route', () => {
    const schedule = buildSchedule(
      input([
        trip('a', ['A', 'B', 'D'], [100, 200, 300], { routeId: 'line' }),
        trip('b', ['A', 'B', 'D'], [110, 210, 310], {
          routeId: 'line',
          events: [visit('A', 110, 1), visit('B', 210, 9), visit('D', 310, 99)],
        }),
        trip('branch', ['A', 'C', 'D'], [100, 200, 300], { routeId: 'line' }),
        trip('loop', ['A', 'B', 'A', 'D'], [100, 200, 300, 400], {
          routeId: 'line',
        }),
        trip('restricted', [], [], {
          routeId: 'line',
          events: [
            visit('A', 100, 1, { pickup: 1 }),
            visit('B', 200, 2),
            visit('D', 300, 3),
          ],
        }),
        trip('other-route', ['A', 'B', 'D'], [100, 200, 300]),
      ]),
    );
    expect(schedule.patterns).toHaveLength(5);
    expect(
      schedule.patterns
        .find((p) => p.tripIndexes.length === 2)
        ?.tripIndexes.map((i) => schedule.trips[i]?.id),
    ).toEqual(['a', 'b']);
    expect(
      schedule.patterns.find((p) => p.stopIds.length === 4)?.stopIds,
    ).toEqual(['A', 'B', 'A', 'D']);
    expect(schedule.eventCount).toBe(19);
  });
  it('copies inputs and freezes nested schedule data, leaving caller inputs mutable', () => {
    const events = [visit('A', 100, 1), visit('D', 200, 2)];
    const fixture = input([trip('a', [], [], { events })]);
    const schedule = buildSchedule(fixture);
    events[0] = visit('B', 100, 1);
    expect(schedule.trips[0]?.events[0]?.stopId).toBe('A');
    expect(() =>
      Object.assign(schedule.trips[0]!.events[0]!, { departure: 0 }),
    ).toThrow();
    expect(() =>
      Object.assign(schedule.patterns[0]!.tripIndexes, { 0: 99 }),
    ).toThrow();
    expect(Object.isFrozen(fixture)).toBe(false);
    expect(Object.isFrozen(schedule.stops)).toBe(true);
  });
  it('filters service once during preparation and exposes only the selected publication/date', () => {
    const schedule = buildSchedule(
      input([
        trip('active', ['A', 'D'], [100, 200]),
        trip('inactive', ['A', 'D'], [90, 110], { serviceId: 'other' }),
      ]),
    );
    expect(schedule.trips.map((t) => t.id)).toEqual(['active']);
    expect(schedule.eventCount).toBe(2);
    expect(schedule.publicationId).toBe('fixture-v1');
  });
  it.each([
    [
      'duplicate trip',
      input([
        trip('a', ['A', 'D'], [100, 200]),
        trip('a', ['A', 'D'], [100, 200]),
      ]),
    ],
    [
      'duplicate stop',
      input([], {
        stops: [
          { id: 'A', changeSeconds: 0 },
          { id: 'A', changeSeconds: 0 },
        ],
      }),
    ],
    ['unknown stop', input([trip('a', ['missing', 'D'], [100, 200])])],
    ['single event', input([trip('a', ['A'], [100])])],
    ['backwards time', input([trip('a', ['A', 'D'], [200, 100])])],
    [
      'bad sequence',
      input([
        trip('a', [], [], { events: [visit('A', 100, 2), visit('D', 200, 1)] }),
      ]),
    ],
    [
      'duplicate sequence',
      input([
        trip('a', [], [], { events: [visit('A', 100, 1), visit('D', 200, 1)] }),
      ]),
    ],
    [
      'departure before arrival',
      input([
        trip('a', [], [], {
          events: [visit('A', 100, 1, { departure: 99 }), visit('D', 200, 2)],
        }),
      ]),
    ],
    ['fractional time', input([trip('a', ['A', 'D'], [100.5, 200])])],
    ['overflow time', input([trip('a', ['A', 'D'], [100, 2147483648])])],
    ['invalid date', input([], { serviceDate: '2026-02-30' })],
    ['bad date format', input([], { serviceDate: '20260918' })],
    ['missing identity', input([], { publicationId: '' })],
    ['negative change', input([], { stops: [{ id: 'A', changeSeconds: -1 }] })],
    [
      'negative link',
      input([], {
        transfers: [
          { id: 'x', fromStopId: 'A', toStopId: 'B', durationSeconds: -1 },
        ],
      }),
    ],
    [
      'unknown link stop',
      input([], {
        transfers: [
          { id: 'x', fromStopId: 'A', toStopId: 'missing', durationSeconds: 0 },
        ],
      }),
    ],
  ])('rejects invalid representation: %s', (_name, fixture) => {
    expect(() => buildSchedule(fixture)).toThrow();
  });
});
