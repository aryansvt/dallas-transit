import type { StyleSpecification } from 'maplibre-gl';

export const MAPBOX_ATTRIBUTION =
  '<a href="https://www.mapbox.com/about/maps/">© Mapbox</a> <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a> <a href="https://apps.mapbox.com/feedback/">Improve this map</a>';
/** Static Tiles supports third-party renderers without Mapbox-specific style
 * protocols, glyphs or SDK telemetry. 512px tiles reduce request count. */
export function mapboxStyle(
  token: string | undefined,
  production = false,
): StyleSpecification | undefined {
  if (!token) {
    if (production)
      throw new Error('NEXT_PUBLIC_MAPBOX_TOKEN is required in production');
    return undefined;
  }
  if (!/^pk\.[A-Za-z0-9._-]+$/.test(token))
    throw new Error('NEXT_PUBLIC_MAPBOX_TOKEN must be a public pk. token');
  return {
    version: 8,
    sources: {
      'mapbox-light': {
        type: 'raster',
        tileSize: 512,
        maxzoom: 22,
        tiles: [
          `https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/512/{z}/{x}/{y}?access_token=${encodeURIComponent(token)}`,
        ],
        attribution: MAPBOX_ATTRIBUTION,
      },
    },
    layers: [{ id: 'mapbox-light', type: 'raster', source: 'mapbox-light' }],
  };
}
