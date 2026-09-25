'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { StyleSpecification } from 'maplibre-gl';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import type {
  GeographicRequest,
  JourneyResponse,
  Place,
} from '@dallas-transit/shared';
import { liveClient, errorMessage, type TransitClient } from '../lib/api';
import {
  addRecent,
  emptyPlaces,
  readPlaces,
  samePlace,
  toggleSaved,
  writePlaces,
  type LocalPlaces,
} from '../lib/local-places';
import { startupLocation } from '../lib/location';
import { journeyPoints } from '../lib/map-points';
import {
  departureAt,
  displayDate,
  duration,
  leaveNow,
  dallasParts,
  shiftDate,
} from '../lib/time';
import {
  DepartureSheet,
  departureLabel,
  type Departure,
} from './departure-sheet';
import { PlaceSearch } from './place-search';
import { JourneyTime, RouteCard, RouteSequence, Timeline } from './journey';
import { JourneyMap } from './journey-map';
import { Icon } from './icon';

import { AppHeader } from './app-header';
import { LiveJourneyPanel } from './live-journey';
export interface PreviewSetup {
  origin: Place | null;
  destination: Place | null;
  data?: JourneyResponse;
  detail?: number;
  search?: boolean;
  loading?: boolean;
  error?: string;
  expanded?: boolean;
  saved?: LocalPlaces;
}
export function TransitApp({
  client = liveClient,
  preview,
  mapStyle,
}: {
  client?: TransitClient;
  preview?: PreviewSetup;
  mapStyle?: string | StyleSpecification;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            gcTime: 0,
            staleTime: 0,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <Planner client={client} preview={preview} mapStyle={mapStyle} />
    </QueryClientProvider>
  );
}
function Planner({
  client,
  preview,
  mapStyle,
}: {
  client: TransitClient;
  preview: PreviewSetup | undefined;
  mapStyle: string | StyleSpecification | undefined;
}) {
  const [origin, setOrigin] = useState<Place | null>(preview?.origin ?? null);
  const [destination, setDestination] = useState<Place | null>(
    preview?.destination ?? null,
  );
  const [locationMessage, setLocationMessage] = useState(
    preview
      ? preview.origin
        ? ''
        : 'Enter a starting point to plan your trip. Location access is optional.'
      : 'Finding your current location…',
  );
  const manualOrigin = useRef(false);
  const [consentedLocation, setConsentedLocation] =
    useState<Pick<Place, 'latitude' | 'longitude'>>();
  const [places, setPlaces] = useState<LocalPlaces>(
    preview?.saved ?? emptyPlaces(),
  );
  const [storageMessage, setStorageMessage] = useState('');
  const [searchTarget, setSearchTarget] = useState<
    'origin' | 'destination' | null
  >(preview?.search ? 'destination' : null);
  const [departureOpen, setDepartureOpen] = useState(false);
  const [departure, setDeparture] = useState<Departure>({ mode: 'now' });
  const [request, setRequest] = useState<{
    id: number;
    input: GeographicRequest;
  } | null>(null);
  const [fixtureInitial, setFixtureInitial] = useState(true);
  const [replacement, setReplacement] = useState<JourneyResponse | null>(null);
  const [routeReason, setRouteReason] = useState('');
  const [selected, setSelected] = useState(preview?.detail ?? 0);
  const [detail, setDetail] = useState(preview?.detail !== undefined);
  const [message, setMessage] = useState(preview?.error ?? '');
  const [busyPreview, setBusyPreview] = useState(preview?.loading ?? false);
  const resultsRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLHeadingElement>(null);
  const destinationButton = useRef<HTMLButtonElement>(null);
  const originButton = useRef<HTMLButtonElement>(null);
  const sequence = useRef(0);
  useEffect(() => {
    if (preview) return;
    let mounted = true;
    void startupLocation().then((result) => {
      if (!mounted || manualOrigin.current) return;
      if (result.status === 'granted') {
        setConsentedLocation({
          latitude: result.place.latitude,
          longitude: result.place.longitude,
        });
        setOrigin(result.place);
        setLocationMessage('');
      } else setLocationMessage(result.message);
    });
    void Promise.resolve().then(() => {
      if (!mounted) return;
      try {
        setPlaces(readPlaces(localStorage));
      } catch {
        setPlaces(emptyPlaces());
      }
    });
    return () => {
      mounted = false;
    };
  }, [preview]);
  const search = useQuery({
    queryKey: ['journeys', request?.id],
    queryFn: ({ signal }) => client.journeys(request!.input, signal),
    enabled: request !== null,
  });
  const data =
    replacement ?? search.data ?? (fixtureInitial ? preview?.data : undefined);
  const loading = busyPreview || search.isFetching;
  const error = search.error ? errorMessage(search.error) : message;
  const result = data?.status === 'ok' ? data : undefined;
  const journey = result?.journeys[selected] ?? result?.journeys[0];
  const liveId = detail ? result?.liveJourneyIds?.[selected] : undefined;
  const points = useMemo(
    () => journeyPoints(journey, result?.references, origin, destination),
    [journey, result?.references, origin, destination],
  );
  const persist = (next: LocalPlaces) => {
    setPlaces(next);
    if (!preview) {
      try {
        if (!writePlaces(localStorage, next))
          setStorageMessage(
            'Places are available for this visit only. Device storage is unavailable.',
          );
      } catch {
        setStorageMessage(
          'Places are available for this visit only. Device storage is unavailable.',
        );
      }
    }
  };
  const resetResults = () => {
    setReplacement(null);
    setRouteReason('');
    setRequest(null);
    setFixtureInitial(false);
    setDetail(false);
    setMessage('');
    setBusyPreview(false);
  };
  const choosePlace = (p: Place, target: 'origin' | 'destination') => {
    resetResults();
    if (target === 'origin') {
      manualOrigin.current = true;
      setOrigin(p);
      setLocationMessage('');
    } else setDestination(p);
    setSearchTarget(null);
  };
  const findRoutes = () => {
    setReplacement(null);
    setRouteReason('');
    if (!origin) {
      originButton.current?.focus();
      setSearchTarget('origin');
      return;
    }
    if (!destination) {
      destinationButton.current?.focus();
      setSearchTarget('destination');
      return;
    }
    setMessage('');
    setFixtureInitial(false);
    setBusyPreview(false);
    setDetail(false);
    setSelected(0);
    try {
      const timing =
        departure.mode === 'now'
          ? leaveNow()
          : departureAt(departure.date, departure.time, departure.previousDay);
      const coordinate = (p: Place) => ({
        latitude: p.latitude,
        longitude: p.longitude,
      });
      setRequest({
        id: ++sequence.current,
        input: {
          origin: coordinate(origin),
          destination: coordinate(destination),
          ...timing,
        },
      });
      persist(addRecent(places, destination));
      resultsRef.current?.focus();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Check your departure time.');
    }
  };
  const showJourney = (index: number) => {
    setSelected(index);
    setDetail(true);
    requestAnimationFrame(() => {
      detailRef.current?.focus();
      if (window.innerWidth < 1000)
        window.scrollTo({ top: 0, behavior: 'instant' });
    });
  };
  const goBack = () => {
    setDetail(false);
    requestAnimationFrame(() => {
      resultsRef.current?.focus();
    });
  };
  const saved = destination
    ? places.saved.some((p) => samePlace(p, destination))
    : false;
  return (
    <>
      <a href="#planner-main" className="skip-link">
        Skip to trip planner
      </a>
      <AppHeader
        preview={Boolean(preview)}
        onHome={() => {
          resetResults();
          setDestination(null);
        }}
      />
      <main
        id="planner-main"
        className={`app-workspace${detail ? ' detail-open' : ''}`}
      >
        <div className="planning-column">
          <div className="planning-content">
            <div className="home-heading">
              <h1>Where do you need to go?</h1>
              <p>Plan your trip across Dallas.</p>
            </div>
            <form
              className="planner"
              onSubmit={(e) => {
                e.preventDefault();
                findRoutes();
              }}
            >
              <div className="journey-fields">
                <span className="field-track" aria-hidden="true">
                  <span />
                  <i />
                  <span />
                </span>
                <button
                  ref={originButton}
                  className="place-control"
                  type="button"
                  onClick={() => setSearchTarget('origin')}
                >
                  <span className="field-label">From</span>
                  <span
                    className={
                      origin?.name === 'Current location' ? 'current-place' : ''
                    }
                  >
                    {origin?.name ?? 'Search starting point'}
                    {origin?.name === 'Current location' && (
                      <Icon name="location" />
                    )}
                  </span>
                  {origin?.context && (
                    <span className="secondary">{origin.context}</span>
                  )}
                </button>
                <button
                  ref={destinationButton}
                  className="place-control destination-control"
                  type="button"
                  onClick={() => setSearchTarget('destination')}
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
              <button
                type="button"
                className="departure-button"
                onClick={() => setDepartureOpen(true)}
              >
                <Icon name="clock" />
                {departureLabel(departure)}
                <span className="down-chevron" aria-hidden="true" />
              </button>
              <button className="primary-button" type="submit">
                Find routes
                <Icon name="arrow" />
              </button>
            </form>
            {!data && !loading && !error && (
              <LocalPlaceList
                places={places}
                onChoose={(p) => choosePlace(p, 'destination')}
                onUpdate={persist}
              />
            )}
            {storageMessage && (
              <p role="status" className="secondary storage-message">
                {storageMessage}
              </p>
            )}
            <section
              ref={resultsRef}
              className="results-section"
              tabIndex={-1}
              aria-label="Route results"
              aria-busy={loading}
            >
              {loading && (
                <div className="loading-state" role="status">
                  <div className="section-heading">
                    <h2>Finding your routes</h2>
                    <button
                      className="text-button"
                      onClick={() => {
                        resetResults();
                        setMessage(
                          'Search canceled. You can change your trip and search again.',
                        );
                      }}
                    >
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
                  <h2>Let&apos;s get you on your way</h2>
                  <p>{error}</p>
                  <button className="secondary-button" onClick={findRoutes}>
                    Find routes again
                  </button>
                </div>
              )}
              {!loading && data?.status === 'no-journey' && (
                <div className="state-message" role="status">
                  <h2>No routes found for this trip</h2>
                  <p>
                    {data.reason.includes('access')
                      ? 'We could not find a connection from this starting point.'
                      : data.reason.includes('egress')
                        ? 'We could not find a connection to this destination.'
                        : 'No transit connection was found for this departure.'}{' '}
                    Try another time or a nearby place.
                  </p>
                  <button
                    className="secondary-button"
                    onClick={() => setDepartureOpen(true)}
                  >
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
                    Scheduled · {displayDate(result.serviceDate)} · Dallas time
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
                        onSelect={() => showJourney(i)}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>
          </div>
          {detail && journey && result && (
            <section className="detail-summary" aria-labelledby="journey-title">
              <button className="back-button" onClick={goBack}>
                <Icon name="back" />
                All route options
              </button>
              <p className="eyebrow">Your trip to</p>
              <div className="destination-heading">
                <h2 ref={detailRef} tabIndex={-1} id="journey-title">
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
                    onClick={() => persist(toggleSaved(places, destination))}
                  >
                    <Icon name="star" />
                  </button>
                )}
              </div>
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
              <p className="summary-metrics">
                {journey.transferCount === 0
                  ? 'No transfers'
                  : `${journey.transferCount} transfer${journey.transferCount > 1 ? 's' : ''}`}{' '}
                · {duration(journey.walkingDurationSeconds)} walking
              </p>
              <RouteSequence journey={journey} references={result.references} />
              <p className="results-caption summary-context">
                Scheduled · {displayDate(journey.serviceDate)} · Dallas time
              </p>
              {routeReason && (
                <p className="notice">Route options updated: {routeReason}</p>
              )}
              {result.incomplete && (
                <p className="notice">Some route options may be unavailable.</p>
              )}
            </section>
          )}
        </div>
        <div className="map-column">
          <JourneyMap
            points={points}
            {...(liveId ? { liveId, client } : {})}
            {...(mapStyle ? { styleUrl: mapStyle } : {})}
            fixture={Boolean(preview)}
            initiallyExpanded={preview?.expanded ?? false}
          />
        </div>
        {detail && journey && result && (
          <div className="instructions-column">
            {liveId && client.live && (
              <LiveJourneyPanel
                key={liveId}
                id={liveId}
                client={client}
                journey={journey}
                references={result.references}
                onReplace={(next, reason) => {
                  manualOrigin.current = true;
                  setOrigin({
                    ...next.origin,
                    name: 'Your confirmed location',
                  });
                  setReplacement(next);
                  setRouteReason(reason);
                  setSelected(0);
                  setDetail(false);
                }}
              />
            )}
            <Timeline
              journey={journey}
              references={result.references}
              destinationName={destination?.name ?? 'Your destination'}
              originName={origin?.name ?? 'Your starting point'}
              {...(liveId ? { liveId, client } : {})}
            />
          </div>
        )}
        <footer className="app-footer">
          <p>Times are scheduled. Check signs at your stop.</p>
          {!preview && (
            <p>
              Walking routes by <a href="https://www.geoapify.com/">Geoapify</a>
              .
            </p>
          )}
          <details>
            <summary>About departure times</summary>
            <p>
              Times use Dallas local time. Searches cover one day’s schedule.
              After midnight, some trips continuing from yesterday may be
              missing. Use Depart at to choose the previous day’s overnight
              service.
            </p>
          </details>
        </footer>
      </main>
      <div className="sr-only" role="status">
        {loading
          ? 'Searching for routes.'
          : result
            ? `${result.journeys.length} route options found.`
            : ''}
      </div>
      {searchTarget && (
        <PlaceSearch
          key={searchTarget}
          context={{
            serviceDate:
              departure.mode === 'now'
                ? dallasParts(new Date()).date
                : departure.previousDay
                  ? shiftDate(departure.date, -1)
                  : departure.date,
            ...(consentedLocation
              ? {
                  proximity: {
                    latitude: consentedLocation.latitude,
                    longitude: consentedLocation.longitude,
                  },
                }
              : {}),
          }}
          target={searchTarget}
          client={client}
          localPlaces={[...places.saved, ...places.recent]}
          onSelect={(p) => choosePlace(p, searchTarget)}
          onClose={() => setSearchTarget(null)}
          initialQuery={preview?.search ? 'museum' : ''}
        />
      )}
      {departureOpen && (
        <DepartureSheet
          value={departure}
          onSelect={(d) => {
            resetResults();
            setDeparture(d);
            setDepartureOpen(false);
          }}
          onClose={() => setDepartureOpen(false)}
        />
      )}
    </>
  );
}
function LocalPlaceList({
  places,
  onChoose,
  onUpdate,
}: {
  places: LocalPlaces;
  onChoose(p: Place): void;
  onUpdate(p: LocalPlaces): void;
}) {
  if (!places.recent.length && !places.saved.length)
    return (
      <p className="local-note">
        Your recent destinations will appear here, on this device.
      </p>
    );
  return (
    <div className="local-places">
      {(['saved', 'recent'] as const).map(
        (kind) =>
          places[kind].length > 0 && (
            <section
              key={kind}
              aria-label={
                kind === 'saved' ? 'Saved places' : 'Recent destinations'
              }
            >
              <div className="section-heading">
                <h2>
                  {kind === 'saved' ? 'Saved places' : 'Recent destinations'}
                </h2>
                {kind === 'recent' && (
                  <button
                    className="text-button"
                    onClick={() => onUpdate({ ...places, recent: [] })}
                  >
                    Clear
                  </button>
                )}
              </div>
              <ul>
                {places[kind].map((p, i) => (
                  <li key={`${p.name}-${i}`}>
                    <button className="local-place" onClick={() => onChoose(p)}>
                      <Icon name={kind === 'saved' ? 'star' : 'clock'} />
                      <span>
                        <strong>{p.name}</strong>
                        {p.context && (
                          <span className="secondary">{p.context}</span>
                        )}
                      </span>
                      <Icon name="chevron" />
                    </button>
                    <button
                      className="icon-button local-save"
                      aria-label={`${places.saved.some((s) => samePlace(s, p)) ? 'Unsave' : 'Save'} ${p.name}`}
                      aria-pressed={places.saved.some((s) => samePlace(s, p))}
                      onClick={() => onUpdate(toggleSaved(places, p))}
                    >
                      <Icon name="star" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ),
      )}
      <p className="local-note">Stored only on this device.</p>
    </div>
  );
}
