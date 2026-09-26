import { expect, it } from 'vitest';
import {
  distinction,
  routeColors,
  routeName,
  transitMode,
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
