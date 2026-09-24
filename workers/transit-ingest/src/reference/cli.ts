import { mkdir, writeFile } from 'node:fs/promises';
import {
  composeGeographicJourneys,
  route,
  type WalkingCandidate,
} from '@dallas-transit/router';
import { readReferenceFeed } from './feed.js';
import { corpus } from './corpus.js';
import {
  compare,
  inSearchWindow,
  normalizeLineFinder,
  normalizeOtp,
  validateItinerary,
} from './compare.js';
import { queryOtp } from './otp.js';
import { startOtp } from './environment.js';

const feed = await readReferenceFeed('data/raw/gtfs/dart-recent.zip');
await mkdir('data/raw/otp', { recursive: true });
console.log(
  'Starting fresh OTP 2.7.0 reference container (read-only retained ZIP)...',
);
const environment = await startOtp();
try {
  // Calibrate the pinned API's transfer/boarding discrepancy independently.
  const calibration = [];
  for (const [id, rawLimit, expected] of [
    ['direct-alternatives', 0, false],
    ['direct-alternatives', 1, true],
    ['one-transfer', 1, false],
    ['one-transfer', 2, true],
  ] as const) {
    const test = corpus.find((c) => c.id === id)!;
    const response = await queryOtp(environment.endpoint, test, rawLimit);
    const exists = response.itineraries.length > 0;
    calibration.push({
      id,
      rawLimit,
      exists,
      expected,
      classification: 'OTP/reference behavior difference',
    });
    if (exists !== expected)
      throw new Error(
        'OTP transfer-limit calibration changed; investigate reference version/configuration',
      );
  }
  const reports = [];
  let failures = 0;
  for (const date of new Set(corpus.map((c) => c.date))) {
    const schedule = feed.schedule(date);
    for (const test of corpus.filter((c) => c.date === date)) {
      const result = route(schedule, {
        serviceDate: date,
        originStopId: test.from,
        destinationStopId: test.to,
        departureTime: test.departure,
        maxTransfers: test.maxTransfers,
      });
      const linefinder =
        result.status === 'ok' ? result.journeys.map(normalizeLineFinder) : [];
      // Identical real feed coordinates imply zero access/egress distance.
      // This tests composition without inventing street edges or walk times.
      let geographicBoundary: 'verified' | undefined;
      if (test.id === 'boarding-boundary' || test.id === 'missed-boundary') {
        const candidate = (id: string): WalkingCandidate => {
          const stop = feed.stops.find((s) => s.stop_id === id)!;
          const coordinate = {
            latitude: Number(stop.stop_lat),
            longitude: Number(stop.stop_lon),
          };
          return {
            publicationId: feed.hash,
            stopId: id,
            coordinate,
            walk: {
              origin: coordinate,
              destination: coordinate,
              durationSeconds: 0,
              distanceMeters: 0,
            },
          };
        };
        const access = candidate(test.from);
        const egress = candidate(test.to);
        const composed = composeGeographicJourneys(
          schedule,
          {
            serviceDate: date,
            origin: access.coordinate,
            destination: egress.coordinate,
            departureTime: test.departure,
            maxTransfers: test.maxTransfers,
          },
          [access],
          [egress],
        );
        if (
          composed.status !== 'ok' ||
          composed.journeys.length !== linefinder.length ||
          composed.journeys.some(
            (j, i) =>
              j.arrivalTime !== linefinder[i]!.arrival ||
              j.walkingDurationSeconds !== 0 ||
              j.walkingDistanceMeters !== 0,
          )
        )
          throw new Error(
            'Zero-walk geographic boundary differs from stop routing',
          );
        geographicBoundary = 'verified';
      }
      const reference = await queryOtp(environment.endpoint, test);
      const allOtp = reference.itineraries.map((i) => normalizeOtp(i, date));
      const otp = allOtp.filter((i) => inSearchWindow(i, test.departure));
      const excludedOtp = allOtp
        .filter((i) => !inSearchWindow(i, test.departure))
        .map((itinerary) => ({
          classification: 'OTP/reference behavior difference',
          reason:
            'Debug API returned a departure outside the explicit two-hour search window',
          itinerary,
        }));
      // Do not silently clip LineFinder: its entire frontier must fit the window.
      const invalid = [
        ...linefinder.map((itinerary) => ({ engine: 'LineFinder', itinerary })),
        ...otp.map((itinerary) => ({ engine: 'OTP', itinerary })),
      ].flatMap(({ engine, itinerary }) => {
        const errors = validateItinerary(
          itinerary,
          schedule,
          test.from,
          test.to,
          test.departure,
          test.maxTransfers,
        );
        if (!inSearchWindow(itinerary, test.departure))
          errors.push('LineFinder frontier exceeds reference search window');
        return errors.length ? [{ engine, itinerary, errors }] : [];
      });
      const comparison = invalid.length
        ? {
            status: 'unresolved',
            detail: 'Invalid or non-equivalent witness; see invalid',
          }
        : compare(linefinder, otp);
      if (
        !['agreement', 'valid alternative itinerary'].includes(
          comparison.status,
        )
      )
        failures++;
      reports.push({
        test,
        activeServices: schedule.activeServiceIds,
        comparison,
        invalid,
        linefinder,
        otp,
        excludedOtp,
        geographicBoundary,
        otpRequest: reference.variables,
        searchWindowUsed: reference.searchWindowUsed,
        routingErrors: reference.routingErrors,
      });
      console.log(
        `${test.id}: ${comparison.status}; LF ${linefinder.map((i) => `${i.departure}-${i.arrival}/${i.transfers}`).join(', ') || 'none'}; OTP ${otp.length} comparable, ${excludedOtp.length} outside window`,
      );
    }
  }
  await writeFile(
    'data/raw/otp/comparison.json',
    JSON.stringify(
      { otpVersion: '2.7.0', feedSha256: feed.hash, calibration, reports },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `Evidence: data/raw/otp/comparison.json; ${failures} unresolved cases`,
  );
  if (failures) process.exitCode = 1;
} finally {
  await environment.stop();
}
