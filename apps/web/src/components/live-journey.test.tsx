// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from '@tanstack/react-query';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import type { LiveJourney } from '@dallas-transit/shared';
import { previewClient, previewResponse } from '../preview/fixtures';
import type { TransitClient } from '../lib/api';
import { ClientError } from '../lib/api';
import { LiveJourneyPanel, LiveTiming } from './live-journey';

let root: Root, container: HTMLDivElement;
const plan = previewResponse();
if (plan.status !== 'ok') throw new Error();
const journey = plan.journeys[0]!;
const legIndex = journey.legs.findIndex((l) => l.kind === 'transit');
const state = (): LiveJourney => ({
  publicationId: journey.publicationId,
  serviceDate: journey.serviceDate,
  checkedAt: Date.now() / 1000,
  validUntil: Date.now() / 1000 + 45,
  freshness: 'LIVE',
  legs: [
    {
      legIndex,
      freshness: 'LIVE',
      updatedAt: Date.now() / 1000,
      departureTime: 30000,
      arrivalTime: 31000,
      departureDelay: 120,
      cancelled: false,
      boardingSkipped: false,
      alightingSkipped: false,
      stopsRemaining: 1,
      boarding: 'UPCOMING',
      vehicle: {
        identity: {
          tripId: 'fixture',
          routeId: null,
          date: null,
          startTime: null,
          relationship: 0,
        },
        timestamp: Date.now() / 1000,
        vehicleId: 'vehicle',
        coordinate: { latitude: 32, longitude: -96 },
        sequence: 20,
        stopId: 'B',
        status: 'IN_TRANSIT',
        freshness: 'LIVE',
      },
    },
  ],
  transfers: [],
  alerts: [],
  replan: { suggested: false, reasons: [] },
});
beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  focusManager.setFocused(true);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  focusManager.setFocused(undefined);
});
async function tick(ms = 50) {
  await act(async () => vi.advanceTimersByTimeAsync(ms));
}
async function render(client: TransitClient, onReplace = vi.fn()) {
  const cache = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, refetchOnWindowFocus: false },
    },
  });
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <LiveJourneyPanel
          id="fixture"
          client={client}
          journey={journey}
          references={plan.references}
          onReplace={onReplace}
        />
        <LiveTiming
          id="fixture"
          client={client}
          legIndex={legIndex}
          serviceDate={journey.serviceDate}
        />
      </QueryClientProvider>,
    ),
  );
  await tick();
  return cache;
}
function button(prefix: string) {
  const b = [...container.querySelectorAll('button')].find((b) =>
    b.textContent?.startsWith(prefix),
  );
  if (!b) throw new Error(prefix);
  return b;
}
async function click(prefix: string) {
  await act(async () => button(prefix).click());
  await tick();
}
it('requires explicit onboard confirmation before giving exit guidance', async () => {
  await render({ ...previewClient, live: async () => state() });
  expect(container.textContent).toContain('Live updates available');
  expect(container.textContent).not.toContain('Get off next');
  expect(container.textContent).toContain('2 min late');
  await click('I’m on');
  expect(container.textContent).toContain('Get off next');
  await click('I’m off');
  expect(container.textContent).not.toContain('Get off next');
});
it('shares requests with timeline subscribers and polls at most every 15 seconds', async () => {
  const live = vi.fn(async () => state());
  await render({ ...previewClient, live });
  expect(live).toHaveBeenCalledTimes(1);
  await tick(14900);
  expect(live).toHaveBeenCalledTimes(1);
  await tick(200);
  expect(live).toHaveBeenCalledTimes(2);
  focusManager.setFocused(false);
  await tick(60000);
  expect(live).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain('showing scheduled times');
});
it('never keeps a live label or prediction after API failure', async () => {
  const live = vi
    .fn()
    .mockResolvedValueOnce(state())
    .mockRejectedValue(new Error('offline'));
  await render({ ...previewClient, live });
  await tick(15100);
  expect(container.textContent).toContain('Live updates unavailable');
  expect(container.textContent).not.toContain('2 min late');
  expect(container.textContent).not.toContain('Live updates available');
});

it('stops polling expired journey handles and explains how to resume', async () => {
  const live = vi.fn(async () => {
    throw new ClientError('NOT_FOUND');
  });
  await render({ ...previewClient, live });
  await tick(60000);
  expect(live).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain(
    'Find routes again to resume live updates',
  );
});

it('expires a live label at the server freshness boundary even between polls', async () => {
  const data = state();
  data.validUntil = Date.now() / 1000 + 1;
  await render({ ...previewClient, live: async () => data });
  expect(container.textContent).toContain('Live updates available');
  await tick(1100);
  expect(container.textContent).not.toContain('Live updates available');
  expect(container.textContent).not.toContain('Get off next');
});
it.each(['AGING', 'STALE', 'SCHEDULED_FALLBACK', 'UNAVAILABLE'] as const)(
  'labels %s honestly',
  async (freshness) => {
    const data = state();
    data.freshness = freshness;
    data.legs[0]!.freshness = freshness;
    data.legs[0]!.vehicle = null;
    await render({ ...previewClient, live: async () => data });
    expect(container.textContent).not.toContain('Live updates available');
    if (freshness !== 'AGING')
      expect(container.textContent).not.toContain('2 min late');
  },
);
it('shows disruption warnings and preserves current directions after replan failure', async () => {
  const data = state();
  data.legs[0]!.cancelled = true;
  data.replan = {
    suggested: true,
    reasons: ['A selected service is cancelled.'],
  };
  const replan = vi.fn(async () => {
    throw new Error('Service unavailable.');
  });
  await render({ ...previewClient, live: async () => data, replan });
  expect(container.textContent).toContain('cancelled');
  const select = container.querySelector('select')!;
  await act(async () => {
    select.value = select.options[1]!.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await click('Replan from this stop');
  expect(replan).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain(
    'Your original directions remain available',
  );
  await click('Replan from this stop');
  expect(replan).toHaveBeenCalledTimes(1);
});
it('rejects equivalent routes without oscillating or silently replacing the selected journey', async () => {
  const onReplace = vi.fn();
  await render(
    {
      ...previewClient,
      live: async () => state(),
      replan: async () => ({
        status: 'ok',
        reason: 'Refresh requested',
        result: { ...plan, journeys: [journey] },
      }),
    },
    onReplace,
  );
  const select = container.querySelector('select')!;
  await act(async () => {
    select.value = select.options[1]!.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await click('Replan from this stop');
  expect(container.textContent).toContain('still the available option');
  expect(onReplace).not.toHaveBeenCalled();
});

it('offers changed walking access from a newly confirmed location even when transit is unchanged', async () => {
  const onReplace = vi.fn();
  const origin = {
    ...journey.origin,
    latitude: journey.origin.latitude + 0.001,
  };
  const result = { ...plan, origin, journeys: [{ ...journey, origin }] };
  await render(
    {
      ...previewClient,
      live: async () => state(),
      replan: async () => ({
        status: 'ok',
        reason: 'Your location changed.',
        result,
      }),
    },
    onReplace,
  );
  const select = container.querySelector('select')!;
  await act(async () => {
    select.value = select.options[1]!.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await click('Replan from this stop');
  expect(onReplace).not.toHaveBeenCalled();
  await click('View new route options');
  expect(onReplace).toHaveBeenCalledWith(result, 'Your location changed.');
});
