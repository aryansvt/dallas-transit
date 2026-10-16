import type { Ref } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  GeographicJourney,
  JourneyResponse,
} from '@dallas-transit/shared';
import type { TransitClient } from '../lib/api';
import {
  classAtLeave,
  classWarning,
  earliestLeave,
} from '../lib/class-schedule';
import type { ClassSeries } from '../lib/ics';
import {
  clockTime,
  displayDate,
  duration,
  fromNow,
  serviceInstant,
  serviceTime,
} from '../lib/time';
import { JourneyBar, JourneyTime, RouteCard, Tick } from './journey';
import { Icon } from './icon';

type OkResponse = Extract<JourneyResponse, { status: 'ok' }>;
type ArriveByResponse = Extract<OkResponse, { requestedArrivalTime: number }>;
/** "10:17 PM", or "12:20 AM next day" past the service date. */
function clockOn(serviceDate: string, seconds: number) {
  const t = serviceTime(serviceDate, seconds);
  return t.dayLabel ? `${t.clock} ${t.dayLabel}` : t.clock;
}
/** A minute late or more; "now" still counts as on time. */
const passed = (leave: Date, now: Date) =>
  leave.getTime() - now.getTime() <= -60000;

/** Arrive-by answers "when do I leave?" first, in the latest option's terms. */
function LeaveBoard({
  result,
  journey,
  now,
  classes,
  client,
  onLeaveNow,
  onPlanAt,
}: {
  result: ArriveByResponse;
  journey: GeographicJourney;
  now: Date;
  classes: readonly ClassSeries[];
  client: TransitClient;
  onLeaveNow(): void;
  onPlanAt(seconds: number): void;
}) {
  const leave = serviceInstant(
    journey.serviceDate,
    journey.requestedDepartureTime,
  );
  // you cannot leave in the past, so that outranks a class conflict
  const late = passed(leave, now);
  const during =
    !late &&
    classAtLeave(classes, journey.serviceDate, journey.requestedDepartureTime);
  const afterClass = during
    ? earliestLeave(
        classes,
        journey.serviceDate,
        journey.requestedDepartureTime,
      )
    : undefined;
  // the real scheduled arrival when leaving after class; a guess from this
  // trip's length can be a whole headway off
  const lookup = useQuery({
    queryKey: [
      'after-class',
      result.serviceDate,
      afterClass,
      result.origin,
      result.destination,
    ],
    queryFn: async ({ signal }) => {
      const next = await client.journeys(
        {
          origin: result.origin,
          destination: result.destination,
          serviceDate: result.serviceDate,
          departureTime: afterClass!,
        },
        signal,
      );
      return next.status === 'ok'
        ? (next.journeys[0]?.arrivalTime ?? null)
        : null;
    },
    enabled: afterClass !== undefined,
  });
  const arrival = lookup.data;
  // nothing to say when the lookup failed; the button still plans
  const arrivalLine = lookup.isPending
    ? 'Finding your arrival time'
    : arrival === null
      ? 'No later trip found'
      : arrival !== undefined && (
          <>
            Arrive {clockOn(result.serviceDate, arrival)}
            {arrival > result.requestedArrivalTime && (
              <>
                ,{' '}
                <strong>
                  {duration(arrival - result.requestedArrivalTime)} late
                </strong>
              </>
            )}
          </>
        );
  const early = result.requestedArrivalTime - journey.arrivalTime;
  const target = serviceTime(
    result.serviceDate,
    result.requestedArrivalTime,
  ).clock;
  return (
    <section
      className={`leave-board${late ? ' is-passed' : ''}`}
      aria-labelledby="leave-title"
    >
      <h2 id="leave-title">
        <span className="eyebrow">Leave by</span>{' '}
        <span className="leave-time">
          <Tick value={journey.requestedDepartureTime}>
            <JourneyTime
              date={journey.serviceDate}
              seconds={journey.requestedDepartureTime}
            />
          </Tick>
        </span>
      </h2>
      <span className="leave-when">
        <Tick value={fromNow(leave, now)}>{fromNow(leave, now)}</Tick>
      </span>
      <JourneyBar journey={journey} references={result.references} />
      <dl className="leave-facts">
        <div>
          <dt>Arrive</dt>
          <dd>
            <JourneyTime
              date={journey.serviceDate}
              seconds={journey.arrivalTime}
            />
          </dd>
        </div>
        <div>
          <dt>{early >= 60 ? 'Early by' : 'Arrives'}</dt>
          <dd>{early >= 60 ? duration(early) : 'On time'}</dd>
          <dd className="leave-target">for {target}</dd>
        </div>
      </dl>
      {late ? (
        <div className="board-alert">
          <span className="board-alert-icon" aria-hidden="true">
            <Icon name="alert" />
          </span>
          <p>This leave time has passed.</p>
          <button className="secondary-button" onClick={onLeaveNow}>
            Leave now instead
            <Icon name="arrow" />
          </button>
        </div>
      ) : (
        during && (
          <div className="board-alert">
            <span className="board-alert-icon" aria-hidden="true">
              <Icon name="alert" />
            </span>
            <p>{classWarning(during)}</p>
            <button
              className="secondary-button"
              onClick={() => onPlanAt(afterClass!)}
            >
              <span className="after-class">
                Leave after class
                {arrivalLine && (
                  <span className="after-class-arrival">
                    <Tick value={lookup.isPending ? 'pending' : `${arrival}`}>
                      {arrivalLine}
                    </Tick>
                  </span>
                )}
              </span>
              <Icon name="arrow" />
            </button>
          </div>
        )
      )}
    </section>
  );
}

/** One sentence for screen readers once a search settles. */
function announcement(
  result: OkResponse | undefined,
  classes: readonly ClassSeries[],
  now: Date,
) {
  if (!result) return '';
  const n = result.journeys.length;
  const found = `${n} route option${n === 1 ? '' : 's'} found.`;
  const first = result.journeys[0];
  if (!('requestedArrivalTime' in result) || !first) return found;
  const leave = serviceInstant(first.serviceDate, first.requestedDepartureTime);
  const during = classAtLeave(
    classes,
    first.serviceDate,
    first.requestedDepartureTime,
  );
  return [
    found,
    `Leave by ${clockTime(leave)}.`,
    passed(leave, now)
      ? 'This leave time has passed.'
      : during
        ? classWarning(during)
        : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function RouteResults({
  ref,
  data,
  loading,
  error,
  selected,
  classes,
  now,
  client,
  onCancel,
  onRetry,
  onChangeDeparture,
  onSelect,
  onInsight,
  onLeaveNow,
}: {
  ref: Ref<HTMLElement>;
  data: JourneyResponse | undefined;
  loading: boolean;
  error: string;
  selected: number;
  /** The device class schedule, for leave times inside a class. */
  classes: readonly ClassSeries[];
  now: Date;
  /** Looks up the arrival for leaving after a class. */
  client: TransitClient;
  onCancel(): void;
  onRetry(): void;
  onChangeDeparture(): void;
  onSelect(index: number): void;
  /** Plan again from a suggested departure, in service-day seconds. */
  onInsight(departureTime: number): void;
  onLeaveNow(): void;
}) {
  const result = data?.status === 'ok' ? data : undefined;
  const at = (seconds: number) =>
    result ? serviceTime(result.serviceDate, seconds).clock : '';
  const arriveBy = result && 'requestedArrivalTime' in result ? result : null;
  const departAt = result && 'requestedDepartureTime' in result ? result : null;
  const hint = departAt?.departureInsight;
  const latest = arriveBy?.journeys[0];
  return (
    <>
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
            {/* placeholder cards in the real card's shape, a light running
                along each route line */}
            <div className="route-skeletons" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div className="route-skeleton" key={i}>
                  <i className="sk-time" />
                  <i className="sk-line" />
                  <i className="sk-text" />
                  <i className="sk-text sk-short" />
                </div>
              ))}
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
            {arriveBy && latest && (
              <LeaveBoard
                result={arriveBy}
                journey={latest}
                now={now}
                classes={classes}
                client={client}
                onLeaveNow={onLeaveNow}
                onPlanAt={onInsight}
              />
            )}
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
            {hint && departAt && (
              <div className="insight" role="note">
                <span className="insight-icon" aria-hidden="true">
                  <Icon name="clock" />
                </span>
                <div className="insight-copy">
                  <p className="insight-title">
                    {hint.kind === 'leave-earlier'
                      ? 'Worth leaving earlier'
                      : 'No need to rush'}
                  </p>
                  <p>
                    {hint.kind === 'leave-earlier' ? (
                      <>
                        Depart <strong>{at(hint.departureTime)}</strong> instead
                        of {at(departAt.requestedDepartureTime)} to arrive{' '}
                        <strong>
                          {Math.round(-hint.arrivalChangeSeconds / 60)} min
                          sooner
                        </strong>
                        .
                      </>
                    ) : (
                      <>
                        Leave at <strong>{at(hint.departureTime)}</strong>,{' '}
                        {Math.round(
                          (hint.departureTime -
                            departAt.requestedDepartureTime) /
                            60,
                        )}{' '}
                        min later, and arrive at nearly the same time.
                      </>
                    )}
                  </p>
                </div>
                <button
                  className="secondary-button"
                  onClick={() => onInsight(hint.departureTime)}
                >
                  Plan for {at(hint.departureTime)}
                  <Icon name="arrow" />
                </button>
              </div>
            )}
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
                  arriveBy={Boolean(arriveBy)}
                  duringClass={Boolean(
                    arriveBy &&
                    classAtLeave(
                      classes,
                      j.serviceDate,
                      j.requestedDepartureTime,
                    ),
                  )}
                />
              ))}
            </div>
          </>
        )}
      </section>
      <div className="sr-only" role="status">
        {loading ? 'Searching for routes.' : announcement(result, classes, now)}
      </div>
    </>
  );
}
