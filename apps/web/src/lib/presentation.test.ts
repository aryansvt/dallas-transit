import { expect, it } from 'vitest';
import { distinction, routeColors } from './presentation';
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
