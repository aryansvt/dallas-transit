import type { Journey, RoutingSchedule } from '@dallas-transit/router';

export type Classification =
  | 'LineFinder defect'
  | 'OTP/reference behavior difference'
  | 'input/configuration mismatch'
  | 'valid alternative itinerary'
  | 'currently unsupported/known limitation'
  | 'unresolved';
export interface Ride {
  trip: string;
  route: string;
  from: string;
  to: string;
  departure: number;
  arrival: number;
  serviceDate: string;
}
export interface Itinerary {
  departure: number;
  arrival: number;
  transfers: number;
  rides: Ride[];
}
export interface OtpItinerary {
  startTime: number;
  endTime: number;
  numberOfTransfers: number;
  legs: {
    transitLeg: boolean;
    startTime: number;
    endTime: number;
    serviceDate: string;
    from: { stop: { gtfsId: string } | null };
    to: { stop: { gtfsId: string } | null };
    trip: { gtfsId: string } | null;
    route: { gtfsId: string } | null;
  }[];
}

/** GTFS defines service-day zero as local noon minus twelve elapsed hours.
 * Using a wall-clock midnight or %86400 would break DST / >24:00 journeys. */
export function serviceDayEpoch(date: string): number {
  const utcNoon = Date.parse(`${date}T12:00:00Z`);
  if (
    !Number.isFinite(utcNoon) ||
    new Date(utcNoon).toISOString().slice(0, 10) !== date
  )
    throw new Error('Invalid service date');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(utcNoon);
  const part = (name: string) =>
    Number(parts.find((p) => p.type === name)!.value);
  const localAsUtc = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
  return (utcNoon - (localAsUtc - utcNoon)) / 1000 - 43200;
}

export function normalizeLineFinder(journey: Journey): Itinerary {
  if (journey.legs.some((l) => l.kind !== 'transit'))
    throw new Error('Stop-only reference does not support transfer walking');
  const rides = journey.legs
    .filter((l) => l.kind === 'transit')
    .map((l) => ({
      trip: l.tripId,
      route: l.routeId,
      from: l.boardingStopId,
      to: l.alightingStopId,
      departure: l.departureTime,
      arrival: l.arrivalTime,
      serviceDate: journey.serviceDate,
    }));
  return {
    departure: rides[0]?.departure ?? journey.requestedDepartureTime,
    arrival: journey.arrivalTime,
    transfers: journey.transferCount,
    rides,
  };
}

function rawId(value: string | undefined): string {
  if (!value?.startsWith('dart:') || value.length === 5)
    throw new Error('Unexpected OTP feed namespace or missing ID');
  return value.slice(5);
}
export function normalizeOtp(
  itinerary: OtpItinerary,
  serviceDate: string,
): Itinerary {
  const epoch = serviceDayEpoch(serviceDate);
  const seconds = (ms: number) => {
    if (!Number.isSafeInteger(ms) || ms % 1000 !== 0)
      throw new Error(
        'OTP timestamp is not integer milliseconds at second precision',
      );
    return ms / 1000 - epoch;
  };
  if (!itinerary.legs.length || itinerary.legs.some((l) => !l.transitLeg))
    throw new Error(
      'OTP returned walking or an empty itinerary in a stop-only comparison',
    );
  const rides = itinerary.legs.map((l) => ({
    trip: rawId(l.trip?.gtfsId),
    route: rawId(l.route?.gtfsId),
    from: rawId(l.from.stop?.gtfsId),
    to: rawId(l.to.stop?.gtfsId),
    departure: seconds(l.startTime),
    arrival: seconds(l.endTime),
    serviceDate: l.serviceDate,
  }));
  if (itinerary.numberOfTransfers !== rides.length - 1)
    throw new Error('OTP transfer count differs from boardings minus one');
  return {
    departure: seconds(itinerary.startTime),
    arrival: seconds(itinerary.endTime),
    transfers: itinerary.numberOfTransfers,
    rides,
  };
}

/** Replay both engines' witnesses against exact ordered feed visits. This is
 * essential before calling a different path an equally valid alternative. */
export function validateItinerary(
  itinerary: Itinerary,
  schedule: RoutingSchedule,
  origin: string,
  destination: string,
  requestedDeparture: number,
  maxTransfers: number,
): string[] {
  const errors: string[] = [];
  if (!itinerary.rides.length) return ['No transit rides'];
  if (
    itinerary.transfers !== itinerary.rides.length - 1 ||
    itinerary.transfers > maxTransfers
  )
    errors.push('Transfer count/bound');
  if (
    itinerary.departure !== itinerary.rides[0]!.departure ||
    itinerary.arrival !== itinerary.rides.at(-1)!.arrival
  )
    errors.push('Endpoint times');
  let stop = origin;
  let ready = requestedDeparture;
  for (const [index, ride] of itinerary.rides.entries()) {
    if (ride.serviceDate !== schedule.serviceDate)
      errors.push(`Adjacent service date: ${ride.serviceDate}`);
    const trip = schedule.trips.find(
      (t) => t.id === ride.trip && t.routeId === ride.route,
    );
    const boardings =
      trip?.events.flatMap((e, i) =>
        e.stopId === ride.from &&
        e.departure === ride.departure &&
        e.pickup === 0
          ? [i]
          : [],
      ) ?? [];
    if (
      !trip ||
      !boardings.some((b) =>
        trip.events.some(
          (e, a) =>
            a > b &&
            e.stopId === ride.to &&
            e.arrival === ride.arrival &&
            e.dropOff === 0,
        ),
      )
    )
      errors.push(`No matching ordered visits: ${ride.trip}`);
    const change = index
      ? (schedule.stops.find((s) => s.id === ride.from)?.changeSeconds ??
        Infinity)
      : 0;
    if (
      ride.from !== stop ||
      ride.departure < ready + change ||
      ride.arrival < ride.departure
    )
      errors.push(`Connection/chronology: ${ride.trip}`);
    stop = ride.to;
    ready = ride.arrival;
  }
  if (stop !== destination) errors.push('Wrong destination');
  return errors;
}

/** Departure is reported, but is not a LineFinder ranking objective. Keep all
 * tied witnesses; discard only strictly dominated arrival/transfer points. */
export function frontier(itineraries: readonly Itinerary[]): Itinerary[] {
  return itineraries.filter(
    (a) =>
      !itineraries.some(
        (b) =>
          b.arrival <= a.arrival &&
          b.transfers <= a.transfers &&
          (b.arrival < a.arrival || b.transfers < a.transfers),
      ),
  );
}
export function inSearchWindow(
  itinerary: Itinerary,
  departure: number,
): boolean {
  return (
    itinerary.departure >= departure && itinerary.departure <= departure + 7200
  );
}
function samePath(a: Itinerary, b: Itinerary): boolean {
  return (
    a.departure === b.departure &&
    a.rides.length === b.rides.length &&
    a.rides.every((r, i) => {
      const s = b.rides[i]!;
      return (
        r.route === s.route &&
        r.from === s.from &&
        r.to === s.to &&
        r.departure === s.departure &&
        r.arrival === s.arrival
      );
    })
  );
}
export function compare(
  linefinder: readonly Itinerary[],
  otp: readonly Itinerary[],
): { status: 'agreement' | Classification; detail: string } {
  const left = frontier(linefinder);
  const right = frontier(otp);
  if (!left.length && !right.length)
    return { status: 'agreement', detail: 'Both report no journey' };
  if (!left.length || !right.length)
    return { status: 'unresolved', detail: 'Journey existence differs' };
  const sameObjective = (a: Itinerary, b: Itinerary) =>
    a.arrival === b.arrival && a.transfers === b.transfers;
  if (
    left.some((a) => !right.some((b) => sameObjective(a, b))) ||
    right.some((b) => !left.some((a) => sameObjective(a, b)))
  )
    return {
      status: 'unresolved',
      detail:
        'Arrival/transfer Pareto frontier differs; investigate inputs and witnesses',
    };
  if (
    left.every((a) => right.some((b) => sameObjective(a, b) && samePath(a, b)))
  )
    return {
      status: 'agreement',
      detail:
        'Every LineFinder frontier point has an exact rider-visible OTP witness',
    };
  return {
    status: 'valid alternative itinerary',
    detail:
      'Same arrival/transfer frontier, different departure or route/stop structure; requires successful witness replay',
  };
}
