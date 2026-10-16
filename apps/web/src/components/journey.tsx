import { Fragment } from 'react';
import type {
  GeographicJourney,
  References,
  RouteDetails,
} from '@dallas-transit/shared';
import {
  distinction,
  routeColors,
  routeName,
  stopName,
  transferLevel,
  transitLegs,
  transitMode,
  worstTransfer,
  type TransferLevel,
} from '../lib/presentation';
import { duration, serviceTime } from '../lib/time';
import { Icon } from './icon';
import { LiveTiming } from './live-journey';
import { liveClient, type TransitClient } from '../lib/api';
export function JourneyTime({
  date,
  seconds,
}: {
  date: string;
  seconds: number;
}) {
  const t = serviceTime(date, seconds);
  return (
    <time dateTime={t.iso}>
      {t.clock}
      {t.dayLabel && <span className="day-label">{t.dayLabel}</span>}
    </time>
  );
}
export function RouteBadge({ route }: { route: RouteDetails | undefined }) {
  return (
    <span className="route-badge" style={routeColors(route)}>
      <Icon
        name={
          transitMode(route) === 'service'
            ? 'arrow'
            : (transitMode(route) as 'bus' | 'train')
        }
      />
      {routeName(route)}
    </span>
  );
}
const transferWords = {
  comfortable: ['Comfortable', 'check'],
  tight: ['Tight', 'clock'],
  risky: ['Risky', 'alert'],
} as const;
/** Scheduled connection confidence: an icon and a word, never color alone. */
export function TransferTag({
  level,
  tightest = false,
}: {
  level: TransferLevel;
  /** Several transfers: name the tightest. */
  tightest?: boolean;
}) {
  const [word, icon] = transferWords[level];
  return (
    <span className={`transfer-tag is-${level}`}>
      <Icon name={icon} />
      {tightest ? `Tightest: ${word}` : word}
      <span className="sr-only"> transfer</span>
    </span>
  );
}
/** The tag and connection time for boarding the ride at legs[ride]. */
function TransferConfidence({
  journey,
  ride,
}: {
  journey: GeographicJourney;
  ride: number;
}) {
  const leg = journey.legs[ride];
  if (leg?.kind !== 'transit') return null;
  const level = transferLevel(leg.scheduledTransferRisk);
  const prior = journey.legs
    .slice(0, ride)
    .filter((l) => l.kind === 'transit')
    .at(-1);
  if (!level || !prior) return null;
  return (
    <p className="transfer-confidence">
      <TransferTag level={level} />
      <span>{duration(leg.departureTime - prior.arrivalTime)} to connect</span>
    </p>
  );
}
export function RouteSequence({
  journey,
  references,
}: {
  journey: GeographicJourney;
  references: References;
}) {
  return (
    <span
      className="route-sequence"
      role="group"
      aria-label="Transit route sequence"
    >
      {transitLegs(journey).map((leg, i) => (
        <span key={`${leg.tripId}-${i}`} className="sequence-item">
          {i > 0 && (
            <>
              <Icon name="arrow" />
              <span className="sr-only">then </span>
            </>
          )}
          <RouteBadge
            route={references.routes.find((r) => r.routeId === leg.routeId)}
          />
        </span>
      ))}
    </span>
  );
}
export function RouteCard({
  journey,
  all,
  references,
  selected,
  onSelect,
  arriveBy = false,
  duringClass = false,
}: {
  journey: GeographicJourney;
  all: readonly GeographicJourney[];
  references: References;
  selected: boolean;
  onSelect(): void;
  /** Arrive-by results lead with the time to leave. */
  arriveBy?: boolean;
  /** The leave time falls inside a class on this device. */
  duringClass?: boolean;
}) {
  const rides = transitLegs(journey);
  const first = rides[0];
  const label = distinction(journey, all, arriveBy);
  const worst = worstTransfer(journey);
  return (
    <button
      className={`route-card${selected ? ' selected' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="route-topline">
        <span>
          <span className="eyebrow">{arriveBy ? 'Leave' : 'Arrive'}</span>
          <span className="arrival-time">
            <JourneyTime
              date={journey.serviceDate}
              seconds={
                arriveBy ? journey.requestedDepartureTime : journey.arrivalTime
              }
            />
          </span>
        </span>
        <span className="route-duration">
          <strong>{duration(journey.durationSeconds)}</strong>
          {label && <span className="route-distinction">{label}</span>}
        </span>
      </span>
      <RouteSequence journey={journey} references={references} />
      <span className="route-metrics">
        {arriveBy && (
          <>
            Arrive {serviceTime(journey.serviceDate, journey.arrivalTime).clock}
            <span aria-hidden="true"> · </span>
          </>
        )}
        {journey.transferCount === 0
          ? 'No transfers'
          : `${journey.transferCount} transfer${journey.transferCount === 1 ? '' : 's'}`}
        <span aria-hidden="true"> · </span>
        {duration(journey.walkingDurationSeconds)} walking
      </span>
      {first && (
        <span className="boarding-context">
          Board{' '}
          {routeName(
            references.routes.find((r) => r.routeId === first.routeId),
          )}{' '}
          at <strong>{stopName(references, first.boardingStopId)}</strong>
        </span>
      )}
      {rides[1] && (
        <span className="route-transfer">
          <span className="secondary">
            Transfer at {stopName(references, rides[1].boardingStopId)}
          </span>
          {worst && <TransferTag level={worst} tightest={rides.length > 2} />}
        </span>
      )}
      {duringClass && (
        <span className="route-warning">
          <Icon name="alert" />
          Leaves during class
        </span>
      )}
      <span className="route-open">
        View journey <Icon name="arrow" />
      </span>
    </button>
  );
}
export function Timeline({
  journey,
  references,
  destinationName,
  originName,
  liveId,
  client = liveClient,
}: {
  journey: GeographicJourney;
  references: References;
  destinationName: string;
  originName: string;
  liveId?: string;
  client?: TransitClient;
}) {
  return (
    <section className="timeline-section" aria-labelledby="steps-title">
      <div className="section-heading">
        <h2 id="steps-title">Your journey, step by step</h2>
        <span className="secondary">Scheduled times</span>
      </div>
      <ol className="timeline">
        {journey.legs.map((leg, i) => {
          if (leg.kind === 'walk')
            return (
              <li className="timeline-step" key={i}>
                <span className="timeline-dot walk-dot">
                  <Icon name="walk" />
                </span>
                <div className="step-content">
                  <div className="step-heading">
                    <h3>
                      Walk to{' '}
                      {leg.phase === 'access'
                        ? stopName(references, leg.stopId)
                        : destinationName}
                    </h3>
                    {leg.phase === 'access' && (
                      <JourneyTime
                        date={journey.serviceDate}
                        seconds={leg.departureTime}
                      />
                    )}
                  </div>
                  <p>
                    {duration(leg.durationSeconds)} ·{' '}
                    {Math.round(leg.distanceMeters)} m
                  </p>
                  {leg.phase === 'access' && (
                    <p className="secondary">From {originName}</p>
                  )}
                  <p className="secondary">
                    Follow local pedestrian signs and crossings.
                  </p>
                </div>
              </li>
            );
          if (leg.kind === 'transfer')
            return (
              <li className="timeline-step transfer-step" key={i}>
                <span className="timeline-dot">
                  <Icon name={leg.pedestrian ? 'walk' : 'arrow'} />
                </span>
                <div className="step-content">
                  <h3>
                    {leg.pedestrian ? 'Walk' : 'Transfer'} to{' '}
                    {stopName(references, leg.toStopId)}
                  </h3>
                  <p>
                    From {stopName(references, leg.fromStopId)} ·{' '}
                    {duration(leg.arrivalTime - leg.departureTime)}
                    {leg.pedestrian && (
                      <>
                        {' '}
                        {'\u00b7'} {Math.round(leg.pedestrian.distanceMeters)} m
                      </>
                    )}
                  </p>
                  <TransferConfidence journey={journey} ride={i + 1} />
                </div>
              </li>
            );
          const priorRide = journey.legs
            .slice(0, i)
            .filter((l) => l.kind === 'transit')
            .at(-1);
          const sameRouteChange = priorRide?.routeId === leg.routeId;
          const transferring = journey.legs
            .slice(0, i)
            .some((previous) => previous.kind === 'transit');
          const route = references.routes.find(
            (r) => r.routeId === leg.routeId,
          );
          const trip = references.trips.find((t) => t.tripId === leg.tripId);
          const stop = references.stops.find(
            (s) => s.stopId === leg.boardingStopId,
          );
          const count = leg.alightingOccurrence - leg.boardingOccurrence;
          return (
            <Fragment key={i}>
              {transferring && journey.legs[i - 1]?.kind !== 'transfer' && (
                <li className="timeline-step transfer-step">
                  <span className="timeline-dot">
                    <Icon name="arrow" />
                  </span>
                  <div className="step-content">
                    <h3>
                      Transfer at {stopName(references, leg.boardingStopId)}
                    </h3>
                    <p>
                      Continue on <RouteBadge route={route} />
                    </p>
                    <TransferConfidence journey={journey} ride={i} />
                  </div>
                </li>
              )}
              <li className="timeline-step ride-step">
                <span className="timeline-dot ride-dot">
                  <Icon
                    name={
                      transitMode(route) === 'service'
                        ? 'arrow'
                        : (transitMode(route) as 'bus' | 'train')
                    }
                  />
                </span>
                <div className="step-content">
                  <div className="step-heading">
                    <h3>
                      {sameRouteChange ? 'Change vehicles: board' : 'Board'}{' '}
                      <RouteBadge route={route} />
                    </h3>
                    <JourneyTime
                      date={journey.serviceDate}
                      seconds={leg.departureTime}
                    />
                  </div>
                  {trip?.headsign && (
                    <p className="direction">Toward {trip.headsign}</p>
                  )}
                  <p>
                    {stopName(references, leg.boardingStopId)}
                    {stop?.platformCode && (
                      <span> · Platform {stop.platformCode}</span>
                    )}
                  </p>
                  <div className="ride-info">
                    <span>
                      <strong>Ride</strong>{' '}
                      {duration(leg.arrivalTime - leg.departureTime)}
                    </span>
                    {count > 0 && (
                      <span>
                        {' '}
                        · {count} stop{count === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                  {liveId && (
                    <LiveTiming
                      id={liveId}
                      client={client}
                      legIndex={i}
                      serviceDate={journey.serviceDate}
                    />
                  )}
                  <div className="alight">
                    <div>
                      <strong>Get off</strong>
                      <p>{stopName(references, leg.alightingStopId)}</p>
                    </div>
                    <JourneyTime
                      date={journey.serviceDate}
                      seconds={leg.arrivalTime}
                    />
                  </div>
                </div>
              </li>
            </Fragment>
          );
        })}
        <li className="timeline-step arrival-step">
          <span className="timeline-dot arrival-dot">
            <Icon name="pin" />
          </span>
          <div className="step-content">
            <p className="eyebrow">You&apos;ve arrived</p>
            <div className="step-heading">
              <h3>{destinationName}</h3>
              <JourneyTime
                date={journey.serviceDate}
                seconds={journey.arrivalTime}
              />
            </div>
          </div>
        </li>
      </ol>
    </section>
  );
}
