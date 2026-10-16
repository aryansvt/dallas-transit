import { expect, it } from 'vitest';
import {
  distinction,
  routeColors,
  routeName,
  transferLevel,
  transitMode,
  worstTransfer,
} from './presentation';
import { journeyPoints } from './map-points';
import {
  previewDestination,
  previewOrigin,
  previewResponse,
} from '../preview/fixtures';
it('assigns comparative labels only for distinct winning metrics', () => {
  const { journeys } = previewResponse();
  expect(distinction(journeys[0]!, journeys)).toBe('Fastest');
  expect(distinction(journeys[1]!, journeys)).toBe('No transfers');
  expect(distinction(journeys[2]!, journeys)).toBe('Least walking');
  expect(distinction(journeys[0]!, [journeys[0]!])).toBe('');
});
it('tags the latest leave, not the earliest arrival, for arrive-by options', () => {
  // these leave at different times, so arriving first is not fastest
  const journeys = previewResponse().journeys.map((j, i) => ({
    ...j,
    requestedDepartureTime: [28860, 28980, 29640][i]!,
  }));
  const tags = journeys.map((j) => distinction(j, journeys, true));
  expect(tags).toEqual(['', 'No transfers', 'Leaves latest']);
  expect(tags).not.toContain('Fastest');
});
it('uses zero-transfer facts for ties without manufacturing a distinction for tied transfer journeys', () => {
  const journey = previewResponse().journeys[1]!;
  const duplicate = { ...journey };
  expect(distinction(journey, [journey, duplicate])).toBe('No transfers');
  const transfer = { ...journey, transferCount: 1 };
  expect(distinction(transfer, [transfer, { ...transfer }])).toBe('');
  expect(
    distinction(transfer, [transfer, { ...transfer, transferCount: 2 }]),
  ).toBe('Fewest transfers');
});
it('keeps genuine route color while repairing low-contrast or invalid text', () => {
  const orange = previewResponse().references.routes[3]!;
  expect(routeColors(orange).color).toBe('#000000');
  expect(
    routeColors({ ...orange, color: 'FFFFFF', textColor: 'FFFFFF' }).color,
  ).toBe('#000000');
  expect(routeColors({ ...orange, color: 'bad-color' }).backgroundColor).toBe(
    '#192c3c',
  );
});
it('produces only relevant points and collapses a same-stop transfer', () => {
  const response = previewResponse();
  const points = journeyPoints(
    response.journeys[0],
    response.references,
    previewOrigin,
    previewDestination,
  );
  expect(points).toHaveLength(5);
  expect(points.find((p) => p.key === 'akard')?.label).toBe(
    'Transfer: Akard Station',
  );
  expect(points.every((p) => !('geometry' in p))).toBe(true);
});

it('names each rail service and capitalizes bus instructions without raw IDs', () => {
  const base = previewResponse().references.routes[0]!;
  for (const color of ['Red', 'Blue', 'Green', 'Orange', 'Silver'])
    expect(
      routeName({
        ...base,
        shortName: color.toUpperCase(),
        type: color === 'Silver' ? 2 : 0,
      }),
    ).toBe(`${color} Line`);
  expect(routeName({ ...base, shortName: 'TRE', type: 2 })).toBe('TRE');
  expect(routeName({ ...base, shortName: '244', type: 3 })).toBe('Bus 244');
  expect(transitMode({ ...base, type: 4 })).toBe('service');
});
it('keeps tied fastest badges factual and prioritizes fewer transfers over walking', () => {
  const base = previewResponse().journeys[0]!;
  const a = {
    ...base,
    arrivalTime: 1000,
    transferCount: 1,
    walkingDurationSeconds: 200,
  };
  const b = {
    ...base,
    arrivalTime: 1000,
    transferCount: 2,
    walkingDurationSeconds: 100,
  };
  const c = {
    ...base,
    arrivalTime: 1100,
    transferCount: 2,
    walkingDurationSeconds: 300,
  };
  expect(distinction(a, [a, b, c])).toBe('Fewest transfers');
  expect(distinction(b, [a, b, c])).toBe('Least walking');
  expect(distinction(c, [a, b, c])).toBe('');
  const winner = { ...a, walkingDurationSeconds: 50 };
  expect(distinction(winner, [winner, b, c])).toBe('Fewest transfers');
});
it('words the router transfer shortfall and never invents one', () => {
  expect([0, 1, 180, 181, 300].map(transferLevel)).toEqual([
    'comfortable',
    'tight',
    'tight',
    'risky',
    'risky',
  ]);
  expect(transferLevel(undefined)).toBeNull();
});
it('reports the tightest transfer of a journey and how many share it', () => {
  // three rides: red, then two transfers
  const journey = previewResponse(false, 'two-transfers').journeys[0]!;
  // each ride's risk in order; undefined means the response had none
  const withRisk = (...risks: (number | undefined)[]) => {
    let ride = 0;
    return {
      ...journey,
      legs: journey.legs.map((l) => {
        if (l.kind !== 'transit') return l;
        const risk = risks[ride++];
        const bare = Object.fromEntries(
          Object.entries(l).filter(([k]) => k !== 'scheduledTransferRisk'),
        ) as typeof l;
        return risk === undefined
          ? bare
          : { ...bare, scheduledTransferRisk: risk };
      }),
    };
  };
  expect(worstTransfer(withRisk(undefined, 120, 0))).toEqual({
    level: 'tight',
    count: 1,
  });
  expect(worstTransfer(withRisk(undefined, 0, 0))).toEqual({
    level: 'comfortable',
    count: 2,
  });
  // 300 and 200 are both risky, so both count
  expect(worstTransfer(withRisk(undefined, 300, 200))).toEqual({
    level: 'risky',
    count: 2,
  });
  // an older response without per-leg risk gets no label
  expect(worstTransfer(withRisk(undefined, undefined, undefined))).toBeNull();
});
