'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  GeographicJourney,
  JourneyResponse,
  References,
} from '@dallas-transit/shared';
import { ClientError, errorMessage, type TransitClient } from '../lib/api';
import {
  routeColors,
  routeName,
  stopName,
  transitMode,
} from '../lib/presentation';
import { serviceTime } from '../lib/time';
import { Icon } from './icon';

export function useLiveJourney(
  id: string | undefined,
  client: TransitClient,
  poll = false,
) {
  const [now, setNow] = useState(() => Date.now());
  const query = useQuery({
    queryKey: ['live-journey', id],
    queryFn: ({ signal }) => client.live!(id!, signal),
    enabled: Boolean(id && client.live),
    refetchInterval: (query) =>
      poll &&
      !(
        query.state.error instanceof ClientError &&
        ['NOT_FOUND', 'PUBLICATION_CHANGED'].includes(query.state.error.code)
      )
        ? 15000
        : false,
    refetchIntervalInBackground: false,
    staleTime: 14000,
    retry: false,
  });
  useEffect(() => {
    const expiry = query.data?.validUntil;
    if (!id || expiry === undefined) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(1, expiry * 1000 - Date.now()),
    );
    const visible = () => setNow(Date.now());
    document.addEventListener('visibilitychange', visible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [id, query.data?.validUntil]);
  const data =
    !query.isError &&
    query.data &&
    Math.max(now, query.dataUpdatedAt) / 1000 < query.data.validUntil
      ? query.data
      : undefined;
  return { ...query, data, now: Math.max(now, query.dataUpdatedAt) };
}
export function LiveTiming({
  id,
  client,
  legIndex,
  serviceDate,
}: {
  id: string | undefined;
  client: TransitClient;
  legIndex: number;
  serviceDate: string;
}) {
  const { data } = useLiveJourney(id, client);
  const leg = data?.legs.find((l) => l.legIndex === legIndex);
  if (!id) return null;
  if (!leg || !['LIVE', 'AGING'].includes(leg.freshness))
    return <p className="secondary">Showing scheduled times</p>;
  return (
    <div className="live-timing">
      <p>
        {leg.freshness === 'AGING' ? 'Updates delayed' : 'Live update'}
        {leg.cancelled
          ? ' · Service cancelled'
          : leg.boardingSkipped
            ? ' · Boarding stop skipped'
            : leg.alightingSkipped
              ? ' · Exit stop skipped'
              : ''}
      </p>
      {leg.departureTime !== null && (
        <p>
          Expected departure {serviceTime(serviceDate, leg.departureTime).clock}
          {leg.departureDelay === 0
            ? ' · On time'
            : leg.departureDelay !== null
              ? ` · ${Math.ceil(Math.abs(leg.departureDelay) / 60)} min ${leg.departureDelay > 0 ? 'late' : 'early'}`
              : ''}
        </p>
      )}
      {leg.arrivalTime !== null && (
        <p>
          Expected arrival {serviceTime(serviceDate, leg.arrivalTime).clock}
        </p>
      )}
    </div>
  );
}

export function LiveJourneyPanel({
  id,
  client,
  journey,
  references,
  onReplace,
}: {
  id: string;
  client: TransitClient;
  journey: GeographicJourney;
  references: References;
  onReplace(result: JourneyResponse, reason: string): void;
}) {
  const query = useLiveJourney(id, client, true);
  const data = query.data;
  const [onboard, setOnboard] = useState<number | null>(null);
  const [completedThrough, setCompletedThrough] = useState(-1);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [alternative, setAlternative] = useState<{
    result: JourneyResponse;
    reason: string;
  } | null>(null);
  const [stop, setStop] = useState('');
  const controller = useRef<AbortController | null>(null);
  const cooldown = useRef(0);
  const actionButton = useRef<HTMLButtonElement>(null);
  const actionHeading = useRef<HTMLHeadingElement>(null);
  const restoreActionFocus = useRef(false);
  useEffect(() => {
    if (!restoreActionFocus.current) return;
    restoreActionFocus.current = false;
    (actionButton.current ?? actionHeading.current)?.focus();
  }, [onboard, completedThrough]);
  useEffect(() => () => controller.current?.abort(), []);
  const rides = journey.legs.flatMap((l, i) =>
    l.kind === 'transit' ? [{ leg: l, index: i }] : [],
  );
  const stops = [
    ...new Set(
      rides.flatMap((r) => [r.leg.boardingStopId, r.leg.alightingStopId]),
    ),
  ];
  const replan = async (location: 'gps' | 'stop') => {
    if (!client.replan || busy || Date.now() < cooldown.current) {
      setMessage('Please wait one minute between route refreshes.');
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setAlternative(null);
    setMessage('');
    cooldown.current = Date.now() + 60000;
    try {
      const input =
        location === 'stop'
          ? { confirmedStopId: stop }
          : {
              coordinate: await new Promise<{
                latitude: number;
                longitude: number;
              }>((resolve, reject) => {
                if (!navigator.geolocation) {
                  reject(
                    new Error('Location unavailable. Confirm a stop instead.'),
                  );
                  return;
                }
                navigator.geolocation.getCurrentPosition(
                  (p) => {
                    if (
                      Date.now() - p.timestamp > 30000 ||
                      p.coords.accuracy > 100
                    )
                      reject(
                        new Error(
                          'Location is not precise enough. Confirm a stop instead.',
                        ),
                      );
                    else
                      resolve({
                        latitude: p.coords.latitude,
                        longitude: p.coords.longitude,
                      });
                  },
                  () =>
                    reject(
                      new Error(
                        'Location unavailable. Confirm a stop instead.',
                      ),
                    ),
                  { maximumAge: 0, timeout: 10000 },
                );
              }),
            };
      abort.signal.throwIfAborted();
      const result = await client.replan(id, input, abort.signal);
      abort.signal.throwIfAborted();
      if (result.status === 'cooldown')
        setMessage(`Try again in ${result.retryAfterSeconds} seconds.`);
      else if (result.result.status === 'no-journey')
        setMessage(
          'No new route was found. Your original directions remain available.',
        );
      else {
        const signature = (j: GeographicJourney) =>
          JSON.stringify([
            j.origin,
            j.destination,
            j.accessStopId,
            j.egressStopId,
            j.walkingDurationSeconds,
            j.walkingDistanceMeters,
            j.legs
              .filter((l) => l.kind === 'transit')
              .map((l) => [
                l.tripId,
                l.boardingSequence,
                l.alightingSequence,
                l.departureTime,
              ]),
          ]);
        if (
          result.result.journeys.every(
            (j) => signature(j) === signature(journey),
          )
        )
          setMessage(
            'Your current transit route is still the available option.',
          );
        else setAlternative({ result: result.result, reason: result.reason });
      }
    } catch (e) {
      if (!abort.signal.aborted)
        setMessage(
          `${e instanceof Error && !('code' in e) ? e.message : errorMessage(e)} Your original directions remain available.`,
        );
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  };
  const current = data?.legs.find((l) => l.legIndex === onboard);
  const currentRide = rides.find((r) => r.index === onboard);
  const nextRide = rides.find((r) => r.index > completedThrough);
  const actionableRide = currentRide ?? nextRide;
  const route = references.routes.find(
    (r) => r.routeId === actionableRide?.leg.routeId,
  );
  const mode = transitMode(route);
  const rideName = routeName(route);
  const headsign = references.trips.find(
    (t) => t.tripId === actionableRide?.leg.tripId,
  )?.headsign;
  const activeTransfers =
    data?.transfers.filter(
      (t) => t.outboundLeg > (onboard ?? completedThrough),
    ) ?? [];
  const activeDisruption =
    data?.legs.some(
      (l) =>
        l.legIndex > completedThrough &&
        (l.cancelled || l.boardingSkipped || l.alightingSkipped),
    ) || activeTransfers.some((t) => t.status === 'INFEASIBLE');
  const transferTimingUnavailable =
    activeTransfers.some((t) => t.status === 'UNKNOWN') ||
    (!data && rides.filter((r) => r.index > completedThrough).length > 1);
  const freshness = data?.freshness ?? 'UNAVAILABLE';
  const labels = {
    LIVE: 'Live updates available',
    AGING: 'Updates delayed',
    STALE: 'Updates are stale · showing scheduled times',
    SCHEDULED_FALLBACK: 'Showing scheduled times',
    UNAVAILABLE: 'Live updates unavailable · showing scheduled times',
  };
  return (
    <section className="live-following" aria-label="Live journey">
      <div className="live-following-header">
        <p className="eyebrow">Your journey now</p>
        <span
          className={`live-status${freshness === 'LIVE' ? ' is-live' : ''}`}
          role="status"
          aria-label={labels[freshness]}
        >
          {freshness === 'LIVE'
            ? 'Live'
            : freshness === 'AGING'
              ? 'Updates delayed'
              : 'Scheduled'}
        </span>
      </div>
      <div className="live-next-action">
        <h3 ref={actionHeading} tabIndex={-1}>
          {currentRide
            ? `Get off at ${stopName(references, currentRide.leg.alightingStopId)}`
            : nextRide
              ? `Board at ${stopName(references, nextRide.leg.boardingStopId)}`
              : 'Transit rides complete'}
        </h3>
        {actionableRide && (
          <div className="live-route-identity">
            <span className="route-badge" style={routeColors(route)}>
              <Icon name={mode === 'service' ? 'arrow' : mode} />
              <span>{rideName}</span>
            </span>
            {headsign && <span>Toward {headsign}</span>}
          </div>
        )}
        {currentRide ? (
          <>
            <p className="live-onboard" role="status">
              You confirmed you’re on {rideName}.
            </p>
            <p className="secondary">
              {current?.vehicle?.freshness === 'LIVE' &&
              current.stopsRemaining !== null
                ? current.stopsRemaining === 0
                  ? 'Your exit stop is the current stop. Check signs before getting off.'
                  : current.stopsRemaining === 1
                    ? 'Get off next. Check the stop name.'
                    : `${current.stopsRemaining} stops remaining`
                : 'Vehicle progress unavailable. Follow the listed stops and onboard announcements.'}
            </p>
          </>
        ) : (
          <p className="secondary">
            {nextRide
              ? 'Check the route and destination on the vehicle. Confirm only when you’ve boarded.'
              : 'Follow your final walking directions.'}
          </p>
        )}
        {actionableRide && (
          <button
            ref={actionButton}
            type="button"
            className={currentRide ? 'secondary-button' : 'primary-button'}
            onClick={() => {
              restoreActionFocus.current = true;
              if (onboard !== null) {
                setCompletedThrough(onboard);
                setOnboard(null);
              } else if (nextRide) setOnboard(nextRide.index);
            }}
          >
            {currentRide
              ? `I’m off at ${stopName(references, currentRide.leg.alightingStopId)}`
              : `I’m on ${rideName}`}
          </button>
        )}
      </div>
      {query.error instanceof ClientError &&
        ['NOT_FOUND', 'PUBLICATION_CHANGED'].includes(query.error.code) && (
          <p className="notice">
            This live session expired or its schedule changed. Find routes again
            to resume live updates. Your original directions remain below.
          </p>
        )}
      {data?.legs.some((l) => l.updatedAt !== null) && (
        <p className="secondary">
          Last source update{' '}
          {Math.max(
            0,
            Math.floor(
              query.now / 1000 -
                Math.min(
                  ...data.legs.flatMap((l) =>
                    l.updatedAt === null ? [] : [l.updatedAt],
                  ),
                ),
            ),
          )}{' '}
          sec ago
        </p>
      )}
      {transferTimingUnavailable && (
        <p className="secondary live-transfer-note">
          We can’t check transfer risk without live timing. Scheduled directions
          are still available.
        </p>
      )}
      {activeTransfers
        .filter((t) => t.status !== 'UNKNOWN')
        .map((t) => (
          <p
            key={t.outboundLeg}
            className={
              t.status === 'AT_RISK' || t.status === 'INFEASIBLE'
                ? 'notice'
                : 'secondary'
            }
          >
            {t.status === 'INFEASIBLE'
              ? 'Transfer may be missed. '
              : t.status === 'AT_RISK'
                ? 'Transfer is at risk. '
                : ''}
            {t.reason}
          </p>
        ))}
      {data?.alerts.map((a) => (
        <div key={a.id} className="notice">
          <strong>{a.title || 'Service alert'}</strong>
          {a.description && <p>{a.description}</p>}
        </div>
      ))}
      {activeDisruption && (
        <p className="notice">
          A remaining service or transfer is disrupted. Confirm your location to
          find new options.
        </p>
      )}
      {onboard === null &&
        data?.legs.some(
          (l) => l.legIndex > completedThrough && l.boarding === 'DEPARTED',
        ) && (
          <p className="notice">
            A selected vehicle has passed its boarding stop. If you missed it,
            find new options below.
          </p>
        )}
      <details>
        <summary>Find new route options</summary>
        <p>Use your current location, or confirm the stop where you are now.</p>
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => void replan('gps')}
        >
          Use my current location
        </button>
        <div role="group" aria-label="Replan from a stop">
          <label>
            I am at{' '}
            <select value={stop} onChange={(e) => setStop(e.target.value)}>
              <option value="">Choose a stop</option>
              {stops.map((s) => (
                <option key={s} value={s}>
                  {stopName(references, s)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="text-button"
            disabled={busy || !stop}
            onClick={() => void replan('stop')}
          >
            {busy ? 'Finding options…' : 'Replan from this stop'}
          </button>
        </div>
      </details>
      {message && <p role="status">{message}</p>}
      {alternative && (
        <div className="notice">
          <p>{alternative.reason}</p>
          <p>
            New route options are available. Your current journey stays selected
            until you choose them.
          </p>
          <button
            className="back-button"
            onClick={() => onReplace(alternative.result, alternative.reason)}
          >
            View new route options
          </button>
        </div>
      )}
    </section>
  );
}
