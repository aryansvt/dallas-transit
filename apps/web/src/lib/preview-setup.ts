import type { JourneyResponse, Place } from '@dallas-transit/shared';
import type { Departure } from '../components/departure-sheet';
import type { ClassSeries } from './ics';
import type { LocalPlaces } from './local-places';
import type { Presets } from './presets';

/** Initial state for the /preview workspace; live use passes none. */
export interface PreviewSetup {
  origin: Place | null;
  destination: Place | null;
  data?: JourneyResponse;
  detail?: number;
  search?: boolean;
  loading?: boolean;
  error?: string;
  expanded?: boolean;
  saved?: LocalPlaces;
  presets?: Presets;
  schedule?: ClassSeries[];
  departure?: Departure;
  /** A fixed clock, ISO, so class-dependent screens repeat. */
  now?: string;
  /** Run that clock a minute every 1.5 s, to review values that change. */
  fastClock?: boolean;
  /** Render the map without a street style, as when none is configured. */
  noMap?: boolean;
}
