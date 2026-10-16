import { useState, type Ref } from 'react';
import type {
  GeographicJourney,
  Place,
  References,
} from '@dallas-transit/shared';
import {
  isSaved,
  SAVED_FULL_MESSAGE,
  savedFull,
  toggleSaved,
  type LocalPlaces,
} from '../lib/local-places';
import { worstTransfer } from '../lib/presentation';
import { displayDate, duration, serviceTime } from '../lib/time';
import { JourneyBar, JourneyTime, RouteSequence, TransferTag } from './journey';
import { Icon } from './icon';

export function JourneySummary({
  headingRef,
  journey,
  references,
  incomplete,
  destination,
  places,
  routeReason,
  arriveBy,
  warning,
  onBack,
  onUpdatePlaces,
}: {
  headingRef: Ref<HTMLHeadingElement>;
  journey: GeographicJourney;
  references: References;
  incomplete: boolean;
  destination: Place | null;
  places: LocalPlaces;
  routeReason: string;
  /** Arrive-by trips also say when to leave. */
  arriveBy: boolean;
  /** Why this leave time does not work, such as a class still under way. */
  warning: string;
  onBack(): void;
  onUpdatePlaces(next: LocalPlaces): void;
}) {
  const [full, setFull] = useState(false);
  const saved = destination ? isSaved(places, destination) : false;
  const worst = worstTransfer(journey);
  return (
    <section className="detail-summary" aria-labelledby="journey-title">
      <button className="back-button" onClick={onBack}>
        <Icon name="back" />
        All route options
      </button>
      <p className="sr-only">Your trip to</p>
      <div className="destination-heading">
        <h2 ref={headingRef} tabIndex={-1} id="journey-title">
          {destination?.name ?? 'Your destination'}
        </h2>
        {destination && !destination.temporary && (
          <button
            className={`icon-button save-button${saved ? ' is-saved' : ''}`}
            aria-label={
              saved
                ? 'Remove destination from saved places'
                : 'Save destination'
            }
            aria-pressed={saved}
            onClick={() => {
              const refused = !saved && savedFull(places);
              setFull(refused);
              if (!refused) onUpdatePlaces(toggleSaved(places, destination));
            }}
          >
            <Icon name="star" />
          </button>
        )}
      </div>
      {full && (
        <p className="notice save-limit" role="status">
          {SAVED_FULL_MESSAGE}
        </p>
      )}
      <div className="detail-arrival">
        <div className="summary-arrival">
          <span className="arrival-time">
            <JourneyTime
              date={journey.serviceDate}
              seconds={journey.arrivalTime}
            />
          </span>
          <span className="secondary">Arrive</span>
        </div>
        <div className="summary-duration">
          <strong>{duration(journey.durationSeconds)}</strong>
          <span className="secondary">Total trip</span>
        </div>
      </div>
      <JourneyBar journey={journey} references={references} />
      <p className="summary-metrics">
        {arriveBy && (
          <>
            Leave by{' '}
            {
              serviceTime(journey.serviceDate, journey.requestedDepartureTime)
                .clock
            }{' '}
            ·{' '}
          </>
        )}
        {journey.transferCount === 0
          ? 'No transfers'
          : `${journey.transferCount} transfer${journey.transferCount > 1 ? 's' : ''}`}{' '}
        · {duration(journey.walkingDurationSeconds)} walking
        {worst && (
          <>
            {' '}
            <TransferTag level={worst} tightest={journey.transferCount > 1} />
          </>
        )}
      </p>
      {warning && (
        <p className="board-note">
          <Icon name="alert" />
          {warning}
        </p>
      )}
      <RouteSequence journey={journey} references={references} />
      <p className="results-caption summary-context">
        <span className="schedule-tag">
          <Icon name="clock" />
          Scheduled
        </span>
        <span className="sr-only"> · </span>
        <span>{displayDate(journey.serviceDate)} · Dallas time</span>
      </p>
      {routeReason && (
        <p className="notice">Route options updated: {routeReason}</p>
      )}
      {incomplete && (
        <p className="notice">Some route options may be unavailable.</p>
      )}
    </section>
  );
}
