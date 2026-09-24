import { copyPlace, isPlace, type Place } from '@dallas-transit/shared';
export const PLACES_KEY = 'dallas-transit.places.v1';
export interface LocalPlaces {
  version: 1;
  recent: Place[];
  saved: Place[];
}
export const emptyPlaces = (): LocalPlaces => ({
  version: 1,
  recent: [],
  saved: [],
});
export const samePlace = (a: Place, b: Place) =>
  a.name === b.name && a.latitude === b.latitude && a.longitude === b.longitude;
export function readPlaces(storage: Pick<Storage, 'getItem'>): LocalPlaces {
  try {
    const raw = storage.getItem(PLACES_KEY);
    if (!raw || raw.length > 24000) return emptyPlaces();
    const data = JSON.parse(raw) as Partial<LocalPlaces>;
    if (
      data.version !== 1 ||
      !Array.isArray(data.recent) ||
      !Array.isArray(data.saved)
    )
      return emptyPlaces();
    return {
      version: 1,
      recent: data.recent.filter(isPlace).slice(0, 5).map(copyPlace),
      saved: data.saved.filter(isPlace).slice(0, 5).map(copyPlace),
    };
  } catch {
    return emptyPlaces();
  }
}
export function writePlaces(
  storage: Pick<Storage, 'setItem'>,
  data: LocalPlaces,
) {
  try {
    storage.setItem(
      PLACES_KEY,
      JSON.stringify({
        version: 1,
        recent: data.recent.slice(0, 5).map(copyPlace),
        saved: data.saved.slice(0, 5).map(copyPlace),
      }),
    );
    return true;
  } catch {
    return false;
  }
}
export function addRecent(data: LocalPlaces, place: Place): LocalPlaces {
  return {
    ...data,
    recent: [
      copyPlace(place),
      ...data.recent.filter((p) => !samePlace(p, place)),
    ].slice(0, 5),
  };
}
export function toggleSaved(data: LocalPlaces, place: Place): LocalPlaces {
  return {
    ...data,
    saved: data.saved.some((p) => samePlace(p, place))
      ? data.saved.filter((p) => !samePlace(p, place))
      : [copyPlace(place), ...data.saved].slice(0, 5),
  };
}
