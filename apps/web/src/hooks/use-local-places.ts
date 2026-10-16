'use client';
import { useEffect, useState } from 'react';
import {
  emptyPlaces,
  readPlaces,
  writePlaces,
  type LocalPlaces,
} from '../lib/local-places';

const unavailable =
  'Places are available for this visit only. Device storage is unavailable.';

/** Saved and recent places on this device; fixtures never touch storage. */
export function useLocalPlaces(
  fixture: LocalPlaces | undefined,
  device: boolean,
) {
  const [places, setPlaces] = useState<LocalPlaces>(fixture ?? emptyPlaces());
  const [storageMessage, setStorageMessage] = useState('');
  useEffect(() => {
    if (!device) return;
    let mounted = true;
    void Promise.resolve().then(() => {
      if (!mounted) return;
      try {
        setPlaces(readPlaces(localStorage));
      } catch {
        setPlaces(emptyPlaces());
      }
    });
    return () => {
      mounted = false;
    };
  }, [device]);
  const persist = (next: LocalPlaces) => {
    setPlaces(next);
    if (!device) return;
    try {
      if (!writePlaces(localStorage, next)) setStorageMessage(unavailable);
    } catch {
      setStorageMessage(unavailable);
    }
  };
  return { places, persist, storageMessage };
}
