// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { JourneyMap } from './journey-map';
it('expands without a provider, preserves the text fallback, closes and restores focus', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
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
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<JourneyMap points={[]} />));
    expect(container.textContent).toContain('Street map unavailable');
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-expand-map]')!.click(),
    );
    expect(container.querySelector('dialog')?.open).toBe(true);
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Close journey map"]')!
        .click(),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(container.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(
      container.querySelector('[data-expand-map]'),
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  }
});
