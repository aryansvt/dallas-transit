// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
it('opens departure options without arrive-by, applies the choice, restores the opener', async () => {
  await render();
  const opener = button('Leave now');
  await click(opener);
  expect(container.querySelector('dialog')?.textContent).toContain('Depart at');
  expect(container.querySelector('dialog')?.textContent).not.toContain(
    'Arrive by',
  );
  await click(button('Set departure'));
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
  expect(container.querySelector('.timeline')?.textContent).not.toMatch(
    /comfortable|tight|risk/i,
  );
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
  ).toContain('RED');
  expect(
    summary.querySelector('[aria-label="Transit route sequence"]')?.textContent,
  ).toContain('BLUE');
  expect(summary.textContent).toContain('Total trip');
  expect(summary.textContent).toContain('1 transfer');
  expect(summary.textContent).toContain('Scheduled');
  const steps = [...container.querySelectorAll('.timeline > li')];
  expect(steps.map((step) => step.querySelector('h3')?.textContent)).toEqual([
    'Walk to West End Station',
    'Board RED',
    'Transfer at Akard Station',
    'Board BLUE',
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
  await click(button('Close when do you want to leave?'));
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
