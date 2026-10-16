import type { Ref } from 'react';
import type { JourneyResponse } from '@dallas-transit/shared';
import { displayDate } from '../lib/time';
import { RouteCard } from './journey';
import { Icon } from './icon';

export function RouteResults({
  ref,
  data,
  loading,
  error,
  selected,
  onCancel,
  onRetry,
  onChangeDeparture,
  onSelect,
}: {
  ref: Ref<HTMLElement>;
  data: JourneyResponse | undefined;
  loading: boolean;
  error: string;
  selected: number;
  onCancel(): void;
  onRetry(): void;
  onChangeDeparture(): void;
  onSelect(index: number): void;
}) {
  const result = data?.status === 'ok' ? data : undefined;
  return (
    <section
      ref={ref}
      className="results-section"
      tabIndex={-1}
      aria-label="Route results"
      aria-busy={loading}
    >
      {loading && (
        <div className="loading-state" role="status">
          <div className="section-heading">
            <h2>Finding your routes</h2>
            <button className="text-button" onClick={onCancel}>
              Cancel
            </button>
          </div>
          <p>Checking departures and walking connections.</p>
          <div className="route-skeleton" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        </div>
      )}
      {!loading && error && (
        <div className="state-message" role="alert">
          <span className="state-icon" aria-hidden="true">
            <Icon name="alert" />
          </span>
          <h2>Let&apos;s get you on your way</h2>
          <p>{error}</p>
          <button className="secondary-button" onClick={onRetry}>
            Find routes again
          </button>
        </div>
      )}
      {!loading && data?.status === 'no-journey' && (
        <div className="state-message" role="status">
          <span className="state-icon" aria-hidden="true">
            <Icon name="pin" />
          </span>
          <h2>No routes found for this trip</h2>
          <p>
            {data.reason.includes('access')
              ? 'We could not find a connection from this starting point.'
              : data.reason.includes('egress')
                ? 'We could not find a connection to this destination.'
                : 'No transit connection was found for this departure.'}{' '}
            Try another time or a nearby place.
          </p>
          <button className="secondary-button" onClick={onChangeDeparture}>
            Change departure
          </button>
        </div>
      )}
      {!loading && result && (
        <>
          <div className="section-heading">
            <h2>Ways to get there</h2>
            <span className="secondary">
              {result.journeys.length} option
              {result.journeys.length === 1 ? '' : 's'}
            </span>
          </div>
          <p className="results-caption">
            <span className="schedule-tag">
              <Icon name="clock" />
              Scheduled
            </span>
            <span className="sr-only"> · </span>
            <span>{displayDate(result.serviceDate)} · Dallas time</span>
          </p>
          {result.incomplete && (
            <p className="notice" role="status">
              Some route options may be unavailable.
            </p>
          )}
          <div className="route-list">
            {result.journeys.map((j, i) => (
              <RouteCard
                key={i}
                journey={j}
                all={result.journeys}
                references={result.references}
                selected={selected === i}
                onSelect={() => onSelect(i)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
