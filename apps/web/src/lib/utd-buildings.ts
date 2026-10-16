/** UT Dallas buildings from the official campus map (map.utdallas.edu, which
 * embeds Concept3D map 1772), retrieved 2026-10-16. Codes and names come from
 * its building records. An entrance comes only from its "Accessible Doors"
 * layer: the lowest-numbered automatic door, else the lowest-numbered ramp
 * entrance. A building with no door on that layer has no coordinate, so a trip
 * there needs a destination chosen by the rider. See ADR 0008. */
export interface UtdBuilding {
  readonly code: string;
  readonly name: string;
  /** Other codes the official map uses for the same building. */
  readonly aliases?: readonly string[];
  readonly entrance?: {
    readonly latitude: number;
    readonly longitude: number;
    /** Location id on the official map, for re-checking. */
    readonly mapLocationId: number;
  };
}

export const UTD_BUILDINGS: readonly UtdBuilding[] = [
  {
    code: 'AB',
    name: 'Activity Center',
    entrance: {
      latitude: 32.98534,
      longitude: -96.749794,
      mapLocationId: 672142,
    },
  },
  {
    code: 'ACB',
    name: 'Activity Center Bookstore',
    entrance: { latitude: 32.984539, longitude: -96.75, mapLocationId: 672139 },
  },
  {
    code: 'AD',
    name: 'Administration Building',
    entrance: {
      latitude: 32.989777,
      longitude: -96.748421,
      mapLocationId: 672067,
    },
  },
  {
    code: 'APC',
    name: "Edith and Peter O'Donnell Jr. Athenaeum",
    aliases: ['APC1', 'APC2'],
  },
  {
    code: 'ATC',
    name: "Edith O'Donnell Arts & Technology Building",
    entrance: {
      latitude: 32.985779,
      longitude: -96.747795,
      mapLocationId: 672134,
    },
  },
  {
    code: 'BE',
    name: 'Lloyd V. Berkner Hall',
    entrance: {
      latitude: 32.987942,
      longitude: -96.750198,
      mapLocationId: 672095,
    },
  },
  {
    code: 'BSB',
    name: 'Bioengineering and Sciences Building',
    entrance: {
      latitude: 32.991688,
      longitude: -96.749825,
      mapLocationId: 672046,
    },
  },
  {
    code: 'CB',
    name: 'Classroom Building',
    entrance: {
      latitude: 32.989674,
      longitude: -96.749596,
      mapLocationId: 672062,
    },
  },
  {
    code: 'CR',
    name: 'Callier Center Richardson',
    entrance: {
      latitude: 32.992634,
      longitude: -96.749084,
      mapLocationId: 672049,
    },
  },
  {
    code: 'CRA',
    name: 'Callier Center Richardson Addition',
    entrance: {
      latitude: 32.991516,
      longitude: -96.748604,
      mapLocationId: 672053,
    },
  },
  {
    code: 'DGA',
    name: 'Davidson-Gundy Alumni Center',
    entrance: {
      latitude: 32.986034,
      longitude: -96.746124,
      mapLocationId: 672137,
    },
  },
  {
    code: 'ECSN',
    name: 'Engineering and Computer Science North',
    entrance: {
      latitude: 32.98674,
      longitude: -96.750694,
      mapLocationId: 672115,
    },
  },
  {
    code: 'ECSS',
    name: 'Engineering and Computer Science South',
    entrance: {
      latitude: 32.98595,
      longitude: -96.75071,
      mapLocationId: 672111,
    },
  },
  {
    code: 'ECSW',
    name: 'Engineering and Computer Science West',
    entrance: {
      latitude: 32.98658,
      longitude: -96.752007,
      mapLocationId: 672106,
    },
  },
  {
    code: 'FA',
    name: 'Founders Annex',
    entrance: {
      latitude: 32.987938,
      longitude: -96.74987,
      mapLocationId: 672093,
    },
  },
  {
    code: 'FN',
    name: 'Founders North',
    entrance: {
      latitude: 32.987968,
      longitude: -96.749191,
      mapLocationId: 672087,
    },
  },
  {
    code: 'FO',
    name: 'Founders Building',
    entrance: {
      latitude: 32.987911,
      longitude: -96.749069,
      mapLocationId: 672088,
    },
  },
  {
    code: 'GR',
    name: 'Cecil H. Green Hall',
    entrance: {
      latitude: 32.988602,
      longitude: -96.747475,
      mapLocationId: 672082,
    },
  },
  {
    code: 'HH',
    name: 'Karl Hoblitzelle Hall',
    entrance: {
      latitude: 32.986851,
      longitude: -96.751846,
      mapLocationId: 672099,
    },
  },
  {
    code: 'JO',
    name: 'Erik Jonsson Academic Center',
    entrance: {
      latitude: 32.988724,
      longitude: -96.748596,
      mapLocationId: 672077,
    },
  },
  {
    code: 'JSOM',
    name: 'Naveen Jindal School of Management Building',
    aliases: ['SOM'],
    entrance: {
      latitude: 32.985512,
      longitude: -96.74794,
      mapLocationId: 672144,
    },
  },
  { code: 'JSOM3', name: 'Charles and Nancy Davidson Building' },
  {
    code: 'MC',
    name: 'Eugene McDermott Library',
    entrance: {
      latitude: 32.987339,
      longitude: -96.74762,
      mapLocationId: 672129,
    },
  },
  {
    code: 'ML1',
    name: 'Modular Lab 1',
    entrance: {
      latitude: 32.986858,
      longitude: -96.752335,
      mapLocationId: 672101,
    },
  },
  {
    code: 'ML2',
    name: 'Modular Lab 2',
    entrance: {
      latitude: 32.986858,
      longitude: -96.753571,
      mapLocationId: 672103,
    },
  },
  {
    code: 'NB',
    name: 'North Office Building',
    entrance: {
      latitude: 32.990047,
      longitude: -96.749641,
      mapLocationId: 672061,
    },
  },
  {
    code: 'NL',
    name: 'North Lab',
    entrance: {
      latitude: 32.990215,
      longitude: -96.749428,
      mapLocationId: 672059,
    },
  },
  {
    code: 'PHA',
    name: 'Physics Annex',
    entrance: {
      latitude: 32.989395,
      longitude: -96.749992,
      mapLocationId: 672065,
    },
  },
  {
    code: 'PHY',
    name: 'Physics Building',
    entrance: {
      latitude: 32.989319,
      longitude: -96.750694,
      mapLocationId: 672063,
    },
  },
  {
    code: 'RL',
    name: 'Natural Science and Engineering Research Lab',
    entrance: {
      latitude: 32.9921,
      longitude: -96.750267,
      mapLocationId: 672044,
    },
  },
  { code: 'ROC', name: 'Research and Operations Center' },
  { code: 'ROW', name: 'Research and Operations Center West' },
  {
    code: 'SCI',
    name: 'Sciences Building',
    entrance: {
      latitude: 32.988869,
      longitude: -96.750893,
      mapLocationId: 672070,
    },
  },
  {
    code: 'SLC',
    name: 'Science Learning Center',
    entrance: {
      latitude: 32.988026,
      longitude: -96.75016,
      mapLocationId: 672074,
    },
  },
  {
    code: 'SP2',
    name: 'Synergy Park North 2',
    aliases: ['SPN2'],
    entrance: {
      latitude: 32.994762,
      longitude: -96.753143,
      mapLocationId: 672154,
    },
  },
  { code: 'SPN', name: 'Synergy Park North' },
  {
    code: 'SSA',
    name: 'Student Services Building Addition',
    entrance: {
      latitude: 32.985752,
      longitude: -96.749626,
      mapLocationId: 672127,
    },
  },
  {
    code: 'SSB',
    name: 'Student Services Building',
    entrance: {
      latitude: 32.98597,
      longitude: -96.748543,
      mapLocationId: 672126,
    },
  },
  {
    code: 'SU',
    name: 'Student Union',
    entrance: {
      latitude: 32.987144,
      longitude: -96.748886,
      mapLocationId: 672119,
    },
  },
  {
    code: 'TH',
    name: 'University Theatre',
    entrance: {
      latitude: 32.988407,
      longitude: -96.748512,
      mapLocationId: 672080,
    },
  },
  {
    code: 'TI-BMES',
    name: 'Texas Instruments Biomedical Engineering and Sciences Building',
  },
  { code: 'WAAC', name: 'Waterview Academic and Administrative Center' },
  { code: 'WSTC', name: 'Waterview Science and Technology Center' },
];

const byCode = new Map(
  UTD_BUILDINGS.flatMap((b) =>
    [b.code, ...(b.aliases ?? [])].map((c) => [c, b]),
  ),
);

// longest first: "Callier Center Richardson Addition" before its prefix
const byName = [...UTD_BUILDINGS].sort((a, b) => b.name.length - a.name.length);

/** Reads "ECSW 1.315", "ecsw1.315 (Clark Auditorium)" or an official building
 * name. A bare code only counts when it is the whole location, so words like
 * "BE" in "To be announced" never match. */
export function matchBuilding(
  location: string,
): { building: UtdBuilding; room?: string } | null {
  const text = location.toUpperCase().replace(/\s+/g, ' ').trim();
  // codes may be hyphenated, as in TI-BMES 2.102
  for (const m of text.matchAll(
    /\b([A-Z]{2,5}(?:-[A-Z]{2,5})?\d?)\s*-?\s*(\d{1,2}\.\d{1,4}[A-Z]?)(?![\d.])/g,
  )) {
    const building = byCode.get(m[1]!);
    if (building) return { building, room: m[2]! };
  }
  const bare = byCode.get(text);
  if (bare) return { building: bare };
  const named = byName.find((b) => text.includes(b.name.toUpperCase()));
  if (!named) return null;
  const room = /\b(\d{1,2}\.\d{1,4}[A-Z]?)(?![\d.])/.exec(text)?.[1];
  return room ? { building: named, room } : { building: named };
}
