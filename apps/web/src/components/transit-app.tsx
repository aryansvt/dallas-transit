'use client';
import { useMemo, useRef, useState } from 'react';
import type { StyleSpecification } from 'maplibre-gl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Place } from '@dallas-transit/shared';
import { liveClient, type TransitClient } from '../lib/api';
import { addRecent } from '../lib/local-places';
import { journeyPoints } from '../lib/map-points';
import { departureAt, leaveNow, dallasParts, shiftDate } from '../lib/time';
import { useJourneySearch } from '../hooks/use-journey-search';
import { useLocalPlaces } from '../hooks/use-local-places';
import { useStartupOrigin } from '../hooks/use-startup-origin';
import { DepartureSheet, type Departure } from './departure-sheet';
import { PlaceSearch } from './place-search';
import { Timeline } from './journey';
import { JourneyMap } from './journey-map';
import { AppHeader } from './app-header';
import { LiveJourneyPanel } from './live-journey';
import { PlannerForm } from './planner-form';
import { RouteResults } from './route-results';
import { JourneySummary } from './journey-summary';
import { LocalPlaceList } from './local-place-list';
import type { PreviewSetup } from '../lib/preview-setup';
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
  const { origin, chooseOrigin, locationMessage, consentedLocation } =
    useStartupOrigin(preview);
  const [destination, setDestination] = useState<Place | null>(
    preview?.destination ?? null,
  );
  const { places, persist, storageMessage } = useLocalPlaces(
    preview?.saved,
    !preview,
  );
  const [searchTarget, setSearchTarget] = useState<
    'origin' | 'destination' | null
  >(preview?.search ? 'destination' : null);
  const [departureOpen, setDepartureOpen] = useState(false);
  const [departure, setDeparture] = useState<Departure>({ mode: 'now' });
  const trip = useJourneySearch(client, preview);
  const { data, result, journey, detail, loading, error, liveId } = trip;
  const resultsRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLHeadingElement>(null);
  const destinationButton = useRef<HTMLButtonElement>(null);
  const originButton = useRef<HTMLButtonElement>(null);
  const points = useMemo(
    () => journeyPoints(journey, result?.references, origin, destination),
    [journey, result?.references, origin, destination],
  );
  const choosePlace = (p: Place, target: 'origin' | 'destination') => {
    trip.reset();
    if (target === 'origin') chooseOrigin(p);
    else setDestination(p);
    setSearchTarget(null);
  };
  const findRoutes = () => {
    trip.clearReplacement();
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
    const coordinate = (p: Place) => ({
      latitude: p.latitude,
      longitude: p.longitude,
    });
    const started = trip.start(() => ({
      origin: coordinate(origin),
      destination: coordinate(destination),
      ...(departure.mode === 'now'
        ? leaveNow()
        : departureAt(departure.date, departure.time, departure.previousDay)),
    }));
    if (!started) return;
    persist(addRecent(places, destination));
    resultsRef.current?.focus();
  };
  const showJourney = (index: number) => {
    trip.show(index);
    requestAnimationFrame(() => {
      detailRef.current?.focus();
      if (window.innerWidth < 1000)
        window.scrollTo({ top: 0, behavior: 'instant' });
    });
  };
  const goBack = () => {
    trip.hide();
    requestAnimationFrame(() => {
      resultsRef.current?.focus();
    });
  };
  return (
    <>
      <a href="#planner-main" className="skip-link">
        Skip to trip planner
      </a>
      <AppHeader
        preview={Boolean(preview)}
        onHome={() => {
          trip.reset();
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
            <PlannerForm
              origin={origin}
              destination={destination}
              locationMessage={locationMessage}
              departure={departure}
              originRef={originButton}
              destinationRef={destinationButton}
              onSearch={setSearchTarget}
              onDeparture={() => setDepartureOpen(true)}
              onSubmit={findRoutes}
            />
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
            <RouteResults
              ref={resultsRef}
              data={data}
              loading={loading}
              error={error}
              selected={trip.selected}
              onCancel={() =>
                trip.reset(
                  'Search canceled. You can change your trip and search again.',
                )
              }
              onRetry={findRoutes}
              onChangeDeparture={() => setDepartureOpen(true)}
              onSelect={showJourney}
            />
          </div>
          {detail && journey && result && (
            <JourneySummary
              headingRef={detailRef}
              journey={journey}
              references={result.references}
              incomplete={result.incomplete}
              destination={destination}
              places={places}
              routeReason={trip.routeReason}
              onBack={goBack}
              onUpdatePlaces={persist}
            />
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
                  chooseOrigin({
                    ...next.origin,
                    name: 'Your confirmed location',
                  });
                  trip.replace(next, reason);
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
          <p>LineFinder is independent and not affiliated with DART.</p>
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
            trip.reset();
            setDeparture(d);
            setDepartureOpen(false);
          }}
          onClose={() => setDepartureOpen(false)}
        />
      )}
    </>
  );
}
