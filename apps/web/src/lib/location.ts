import type { Place } from '@dallas-transit/shared';
export type LocationResult =
  { status: 'granted'; place: Place } | { status: 'manual'; message: string };
const manual: LocationResult = {
  status: 'manual',
  message:
    'Enter a starting point to plan your trip. Location access is optional.',
};
let startup: Promise<LocationResult> | undefined;
/** Shared across Strict Mode mounts. Attempt marker only; coordinates are never stored. */
export function startupLocation(): Promise<LocationResult> {
  if (startup) return startup;
  startup = new Promise((resolve) => {
    if (!window.isSecureContext || !navigator.geolocation) {
      resolve(manual);
      return;
    }
    try {
      if (sessionStorage.getItem('dallas-transit.location-attempted')) {
        resolve(manual);
        return;
      }
      sessionStorage.setItem('dallas-transit.location-attempted', '1');
    } catch {
      /* Restricted storage does not prevent this in-memory one-time request. */
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({
          status: 'granted',
          place: {
            name: 'Current location',
            latitude: coords.latitude,
            longitude: coords.longitude,
          },
        }),
      () => resolve(manual),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  });
  return startup;
}
