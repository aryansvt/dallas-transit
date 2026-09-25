import { readFileSync } from 'node:fs';
import protobuf from 'protobufjs';
import type {
  AlertSelector,
  EventPrediction,
  Snapshot,
  TripIdentity,
} from './types.js';

// The upstream Apache-2.0 schema is vendored locally. Protobuf types stop here.
const message = protobuf
  .parse(
    readFileSync(new URL('./gtfs-realtime.proto', import.meta.url), 'utf8'),
  )
  .root.lookupType('transit_realtime.FeedMessage');
export const MAX_FEED_BYTES = 4 * 1024 * 1024;
type RecordValue = Record<string, unknown>;
const obj = (v: unknown): RecordValue =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as RecordValue) : {};
const list = (v: unknown, max: number): RecordValue[] => {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > max) throw new Error('invalid-array');
  return v.map(obj);
};
const integer = (v: unknown, min = 0, max = 4102444800): number | null => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max)
    throw new Error('invalid-number');
  return v;
};
const id = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' || !v.length || v.length > 256)
    throw new Error('invalid-id');
  return v;
};
const identity = (v: unknown): TripIdentity => {
  const t = obj(v);
  const tripId = id(t.tripId);
  if (!tripId) throw new Error('missing-trip');
  const date = id(t.startDate);
  if (
    date &&
    (!/^\d{8}$/.test(date) ||
      !Number.isFinite(
        Date.parse(
          `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T12:00:00Z`,
        ),
      ))
  )
    throw new Error('invalid-date');
  const start = id(t.startTime);
  if (start && !/^\d{2,3}:[0-5]\d:[0-5]\d$/.test(start))
    throw new Error('invalid-start');
  return {
    tripId,
    routeId: id(t.routeId),
    date,
    startTime: start
      ? start.split(':').reduce((sum, n) => sum * 60 + Number(n), 0)
      : null,
    relationship: integer(t.scheduleRelationship, 0, 20) ?? 0,
  };
};
const prediction = (v: unknown): EventPrediction | null => {
  if (!v) return null;
  const p = obj(v);
  return {
    time: integer(p.time),
    delay: integer(p.delay, -21600, 21600),
    uncertainty: integer(p.uncertainty, 0, 21600),
  };
};
const translated = (v: unknown, max: number): string => {
  const values = list(obj(v).translation, 32);
  const selected =
    values.find((t) => t.language === 'en' || t.language === 'en-US') ??
    values[0];
  return typeof selected?.text === 'string'
    ? selected.text
        .slice(0, max)
        .split('')
        .map((character) => (character.charCodeAt(0) < 32 ? ' ' : character))
        .join('')
    : '';
};

export function parseFeed(
  bytes: Uint8Array,
  publicationId: string,
  receivedAt: number,
): Snapshot {
  const started = performance.now();
  if (!bytes.length || bytes.length > MAX_FEED_BYTES)
    throw new Error('payload-size');
  const decoded = message.decode(bytes);
  const raw = message.toObject(decoded, {
    longs: Number,
    defaults: false,
  }) as RecordValue;
  const parsed = performance.now();
  const header = obj(raw.header);
  if (!['1.0', '2.0'].includes(String(header.gtfsRealtimeVersion)))
    throw new Error('unsupported-version');
  if ((header.incrementality ?? 0) !== 0)
    throw new Error('differential-not-supported');
  const sourceTimestamp = integer(header.timestamp);
  if (sourceTimestamp !== null && sourceTimestamp > receivedAt + 30)
    throw new Error('future-feed');
  const snapshot: Snapshot = {
    publicationId,
    sourceTimestamp,
    receivedAt,
    trips: [],
    vehicles: [],
    alerts: [],
    diagnostics: {},
    metrics: { parseMs: parsed - started, normalizeMs: 0 },
  };
  const entities = list(raw.entity, 20000);
  const counts = new Map<string, number>();
  for (const entity of entities)
    if (typeof entity.id === 'string')
      counts.set(entity.id, (counts.get(entity.id) ?? 0) + 1);
  const diagnostic = (code: string) => {
    snapshot.diagnostics[code] = (snapshot.diagnostics[code] ?? 0) + 1;
  };
  for (const entity of entities) {
    try {
      const entityId = id(entity.id);
      if (!entityId || counts.get(entityId) !== 1) {
        diagnostic('duplicate-or-missing-entity');
        continue;
      }
      if (entity.isDeleted) {
        diagnostic('unsupported-deletion');
        continue;
      }
      if (
        [entity.tripUpdate, entity.vehicle, entity.alert].filter(Boolean)
          .length !== 1
      )
        throw new Error('entity-content');
      if (entity.tripUpdate) {
        const t = obj(entity.tripUpdate);
        snapshot.trips.push({
          identity: identity(t.trip),
          timestamp: integer(t.timestamp),
          stops: list(t.stopTimeUpdate, 2000).map((s) => ({
            stopId: id(s.stopId),
            sequence: integer(s.stopSequence, 0, 2147483647),
            relationship: integer(s.scheduleRelationship, 0, 10) ?? 0,
            arrival: prediction(s.arrival),
            departure: prediction(s.departure),
          })),
        });
      }
      if (entity.vehicle) {
        const v = obj(entity.vehicle),
          p = obj(v.position);
        let coordinate = null;
        if (v.position) {
          if (
            typeof p.latitude !== 'number' ||
            !Number.isFinite(p.latitude) ||
            Math.abs(p.latitude) > 90 ||
            typeof p.longitude !== 'number' ||
            !Number.isFinite(p.longitude) ||
            Math.abs(p.longitude) > 180
          )
            throw new Error('invalid-coordinate');
          coordinate = { latitude: p.latitude, longitude: p.longitude };
        }
        const status = integer(v.currentStatus, 0, 2) ?? 2;
        snapshot.vehicles.push({
          identity: identity(v.trip),
          timestamp: integer(v.timestamp),
          vehicleId: id(obj(v.vehicle).id),
          coordinate,
          sequence: integer(v.currentStopSequence, 0, 2147483647),
          stopId: id(v.stopId),
          status:
            status === 0 ? 'INCOMING' : status === 1 ? 'STOPPED' : 'IN_TRANSIT',
        });
      }
      if (entity.alert) {
        const a = obj(entity.alert);
        snapshot.alerts.push({
          id: entityId,
          title: translated(a.headerText, 240),
          description: translated(a.descriptionText, 1200),
          periods: list(a.activePeriod, 32).map((p) => {
            const start = integer(p.start),
              end = integer(p.end);
            if (start !== null && end !== null && end < start)
              throw new Error('alert-period');
            return { start, end };
          }),
          selectors: list(a.informedEntity, 256).map((s) => {
            if (s.routeType !== undefined || s.directionId !== undefined)
              throw new Error('unsupported-alert-selector');
            return {
              agencyId: id(s.agencyId),
              routeId: id(s.routeId),
              stopId: id(s.stopId),
              trip: s.trip ? identity(s.trip) : null,
            } satisfies AlertSelector;
          }),
        });
      }
    } catch {
      diagnostic('invalid-entity');
    }
  }
  snapshot.metrics.normalizeMs = performance.now() - parsed;
  return snapshot;
}

/** Test fixtures use the same official schema and wire decoder as production. */
export function encodeFixture(value: Record<string, unknown>): Uint8Array {
  const error = message.verify(value);
  if (error) throw new Error(error);
  return message.encode(message.create(value)).finish();
}
