// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
beforeEach(() => {
  vi.resetModules();
  sessionStorage.clear();
  Object.defineProperty(window, 'isSecureContext', {
    configurable: true,
    value: true,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});
it('requests early only once across repeated mounts and stores no coordinates', async () => {
  const getCurrentPosition = vi.fn((success: PositionCallback) =>
    success({
      coords: { latitude: 32.78, longitude: -96.8 },
    } as GeolocationPosition),
  );
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
  const { startupLocation } = await import('./location');
  const result = await startupLocation();
  await startupLocation();
  expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  expect(result.status).toBe('granted');
  expect(sessionStorage.getItem('dallas-transit.location-attempted')).toBe('1');
  expect(sessionStorage.length).toBe(1);
});
it('falls back to manual origin after denial without nagging', async () => {
  const getCurrentPosition = vi.fn(
    (_success: PositionCallback, failure: PositionErrorCallback) =>
      failure({ code: 1 } as GeolocationPositionError),
  );
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
  const { startupLocation } = await import('./location');
  expect((await startupLocation()).status).toBe('manual');
  await startupLocation();
  expect(getCurrentPosition).toHaveBeenCalledTimes(1);
});
it('does not request in an insecure context or after a prior session attempt', async () => {
  const getCurrentPosition = vi.fn();
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
  sessionStorage.setItem('dallas-transit.location-attempted', '1');
  const { startupLocation } = await import('./location');
  expect((await startupLocation()).status).toBe('manual');
  expect(getCurrentPosition).not.toHaveBeenCalled();
});
