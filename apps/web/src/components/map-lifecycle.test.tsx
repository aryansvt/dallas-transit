// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { JourneyMap } from './journey-map';
import type { MapPoint } from '../lib/map-points';

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

it('updates route points without replacing the visible map and releases resources on unmount', async () => {
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
    await act(async () => root.render(<JourneyMap points={[point]} fixture />));
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    await act(async () =>
      root.render(
        <JourneyMap
          points={[
            { ...point, coordinate: { latitude: 32.79, longitude: -96.81 } },
          ]}
          fixture
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
