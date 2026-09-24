import { afterEach, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';
import { apiFixture } from './fixture.js';
import { searchPlaces, type PlaceSearchProvider } from './places.js';
const apps: ReturnType<typeof buildApp>[] = [];
const place = {
  name: 'Museum',
  context: 'Dallas',
  latitude: 32.78,
  longitude: -96.8,
};
function setup(placeProvider?: PlaceSearchProvider) {
  const fixture = apiFixture();
  const app = buildApp(
    {},
    {
      repository: fixture.repository,
      walkingProvider: fixture.provider,
      ...(placeProvider ? { placeProvider } : {}),
    },
  );
  apps.push(app);
  return { app, fixture };
}
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});
it('reports missing provider deliberately, without touching the repository', async () => {
  const { app, fixture } = setup();
  const spy = vi.spyOn(fixture.repository, 'publication');
  const response = await app.inject('/v1/places/search?q=museum');
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({
    status: 'unavailable',
    reason: 'not-configured',
    places: [],
  });
  expect(response.headers['cache-control']).toBe('no-store');
  expect(spy).not.toHaveBeenCalled();
});
it('bounds input before provider invocation and rejects unknown fields', async () => {
  const search = vi.fn(async () => [place]);
  const { app } = setup({ search });
  for (const query of [
    'q=a',
    'q=%20%20',
    `q=${'a'.repeat(161)}`,
    'q=abc&provider=evil',
  ])
    expect((await app.inject(`/v1/places/search?${query}`)).statusCode).toBe(
      400,
    );
  expect(search).not.toHaveBeenCalled();
});
it('trims query, supplies limit/signal, strips private fields and preserves place context', async () => {
  const search = vi.fn(async () => [{ ...place, providerId: 'private' }]);
  const { app } = setup({ search });
  const response = await app.inject('/v1/places/search?q=%20museum%20');
  expect(search).toHaveBeenCalledWith('museum', {
    limit: 6,
    signal: expect.any(AbortSignal),
  });
  expect(response.json()).toEqual({ status: 'ok', places: [place] });
});
it.each([[], [{ ...place, latitude: 100 }], Array(7).fill(place), null])(
  'distinguishes empty results from invalid provider output %#',
  async (value) => {
    const { app } = setup({ search: async () => value });
    const response = (await app.inject('/v1/places/search?q=museum')).json();
    expect(response.status).toBe(
      Array.isArray(value) && value.length === 0 ? 'ok' : 'unavailable',
    );
  },
);
it('sanitizes provider failure', async () => {
  const { app } = setup({
    search: async () => {
      throw new Error('private-token');
    },
  });
  const response = await app.inject('/v1/places/search?q=museum');
  expect(response.body).not.toContain('private-token');
  expect(response.json().reason).toBe('provider-unavailable');
});
it('stops waiting for a canceled provider even if it does not cooperate', async () => {
  const controller = new AbortController();
  const response = searchPlaces(
    { search: () => new Promise(() => {}) },
    'museum',
    controller.signal,
  );
  controller.abort(new Error('canceled'));
  await expect(response).rejects.toThrow('canceled');
});
