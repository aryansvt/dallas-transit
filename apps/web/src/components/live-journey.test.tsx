// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from '@tanstack/react-query';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import type {
  LiveJourney,
  GeographicJourney,
  References,
} from '@dallas-transit/shared';
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
async function render(
  client: TransitClient,
  onReplace = vi.fn(),
  selected: { journey: GeographicJourney; references: References } = {
    journey,
    references: plan.references,
  },
) {
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
          journey={selected.journey}
          references={selected.references}
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
const statusLabel = () =>
  container.querySelector('.live-status')?.getAttribute('aria-label');
function threeBuses() {
  const template = journey.legs.find((l) => l.kind === 'transit')!;
  const bus = plan.references.routes.find((r) => r.type === 3)!;
  const numbers = ['244', '238', '022'];
  const selected = {
    journey: {
      ...journey,
      legs: numbers.map((number) => ({
        ...template,
        routeId: number,
        tripId: 'bus-trip',
      })),
    },
    references: {
      ...plan.references,
      routes: numbers.map((number) => ({
        ...bus,
        routeId: number,
        shortName: number,
      })),
    },
  };
  const data: LiveJourney = {
    ...state(),
    freshness: 'SCHEDULED_FALLBACK',
    legs: numbers.map((_, i) => ({
      ...state().legs[0]!,
      legIndex: i,
      freshness: 'SCHEDULED_FALLBACK',
      vehicle: null,
      stopsRemaining: null,
    })),
    transfers: [1, 2].map((outboundLeg) => ({
      inboundLeg: outboundLeg - 1,
      outboundLeg,
      status: 'UNKNOWN',
      requiredSeconds: 120,
      remainingSeconds: null,
      reason: 'Fresh timing is needed for both services.',
    })),
  };
  return { selected, data };
}
it('shows one native primary boarding button and progresses only after explicit confirmations', async () => {
  const { selected, data } = threeBuses();
  await render({ ...previewClient, live: async () => data }, vi.fn(), selected);
  const boarding = () =>
    [...container.querySelectorAll('button')].filter((b) =>
      b.textContent?.startsWith('I’m on'),
    );
  expect(boarding().map((b) => b.textContent)).toEqual(['I’m on Bus 244']);
  const first = boarding()[0]!;
  expect(first.type).toBe('button');
  expect(first.classList.contains('primary-button')).toBe(true);
  expect(first.disabled).toBe(false);
  first.focus();
  expect(document.activeElement).toBe(first);
  expect(
    container.querySelector('.live-next-action h3')?.textContent,
  ).toContain('Board at');
  expect(
    container.querySelector('.live-route-identity')?.textContent,
  ).toContain('Bus 244');
  expect(container.querySelector('.live-status')?.textContent).toBe(
    'Scheduled',
  );
  await tick(16000); // Polling and elapsed time cannot board for the rider.
  expect(boarding()[0]?.textContent).toBe('I’m on Bus 244');
  expect(container.querySelector('.live-onboard')).toBeNull();
  for (const number of ['244', '238', '022']) {
    expect(boarding().map((b) => b.textContent)).toEqual([
      `I’m on Bus ${number}`,
    ]);
    await click(`I’m on Bus ${number}`);
    expect(boarding()).toHaveLength(0);
    expect(container.querySelector('.live-onboard')?.textContent).toBe(
      `You confirmed you’re on Bus ${number}.`,
    );
    expect(
      container.querySelector('.live-next-action h3')?.textContent,
    ).toContain('Get off at');
    expect(document.activeElement).toBe(button('I’m off'));
    await click('I’m off');
  }
  expect(boarding()).toHaveLength(0);
  expect(container.textContent).toContain('Transit rides complete');
  expect(document.activeElement).toBe(
    container.querySelector('.live-next-action h3'),
  );
});
it('summarizes unavailable transfer timing once and removes it after the final boarding', async () => {
  const { selected, data } = threeBuses();
  await render({ ...previewClient, live: async () => data }, vi.fn(), selected);
  const note = () => container.querySelectorAll('.live-transfer-note');
  expect(note()).toHaveLength(1);
  expect(note()[0]?.textContent).toBe(
    'We can’t check transfer risk without live timing. Scheduled directions are still available.',
  );
  expect(container.textContent).not.toContain('Fresh timing');
  await click('I’m on');
  await click('I’m off');
  await click('I’m on');
  expect(note()).toHaveLength(1);
  await click('I’m off');
  await click('I’m on');
  expect(note()).toHaveLength(0);
});
it('keeps actionable transfer warnings alongside one unavailable-timing explanation', async () => {
  const { selected, data } = threeBuses();
  data.transfers[1] = {
    ...data.transfers[1]!,
    status: 'AT_RISK',
    reason: 'Only one minute remains for this transfer.',
  };
  await render({ ...previewClient, live: async () => data }, vi.fn(), selected);
  expect(container.querySelectorAll('.live-transfer-note')).toHaveLength(1);
  expect(container.textContent).toContain(
    'Transfer is at risk. Only one minute remains for this transfer.',
  );
});
it('retains scheduled transfer guidance when live requests fail', async () => {
  const { selected } = threeBuses();
  await render(
    {
      ...previewClient,
      live: async () => {
        throw new Error('offline');
      },
    },
    vi.fn(),
    selected,
  );
  expect(container.querySelector('.live-status')?.textContent).toBe(
    'Scheduled',
  );
  expect(container.querySelectorAll('.live-transfer-note')).toHaveLength(1);
  expect(button('I’m on Bus 244')).toBeTruthy();
});
async function click(prefix: string) {
  await act(async () => button(prefix).click());
  await tick();
}
it('requires explicit onboard confirmation before giving exit guidance', async () => {
  await render({ ...previewClient, live: async () => state() });
  expect(statusLabel()).toBe('Live updates available');
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
  expect(statusLabel()).toContain('showing scheduled times');
});
it('never keeps a live label or prediction after API failure', async () => {
  const live = vi
    .fn()
    .mockResolvedValueOnce(state())
    .mockRejectedValue(new Error('offline'));
  await render({ ...previewClient, live });
  await tick(15100);
  expect(statusLabel()).toContain('Live updates unavailable');
  expect(container.textContent).not.toContain('2 min late');
  expect(statusLabel()).not.toBe('Live updates available');
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
  expect(statusLabel()).toBe('Live updates available');
  await tick(1100);
  expect(statusLabel()).not.toBe('Live updates available');
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
    expect(statusLabel()).not.toBe('Live updates available');
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
  const details = container.querySelector('details')!;
  details.open = true;
  const gpsButton = button('Use my current location');
  const stopButton = button('Replan from this stop');
  for (const action of [gpsButton, stopButton]) {
    expect(action.type).toBe('button');
    expect(action.classList.contains('text-button')).toBe(true);
    expect(action.classList.contains('primary-button')).toBe(false);
  }
  expect(stopButton.disabled).toBe(true);
  gpsButton.focus();
  expect(document.activeElement).toBe(gpsButton);
  const select = container.querySelector('select')!;
  expect(stopButton.closest('[role="group"]')?.contains(select)).toBe(true);
  await act(async () => {
    select.value = select.options[1]!.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(stopButton.disabled).toBe(false);
  stopButton.focus();
  expect(document.activeElement).toBe(stopButton);
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
