import type { JourneyResponse, Place } from '@dallas-transit/shared';
import type { LocalPlaces } from './local-places';

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
}
