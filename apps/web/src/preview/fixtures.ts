import {
  copyPlace,
  type GeographicJourney,
  type JourneyRequest,
  type JourneyResponse,
  type Place,
  type References,
  type TransitLeg,
} from '@dallas-transit/shared';
import { ClientError, errorMessage, type TransitClient } from '../lib/api';
import type { ClassSeries } from '../lib/ics';
import type { Presets } from '../lib/presets';
import type { PreviewSetup } from '../lib/preview-setup';
import { classDestination } from '../lib/class-schedule';
import { STUDENT_PLACES } from '../lib/student-places';

// Original synthetic presentation fixtures. Names provide Dallas context; times,
// connections and coordinates are examples, not travel advice or copied feed rows.
export const previewOrigin: Place = {
  name: 'Current location',
  latitude: 32.7788,
  longitude: -96.8079,
};
export const previewPlaces: Place[] = [
  {
    name: 'Dallas Museum of Art',
    context: 'Arts District, Dallas',
    latitude: 32.7876,
    longitude: -96.8009,
  },
  {
    name: 'Perot Museum of Nature and Science',
    context: 'Victory Park, Dallas',
    latitude: 32.7869,
    longitude: -96.8066,
  },
  {
    name: 'West End Station',
    context: 'Downtown Dallas',
    latitude: 32.7809,
    longitude: -96.8054,
  },
  {
    name: 'Klyde Warren Park',
    context: 'Woodall Rodgers Freeway, Dallas',
    latitude: 32.789,
    longitude: -96.8017,
  },
];
export const previewDestination = previewPlaces[0]!;
const references: References = {
  stops: [
    {
      stopId: 'west',
      name: 'West End Station',
      coordinate: { latitude: 32.7809, longitude: -96.8054 },
      code: null,
      platformCode: null,
      parentStationId: null,
    },
    {
      stopId: 'akard',
      name: 'Akard Station',
      coordinate: { latitude: 32.7813, longitude: -96.7976 },
      code: null,
      platformCode: null,
      parentStationId: null,
    },
    {
      stopId: 'paul',
      name: 'St. Paul Station',
      coordinate: { latitude: 32.7841, longitude: -96.7948 },
      code: null,
      platformCode: null,
      parentStationId: null,
    },
    {
      stopId: 'pearl',
      name: 'Pearl/Arts District Station',
      coordinate: { latitude: 32.7866, longitude: -96.7932 },
      code: null,
      platformCode: null,
      parentStationId: null,
    },
  ],
  routes: [
    {
      routeId: 'red',
      shortName: 'RED',
      longName: 'Red Line',
      color: 'C63532',
      textColor: 'FFFFFF',
      type: 0,
      agencyTimezone: 'America/Chicago',
    },
    {
      routeId: 'blue',
      shortName: 'BLUE',
      longName: 'Blue Line',
      color: '196599',
      textColor: 'FFFFFF',
      type: 0,
      agencyTimezone: 'America/Chicago',
    },
    {
      routeId: 'bus',
      shortName: '17',
      longName: 'Arts District',
      color: null,
      textColor: null,
      type: 3,
      agencyTimezone: 'America/Chicago',
    },
    {
      routeId: 'orange',
      shortName: 'ORANGE',
      longName: 'Orange Line',
      color: 'DB761E',
      textColor: 'FFFFFF',
      type: 0,
      agencyTimezone: 'America/Chicago',
    },
  ],
  trips: [
    { tripId: 'red-trip', headsign: 'Parker Road', directionId: 0 },
    { tripId: 'blue-trip', headsign: 'Downtown Rowlett', directionId: 1 },
    { tripId: 'bus-trip', headsign: 'Arts District', directionId: 0 },
    { tripId: 'orange-trip', headsign: 'Parker Road', directionId: 0 },
  ],
};
type OkResponse = Extract<JourneyResponse, { status: 'ok' }>;
/** Fixture risk on a later boarding, in router seconds (see presentation). */
const later = (leg: TransitLeg, risk: number): TransitLeg => ({
  ...leg,
  scheduledTransferRisk: risk,
});
export function previewResponse(
  overnight = false,
  variant: 'default' | 'transfers' | 'two-transfers' = 'default',
): OkResponse {
  const offset = overnight ? 57600 : 0;
  const base = {
    publicationId: '11111111-1111-4111-8111-111111111111',
    serviceDate: '2026-09-18',
    origin: {
      latitude: previewOrigin.latitude,
      longitude: previewOrigin.longitude,
    },
    destination: {
      latitude: previewDestination.latitude,
      longitude: previewDestination.longitude,
    },
    requestedDepartureTime: 28800 + offset,
  };
  const transit = (
    routeId: string,
    from: string,
    to: string,
    departure: number,
    arrival: number,
    stops: number,
  ): TransitLeg => ({
    kind: 'transit',
    tripId: `${routeId}-trip`,
    routeId,
    patternId: `fixture-${routeId}`,
    boardingStopId: from,
    alightingStopId: to,
    boardingOccurrence: 0,
    alightingOccurrence: stops,
    boardingSequence: 1,
    alightingSequence: stops * 10 + 1,
    departureTime: departure + offset,
    arrivalTime: arrival + offset,
  });
  const make = (
    rides: TransitLeg[],
    accessSeconds: number,
    egressSeconds: number,
  ): GeographicJourney => {
    const last = rides.at(-1)!;
    const arrivalTime = last.arrivalTime + egressSeconds;
    const egress = references.stops.find(
      (s) => s.stopId === last.alightingStopId,
    )!;
    return {
      ...base,
      accessStopId: 'west',
      egressStopId: egress.stopId,
      arrivalTime,
      durationSeconds: arrivalTime - base.requestedDepartureTime,
      boardingCount: rides.length,
      transferCount: rides.length - 1,
      walkingDurationSeconds: accessSeconds + egressSeconds,
      walkingDistanceMeters: (accessSeconds + egressSeconds) * 1.2,
      interchangeDurationSeconds: 0,
      legs: [
        {
          kind: 'walk',
          phase: 'access',
          stopId: 'west',
          origin: base.origin,
          destination: references.stops[0]!.coordinate,
          departureTime: base.requestedDepartureTime,
          arrivalTime: base.requestedDepartureTime + accessSeconds,
          durationSeconds: accessSeconds,
          distanceMeters: accessSeconds * 1.2,
        },
        ...rides,
        {
          kind: 'walk',
          phase: 'egress',
          stopId: egress.stopId,
          origin: egress.coordinate,
          destination: base.destination,
          departureTime: last.arrivalTime,
          arrivalTime,
          durationSeconds: egressSeconds,
          distanceMeters: egressSeconds * 1.2,
        },
      ],
    };
  };
  const red = transit('red', 'west', 'akard', 29160, 29700, 2);
  // spare after the two-minute change allowance: 8 min, 3 min and none
  const comfortable = later(
    transit('blue', 'akard', 'paul', 30300, 30840, 3),
    0,
  );
  const tight = later(transit('blue', 'akard', 'paul', 30000, 30540, 3), 120);
  const risky = later(transit('orange', 'akard', 'paul', 29820, 30300, 2), 300);
  const journeys = {
    default: [
      make([red, tight], 180, 180),
      make([transit('bus', 'west', 'paul', 29280, 30840, 8)], 180, 300),
      make([transit('orange', 'west', 'paul', 29820, 31200, 4)], 60, 120),
    ],
    transfers: [
      make([red, risky], 180, 180),
      make([red, tight], 180, 180),
      make([red, comfortable], 180, 180),
    ],
    'two-transfers': [
      make(
        [
          red,
          comfortable,
          later(transit('bus', 'paul', 'pearl', 30960, 31200, 2), 300),
        ],
        180,
        120,
      ),
    ],
  }[variant];
  return {
    ...base,
    status: 'ok',
    incomplete: false,
    references,
    journeys,
  };
}
export const scenarios = {
  granted: '01 · Home — location granted',
  manual: '02 · Home — manual origin',
  search: '03 · Place search',
  loading: '04 · Finding routes',
  results: '05 · Three route alternatives',
  empty: '06 · No journey',
  failure: '07 · Service failure',
  direct: '08 · Direct journey',
  transfer: '09 · Transfer journey',
  overnight: '10 · After midnight',
  partial: '11 · Incomplete options',
  expanded: '12 · Expanded map',
  long: '13 · Long destination name',
  'student-new': '14 · Student, no schedule yet',
  classes: '15 · Student, next class',
  'class-ongoing': '16 · Student, in class now',
  insight: '17 · Departure-time insight',
  'arrive-by': '18 · Arrive-by results',
  'student-worst': '19 · Student, worst-case data',
  'arrive-late': '20 · Arrive-by, leave time passed',
  'class-conflict': '21 · Next class, leave during class',
  transfers: '22 · Transfer confidence',
  'transfers-detail': '23 · Two transfers, step by step',
  'insight-later': '24 · Insight, no need to rush',
} as const;
export type Scenario = keyof typeof scenarios;
// a fall 2026 timetable; one building has no official entrance yet
const semester = {
  startDate: '2026-08-18',
  minutes: 75,
  interval: 1,
  until: '2026-12-03T23:59',
  exdates: ['2026-11-24T10:00', '2026-11-26T10:00'],
};
export const previewClasses: ClassSeries[] = [
  {
    ...semester,
    id: 'cs3345',
    title: 'CS 3345.001 Data Structures and Algorithmic Analysis',
    location: 'ECSW 1.315',
    startTime: '10:00',
    weekdays: [2, 4],
  },
  {
    ...semester,
    id: 'cs4349',
    title: 'CS 4349.002 Advanced Algorithm Design',
    location: 'JSOM 2.106',
    startTime: '13:00',
    weekdays: [2, 4],
  },
  {
    ...semester,
    id: 'govt2306',
    title: 'GOVT 2306.004 State and Local Government',
    location: 'ROC 2.103',
    startDate: '2026-08-17',
    startTime: '16:00',
    weekdays: [1, 3],
  },
];
// a back-to-back class across campus, for a leave time inside CS 3345
const backToBack: ClassSeries = {
  ...semester,
  id: 'psy2301',
  title: 'PSY 2301.002 Introduction to Psychology',
  location: 'GR 2.530',
  startTime: '11:30',
  weekdays: [2, 4],
};
type WalkingLeg = Extract<GeographicJourney['legs'][number], { kind: 'walk' }>;
const [utd, , , northside] = STUDENT_PLACES.map(copyPlace);
const previewPresets: Presets = { version: 1, home: northside!, school: utd! };
/** Arrive-by results: each option leaves as late as it can, latest first as
 * the API orders them. The 9:00 AM fixture moves to any deadline and date. */
function arriveByResponse(
  arrivalTime = 32400,
  arrivalBufferMinutes = 10,
  serviceDate = '2026-09-18',
): OkResponse {
  const response = previewResponse();
  const shift = arrivalTime - 32400;
  const moved = <T extends { departureTime: number; arrivalTime: number }>(
    l: T,
  ): T => ({
    ...l,
    departureTime: l.departureTime + shift,
    arrivalTime: l.arrivalTime + shift,
  });
  return {
    publicationId: response.publicationId,
    serviceDate,
    origin: response.origin,
    destination: response.destination,
    requestedArrivalTime: arrivalTime,
    arrivalBufferMinutes,
    status: 'ok',
    incomplete: false,
    references: response.references,
    journeys: response.journeys
      .map((j) => {
        const [walk, ride] = j.legs as [WalkingLeg, TransitLeg];
        const access = walk.arrivalTime - walk.departureTime;
        const leave = ride.departureTime - access - 120 + shift;
        return {
          ...j,
          serviceDate,
          requestedDepartureTime: leave,
          arrivalTime: j.arrivalTime + shift,
          durationSeconds: j.arrivalTime + shift - leave,
          legs: [
            { ...walk, departureTime: leave, arrivalTime: leave + access },
            ...j.legs.slice(1).map(moved),
          ],
        };
      })
      .sort((a, b) => b.requestedDepartureTime - a.requestedDepartureTime),
  };
}
export function previewSetup(scenario: Scenario): PreviewSetup {
  const response = previewResponse(scenario === 'overnight');
  const setup: PreviewSetup = {
    origin: previewOrigin,
    destination: previewDestination,
    saved: {
      version: 1,
      recent: [previewDestination, previewPlaces[1]!],
      saved: [previewPlaces[3]!],
    },
  };
  // Thursday 2026-09-17, 9:30 AM in Dallas
  const student = { ...setup, destination: null, now: '2026-09-17T14:30:00Z' };
  if (scenario === 'student-new') return student;
  // realistic worst case: Google Calendar addresses, long course names, a
  // building without an entrance, an empty room, five meetings a week, 80 rows
  if (scenario === 'student-worst')
    return {
      ...student,
      now: '2026-09-17T15:30:00Z',
      departure: {
        mode: 'by',
        date: '2026-09-30',
        time: '12:50',
        bufferMinutes: 30,
      },
      presets: {
        version: 1,
        home: {
          name: 'Canyon Creek Heights North, 2100 Waterview Parkway, Apartment 4127',
          context: 'Richardson, TX 75080',
          latitude: 32.981586,
          longitude: -96.755264,
        },
        school: null,
      },
      schedule: [
        {
          ...semester,
          id: 'w1',
          title:
            "CS 4485.0W1 Computer Science Project (Senior Design) for Accelerated Bachelor's and Master's Students",
          location:
            'ECSW 1.315 (Clark Auditorium), The University of Texas at Dallas, 800 W Campbell Rd, Richardson, TX 75080',
          startTime: '10:00',
          weekdays: [1, 2, 3, 4, 5],
        },
        {
          ...semester,
          id: 'w2',
          title: 'BMEN 4310.001 Transport Phenomena in Biological Systems',
          location: 'TI-BMES 2.102',
          startTime: '12:00',
          weekdays: [2, 4],
        },
        {
          ...semester,
          id: 'w3',
          title: 'Lab',
          location: '',
          startTime: '15:00',
          weekdays: [4],
        },
        ...Array.from({ length: 77 }, (_, i) => ({
          ...semester,
          id: `seminar-${i}`,
          title: `UNIV 1010.${String(i + 1).padStart(3, '0')} First-Year Seminar`,
          location: `SLC 1.${102 + i}`,
          startTime: '08:00',
          weekdays: [(i % 5) + 1],
        })),
      ],
    };
  if (scenario === 'classes' || scenario === 'class-ongoing')
    return {
      ...student,
      presets: previewPresets,
      schedule: previewClasses,
      ...(scenario === 'class-ongoing' ? { now: '2026-09-17T15:30:00Z' } : {}),
    };
  if (scenario === 'insight')
    return {
      ...setup,
      data: {
        ...response,
        departureInsight: {
          kind: 'leave-earlier',
          departureTime: 28380,
          arrivalChangeSeconds: -1080,
        },
      },
    };
  // Friday 7:48 AM: the latest option leaves at 8:14
  if (scenario === 'arrive-by')
    return { ...setup, now: '2026-09-18T12:48:00Z', data: arriveByResponse() };
  if (scenario === 'arrive-late')
    return { ...setup, now: '2026-09-18T13:20:00Z', data: arriveByResponse() };
  // in CS 3345 until 11:15; getting to an 11:30 class means leaving at 10:44
  if (scenario === 'class-conflict') {
    const target = classDestination(backToBack);
    return {
      ...student,
      now: '2026-09-17T15:20:00Z',
      presets: previewPresets,
      schedule: [...previewClasses, backToBack],
      destination: target && 'place' in target ? target.place : null,
      departure: {
        mode: 'by',
        date: '2026-09-17',
        time: '11:30',
        bufferMinutes: 10,
      },
      data: arriveByResponse(41400, 10, '2026-09-17'),
    };
  }
  if (scenario === 'transfers')
    return { ...setup, data: previewResponse(false, 'transfers') };
  if (scenario === 'transfers-detail')
    return {
      ...setup,
      data: previewResponse(false, 'two-transfers'),
      detail: 0,
    };
  if (scenario === 'insight-later')
    return {
      ...setup,
      data: {
        ...response,
        departureInsight: {
          kind: 'no-rush',
          departureTime: 29340,
          arrivalChangeSeconds: 0,
        },
      },
    };
  if (scenario === 'granted') return { ...setup, destination: null };
  if (scenario === 'manual')
    return { ...setup, origin: null, destination: null };
  if (scenario === 'search')
    return { ...setup, destination: null, search: true };
  if (scenario === 'loading') return { ...setup, loading: true };
  if (scenario === 'failure')
    return {
      ...setup,
      error: errorMessage(new ClientError('WALKING_UNAVAILABLE')),
    };
  if (scenario === 'empty')
    return {
      ...setup,
      data: {
        ...response,
        status: 'no-journey',
        journeys: [],
        incomplete: false,
        reason: 'transit-unreachable',
      },
    };
  if (scenario === 'long')
    return {
      ...setup,
      destination: {
        ...previewDestination,
        name: 'Dallas Museum of Art — Center for Creative Connections and Family Experiences',
      },
      data: response,
      detail: 0,
    };
  return {
    ...setup,
    data: { ...response, incomplete: scenario === 'partial' },
    ...(['direct', 'transfer', 'overnight', 'expanded'].includes(scenario)
      ? { detail: scenario === 'direct' ? 1 : 0 }
      : {}),
    ...(scenario === 'expanded' ? { expanded: true } : {}),
  };
}
function delay(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(new ClientError('REQUEST_CANCELED'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, 450);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}
export const previewClient: TransitClient = {
  async places(q, signal) {
    await delay(signal);
    return {
      status: 'ok',
      places: previewPlaces.filter((p) =>
        `${p.name} ${p.context}`.toLowerCase().includes(q.toLowerCase()),
      ),
    };
  },
  async journeys(request: JourneyRequest, signal) {
    await delay(signal);
    return 'arrivalTime' in request
      ? arriveByResponse(
          request.arrivalTime,
          request.arrivalBufferMinutes ?? 0,
          request.serviceDate,
        )
      : previewResponse();
  },
};
