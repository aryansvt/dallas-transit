import {
  color,
  date,
  decimal,
  enumeration,
  id,
  integer,
  optional,
  text,
  time,
  timezone,
  url,
  type Field,
} from './fields.js';

// These are GTFS input models, independent of SQL, HTTP, and future routing models.
export const schemas = {
  'agency.txt': {
    agency_id: optional(id),
    agency_name: text,
    agency_url: url,
    agency_timezone: timezone,
    agency_lang: optional(text),
    agency_phone: optional(text),
    agency_fare_url: optional(url),
    agency_email: optional(text),
  },
  'routes.txt': {
    route_id: id,
    agency_id: optional(id),
    route_short_name: optional(text),
    route_long_name: optional(text),
    route_desc: optional(text),
    route_type: enumeration(0, 1, 2, 3, 4, 5, 6, 7, 11, 12),
    route_url: optional(url),
    route_color: optional(color),
    route_text_color: optional(color),
    route_sort_order: optional(integer()),
    company_id: optional(text),
  },
  'stops.txt': {
    stop_id: id,
    stop_code: optional(text),
    stop_name: text,
    stop_desc: optional(text),
    stop_lat: decimal(-90, 90),
    stop_lon: decimal(-180, 180),
    zone_id: optional(id),
    stop_url: optional(url),
    location_type: optional(enumeration(0, 1, 2, 3, 4)),
    parent_station: optional(id),
    stop_timezone: optional(timezone),
    wheelchair_boarding: optional(enumeration(0, 1, 2)),
    platform_code: optional(text),
    level_id: optional(id),
  },
  'calendar.txt': {
    service_id: id,
    monday: enumeration(0, 1),
    tuesday: enumeration(0, 1),
    wednesday: enumeration(0, 1),
    thursday: enumeration(0, 1),
    friday: enumeration(0, 1),
    saturday: enumeration(0, 1),
    sunday: enumeration(0, 1),
    start_date: date,
    end_date: date,
  },
  'calendar_dates.txt': {
    service_id: id,
    date,
    exception_type: enumeration(1, 2),
  },
  'shapes.txt': {
    shape_id: id,
    shape_pt_lat: decimal(-90, 90),
    shape_pt_lon: decimal(-180, 180),
    shape_pt_sequence: integer(),
    shape_dist_traveled: optional(decimal(0)),
  },
  'trips.txt': {
    route_id: id,
    service_id: id,
    trip_id: id,
    trip_headsign: optional(text),
    trip_short_name: optional(text),
    direction_id: optional(enumeration(0, 1)),
    block_id: optional(id),
    shape_id: optional(id),
    wheelchair_accessible: optional(enumeration(0, 1, 2)),
    bikes_allowed: optional(enumeration(0, 1, 2)),
  },
  'stop_times.txt': {
    trip_id: id,
    arrival_time: optional(time),
    departure_time: optional(time),
    stop_id: id,
    stop_sequence: integer(),
    stop_headsign: optional(text),
    pickup_type: optional(enumeration(0, 1, 2, 3)),
    drop_off_type: optional(enumeration(0, 1, 2, 3)),
    shape_dist_traveled: optional(decimal(0)),
    timepoint: optional(enumeration(0, 1)),
  },
  'feed_info.txt': {
    feed_publisher_name: text,
    feed_publisher_url: url,
    feed_lang: text,
    default_lang: optional(text),
    feed_version: optional(text),
    feed_start_date: optional(date),
    feed_end_date: optional(date),
    feed_contact_email: optional(text),
    feed_contact_url: optional(url),
  },
  'fare_attributes.txt': {
    fare_id: id,
    price: decimal(0),
    currency_type: text,
    payment_method: enumeration(0, 1),
    transfers: optional(enumeration(0, 1, 2)),
    agency_id: optional(id),
    transfer_duration: optional(integer()),
  },
  'fare_rules.txt': {
    fare_id: id,
    route_id: optional(id),
    origin_id: optional(id),
    destination_id: optional(id),
    contains_id: optional(id),
  },
  // DART supplements: validated/preserved, with no inferred passenger semantics.
  'blocks.txt': {
    SERVICE_ID: id,
    BLOCK_ID: id,
    PULLOUTTIME: text,
    PULLINTIME: text,
  },
  'facilities.txt': {
    facility_id: id,
    facility_code: optional(text),
    facility_name: text,
    facility_desc: optional(text),
    facility_lat: decimal(-90, 90),
    facility_lon: decimal(-180, 180),
    facility_type: integer(),
    facility_url: optional(url),
  },
  'nodes.txt': {
    ROUTE_NAME_SHORT: text,
    DIRECTION_ID: enumeration(0, 1),
    NODE: id,
    STOP_ID: id,
    NODENAME: text,
  },
  'route_direction.txt': {
    ARTICLE: text,
    DIRNUM: enumeration(0, 1),
    DIRECTIONNAME: text,
  },
} as const satisfies Record<string, Record<string, Field>>;

export type GtfsFile = keyof typeof schemas;
export type NormalizedRecord<F extends GtfsFile> = F extends GtfsFile
  ? {
      [K in keyof (typeof schemas)[F]]: (typeof schemas)[F][K] extends Field<
        infer T
      >
        ? T
        : never;
    }
  : never;
export const requiredFiles: readonly GtfsFile[] = [
  'agency.txt',
  'routes.txt',
  'stops.txt',
  'trips.txt',
  'stop_times.txt',
];
export const supplementalFiles: readonly GtfsFile[] = [
  'blocks.txt',
  'facilities.txt',
  'nodes.txt',
  'route_direction.txt',
];
