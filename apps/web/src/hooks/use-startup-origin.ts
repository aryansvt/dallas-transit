'use client';
import { useEffect, useRef, useState } from 'react';
import type { Place } from '@dallas-transit/shared';
import { startupLocation } from '../lib/location';

/** Current location as the default origin until the rider picks one. */
export function useStartupOrigin(
  preview: { origin: Place | null } | undefined,
) {
  const [origin, setOrigin] = useState<Place | null>(preview?.origin ?? null);
  const [locationMessage, setLocationMessage] = useState(
    preview
      ? preview.origin
        ? ''
        : 'Enter a starting point to plan your trip. Location access is optional.'
      : 'Finding your current location…',
  );
  const manualOrigin = useRef(false);
  const [consentedLocation, setConsentedLocation] =
    useState<Pick<Place, 'latitude' | 'longitude'>>();
  useEffect(() => {
    if (preview) return;
    let mounted = true;
    void startupLocation().then((result) => {
      if (!mounted || manualOrigin.current) return;
      if (result.status === 'granted') {
        setConsentedLocation({
          latitude: result.place.latitude,
          longitude: result.place.longitude,
        });
        setOrigin(result.place);
        setLocationMessage('');
      } else setLocationMessage(result.message);
    });
    return () => {
      mounted = false;
    };
  }, [preview]);
  const chooseOrigin = (place: Place) => {
    manualOrigin.current = true;
    setOrigin(place);
    setLocationMessage('');
  };
  return { origin, chooseOrigin, locationMessage, consentedLocation };
}
