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
  transitLegs,
} from '../lib/presentation';
import { duration, serviceTime } from '../lib/time';
import { Icon } from './icon';
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
      <Icon name={route?.type === 3 ? 'bus' : 'train'} />
      {routeName(route)}
    </span>
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
}: {
  journey: GeographicJourney;
  all: readonly GeographicJourney[];
  references: References;
  selected: boolean;
  onSelect(): void;
}) {
  const rides = transitLegs(journey);
  const first = rides[0];
  const label = distinction(journey, all);
  return (
    <button
      className={`route-card${selected ? ' selected' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="route-topline">
        <span>
          <span className="eyebrow">Arrive</span>
          <span className="arrival-time">
            <JourneyTime
              date={journey.serviceDate}
              seconds={journey.arrivalTime}
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
        <span className="secondary">
          Transfer at {stopName(references, rides[1].boardingStopId)}
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
}: {
  journey: GeographicJourney;
  references: References;
  destinationName: string;
  originName: string;
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
                  <Icon name="arrow" />
                </span>
                <div className="step-content">
                  <h3>Transfer to {stopName(references, leg.toStopId)}</h3>
                  <p>
                    From {stopName(references, leg.fromStopId)} ·{' '}
                    {duration(leg.arrivalTime - leg.departureTime)}
                  </p>
                </div>
              </li>
            );
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
                  </div>
                </li>
              )}
              <li className="timeline-step ride-step">
                <span className="timeline-dot ride-dot">
                  <Icon name={route?.type === 3 ? 'bus' : 'train'} />
                </span>
                <div className="step-content">
                  <div className="step-heading">
                    <h3>
                      Board <RouteBadge route={route} />
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
