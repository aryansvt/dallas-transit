'use client';
import { useMemo, useRef, useState } from 'react';
import type { StyleSpecification } from 'maplibre-gl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { copyPlace, type Place } from '@dallas-transit/shared';
import { liveClient, type TransitClient } from '../lib/api';
import {
  CLASS_BUFFER_MINUTES,
  classAtLeave,
  classDestination,
  classWarning,
  earliestLeave,
  readSchedule,
  writeSchedule,
  type ClassTime,
} from '../lib/class-schedule';
import type { ClassSeries } from '../lib/ics';
import { addRecent } from '../lib/local-places';
import { journeyPoints } from '../lib/map-points';
import {
  emptyPresets,
  readPresets,
  setPreset,
  writePresets,
} from '../lib/presets';
import { STUDENT_PLACES } from '../lib/student-places';
import {
  arriveBy,
  departureAt,
  leaveNow,
  dallasParts,
  serviceInstant,
  shiftDate,
} from '../lib/time';
import { useDeviceStore } from '../hooks/use-device-store';
import { useJourneySearch } from '../hooks/use-journey-search';
import { useLocalPlaces } from '../hooks/use-local-places';
import { useNow } from '../hooks/use-now';
import { useStartupOrigin } from '../hooks/use-startup-origin';
import { ClassSchedule } from './class-schedule';
import { DepartureSheet, type Departure } from './departure-sheet';
import { HomeShortcuts } from './home-shortcuts';
import { PlaceSearch, type SearchTarget } from './place-search';
import { Timeline } from './journey';
import { JourneyMap } from './journey-map';
import { AppHeader } from './app-header';
import { LiveJourneyPanel } from './live-journey';
import { PlannerForm } from './planner-form';
import { RouteResults } from './route-results';
import { JourneySummary } from './journey-summary';
import { LocalPlaceList } from './local-place-list';
import type { PreviewSetup } from '../lib/preview-setup';

const quickPlaces = STUDENT_PLACES.map(copyPlace);
const noClasses = (): ClassSeries[] => [];
/** Request times for a departure choice. During a class, departure-time insight
 * gets the class end as the earliest leave. */
function requestTime(d: Departure, now: Date, classes: readonly ClassSeries[]) {
  if (d.mode === 'by')
    return {
      ...arriveBy(d.date, d.time),
      arrivalBufferMinutes: d.bufferMinutes,
    };
  const t =
    d.mode === 'now'
      ? leaveNow(now)
      : departureAt(d.date, d.time, d.previousDay);
  const earliest = earliestLeave(classes, t.serviceDate, t.departureTime);
  return earliest === undefined ? t : { ...t, earliestDepartureTime: earliest };
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
  const { origin, chooseOrigin, locationMessage, consentedLocation } =
    useStartupOrigin(preview);
  const [destination, setDestination] = useState<Place | null>(
    preview?.destination ?? null,
  );
  const { places, persist, storageMessage } = useLocalPlaces(
    preview?.saved,
    !preview,
  );
  const presetStore = useDeviceStore(
    readPresets,
    writePresets,
    emptyPresets,
    preview?.presets,
    !preview,
    'Home and School are available for this visit only. Device storage is unavailable.',
  );
  const presets = presetStore.value;
  const scheduleStore = useDeviceStore(
    readSchedule,
    writeSchedule,
    noClasses,
    preview?.schedule,
    !preview,
    'Your classes are available for this visit only. Device storage is unavailable.',
  );
  const classes = scheduleStore.value;
  const now = useNow(preview?.now);
  const [searchTarget, setSearchTarget] = useState<SearchTarget | null>(
    preview?.search ? 'destination' : null,
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [departureOpen, setDepartureOpen] = useState(false);
  const [departure, setDeparture] = useState<Departure>(
    preview?.departure ?? { mode: 'now' },
  );
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
  const choosePlace = (p: Place, target: SearchTarget) => {
    setSearchTarget(null);
    if (target === 'home' || target === 'school') {
      presetStore.persist(setPreset(presets, target, p));
      return;
    }
    trip.reset();
    if (target === 'origin') chooseOrigin(p);
    else setDestination(p);
  };
  const openSearch = (target: SearchTarget, query = '') => {
    setSearchQuery(query);
    setSearchTarget(target);
  };
  /** Search with the current choices, or with ones set in the same tap. */
  const findRoutes = (
    next: {
      origin?: Place | null;
      destination?: Place;
      departure?: Departure;
    } = {},
  ) => {
    const from = next.origin === undefined ? origin : next.origin;
    const to = next.destination ?? destination;
    const when = next.departure ?? departure;
    trip.clearReplacement();
    if (!from) {
      originButton.current?.focus();
      openSearch('origin');
      return;
    }
    if (!to) {
      destinationButton.current?.focus();
      openSearch('destination');
      return;
    }
    const coordinate = (p: Place) => ({
      latitude: p.latitude,
      longitude: p.longitude,
    });
    const started = trip.start(() => ({
      origin: coordinate(from),
      destination: coordinate(to),
      ...requestTime(when, preview?.now ? now : new Date(), classes),
    }));
    if (!started) return;
    persist(addRecent(places, to));
    resultsRef.current?.focus();
  };
  // next class: its entrance, arriving by the start with a buffer
  const planClass = (next: ClassTime) => {
    const target = classDestination(next.series);
    if (!target || !('place' in target)) return;
    const start = dallasParts(next.start);
    const when: Departure = {
      mode: 'by',
      date: start.date,
      time: start.time,
      bufferMinutes: CLASS_BUFFER_MINUTES,
    };
    const from = origin ?? presets.home;
    trip.reset();
    if (!origin && presets.home) chooseOrigin(presets.home);
    setDestination(target.place);
    setDeparture(when);
    findRoutes({ origin: from, destination: target.place, departure: when });
  };
  // departure-time insight: plan again from the suggested time
  const planAt = (seconds: number) => {
    if (!result) return;
    const at = dallasParts(serviceInstant(result.serviceDate, seconds));
    const when: Departure = {
      mode: 'at',
      date: at.date,
      time: at.time,
      previousDay: at.date !== result.serviceDate,
    };
    setDeparture(when);
    findRoutes({ departure: when });
  };
  // a passed leave-by: see when you would get there going now
  const leaveNowInstead = () => {
    const when: Departure = { mode: 'now' };
    setDeparture(when);
    findRoutes({ departure: when });
  };
  const arriveByTrip = Boolean(result && 'requestedArrivalTime' in result);
  const duringClass =
    arriveByTrip && journey
      ? classAtLeave(
          classes,
          journey.serviceDate,
          journey.requestedDepartureTime,
        )
      : null;
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
  const schedule = (
    <ClassSchedule
      key="schedule"
      classes={classes}
      now={now}
      onImport={scheduleStore.persist}
      onRemove={() => scheduleStore.persist([])}
      onPlan={planClass}
      onChoose={(query) => openSearch('destination', query)}
    />
  );
  const shortcuts = (
    <HomeShortcuts
      key="shortcuts"
      presets={presets}
      onChoose={(p) => choosePlace(p, 'destination')}
      onEdit={(name) => openSearch(name)}
    />
  );
  const localPlaces = (
    <LocalPlaceList
      key="places"
      places={places}
      onChoose={(p) => choosePlace(p, 'destination')}
      onUpdate={persist}
    />
  );
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
              onSearch={(target) => openSearch(target)}
              onDeparture={() => setDepartureOpen(true)}
              onSubmit={() => findRoutes()}
            />
            {/* keyed so the schedule keeps its state when it moves to the top */}
            {!data && !loading && !error && (
              <>
                {classes.length > 0
                  ? [schedule, shortcuts, localPlaces]
                  : [shortcuts, localPlaces, schedule]}
              </>
            )}
            {[
              storageMessage,
              presetStore.storageMessage,
              scheduleStore.storageMessage,
            ]
              .filter(Boolean)
              .map((message) => (
                <p
                  key={message}
                  role="status"
                  className="secondary storage-message"
                >
                  {message}
                </p>
              ))}
            <RouteResults
              ref={resultsRef}
              data={data}
              loading={loading}
              error={error}
              selected={trip.selected}
              classes={classes}
              now={now}
              onCancel={() =>
                trip.reset(
                  'Search canceled. You can change your trip and search again.',
                )
              }
              onRetry={() => findRoutes()}
              onChangeDeparture={() => setDepartureOpen(true)}
              onSelect={showJourney}
              onInsight={planAt}
              onLeaveNow={leaveNowInstead}
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
              arriveBy={arriveByTrip}
              warning={duringClass ? classWarning(duringClass) : ''}
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
      {searchTarget && (
        <PlaceSearch
          key={searchTarget}
          context={{
            serviceDate:
              departure.mode === 'now'
                ? dallasParts(new Date()).date
                : departure.mode === 'at' && departure.previousDay
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
          quickPlaces={quickPlaces}
          onSelect={(p) => choosePlace(p, searchTarget)}
          onClose={() => setSearchTarget(null)}
          initialQuery={searchQuery || (preview?.search ? 'museum' : '')}
          {...((searchTarget === 'home' || searchTarget === 'school') &&
          presets[searchTarget]
            ? {
                onRemove: () => {
                  presetStore.persist(setPreset(presets, searchTarget, null));
                  setSearchTarget(null);
                },
              }
            : {})}
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
