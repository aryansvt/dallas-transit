import { copyPlace, isPlace, type Place } from '@dallas-transit/shared';
export const PLACES_KEY = 'dallas-transit.places.v1';
export const MAX_RECENT = 5;
// full-length places stay well under the 24000-character read guard
export const MAX_SAVED = 12;
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
export const SAVED_FULL_MESSAGE = `You can save up to ${MAX_SAVED} places. Remove one to save another.`;
export const isSaved = (data: LocalPlaces, place: Place) =>
  data.saved.some((p) => samePlace(p, place));
export const savedFull = (data: LocalPlaces) => data.saved.length >= MAX_SAVED;
const stored = (places: unknown[], limit: number) =>
  places
    .filter(isPlace)
    .filter((p) => !p.temporary)
    .slice(0, limit)
    .map(copyPlace);
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
      recent: stored(data.recent, MAX_RECENT),
      saved: stored(data.saved, MAX_SAVED),
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
        recent: stored(data.recent, MAX_RECENT),
        saved: stored(data.saved, MAX_SAVED),
      }),
    );
    return true;
  } catch {
    return false;
  }
}
export function addRecent(data: LocalPlaces, place: Place): LocalPlaces {
  if (place.temporary) return data;
  return {
    ...data,
    recent: [
      copyPlace(place),
      ...data.recent.filter((p) => !samePlace(p, place)),
    ].slice(0, MAX_RECENT),
  };
}
/** A full list refuses a new save instead of silently dropping an older one. */
export function toggleSaved(data: LocalPlaces, place: Place): LocalPlaces {
  if (place.temporary) return data;
  if (isSaved(data, place))
    return { ...data, saved: data.saved.filter((p) => !samePlace(p, place)) };
  if (savedFull(data)) return data;
  return { ...data, saved: [copyPlace(place), ...data.saved] };
}
