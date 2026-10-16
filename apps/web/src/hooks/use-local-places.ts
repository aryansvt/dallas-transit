'use client';
import {
  emptyPlaces,
  readPlaces,
  writePlaces,
  type LocalPlaces,
} from '../lib/local-places';
import { useDeviceStore } from './use-device-store';

/** Saved and recent places on this device; fixtures never touch storage. */
export function useLocalPlaces(
  fixture: LocalPlaces | undefined,
  device: boolean,
) {
  const { value, persist, storageMessage } = useDeviceStore(
    readPlaces,
    writePlaces,
    emptyPlaces,
    fixture,
    device,
    'Places are available for this visit only. Device storage is unavailable.',
  );
  return { places: value, persist, storageMessage };
}
