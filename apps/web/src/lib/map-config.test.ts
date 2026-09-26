import { expect, it } from 'vitest';
import { mapboxStyle, MAPBOX_ATTRIBUTION } from './map-config';
it('configures Mapbox Light Static Tiles with public tokens and mandatory attribution', () => {
  const style = mapboxStyle('pk.test')!;
  expect(style.sources['mapbox-light']).toMatchObject({
    type: 'raster',
    tileSize: 512,
    attribution: MAPBOX_ATTRIBUTION,
  });
  expect(JSON.stringify(style)).toContain('/mapbox/light-v11/tiles/512/');
  expect(MAPBOX_ATTRIBUTION).toContain('© OpenStreetMap');
  expect(MAPBOX_ATTRIBUTION).toContain('© Mapbox');
  expect(mapboxStyle(undefined)).toBeUndefined();
  expect(() => mapboxStyle(undefined, true)).toThrow('required');
  expect(() => mapboxStyle('sk.private')).toThrow('public pk.');
});
