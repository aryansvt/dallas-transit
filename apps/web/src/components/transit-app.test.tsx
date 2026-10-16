// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Timeline } from './journey';
import { TransitApp } from './transit-app';
import {
  previewClient,
  previewDestination,
  previewPlaces,
  previewResponse,
  previewSetup,
} from '../preview/fixtures';
import type { TransitClient } from '../lib/api';
import { ClientError } from '../lib/api';
import { MAX_SAVED, SAVED_FULL_MESSAGE } from '../lib/local-places';
vi.mock('./journey-map', () => ({
  JourneyMap: () => (
    <div aria-label="Journey map">Map integration boundary</div>
  ),
}));
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(
    function (this: HTMLDialogElement) {
      this.open = true;
    },
  );
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.open = false;
  });
  vi.stubGlobal('scrollTo', () => {});
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function tick(ms = 600) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
async function render(
  scenario: Parameters<typeof previewSetup>[0] = 'granted',
  client: TransitClient = previewClient,
) {
  await act(async () =>
    root.render(
      <TransitApp preview={previewSetup(scenario)} client={client} />,
    ),
  );
}
function button(text: string) {
  const found = [...container.querySelectorAll('button')].find(
    (b) =>
      b.textContent?.trim() === text || b.getAttribute('aria-label') === text,
  );
  if (!found) throw new Error(`Button missing: ${text}`);
  return found;
}
async function click(b: HTMLElement) {
  await act(async () => {
    b.focus();
    b.click();
  });
}
it('has the exact approved home heading and manual-origin permission fallback', async () => {
  await render('manual');
  expect(container.querySelector('h1')?.textContent).toBe(
    'Where do you need to go?',
  );
  expect(container.textContent).toContain('Location access is optional.');
  await click(button('Find routes'));
  expect(container.querySelector('dialog')?.textContent).toContain(
    'Your starting point',
  );
  expect(container.querySelector('input[role="combobox"]')).toBe(
    document.activeElement,
  );
});
it('supports combobox arrow/Enter selection and restores focus', async () => {
  await render('search');
  await tick();
  const input = container.querySelector<HTMLInputElement>('[role="combobox"]')!;
  expect(container.querySelectorAll('[role="option"]')).toHaveLength(2);
  await act(async () => {
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    );
  });
  expect(input.getAttribute('aria-activedescendant')).toBeTruthy();
  await act(async () => {
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
  });
  expect(container.querySelector('dialog')).toBeNull();
  expect(container.textContent).toContain(previewPlaces[0]!.name);
});
it('opens time options, applies the choice, restores the opener', async () => {
  await render();
  const opener = button('Leave now');
  await click(opener);
  expect(container.querySelector('dialog')?.textContent).toContain('Depart at');
  expect(container.querySelector('dialog')?.textContent).toContain('Arrive by');
  await click(button('Set time'));
  expect(document.activeElement).toBe(opener);
});
it('plans, shows alternatives, opens direct instructions, and returns to results', async () => {
  await render('results');
  expect(container.querySelectorAll('.route-card')).toHaveLength(3);
  await click(container.querySelectorAll<HTMLButtonElement>('.route-card')[1]!);
  await tick(20);
  expect(container.querySelector('.timeline')?.textContent).toContain('Board');
  expect(container.querySelector('.timeline')?.textContent).toContain(
    'Get off',
  );
  expect(container.querySelector('.timeline')?.textContent).toContain(
    "You've arrived",
  );
  expect(container.querySelector('.timeline')?.textContent).not.toContain(
    'pattern:',
  );
  await click(button('All route options'));
  expect(container.querySelector('.timeline')).toBeNull();
});
it('preserves transfer instructions, overnight date context and partial-result language', async () => {
  await render('overnight');
  expect(container.querySelector('.timeline')?.textContent).toContain(
    'Transfer at Akard Station',
  );
  expect(container.querySelector('.timeline')?.textContent).toContain(
    'next day',
  );
  // the router's own per-leg risk, not a guess: 3 spare minutes is tight
  expect(container.querySelector('.transfer-step')?.textContent).toContain(
    'Tight transfer5 min to connect',
  );
});
it('labels each transfer from router risk and never invents one', async () => {
  await render('transfers');
  const tags = [...container.querySelectorAll('.route-card .transfer-tag')];
  expect(tags.map((t) => t.textContent)).toEqual([
    'Risky transfer',
    'Tight transfer',
    'Comfortable transfer',
  ]);
  // the meaning is in words and an icon, not only color
  expect(tags.every((t) => t.querySelector('svg'))).toBe(true);
  const { references, journeys } = previewResponse();
  const bare = {
    ...journeys[0]!,
    legs: journeys[0]!.legs.map((l) =>
      l.kind === 'transit' ? { ...l, scheduledTransferRisk: undefined } : l,
    ),
  };
  await act(async () =>
    root.render(
      <Timeline
        journey={JSON.parse(JSON.stringify(bare))}
        references={references}
        originName="Origin"
        destinationName="Destination"
      />,
    ),
  );
  expect(container.textContent).toContain('Transfer at Akard Station');
  expect(container.textContent).not.toMatch(/comfortable|tight|risky/i);
});
it('names the tightest of several transfers and words each one in the steps', async () => {
  await render('transfers-detail');
  expect(
    container.querySelector('.summary-metrics .transfer-tag')?.textContent,
  ).toBe('Tightest: Risky transfer');
  expect(
    [...container.querySelectorAll('.transfer-confidence')].map(
      (p) => p.textContent,
    ),
  ).toEqual([
    'Comfortable transfer10 min to connect',
    'Risky transfer2 min to connect',
  ]);
});
it('cancels superseded journey queries and ignores late completion', async () => {
  const signals: AbortSignal[] = [];
  const client: TransitClient = {
    ...previewClient,
    journeys: (_input, signal) => {
      signals.push(signal);
      return new Promise(() => {});
    },
  };
  await render('results', client);
  await click(button('Find routes'));
  await tick(10);
  expect(container.textContent).toContain('Finding your routes');
  await click(button('Find routes'));
  await tick(10);
  expect(signals).toHaveLength(2);
  expect(signals[0]?.aborted).toBe(true);
  await click(button('Cancel'));
  await tick(10);
  expect(signals[1]?.aborted).toBe(true);
  expect(container.textContent).toContain('Search canceled.');
});
it('announces service errors without raw codes and retains editable planning controls', async () => {
  await render('results', {
    ...previewClient,
    journeys: async () => {
      throw new ClientError('SERVER_BUSY');
    },
  });
  await click(button('Find routes'));
  await tick(10);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    'A lot of trips',
  );
  expect(container.textContent).not.toContain('SERVER_BUSY');
  expect(button('Find routes')).toBeTruthy();
});
it('shows no-journey and incomplete outcomes separately', async () => {
  await render('empty');
  expect(container.textContent).toContain('No routes found');
  expect(container.querySelectorAll('.route-card')).toHaveLength(0);
});
it('uses human language for partial results', async () => {
  await render('partial');
  expect(container.textContent).toContain(
    'Some route options may be unavailable.',
  );
  expect(container.textContent).not.toContain('incomplete');
});
it('keeps preview saves isolated from device storage', async () => {
  const spy = vi.spyOn(Storage.prototype, 'setItem');
  await render('direct');
  await click(button('Save destination'));
  expect(
    button('Remove destination from saved places').getAttribute('aria-pressed'),
  ).toBe('true');
  expect(spy).not.toHaveBeenCalled();
});
it('explains a full saved list instead of silently dropping a saved place', async () => {
  const saved = Array.from({ length: MAX_SAVED }, (_, i) => ({
    ...previewDestination,
    name: `Saved ${i}`,
  }));
  const full = { version: 1 as const, recent: [], saved };
  for (const scenario of ['direct', 'granted'] as const) {
    await act(async () =>
      root.render(
        <TransitApp
          key={scenario}
          preview={{
            ...previewSetup(scenario),
            saved: { ...full, recent: [previewDestination] },
          }}
          client={previewClient}
        />,
      ),
    );
    await click(
      button(
        scenario === 'direct'
          ? 'Save destination'
          : `Save ${previewDestination.name}`,
      ),
    );
    expect(container.querySelector('.save-limit')?.textContent).toBe(
      SAVED_FULL_MESSAGE,
    );
    expect(container.querySelector('.save-limit')?.getAttribute('role')).toBe(
      'status',
    );
  }
  // every original saved place is still listed
  for (const place of saved)
    expect(container.textContent).toContain(place.name);
  await click(button(`Unsave ${saved[0]!.name}`));
  expect(container.querySelector('.save-limit')).toBeNull();
});
it('clears earlier results when a new search cannot start', async () => {
  await render('results', {
    ...previewClient,
    journeys: async () => previewResponse(),
  });
  await click(button('Find routes'));
  await tick(10);
  expect(container.querySelectorAll('.route-card')).toHaveLength(3);
  // 00:30 on the night Dallas clocks move back precedes that service day
  vi.setSystemTime(new Date('2026-11-01T05:30:00Z'));
  await click(button('Find routes'));
  await tick(10);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    'previous day',
  );
  expect(container.querySelectorAll('.route-card')).toHaveLength(0);
});
it('consumes real-client-shaped success after Find routes', async () => {
  await render('results', {
    ...previewClient,
    journeys: async () => previewResponse(),
  });
  await click(button('Find routes'));
  await tick(10);
  expect(container.querySelectorAll('.route-card')).toHaveLength(3);
});
it('groups the journey summary and actions without announcing decorative dividers', async () => {
  await render('transfer');
  const summary = container.querySelector('.detail-summary')!;
  expect(
    summary.querySelector('[aria-label="Transit route sequence"]')?.textContent,
  ).toContain('Red Line');
  expect(
    summary.querySelector('[aria-label="Transit route sequence"]')?.textContent,
  ).toContain('Blue Line');
  expect(summary.textContent).toContain('Total trip');
  expect(summary.textContent).toContain('1 transfer');
  expect(summary.textContent).toContain('Scheduled');
  const steps = [...container.querySelectorAll('.timeline > li')];
  expect(steps.map((step) => step.querySelector('h3')?.textContent)).toEqual([
    'Walk to West End Station',
    'Board Red Line',
    'Transfer at Akard Station',
    'Board Blue Line',
    `Walk to ${previewDestination.name}`,
    previewDestination.name,
  ]);
  expect(container.querySelectorAll('hr, [role="separator"]')).toHaveLength(0);
  expect(container.querySelector('nav a')?.getAttribute('href')).toBe('/about');
});
it('does not repeat journey or place requests for unrelated UI changes', async () => {
  const journeys = vi.fn(async () => previewResponse());
  const places = vi.fn(previewClient.places);
  await render('results', { journeys, places });
  await click(button('Find routes'));
  await tick(20);
  await click(container.querySelectorAll<HTMLButtonElement>('.route-card')[0]!);
  await tick(20);
  await click(button('Save destination'));
  await click(button('All route options'));
  await click(button('Leave now'));
  await click(button('Close when are you traveling?'));
  await tick(300);
  expect(journeys).toHaveBeenCalledTimes(1);
  expect(places).not.toHaveBeenCalled();
});
it.each([320, 390, 768, 1440])(
  'preserves long destination text and responsive detail navigation at %i px',
  async (width) => {
    vi.stubGlobal('innerWidth', width);
    const scroll = vi.fn();
    vi.stubGlobal('scrollTo', scroll);
    await render('long');
    const name = previewSetup('long').destination!.name;
    expect(container.querySelector('#journey-title')?.textContent).toBe(name);
    expect(container.querySelector('.arrival-step h3')?.textContent).toBe(name);
    await click(button('All route options'));
    await click(
      container.querySelectorAll<HTMLButtonElement>('.route-card')[0]!,
    );
    await tick(20);
    expect(document.activeElement).toBe(
      container.querySelector('#journey-title'),
    );
    expect(scroll).toHaveBeenCalledTimes(width < 1000 ? 1 : 0);
    expect(
      container.querySelector('[aria-label="Main navigation"] a')?.textContent,
    ).toBe('About');
  },
);

it('renders measured interchange walking and explains a same-route vehicle change', async () => {
  const response = previewResponse();
  const base = response.journeys[0]!;
  const rides = base.legs.filter((l) => l.kind === 'transit');
  const first = rides[0]!,
    second = { ...rides[1]!, routeId: first.routeId };
  const transfer = {
    kind: 'transfer' as const,
    transferId: 'synthetic',
    fromStopId: first.alightingStopId,
    toStopId: second.boardingStopId,
    departureTime: first.arrivalTime,
    arrivalTime: first.arrivalTime + 120,
    pedestrian: { distanceMeters: 150, provenance: 'synthetic' },
  };
  const journey = { ...base, legs: [first, transfer, second] };
  await act(async () =>
    root.render(
      <Timeline
        journey={journey}
        references={response.references}
        originName="Origin"
        destinationName="Destination"
      />,
    ),
  );
  expect(container.textContent).toContain('Walk to');
  expect(container.textContent).toContain('150 m');
  expect(container.textContent).toContain('Change vehicles: board');
  // the connection is timed from getting off, including the walk
  expect(container.querySelector('.transfer-step')?.textContent).toContain(
    'Tight transfer5 min to connect',
  );
});
