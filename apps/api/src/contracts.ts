import {
  validateGeographicRequest,
  type GeographicRequest,
  validateCoordinate,
} from '@dallas-transit/router';
import { parseGtfsDate } from '@dallas-transit/gtfs';
import { MAX_TRANSFERS } from './config.js';
import { ApiError } from './errors.js';

const string = { type: 'string' } as const;
const number = { type: 'number' } as const;
const integer = { type: 'integer', minimum: 0 } as const;
const nullableString = { type: ['string', 'null'] } as const;
const array = (items: object) => ({ type: 'array', items });
export const object = (
  properties: Record<string, object>,
  required = Object.keys(properties),
) => ({ type: 'object', additionalProperties: false, properties, required });
export const coordinateSchema = object({ latitude: number, longitude: number });
export const journeyRequestSchema = object(
  {
    origin: coordinateSchema,
    destination: coordinateSchema,
    serviceDate: { type: 'string', minLength: 10, maxLength: 10 },
    departureTime: integer,
    maxTransfers: { ...integer, maximum: MAX_TRANSFERS },
  },
  ['origin', 'destination', 'serviceDate', 'departureTime'],
);
export function journeyRequest(value: unknown): GeographicRequest {
  try {
    const request = value as GeographicRequest;
    validateGeographicRequest(request);
    if ((request.maxTransfers ?? MAX_TRANSFERS) > MAX_TRANSFERS)
      throw new Error();
    return { ...request, maxTransfers: request.maxTransfers ?? MAX_TRANSFERS };
  } catch {
    throw new ApiError('INVALID_REQUEST');
  }
}
export function serviceDate(value: string) {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error();
    return parseGtfsDate(value.replaceAll('-', ''));
  } catch {
    throw new ApiError('INVALID_REQUEST');
  }
}
export const dateQuerySchema = object(
  { serviceDate: string, publicationId: { type: 'string', format: 'uuid' } },
  ['serviceDate'],
);
export const nearbyQuerySchema = object({
  serviceDate: string,
  latitude: string,
  longitude: string,
});
export function queryCoordinate(query: {
  latitude: string;
  longitude: string;
}) {
  try {
    for (const value of [query.latitude, query.longitude])
      if (!/^-?\d+(\.\d+)?$/.test(value) || value.length > 24)
        throw new Error();
    const point = {
      latitude: Number(query.latitude),
      longitude: Number(query.longitude),
    };
    validateCoordinate(point);
    return point;
  } catch {
    throw new ApiError('INVALID_REQUEST');
  }
}
export const stopSchema = object({
  stopId: string,
  name: string,
  coordinate: coordinateSchema,
  code: nullableString,
  platformCode: nullableString,
  parentStationId: nullableString,
});
export const routeSchema = object({
  routeId: string,
  shortName: nullableString,
  longName: nullableString,
  type: integer,
  color: nullableString,
  textColor: nullableString,
  agencyTimezone: string,
});
export const referencesSchema = object({
  stops: array(stopSchema),
  routes: array(routeSchema),
  trips: array(
    object({
      tripId: string,
      headsign: nullableString,
      directionId: { type: ['integer', 'null'] },
    }),
  ),
});
const timing = { departureTime: number, arrivalTime: number };
export const legSchema = {
  anyOf: [
    object({
      kind: { const: 'walk' },
      phase: { enum: ['access', 'egress'] },
      stopId: string,
      origin: coordinateSchema,
      destination: coordinateSchema,
      durationSeconds: number,
      distanceMeters: number,
      ...timing,
    }),
    object({
      kind: { const: 'transit' },
      tripId: string,
      routeId: string,
      patternId: string,
      boardingStopId: string,
      boardingOccurrence: integer,
      boardingSequence: integer,
      alightingStopId: string,
      alightingOccurrence: integer,
      alightingSequence: integer,
      ...timing,
    }),
    object({
      kind: { const: 'transfer' },
      transferId: string,
      fromStopId: string,
      toStopId: string,
      ...timing,
    }),
  ],
};
export const journeySchema = object({
  publicationId: string,
  serviceDate: string,
  origin: coordinateSchema,
  destination: coordinateSchema,
  accessStopId: string,
  egressStopId: string,
  requestedDepartureTime: number,
  arrivalTime: number,
  durationSeconds: number,
  boardingCount: integer,
  transferCount: integer,
  walkingDurationSeconds: number,
  walkingDistanceMeters: number,
  interchangeDurationSeconds: number,
  legs: array(legSchema),
});
const context = {
  publicationId: string,
  serviceDate: string,
  origin: coordinateSchema,
  destination: coordinateSchema,
  requestedDepartureTime: number,
};
export const journeyResponseSchema = {
  anyOf: [
    object({
      ...context,
      status: { const: 'ok' },
      incomplete: { type: 'boolean' },
      journeys: array(journeySchema),
      references: referencesSchema,
    }),
    object({
      ...context,
      status: { const: 'no-journey' },
      incomplete: { const: false },
      journeys: { type: 'array', maxItems: 0 },
      reason: {
        enum: [
          'no-nearby-access-stops',
          'no-nearby-egress-stops',
          'no-reachable-access-stops',
          'no-reachable-egress-stops',
          'transit-unreachable',
        ],
      },
    }),
  ],
};
export const errorSchema = object({
  error: object({
    code: string,
    message: string,
    retryable: { type: 'boolean' },
  }),
  requestId: string,
});
export const errors = { '4xx': errorSchema, '5xx': errorSchema };
export const nearbyResponseSchema = object({
  publicationId: string,
  serviceDate: string,
  stops: array(
    object({
      stopId: string,
      name: string,
      coordinate: coordinateSchema,
      candidateDistanceMeters: number,
    }),
  ),
});
