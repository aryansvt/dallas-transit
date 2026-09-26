// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PlaceSearchSession, SearchResults } from '@dallas-transit/shared';
import { PlaceSearch } from './place-search';
import { previewClient } from '../preview/fixtures';
let root: Root, container: HTMLDivElement;
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
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
async function input(value: string) {
  await act(async () => {
    const el = container.querySelector('input')!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
it('debounces 250ms, aborts superseded requests immediately, ignores late replies, closes sessions', async () => {
  const pending: {
    signal: AbortSignal;
    resolve: (value: SearchResults) => void;
  }[] = [];
  const session: PlaceSearchSession = {
    suggest: vi.fn<PlaceSearchSession['suggest']>(
      (_q, _ctx, signal) =>
        new Promise((resolve) => pending.push({ signal, resolve })),
    ),
    retrieve: vi.fn(),
    close: vi.fn(),
  };
  const factory = vi.fn(() => session);
  const client = { ...previewClient, createPlaceSession: factory };
  const render = () =>
    root.render(
      <PlaceSearch
        target="destination"
        client={client}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
  await act(async () => render());
  await input('mus');
  await tick(249);
  expect(session.suggest).not.toHaveBeenCalled();
  await tick(1);
  expect(session.suggest).toHaveBeenCalledTimes(1);
  await input('museum');
  expect(pending[0]!.signal.aborted).toBe(true);
  await tick(250);
  expect(session.suggest).toHaveBeenCalledTimes(2);
  await act(async () => {
    pending[1]!.resolve({
      suggestions: [{ id: 'new', kind: 'place', name: 'New museum' }],
      failures: [],
    });
  });
  await act(async () => {
    pending[0]!.resolve({
      suggestions: [{ id: 'old', kind: 'place', name: 'Old museum' }],
      failures: [],
    });
  });
  expect(container.textContent).toContain('New museum');
  expect(container.textContent).not.toContain('Old museum');
  await act(async () => render());
  await tick(250);
  expect(factory).toHaveBeenCalledTimes(1);
  expect(session.suggest).toHaveBeenCalledTimes(2);
  await act(async () => root.render(null));
  expect(session.close).toHaveBeenCalled();
});
it('retrieves only on selection, keeps source failures visible and displays attribution as text', async () => {
  const selected = vi.fn();
  const place = {
    name: 'Museum',
    latitude: 32.8,
    longitude: -96.8,
    temporary: true,
  };
  const session: PlaceSearchSession = {
    suggest: vi.fn<PlaceSearchSession['suggest']>(async () => ({
      suggestions: [{ id: 'one', kind: 'place', name: 'Museum' }],
      failures: [{ source: 'stops', reason: 'provider-unavailable' }],
      attribution: '© Mapbox <script>text</script>',
    })),
    retrieve: vi.fn(async () => place),
    close: vi.fn(),
  };
  await act(async () =>
    root.render(
      <PlaceSearch
        target="destination"
        client={{ ...previewClient, createPlaceSession: () => session }}
        initialQuery="museum"
        onSelect={selected}
        onClose={() => {}}
      />,
    ),
  );
  await tick(250);
  expect(session.retrieve).not.toHaveBeenCalled();
  expect(container.textContent).toContain(
    'DART stop search is temporarily unavailable',
  );
  expect(container.textContent).toContain('© Mapbox');
  expect(container.querySelector('script')).toBeNull();
  await act(async () =>
    container.querySelector<HTMLElement>('[role="option"]')!.click(),
  );
  expect(session.retrieve).toHaveBeenCalledTimes(1);
  expect(selected).toHaveBeenCalledWith(place);
  expect(session.close).toHaveBeenCalled();
});
it('discards abandoned suggestions before session expiry', async () => {
  const session: PlaceSearchSession = {
    suggest: vi.fn<PlaceSearchSession['suggest']>(async () => ({
      suggestions: [{ id: 'one', name: 'Museum', kind: 'place' }],
      failures: [],
    })),
    retrieve: vi.fn(),
    close: vi.fn(),
  };
  await act(async () =>
    root.render(
      <PlaceSearch
        target="destination"
        client={{ ...previewClient, createPlaceSession: () => session }}
        initialQuery="museum"
        onSelect={() => {}}
        onClose={() => {}}
      />,
    ),
  );
  await tick(250);
  expect(container.querySelectorAll('[role="option"]')).toHaveLength(1);
  await tick(175000);
  expect(container.querySelectorAll('[role="option"]')).toHaveLength(0);
  expect(container.textContent).toContain('Search expired');
  expect(session.close).toHaveBeenCalled();
});
