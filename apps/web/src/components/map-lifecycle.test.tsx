// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { JourneyMap } from './journey-map';
import type { MapPoint } from '../lib/map-points';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LiveJourney } from '@dallas-transit/shared';
import { previewClient } from '../preview/fixtures';
import { mapboxStyle } from '../lib/map-config';

const probe = vi.hoisted(() => ({
  maps: 0,
  disposed: 0,
  markers: 0,
  markersRemoved: 0,
  positions: [] as number[][],
}));
vi.mock('maplibre-gl', () => ({
  Map: class {
    constructor() {
      probe.maps++;
    }
    addControl() {}
    on() {}
    fitBounds() {}
    jumpTo() {}
    resize() {}
    remove() {
      probe.disposed++;
    }
  },
  Marker: class {
    constructor() {
      probe.markers++;
    }
    setLngLat(position: number[]) {
      probe.positions.push(position);
      return this;
    }
    setPopup() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {
      probe.markersRemoved++;
    }
  },
  Popup: class {
    setText() {
      return this;
    }
  },
  NavigationControl: class {},
  LngLatBounds: class {
    extend() {
      return this;
    }
  },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  Object.assign(probe, {
    maps: 0,
    disposed: 0,
    markers: 0,
    markersRemoved: 0,
    positions: [],
  });
});

it('moves only the selected vehicle marker, removes stale markers, and keeps the map instance', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(
        private callback: (entries: { isIntersecting: boolean }[]) => void,
      ) {}
      observe() {
        this.callback([{ isIntersecting: true }]);
      }
      disconnect() {}
    },
  );
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const live: LiveJourney = {
    publicationId: 'p',
    serviceDate: '2026-09-18',
    checkedAt: Date.now() / 1000,
    validUntil: Date.now() / 1000 + 45,
    freshness: 'LIVE',
    legs: [
      {
        legIndex: 1,
        freshness: 'LIVE',
        updatedAt: Date.now() / 1000,
        departureTime: null,
        arrivalTime: null,
        departureDelay: null,
        cancelled: false,
        boardingSkipped: false,
        alightingSkipped: false,
        stopsRemaining: null,
        boarding: 'UNKNOWN',
        vehicle: {
          identity: {
            tripId: 'selected',
            routeId: null,
            date: null,
            startTime: null,
            relationship: 0,
          },
          vehicleId: 'v',
          coordinate: { latitude: 32, longitude: -96 },
          timestamp: Date.now() / 1000,
          sequence: null,
          stopId: null,
          status: 'IN_TRANSIT',
          freshness: 'LIVE',
        },
      },
    ],
    transfers: [],
    alerts: [],
    replan: { suggested: false, reasons: [] },
  };
  cache.setQueryData(['live-journey', 'selected'], live);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const client = { ...previewClient, live: async () => live };
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={cache}>
          <JourneyMap points={[]} fixture liveId="selected" client={client} />
        </QueryClientProvider>,
      ),
    );
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(probe.maps).toBe(1);
    await act(async () => {
      await vi.waitFor(() => expect(probe.markers).toBe(1));
    });
    expect(probe.markers).toBe(1);
    const count = probe.positions.length;
    const moved = structuredClone(live);
    moved.legs[0]!.vehicle!.coordinate = { latitude: 32.001, longitude: -96 };
    await act(async () => {
      cache.setQueryData(['live-journey', 'selected'], moved);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(probe.maps).toBe(1);
    expect(probe.markers).toBe(1);
    expect(probe.positions.length).toBeGreaterThan(count);
    expect(probe.positions.at(-1)).toEqual([-96, 32.001]);
    const stale = structuredClone(moved);
    stale.legs[0]!.vehicle!.freshness = 'STALE';
    await act(async () => {
      cache.setQueryData(['live-journey', 'selected'], stale);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(probe.markersRemoved).toBe(1);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    cache.clear();
  }
});

it('updates route points without replacing the visible map and releases resources on unmount', async () => {
  const style = mapboxStyle('pk.fixture')!;
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(
        private callback: (entries: { isIntersecting: boolean }[]) => void,
      ) {}
      observe() {
        this.callback([{ isIntersecting: true }]);
      }
      disconnect() {}
    },
  );
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const point: MapPoint = {
    key: 'origin',
    kind: 'origin',
    symbol: 'A',
    label: 'Origin',
    coordinate: { latitude: 32.78, longitude: -96.8 },
  };
  try {
    await act(async () =>
      root.render(<JourneyMap points={[point]} styleUrl={style} />),
    );
    expect(
      container.querySelector('.mapbox-logo img')?.getAttribute('src'),
    ).toBe('/mapbox-logo.svg');
    expect(container.querySelector('.mapbox-logo')?.getAttribute('href')).toBe(
      'https://www.mapbox.com/',
    );
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    await act(async () =>
      root.render(
        <JourneyMap
          points={[
            { ...point, coordinate: { latitude: 32.79, longitude: -96.81 } },
          ]}
          styleUrl={style}
        />,
      ),
    );
    expect(probe.maps).toBe(1);
    expect(probe.disposed).toBe(0);
    expect(probe.positions).toEqual([
      [-96.8, 32.78],
      [-96.81, 32.79],
    ]);
    expect(probe.markersRemoved).toBe(1);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
  expect(probe.disposed).toBe(1);
  expect(probe.markersRemoved).toBe(probe.markers);
});

it('does not create a map for an offscreen mobile panel', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(<JourneyMap points={[]} fixture />));
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(probe.maps).toBe(0);
  } finally {
    await act(async () => root.unmount());
  }
});
