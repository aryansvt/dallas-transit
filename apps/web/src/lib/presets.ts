import { copyPlace, isPlace, type Place } from '@dallas-transit/shared';

export const PRESETS_KEY = 'dallas-transit.presets.v1';
export type PresetName = 'home' | 'school';
export interface Presets {
  version: 1;
  home: Place | null;
  school: Place | null;
}
export const emptyPresets = (): Presets => ({
  version: 1,
  home: null,
  school: null,
});
const stored = (v: unknown) =>
  isPlace(v) && !v.temporary ? copyPlace(v) : null;

/** Missing, corrupt or oversized data reads as no presets. */
export function readPresets(storage: Pick<Storage, 'getItem'>): Presets {
  try {
    const raw = storage.getItem(PRESETS_KEY);
    if (!raw || raw.length > 4000) return emptyPresets();
    const data = JSON.parse(raw) as Partial<Presets>;
    if (data.version !== 1) return emptyPresets();
    return { version: 1, home: stored(data.home), school: stored(data.school) };
  } catch {
    return emptyPresets();
  }
}
export function writePresets(
  storage: Pick<Storage, 'setItem'>,
  presets: Presets,
) {
  try {
    storage.setItem(PRESETS_KEY, JSON.stringify(presets));
    return true;
  } catch {
    return false;
  }
}
/** A temporary place never becomes a preset. */
export function setPreset(
  presets: Presets,
  name: PresetName,
  place: Place | null,
): Presets {
  if (place?.temporary) return presets;
  return { ...presets, [name]: place && copyPlace(place) };
}
