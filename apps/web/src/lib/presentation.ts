import type {
  GeographicJourney,
  References,
  RouteDetails,
  TransitLeg,
} from '@dallas-transit/shared';
export const transitLegs = (j: GeographicJourney): TransitLeg[] =>
  j.legs.filter((l): l is TransitLeg => l.kind === 'transit');
export function transitMode(
  route: RouteDetails | undefined,
): 'bus' | 'train' | 'service' {
  if (route?.type === 3) return 'bus';
  if (route && [0, 1, 2].includes(route.type)) return 'train';
  return 'service';
}
export function routeName(route: RouteDetails | undefined) {
  if (!route) return 'Transit service';
  const name = route.shortName || route.longName || 'Transit service';
  if (transitMode(route) === 'bus') return `Bus ${name}`;
  if (transitMode(route) === 'train') {
    if (
      ['RED', 'BLUE', 'GREEN', 'ORANGE', 'SILVER'].includes(name.toUpperCase())
    )
      return `${name[0]!.toUpperCase()}${name.slice(1).toLowerCase()} Line`;
    return name;
  }
  return route.longName || name;
}
export const stopName = (refs: References, id: string) =>
  refs.stops.find((s) => s.stopId === id)?.name ?? 'Transit stop';
export function distinction(
  journey: GeographicJourney,
  all: readonly GeographicJourney[],
) {
  if (all.length < 2) return '';
  const uniqueMinimum = (
    key: 'arrivalTime' | 'transferCount' | 'walkingDurationSeconds',
  ) => all.every((j) => j === journey || journey[key] < j[key]);
  if (uniqueMinimum('arrivalTime')) return 'Fastest';
  // Zero transfers is factual even when multiple direct services tie.
  if (uniqueMinimum('transferCount'))
    return journey.transferCount === 0 ? 'No transfers' : 'Fewest transfers';
  if (uniqueMinimum('walkingDurationSeconds')) return 'Least walking';
  if (journey.transferCount === 0) return 'No transfers';
  return '';
}
export function routeColors(route: RouteDetails | undefined) {
  const color =
    route?.color && /^[\da-f]{6}$/i.test(route.color)
      ? `#${route.color}`
      : '#192c3c';
  const channel = (s: string) => {
    const n = parseInt(s, 16) / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (hex: string) =>
    channel(hex.slice(1, 3)) * 0.2126 +
    channel(hex.slice(3, 5)) * 0.7152 +
    channel(hex.slice(5, 7)) * 0.0722;
  const bg = luminance(color);
  const contrast = (fg: string) => {
    const l = luminance(fg);
    return (Math.max(l, bg) + 0.05) / (Math.min(l, bg) + 0.05);
  };
  const supplied =
    route?.textColor && /^[\da-f]{6}$/i.test(route.textColor)
      ? `#${route.textColor}`
      : undefined;
  return {
    backgroundColor: color,
    color:
      supplied && contrast(supplied) >= 4.5
        ? supplied
        : bg > 0.179
          ? '#000000'
          : '#ffffff',
  };
}
