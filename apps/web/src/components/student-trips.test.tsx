// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { JourneyRequest } from '@dallas-transit/shared';
import { TransitApp } from './transit-app';
import {
  previewClient,
  previewDestination,
  previewOrigin,
  previewSetup,
} from '../preview/fixtures';
import type { TransitClient } from '../lib/api';

vi.mock('./journey-map', () => ({
  JourneyMap: () => <div aria-label="Journey map" />,
}));
let container: HTMLDivElement;
let root: Root;
let requests: JourneyRequest[];
let client: TransitClient;
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
  requests = [];
  client = {
    ...previewClient,
    journeys: (request, signal) => {
      requests.push(request);
      return previewClient.journeys(request, signal);
    },
  };
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
const tick = (ms = 600) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const render = (scenario: Parameters<typeof previewSetup>[0]) =>
  act(async () =>
    root.render(
      <TransitApp preview={previewSetup(scenario)} client={client} />,
    ),
  );
const button = (text: string) => {
  const found = [...container.querySelectorAll('button')].find((b) =>
    [b.textContent?.trim(), b.getAttribute('aria-label')].some((t) =>
      t?.startsWith(text),
    ),
  );
  if (!found) throw new Error(`Button missing: ${text}`);
  return found;
};
const click = (b: HTMLElement) =>
  act(async () => {
    b.focus();
    b.click();
  });
const origin = {
  latitude: previewOrigin.latitude,
  longitude: previewOrigin.longitude,
};
const ics = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'DTSTART;TZID=America/Chicago:20260818T100000',
  'DTEND;TZID=America/Chicago:20260818T111500',
  'RRULE:FREQ=WEEKLY;UNTIL=20261204T055959Z;BYDAY=TU,TH',
  'UID:cs3345@example.edu',
  'SUMMARY:CS 3345.001 Data Structures',
  // Google Calendar style: room plus the full campus address
  'LOCATION:ECSW 1.315 (Clark Auditorium)\\, The University of Texas at Dal',
  ' las\\, 800 W Campbell Rd\\, Richardson\\, TX 75080',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20260907',
  'UID:holiday@example.edu',
  'SUMMARY:Labor Day',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

it('imports a schedule on the device and plans the next class by its start', async () => {
  const setItem = vi.spyOn(Storage.prototype, 'setItem');
  await render('student-new');
  const input = container.querySelector<HTMLInputElement>('input[type=file]')!;
  expect(input.accept).toContain('.ics');
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [new File([ics], 'schedule.ics', { type: 'text/calendar' })],
  });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await tick(50);
  expect(container.textContent).toContain('Imported 1 class.');
  expect(container.textContent).toContain('1 all-day event was skipped.');
  expect(container.textContent).toContain('CS 3345.001 Data Structures');
  expect(container.querySelector('.next-class-room')?.textContent).toBe(
    'ECSW 1.315 · Engineering and Computer Science West',
  );
  // preview data never reaches device storage
  expect(setItem).not.toHaveBeenCalled();
  await click(button('Plan trip'));
  await tick();
  expect(requests).toEqual([
    {
      origin,
      destination: { latitude: 32.98658, longitude: -96.752007 },
      serviceDate: '2026-09-17',
      arrivalTime: 36000,
      arrivalBufferMinutes: 10,
    },
  ]);
  expect(button('Arrive by').textContent).toContain('10 min early');
  expect(
    container.querySelector('.place-control.destination-control')?.textContent,
  ).toContain('ECSW 1.315');
});

it('explains a file that is not a calendar', async () => {
  await render('student-new');
  const input = container.querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [new File(['name,time'], 'grades.csv')],
  });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await tick(50);
  expect(container.querySelector('[role=alert]')?.textContent).toContain(
    'not a calendar file',
  );
});

it('does not let insight suggest leaving during a class under way', async () => {
  await render('class-ongoing');
  expect(container.textContent).toContain('In class until 11:15 AM');
  await click(button('SMU'));
  await click(button('Find routes'));
  await tick();
  expect(requests[0]).toMatchObject({
    serviceDate: '2026-09-17',
    departureTime: 37800,
    earliestDepartureTime: 40500,
  });
});

it('keeps the schedule list mounted but inert until it expands', async () => {
  await render('classes');
  const expander = container.querySelector<HTMLElement>('.expander')!;
  const list = expander.querySelector('.class-list')!;
  expect(expander.dataset.open).toBe('false');
  expect(list.hasAttribute('inert')).toBe(true);
  await click(button('Schedule'));
  expect(button('Schedule').getAttribute('aria-expanded')).toBe('true');
  expect(expander.dataset.open).toBe('true');
  expect(list.hasAttribute('inert')).toBe(false);
});

it('sets Home from student places and uses it as a one-tap destination', async () => {
  await render('student-new');
  await click(button('Set Home'));
  expect(container.querySelector('dialog')?.textContent).toContain('Set Home');
  const option = [...container.querySelectorAll('[role=option]')].find((o) =>
    o.textContent?.includes('Northside'),
  ) as HTMLElement;
  await click(option);
  expect(container.querySelector('dialog')).toBeNull();
  await click(button('Home'));
  expect(
    container.querySelector('.place-control.destination-control')?.textContent,
  ).toContain('Northside');
  await click(button('Change Home'));
  await click(button('Remove Home'));
  expect(button('Set Home')).toBeTruthy();
});

it('plans an arrive-by trip chosen in the time sheet', async () => {
  await render('student-new');
  await click(button('Dallas Love Field'));
  await click(button('Leave now'));
  const dialog = container.querySelector('dialog')!;
  const radio = [...dialog.querySelectorAll('label')]
    .find((l) => l.textContent?.includes('Arrive by'))!
    .querySelector('input')!;
  await click(radio);
  const set = (selector: string, value: string) =>
    act(async () => {
      const field = dialog.querySelector<HTMLInputElement>(selector)!;
      Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(field),
        'value',
      )!.set!.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    });
  await set('input[type=date]', '2026-09-18');
  await set('input[type=time]', '17:30');
  await set('select', '15');
  await click(button('Set time'));
  expect(button('Arrive by').textContent).toContain('15 min early');
  await click(button('Find routes'));
  await tick();
  expect(requests[0]).toEqual({
    origin,
    destination: { latitude: 32.843582, longitude: -96.850529 },
    serviceDate: '2026-09-18',
    arrivalTime: 63000,
    arrivalBufferMinutes: 15,
  });
});

it('shows departure-time insight and plans the suggested time in one tap', async () => {
  await render('insight');
  const hint = container.querySelector('.insight')!;
  expect(hint.querySelector('.insight-title')?.textContent).toBe(
    'Worth leaving earlier',
  );
  expect(hint.textContent).toContain(
    'Depart 7:53 AM instead of 8:00 AM to arrive 18 min sooner.',
  );
  await click(button('Plan for 7:53 AM'));
  await tick();
  expect(requests[0]).toMatchObject({
    serviceDate: '2026-09-18',
    departureTime: 28380,
  });
  expect(button('Depart').textContent).toContain('7:53 AM');
});

it('words the no-rush insight plainly', async () => {
  await render('insight-later');
  const hint = container.querySelector('.insight')!;
  expect(hint.querySelector('.insight-title')?.textContent).toBe(
    'No need to rush',
  );
  expect(hint.textContent).toContain(
    'Leave at 8:09 AM, 9 min later, and arrive at nearly the same time.',
  );
});

it('leads arrive-by results with when to leave, latest option first', async () => {
  await render('arrive-by');
  const board = container.querySelector('.leave-board')!;
  expect(board.querySelector('h2')?.textContent).toBe('Leave by 8:14 AM');
  expect(board.querySelector('.leave-when')?.textContent).toBe('in 26 min');
  expect(board.querySelector('.leave-facts')?.textContent).toBe(
    'Arrive8:42 AMEarly by18 minfor 9:00 AM',
  );
  expect(board.querySelector('.board-alert')).toBeNull();
  const card = container.querySelector('.route-card')!;
  expect(card.textContent).toContain('Leave8:14 AM');
  expect(card.textContent).toContain('Arrive 8:42 AM');
  expect(container.querySelector('.sr-only[role=status]')?.textContent).toBe(
    '3 route options found. Leave by 8:14 AM.',
  );
});

it('says a passed leave time and plans from now instead', async () => {
  await render('arrive-late');
  const board = container.querySelector('.leave-board')!;
  expect(board.classList).toContain('is-passed');
  expect(board.querySelector('.leave-when')?.textContent).toBe('6 min ago');
  expect(board.textContent).toContain('This leave time has passed.');
  await click(button('Leave now instead'));
  await tick();
  expect(requests[0]).toEqual({
    origin,
    destination: {
      latitude: previewDestination.latitude,
      longitude: previewDestination.longitude,
    },
    serviceDate: '2026-09-18',
    departureTime: 30000,
  });
  expect(button('Leave now')).toBeTruthy();
});

it('warns when the leave time falls before the current class ends', async () => {
  await render('class-conflict');
  const warning =
    "You'd need to leave ECSW 1.315 before class ends at 11:15 AM.";
  const board = container.querySelector('.leave-board')!;
  expect(board.querySelector('h2')?.textContent).toBe('Leave by 10:44 AM');
  expect(board.querySelector('.board-alert')?.textContent).toContain(warning);
  expect(
    [...container.querySelectorAll('.route-warning')].map((w) => w.textContent),
  ).toEqual(Array(3).fill('Leaves during class'));
  expect(container.querySelector('.sr-only[role=status]')?.textContent).toBe(
    `3 route options found. Leave by 10:44 AM. ${warning}`,
  );
  // the trip summary keeps the warning in view
  await click(container.querySelector<HTMLButtonElement>('.route-card')!);
  expect(container.querySelector('.board-note')?.textContent).toBe(warning);
  expect(container.querySelector('.summary-metrics')?.textContent).toContain(
    'Leave by 10:44 AM',
  );
  await click(button('All route options'));
  await click(button('Leave at 11:15 AM instead'));
  await tick();
  expect(requests[0]).toMatchObject({
    serviceDate: '2026-09-17',
    departureTime: 40500,
  });
  expect(requests[0]).not.toHaveProperty('earliestDepartureTime');
});

it('says a passed leave time instead of a class warning', async () => {
  await act(async () =>
    root.render(
      <TransitApp
        preview={{
          ...previewSetup('class-conflict'),
          now: '2026-09-17T15:50:00Z',
        }}
        client={client}
      />,
    ),
  );
  const board = container.querySelector('.leave-board')!;
  expect(board.textContent).toContain('This leave time has passed.');
  expect(board.textContent).not.toContain("You'd need to leave");
});

it('does not warn when a leave time is exactly when class ends', async () => {
  await act(async () =>
    root.render(
      <TransitApp
        preview={{
          ...previewSetup('class-conflict'),
          // 10:44 leave moved to 11:15: the class ends exclusively
          departure: {
            mode: 'by',
            date: '2026-09-17',
            time: '12:01',
            bufferMinutes: 10,
          },
        }}
        client={client}
      />,
    ),
  );
  await click(button('Find routes'));
  await tick();
  expect(container.querySelector('.leave-board h2')?.textContent).toBe(
    'Leave by 11:15 AM',
  );
  expect(container.querySelector('.board-alert')).toBeNull();
  // the earlier options still leave at 11:02 and 11:04, inside class
  expect(
    [...container.querySelectorAll('.route-card')].map((c) =>
      Boolean(c.querySelector('.route-warning')),
    ),
  ).toEqual([false, true, true]);
});
