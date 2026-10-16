import type { Ref } from 'react';
import type { Place } from '@dallas-transit/shared';
import { departureLabel, type Departure } from './departure-sheet';
import { Icon } from './icon';

export function PlannerForm({
  origin,
  destination,
  locationMessage,
  departure,
  originRef,
  destinationRef,
  onSearch,
  onDeparture,
  onSubmit,
}: {
  origin: Place | null;
  destination: Place | null;
  locationMessage: string;
  departure: Departure;
  originRef: Ref<HTMLButtonElement>;
  destinationRef: Ref<HTMLButtonElement>;
  onSearch(target: 'origin' | 'destination'): void;
  onDeparture(): void;
  onSubmit(): void;
}) {
  return (
    <form
      className="planner"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="journey-fields">
        <span className="field-track" aria-hidden="true">
          <span />
          <i />
          <span />
        </span>
        <button
          ref={originRef}
          className="place-control"
          type="button"
          onClick={() => onSearch('origin')}
        >
          <span className="field-label">From</span>
          <span
            className={
              origin?.name === 'Current location' ? 'current-place' : ''
            }
          >
            {origin?.name ?? 'Search starting point'}
            {origin?.name === 'Current location' && <Icon name="location" />}
          </span>
          {origin?.context && (
            <span className="secondary">{origin.context}</span>
          )}
        </button>
        <button
          ref={destinationRef}
          className="place-control destination-control"
          type="button"
          onClick={() => onSearch('destination')}
        >
          <span className="field-label">To</span>
          <span className={!destination ? 'placeholder' : ''}>
            {destination?.name ?? 'Search destination'}
          </span>
          {destination?.context && (
            <span className="secondary">{destination.context}</span>
          )}
        </button>
      </div>
      {locationMessage && (
        <p className="location-help" role="status">
          {locationMessage}
        </p>
      )}
      <button type="button" className="departure-button" onClick={onDeparture}>
        <Icon name="clock" />
        {departureLabel(departure)}
        <span className="down-chevron" aria-hidden="true" />
      </button>
      <button className="primary-button" type="submit">
        Find routes
        <Icon name="arrow" />
      </button>
    </form>
  );
}
