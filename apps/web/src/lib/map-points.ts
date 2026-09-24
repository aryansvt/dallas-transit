import type {
  Coordinate,
  GeographicJourney,
  Place,
  References,
} from '@dallas-transit/shared';
import { transitLegs } from './presentation';
export interface MapPoint {
  key: string;
  coordinate: Coordinate;
  label: string;
  symbol: string;
  kind: 'origin' | 'destination' | 'stop';
}
export function journeyPoints(
  journey: GeographicJourney | undefined,
  references: References | undefined,
  origin: Place | null,
  destination: Place | null,
): MapPoint[] {
  const points: MapPoint[] = [];
  if (origin)
    points.push({
      key: 'origin',
      coordinate: origin,
      label: origin.name,
      symbol: 'O',
      kind: 'origin',
    });
  if (journey && references) {
    const rides = transitLegs(journey);
    const roles = new Map<string, string[]>();
    const add = (id: string, role: string) =>
      roles.set(id, [...(roles.get(id) ?? []), role]);
    rides.forEach((leg, i) => {
      add(leg.boardingStopId, i === 0 ? 'Board' : 'Transfer');
      add(leg.alightingStopId, i === rides.length - 1 ? 'Get off' : 'Transfer');
    });
    for (const [id, names] of roles) {
      const stop = references.stops.find((s) => s.stopId === id);
      if (stop)
        points.push({
          key: id,
          coordinate: stop.coordinate,
          label: `${[...new Set(names)].join(' / ')}: ${stop.name}`,
          symbol: String(points.filter((p) => p.kind === 'stop').length + 1),
          kind: 'stop',
        });
    }
  }
  if (destination)
    points.push({
      key: 'destination',
      coordinate: destination,
      label: destination.name,
      symbol: 'D',
      kind: 'destination',
    });
  return points;
}
