import { describe, expect, it, vi } from 'vitest';
import { buildSchedule } from '@dallas-transit/router';
import { PreparedSchedules, type ScheduleSource } from './schedules.js';
import { apiFixture } from './fixture.js';
import { deferred } from './test-support.js';
import { abortable } from './async.js';

function fixture(maximum = 2) {
  const { schedule } = apiFixture();
  const source: ScheduleSource = {
    publication: vi.fn(async () => schedule.publicationId),
    load: vi.fn(async (date) => ({
      schedule: buildSchedule({ ...schedule, serviceDate: date }),
      preparationMs: 10,
    })),
  };
  let now = 0;
  const cache = new PreparedSchedules(
    source,
    { sourceKey: 'fixture', changeSeconds: 120, maximum, ttlMs: 100 },
    () => now,
  );
  const signal = new AbortController().signal;
  return {
    source,
    cache,
    signal,
    date: schedule.serviceDate,
    schedule,
    tick: () => {
      now += 101;
    },
  };
}
describe('prepared schedule lifecycle', () => {
  it('does not attach a new caller to an aborted build that is still cleaning up', async () => {
    const f = fixture();
    const entered = deferred<void>();
    const finishCleanup = deferred<never>();
    f.source.load = async () => {
      entered.resolve();
      return finishCleanup.promise;
    };
    const controller = new AbortController();
    const first = f.cache.get(f.date, controller.signal);
    const rejected = expect(first).rejects.toThrow('left');
    await entered.promise;
    controller.abort(new Error('left'));
    await rejected;
    await expect(f.cache.get(f.date, f.signal)).rejects.toMatchObject({
      code: 'SERVER_BUSY',
    });
    finishCleanup.reject(new Error('cleanup complete'));
    await f.cache.close();
  });
  it('reuses the immutable schedule, rechecks activation, and expires entries', async () => {
    const f = fixture();
    const first = await f.cache.get(f.date, f.signal);
    const second = await f.cache.get(f.date, f.signal);
    expect(first.cache).toBe('miss');
    expect(second.cache).toBe('hit');
    expect(first.schedule).toBe(second.schedule);
    expect(Object.isFrozen(first.schedule)).toBe(true);
    expect(f.source.publication).toHaveBeenCalledTimes(2);
    f.tick();
    expect((await f.cache.get(f.date, f.signal)).cache).toBe('miss');
    await f.cache.close();
  });
  it('evicts the least recently used date with a hard retention bound', async () => {
    const f = fixture();
    await f.cache.get('2026-09-18', f.signal);
    await f.cache.get('2026-09-19', f.signal);
    await f.cache.get('2026-09-18', f.signal);
    await f.cache.get('2026-09-20', f.signal);
    expect((await f.cache.get('2026-09-18', f.signal)).cache).toBe('hit');
    expect((await f.cache.get('2026-09-19', f.signal)).cache).toBe('miss');
    expect(f.source.load).toHaveBeenCalledTimes(4);
    await f.cache.close();
  });
  it('single-flights same-key loads and one canceled waiter does not cancel another', async () => {
    const f = fixture();
    const entered = deferred<void>();
    const loaded = deferred<{
      schedule: typeof f.schedule;
      preparationMs: number;
    }>();
    let buildSignal: AbortSignal | undefined;
    f.source.load = vi.fn(async (_date, signal) => {
      buildSignal = signal;
      entered.resolve();
      return abortable(loaded.promise, signal);
    });
    const controller = new AbortController();
    const first = f.cache.get(f.date, controller.signal);
    const rejection = expect(first).rejects.toThrow('canceled');
    const second = f.cache.get(f.date, f.signal);
    await entered.promise;
    controller.abort(new Error('canceled'));
    await rejection;
    expect(buildSignal?.aborted).toBe(false);
    loaded.resolve({ schedule: f.schedule, preparationMs: 10 });
    expect((await second).cache).toBe('shared');
    expect(f.source.load).toHaveBeenCalledTimes(1);
    await f.cache.close();
  });
  it('aborts a build when its last waiter leaves and permits a later retry', async () => {
    const f = fixture();
    const entered = deferred<void>();
    const stopped = deferred<void>();
    const actual = f.source.load;
    f.source.load = async (_date, signal) => {
      entered.resolve();
      signal.addEventListener('abort', () => stopped.resolve(), { once: true });
      return abortable(new Promise(() => {}), signal);
    };
    const controller = new AbortController();
    const first = f.cache.get(f.date, controller.signal);
    const rejection = expect(first).rejects.toThrow('left');
    await entered.promise;
    controller.abort(new Error('left'));
    await rejection;
    await stopped.promise;
    await Promise.resolve();
    await Promise.resolve();
    f.source.load = actual;
    expect((await f.cache.get(f.date, f.signal)).cache).toBe('miss');
    await f.cache.close();
  });
  it('does not poison subsequent retries after loading failure', async () => {
    const f = fixture();
    const load = f.source.load;
    f.source.load = vi
      .fn()
      .mockRejectedValueOnce(new Error('failed'))
      .mockImplementation(load);
    await expect(f.cache.get(f.date, f.signal)).rejects.toThrow('failed');
    expect((await f.cache.get(f.date, f.signal)).cache).toBe('miss');
    await f.cache.close();
  });
  it('discards corrected, removed, and wrong-date publications rather than mixing schedules', async () => {
    const f = fixture();
    await f.cache.get(f.date, f.signal);
    f.source.publication = async () => 'corrected';
    await expect(f.cache.get(f.date, f.signal)).rejects.toMatchObject({
      code: 'PUBLICATION_CHANGED',
    });
    f.source.load = async (date) => ({
      schedule: buildSchedule({
        ...f.schedule,
        publicationId: 'corrected',
        serviceDate: date,
      }),
      preparationMs: 1,
    });
    const fixed = await f.cache.get(f.date, f.signal);
    expect(fixed.schedule.publicationId).toBe('corrected');
    f.source.publication = async () => null;
    await expect(f.cache.get(f.date, f.signal)).rejects.toMatchObject({
      code: 'NO_PUBLICATION',
    });
    await f.cache.close();
    const wrong = fixture();
    wrong.source.load = async () => ({
      schedule: wrong.schedule,
      preparationMs: 0,
    });
    await expect(
      wrong.cache.get('2026-09-19', wrong.signal),
    ).rejects.toMatchObject({ code: 'PUBLICATION_CHANGED' });
    await wrong.cache.close();
  });
  it('bounds distinct-key builds and clears all resources on close', async () => {
    const f = fixture();
    const entered = deferred<void>();
    f.source.load = async (_date, signal) => {
      entered.resolve();
      return abortable(new Promise(() => {}), signal);
    };
    const first = f.cache.get(f.date, f.signal);
    const rejection = expect(first).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
    await entered.promise;
    await expect(f.cache.get('2026-09-19', f.signal)).rejects.toMatchObject({
      code: 'SERVER_BUSY',
    });
    await f.cache.close();
    await rejection;
    await expect(f.cache.get(f.date, f.signal)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
  });
});
