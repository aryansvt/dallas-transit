import { describe, expect, it } from 'vitest';
import { buildSchedule, DEFAULT_MAX_TRANSFERS, route } from './index.js';
import {
  assertJourney,
  day,
  input,
  journeys,
  network,
  query,
  rides,
  trip,
  visit,
} from './test-support.js';

describe('direct journeys and reconstruction', () => {
  it('returns every exact event reference, dwell, waiting and service-day metadata', () => {
    const schedule = buildSchedule(
      input([
        trip('direct', [], [], {
          routeId: 'bus',
          events: [
            visit('A', 100, 3, { departure: 110 }),
            visit('D', 200, 17, { departure: 220 }),
          ],
        }),
      ]),
    );
    expect(journeys(schedule)).toEqual([
      {
        walkingDurationSeconds: 0,
        walkingDistanceMeters: 0,
        scheduledTransferRisk: 0,
        publicationId: 'fixture-v1',
        serviceDate: day,
        originStopId: 'A',
        destinationStopId: 'D',
        requestedDepartureTime: 90,
        arrivalTime: 200,
        durationSeconds: 110,
        boardingCount: 1,
        transferCount: 0,
        legs: [
          {
            kind: 'transit',
            tripId: 'direct',
            routeId: 'bus',
            patternId: 'pattern:0',
            boardingStopId: 'A',
            boardingOccurrence: 0,
            boardingSequence: 3,
            departureTime: 110,
            alightingStopId: 'D',
            alightingOccurrence: 1,
            alightingSequence: 17,
            arrivalTime: 200,
          },
        ],
      },
    ]);
  });
  it('allows boarding at exact departure and rejects one second later', () => {
    const schedule = buildSchedule(
      input([trip('direct', ['A', 'D'], [100, 200])]),
    );
    expect(journeys(schedule, { departureTime: 100 })[0]?.arrivalTime).toBe(
      200,
    );
    expect(query(schedule, { departureTime: 101 })).toEqual({
      status: 'no-journey',
      reason: 'unreachable',
    });
  });
  it('returns a zero-leg journey for an already reached known destination', () => {
    const schedule = buildSchedule(input([]));
    const result = journeys(schedule, { destinationStopId: 'A' })[0]!;
    expect(result).toMatchObject({
      legs: [],
      arrivalTime: 90,
      boardingCount: 0,
      transferCount: 0,
      durationSeconds: 0,
    });
    assertJourney(schedule, result);
  });
  it('cannot ride backwards in a trip', () => {
    expect(
      query(buildSchedule(input([trip('reverse', ['D', 'A'], [100, 200])])))
        .status,
    ).toBe('no-journey');
  });
});

describe('round progression and search bounds', () => {
  it('returns an exact direct / one-transfer / two-transfer Pareto set, earliest first', () => {
    const schedule = network();
    const result = journeys(schedule);
    expect(
      result.map((j) => [
        j.arrivalTime,
        j.transferCount,
        rides(j).map((l) => l.tripId),
      ]),
    ).toEqual([
      [250, 2, ['feeder', 'middle', 'final']],
      [300, 1, ['feeder', 'catchable']],
      [500, 0, ['slow-direct']],
    ]);
    expect(
      rides(result[0]!).map((l) => [
        l.boardingStopId,
        l.boardingSequence,
        l.departureTime,
        l.alightingStopId,
        l.alightingSequence,
        l.arrivalTime,
      ]),
    ).toEqual([
      ['A', 10, 100, 'B', 20, 150],
      ['B', 10, 150, 'C', 20, 200],
      ['C', 10, 200, 'D', 20, 250],
    ]);
    result.forEach((j) => assertJourney(schedule, j));
  });
  it.each([
    [0, 500],
    [1, 300],
    [2, 250],
  ])(
    'maxTransfers=%i bounds boardings, best arrival=%i',
    (maxTransfers, arrival) => {
      expect(journeys(network(), { maxTransfers })[0]?.arrivalTime).toBe(
        arrival,
      );
    },
  );
  it('does not take a second ride within a single round', () => {
    const schedule = buildSchedule(
      input([
        trip('a', ['A', 'B'], [100, 150]),
        trip('b', ['B', 'D'], [150, 200]),
      ]),
    );
    expect(query(schedule, { maxTransfers: 0 }).status).toBe('no-journey');
    expect(journeys(schedule, { maxTransfers: 1 })[0]?.boardingCount).toBe(2);
  });
  it('rescans a route when an earlier local arrival in a later round enables it', () => {
    const schedule = buildSchedule(
      input([
        trip('slow', ['A', 'C'], [100, 300]),
        trip('first', ['A', 'B'], [100, 150]),
        trip('shortcut', ['B', 'C'], [160, 200]),
        trip('connection', ['C', 'D'], [210, 240]),
      ]),
    );
    expect(query(schedule, { maxTransfers: 1 }).status).toBe('no-journey');
    expect(
      rides(journeys(schedule, { maxTransfers: 2 })[0]!).map((l) => l.tripId),
    ).toEqual(['first', 'shortcut', 'connection']);
  });
  it('misses an early connection and catches a later trip', () => {
    const schedule = buildSchedule(
      input([
        trip('first', ['A', 'B'], [100, 150]),
        trip('early', ['B', 'D'], [149, 200], { routeId: 'line' }),
        trip('late', ['B', 'D'], [151, 250], { routeId: 'line' }),
      ]),
    );
    expect(rides(journeys(schedule)[0]!).map((l) => l.tripId)).toEqual([
      'first',
      'late',
    ]);
  });
  it('enforces supplied change time only after the first boarding', () => {
    const schedule = buildSchedule(
      input(
        [
          trip('first', ['A', 'B'], [100, 150]),
          trip('tight', ['B', 'D'], [169, 200]),
          trip('valid', ['B', 'D'], [170, 250]),
        ],
        { stops: ['A', 'B', 'D'].map((id) => ({ id, changeSeconds: 20 })) },
      ),
    );
    const journey = journeys(schedule, { departureTime: 100 })[0]!;
    expect(rides(journey).map((l) => l.tripId)).toEqual(['first', 'valid']);
    assertJourney(schedule, journey);
  });
  it('defines and can override the bounded default', () => {
    expect(DEFAULT_MAX_TRANSFERS).toBe(3);
    const schedule = buildSchedule(
      input(
        ['A', 'B', 'C', 'D', 'E'].map((stop, i) =>
          trip(
            String(i),
            [stop, ['B', 'C', 'D', 'E', 'Z'][i]!],
            [100 + i * 10, 110 + i * 10],
          ),
        ),
      ),
    );
    expect(query(schedule, { destinationStopId: 'Z' }).status).toBe(
      'no-journey',
    );
    expect(
      journeys(schedule, { destinationStopId: 'Z', maxTransfers: 4 })[0]
        ?.boardingCount,
    ).toBe(5);
  });
});

describe('explicit interchange links', () => {
  const trips = [
    trip('a', ['A', 'B'], [100, 150]),
    trip('b', ['Y', 'D'], [180, 220]),
  ];
  const links = [
    { id: 'bx', fromStopId: 'B', toStopId: 'X', durationSeconds: 10 },
    { id: 'xy', fromStopId: 'X', toStopId: 'Y', durationSeconds: 20 },
    { id: 'xb', fromStopId: 'X', toStopId: 'B', durationSeconds: 0 },
  ];
  it('propagates directed chains without adding boardings and reconstructs links', () => {
    const schedule = buildSchedule(input(trips, { transfers: links }));
    const journey = journeys(schedule)[0]!;
    expect(
      journey.legs.map((l) => [l.kind, l.departureTime, l.arrivalTime]),
    ).toEqual([
      ['transit', 100, 150],
      ['transfer', 150, 160],
      ['transfer', 160, 180],
      ['transit', 180, 220],
    ]);
    expect(journey.transferCount).toBe(1);
    assertJourney(schedule, journey);
  });
  it('does not invent a link or catch a trip before the link finishes', () => {
    expect(query(buildSchedule(input(trips))).status).toBe('no-journey');
    expect(
      query(
        buildSchedule(
          input(trips, {
            transfers: links.map((l) => ({
              ...l,
              durationSeconds: l.durationSeconds + 1,
            })),
          }),
        ),
      ).status,
    ).toBe('no-journey');
  });
  it('never uses interchange links for origin access or destination egress', () => {
    const schedule = buildSchedule(input(trips, { transfers: links }));
    expect(query(schedule, { originStopId: 'B' }).status).toBe('no-journey');
    expect(query(schedule, { destinationStopId: 'Y' }).status).toBe(
      'no-journey',
    );
  });
  it('terminates zero-duration link cycles and handles later better propagation', () => {
    const schedule = buildSchedule(
      input(trips, {
        transfers: [
          ...links.map((l) => ({ ...l, durationSeconds: 0 })),
          { id: 'ay', fromStopId: 'B', toStopId: 'Y', durationSeconds: 29 },
        ],
      }),
    );
    const journey = journeys(schedule)[0]!;
    expect(
      journey.legs
        .filter((l) => l.kind === 'transfer')
        .map((l) => l.transferId),
    ).toEqual(['bx', 'xy']);
    assertJourney(schedule, journey);
  });
  it('retains a transit destination result even when a link reaches it earlier', () => {
    const schedule = buildSchedule(
      input(
        [trip('a', ['A', 'B'], [100, 150]), trip('b', ['B', 'D'], [150, 200])],
        {
          transfers: [
            { id: 'bd', fromStopId: 'B', toStopId: 'D', durationSeconds: 1 },
          ],
        },
      ),
    );
    expect(journeys(schedule)[0]?.arrivalTime).toBe(200);
  });
  it('does not prune a return to origin that unlocks an interchange link (oracle regression)', () => {
    const schedule = buildSchedule(
      input(
        [
          trip('loop', ['A', 'B', 'A'], [100, 120, 150]),
          trip('onward', ['X', 'D'], [160, 200]),
        ],
        {
          transfers: [
            { id: 'ax', fromStopId: 'A', toStopId: 'X', durationSeconds: 10 },
          ],
        },
      ),
    );
    const journey = journeys(schedule)[0]!;
    expect(
      journey.legs.map((l) => [l.kind, l.departureTime, l.arrivalTime]),
    ).toEqual([
      ['transit', 100, 150],
      ['transfer', 150, 160],
      ['transit', 160, 200],
    ]);
    assertJourney(schedule, journey);
  });
});

describe('service and service-day time', () => {
  it('selects explicitly active services and refuses a different service date', () => {
    const trips = [
      trip('weekday', ['A', 'D'], [100, 200]),
      trip('special', ['A', 'D'], [100, 150], { serviceId: 'special' }),
    ];
    const schedule = buildSchedule(input(trips));
    expect(rides(journeys(schedule)[0]!)[0]?.tripId).toBe('weekday');
    expect(query(schedule, { serviceDate: '2026-09-19' })).toEqual({
      status: 'no-journey',
      reason: 'service-date-not-loaded',
    });
    const next = buildSchedule(
      input(trips, {
        serviceDate: '2026-09-19',
        activeServiceIds: ['special'],
      }),
    );
    expect(
      rides(journeys(next, { serviceDate: '2026-09-19' })[0]!)[0]?.tripId,
    ).toBe('special');
  });
  it('routes 24:15, 25:30, and 26:06 without wrapping and transfers overnight', () => {
    const schedule = buildSchedule(
      input([
        trip('night', ['A', 'B'], [87300, 91800]),
        trip('later', ['B', 'D'], [91800, 93960]),
      ]),
    );
    const journey = journeys(schedule, { departureTime: 87300 })[0]!;
    expect(rides(journey).map((l) => [l.departureTime, l.arrivalTime])).toEqual(
      [
        [87300, 91800],
        [91800, 93960],
      ],
    );
    expect(journey.durationSeconds).toBe(6660);
    assertJourney(schedule, journey);
  });
});

describe('permissions, loops, missing times and overtaking', () => {
  it('enforces pickup and drop-off restrictions on connecting events', () => {
    for (const restricted of ['pickup', 'dropOff'] as const) {
      const schedule = buildSchedule(
        input([
          trip('first', [], [], {
            events: [
              visit('A', 100, 1),
              visit(
                'B',
                150,
                2,
                restricted === 'dropOff' ? { dropOff: 1 } : {},
              ),
            ],
          }),
          trip('second', [], [], {
            events: [
              visit('B', 150, 1, restricted === 'pickup' ? { pickup: 1 } : {}),
              visit('D', 200, 2),
            ],
          }),
        ]),
      );
      expect(query(schedule).status).toBe('no-journey');
    }
  });
  it('allows zero travel seconds while requiring distinct ordered occurrences', () => {
    const schedule = buildSchedule(
      input([trip('instant', ['A', 'D'], [100, 100])]),
    );
    const journey = journeys(schedule, { departureTime: 100 })[0]!;
    expect(journey.durationSeconds).toBe(0);
    assertJourney(schedule, journey);
  });
  it.each([1, 2, 3] as const)(
    'does not board or alight using permission %i',
    (permission) => {
      for (const events of [
        [visit('A', 100, 1, { pickup: permission }), visit('D', 200, 2)],
        [visit('A', 100, 1), visit('D', 200, 2, { dropOff: permission })],
      ])
        expect(
          query(buildSchedule(input([trip('restricted', [], [], { events })])))
            .status,
        ).toBe('no-journey');
    },
  );
  it('can ride through prohibited or untimed intermediate visits', () => {
    const schedule = buildSchedule(
      input([
        trip('through', [], [], {
          events: [
            visit('A', 100, 1),
            visit('B', 0, 3, { arrival: null, departure: null }),
            visit('C', 180, 5, { pickup: 1, dropOff: 1 }),
            visit('D', 200, 8),
          ],
        }),
      ]),
    );
    expect(journeys(schedule)[0]?.arrivalTime).toBe(200);
    expect(query(schedule, { destinationStopId: 'B' }).status).toBe(
      'no-journey',
    );
    expect(query(schedule, { originStopId: 'B' }).status).toBe('no-journey');
    expect(query(schedule, { destinationStopId: 'C' }).status).toBe(
      'no-journey',
    );
  });
  it('uses the correct later loop occurrence with nonconsecutive sequences', () => {
    const schedule = buildSchedule(
      input([
        trip('loop', [], [], {
          events: [
            visit('A', 100, 1, { pickup: 1 }),
            visit('D', 150, 7),
            visit('A', 200, 13),
            visit('D', 250, 42),
          ],
        }),
      ]),
    );
    expect(rides(journeys(schedule)[0]!)[0]).toMatchObject({
      boardingOccurrence: 2,
      boardingSequence: 13,
      departureTime: 200,
      alightingOccurrence: 3,
      alightingSequence: 42,
      arrivalTime: 250,
    });
    expect(query(schedule, { departureTime: 201 }).status).toBe('no-journey');
  });
  it('allows a later repeated pickup after missing the first, with no collapsed visits', () => {
    const schedule = buildSchedule(
      input([trip('loop', ['A', 'D', 'A', 'D'], [100, 150, 200, 250])]),
    );
    expect(
      rides(journeys(schedule, { departureTime: 160 })[0]!)[0]
        ?.boardingOccurrence,
    ).toBe(2);
  });
  it('keeps riding past a forbidden first drop-off to the allowed later occurrence', () => {
    const schedule = buildSchedule(
      input([
        trip('loop', [], [], {
          events: [
            visit('A', 100, 1),
            visit('D', 150, 2, { dropOff: 1 }),
            visit('B', 200, 3),
            visit('D', 250, 4),
          ],
        }),
      ]),
    );
    expect(rides(journeys(schedule)[0]!)[0]?.alightingOccurrence).toBe(3);
  });
  it('finds the later-departing overtaker and a different winner at an intermediate stop', () => {
    const schedule = buildSchedule(
      input([
        trip('early', ['A', 'B', 'D'], [100, 150, 300], { routeId: 'same' }),
        trip('late', ['A', 'B', 'D'], [110, 160, 200], { routeId: 'same' }),
      ]),
    );
    expect(schedule.patterns).toHaveLength(1);
    expect(rides(journeys(schedule)[0]!)[0]?.tripId).toBe('late');
    expect(
      rides(journeys(schedule, { destinationStopId: 'B' })[0]!)[0]?.tripId,
    ).toBe('early');
  });
});

describe('determinism and no-journey outcomes', () => {
  it('prefers fewer transfers on equal arrival, without fabricated metrics', () => {
    const schedule = buildSchedule(
      input([
        trip('direct', ['A', 'D'], [100, 200]),
        trip('first', ['A', 'B'], [100, 150]),
        trip('second', ['B', 'D'], [150, 200]),
      ]),
    );
    expect(
      journeys(schedule).map((j) => [j.arrivalTime, j.transferCount]),
    ).toEqual([[200, 0]]);
  });
  it('is independent of input order, stable on tied trips, and reusable across queries', () => {
    const trips = [
      trip('z', ['A', 'D'], [100, 200], { routeId: 'same' }),
      trip('a', ['A', 'D'], [100, 200], { routeId: 'same' }),
    ];
    const first = buildSchedule(input(trips));
    const reordered = buildSchedule(
      input([...trips].reverse(), { stops: [...first.stops].reverse() }),
    );
    expect(query(first)).toEqual(query(reordered));
    expect(rides(journeys(first)[0]!)[0]?.tripId).toBe('a');
    query(first, { departureTime: 300 });
    expect(query(first)).toEqual(query(reordered));
  });
  it.each([
    ['disconnected', input([trip('a', ['A', 'B'], [100, 200])]), 'unreachable'],
    [
      'inactive service',
      input([trip('a', ['A', 'D'], [100, 200])], { activeServiceIds: [] }),
      'no-service',
    ],
    [
      'last departure',
      input([trip('a', ['A', 'D'], [80, 200])]),
      'unreachable',
    ],
    [
      'missed transfer',
      input([
        trip('a', ['A', 'B'], [100, 150]),
        trip('b', ['B', 'D'], [149, 200]),
      ]),
      'unreachable',
    ],
  ])('returns a typed normal outcome for %s', (_name, fixture, reason) => {
    expect(query(buildSchedule(fixture))).toEqual({
      status: 'no-journey',
      reason,
    });
  });
  it('distinguishes an unknown stop from unreachable known stops', () => {
    expect(query(network(), { originStopId: 'missing' })).toEqual({
      status: 'no-journey',
      reason: 'unknown-stop',
    });
  });
  it.each([-1, 0.5, NaN, Infinity])(
    'rejects invalid query values %s',
    (value) => {
      expect(() => query(network(), { departureTime: value })).toThrow();
      expect(() => query(network(), { maxTransfers: value })).toThrow();
    },
  );
  it('does not let an invalid calendar date enter a query', () => {
    expect(() =>
      route(network(), {
        serviceDate: '2026-02-30',
        originStopId: 'A',
        destinationStopId: 'D',
        departureTime: 0,
      }),
    ).toThrow();
  });
});
