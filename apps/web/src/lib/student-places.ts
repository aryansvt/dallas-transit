import type { Place } from '@dallas-transit/shared';

/** Quick destinations for students. Each coordinate comes from an official
 * record, named in `source` (retrieved 2026-10-16). A place without one, such as
 * NorthPark Center, is left out rather than estimated. See ADR 0008. */
export const STUDENT_PLACES: readonly (Place & { readonly source: string })[] =
  [
    {
      name: 'UT Dallas',
      context: 'Student Union, Richardson',
      latitude: 32.987144,
      longitude: -96.748886,
      source:
        'UT Dallas campus map (Concept3D 1772), Accessible Doors, location 672119',
    },
    {
      name: 'SMU',
      context: 'Hughes-Trigg Student Center, University Park',
      latitude: 32.843616,
      longitude: -96.783279,
      source:
        'SMU campus map (Concept3D 1914), Automatic Doors, location 557520',
    },
    {
      name: 'UNT Dallas',
      context: 'UNT Dallas Station',
      latitude: 32.654057,
      longitude: -96.801091,
      source: 'DART GTFS stop 33087, UNT DALLAS STATION',
    },
    {
      name: 'Northside',
      context: 'Apartments next to UT Dallas, Richardson',
      latitude: 32.994385,
      longitude: -96.749428,
      source:
        'UT Dallas campus map (Concept3D 1772), Off-Campus Housing, location 459394',
    },
    {
      name: 'Deep Ellum',
      context: 'Deep Ellum Station',
      latitude: 32.785866,
      longitude: -96.788532,
      source: 'DART GTFS stop 32043, DEEP ELLUM STATION',
    },
    {
      name: 'DFW Airport',
      context: 'DFW Airport Station',
      latitude: 32.907386,
      longitude: -97.039504,
      source: 'DART GTFS stop 32553, DFW AIRPORT STATION',
    },
    {
      name: 'Dallas Love Field',
      context: 'Bus stop at baggage claim',
      latitude: 32.843582,
      longitude: -96.850529,
      source: 'DART GTFS stop 32923, LOVE FIELD AIRPORT (BAGGAGE CLAIMS)',
    },
  ];
