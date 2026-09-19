CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA static_gtfs;

CREATE TABLE static_gtfs.import_attempts (
  attempt_id uuid PRIMARY KEY,
  source_key text NOT NULL,
  source_url text NOT NULL,
  archive_sha256 text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  error text,
  feed_id uuid
);

-- Only complete, validated publications enter this table in a committed transaction.
CREATE TABLE static_gtfs.feed_versions (
  feed_id uuid PRIMARY KEY,
  source_key text NOT NULL,
  source_url text NOT NULL,
  archive_sha256 text NOT NULL CHECK (archive_sha256 ~ '^[0-9a-f]{64}$'),
  archive_name text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  feed_version text,
  coverage_start date NOT NULL,
  coverage_end date NOT NULL,
  max_service_seconds integer NOT NULL DEFAULT 0,
  manifest jsonb NOT NULL,
  row_counts jsonb NOT NULL DEFAULT '{}',
  diagnostics jsonb NOT NULL DEFAULT '{}',
  import_ms integer NOT NULL DEFAULT 0,
  CHECK (coverage_start <= coverage_end),
  UNIQUE (source_key, archive_sha256),
  UNIQUE (source_key, feed_id)
);

-- Publication choice is explicit for each service date, including future dates.
CREATE TABLE static_gtfs.feed_activation (
  source_key text NOT NULL,
  service_date date NOT NULL,
  feed_id uuid NOT NULL,
  activated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_key, service_date),
  FOREIGN KEY (source_key, feed_id) REFERENCES static_gtfs.feed_versions (source_key, feed_id)
);
CREATE INDEX feed_activation_version_idx ON static_gtfs.feed_activation (feed_id);

CREATE TABLE static_gtfs.agencies (
  feed_id uuid NOT NULL REFERENCES static_gtfs.feed_versions,
  agency_id text NOT NULL,
  agency_name text NOT NULL, agency_url text NOT NULL, agency_timezone text NOT NULL,
  agency_lang text, agency_phone text, agency_fare_url text, agency_email text,
  source_record integer NOT NULL, extra jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (feed_id, agency_id)
);
CREATE TABLE static_gtfs.routes (
  feed_id uuid NOT NULL REFERENCES static_gtfs.feed_versions,
  route_id text NOT NULL, agency_id text NOT NULL,
  route_short_name text, route_long_name text, route_desc text,
  route_type integer NOT NULL, route_url text, route_color text, route_text_color text,
  route_sort_order integer, company_id text,
  source_record integer NOT NULL, extra jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (feed_id, route_id),
  FOREIGN KEY (feed_id, agency_id) REFERENCES static_gtfs.agencies
);
CREATE INDEX routes_agency_idx ON static_gtfs.routes (feed_id, agency_id);
CREATE TABLE static_gtfs.stops (
  feed_id uuid NOT NULL REFERENCES static_gtfs.feed_versions,
  stop_id text NOT NULL, stop_code text, stop_name text NOT NULL, stop_desc text,
  stop_lat numeric NOT NULL CHECK (stop_lat BETWEEN -90 AND 90),
  stop_lon numeric NOT NULL CHECK (stop_lon BETWEEN -180 AND 180),
  zone_id text, stop_url text, location_type integer, parent_station text,
  stop_timezone text, wheelchair_boarding integer, platform_code text, level_id text,
  geom geometry(Point, 4326) GENERATED ALWAYS AS
    (ST_SetSRID(ST_MakePoint(stop_lon::double precision, stop_lat::double precision), 4326)) STORED,
  source_record integer NOT NULL, extra jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (feed_id, stop_id),
  FOREIGN KEY (feed_id, parent_station) REFERENCES static_gtfs.stops DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX stops_geom_idx ON static_gtfs.stops USING gist (geom);
CREATE INDEX stops_parent_idx ON static_gtfs.stops (feed_id, parent_station);
CREATE TABLE static_gtfs.services (
  feed_id uuid NOT NULL REFERENCES static_gtfs.feed_versions,
  service_id text NOT NULL,
  PRIMARY KEY (feed_id, service_id)
);
CREATE TABLE static_gtfs.calendars (
  feed_id uuid NOT NULL, service_id text NOT NULL,
  monday integer NOT NULL CHECK (monday IN (0,1)), tuesday integer NOT NULL CHECK (tuesday IN (0,1)),
  wednesday integer NOT NULL CHECK (wednesday IN (0,1)), thursday integer NOT NULL CHECK (thursday IN (0,1)),
  friday integer NOT NULL CHECK (friday IN (0,1)), saturday integer NOT NULL CHECK (saturday IN (0,1)), sunday integer NOT NULL CHECK (sunday IN (0,1)),
  start_date date NOT NULL, end_date date NOT NULL CHECK (end_date >= start_date),
  source_record integer NOT NULL, extra jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (feed_id, service_id),
  FOREIGN KEY (feed_id, service_id) REFERENCES static_gtfs.services
);
CREATE TABLE static_gtfs.calendar_dates (
  feed_id uuid NOT NULL, service_id text NOT NULL, date date NOT NULL, exception_type integer NOT NULL CHECK (exception_type IN (1,2)),
  source_record integer NOT NULL, extra jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (feed_id, service_id, date),
  FOREIGN KEY (feed_id, service_id) REFERENCES static_gtfs.services
);
CREATE INDEX calendar_dates_date_idx ON static_gtfs.calendar_dates (feed_id, date);
CREATE TABLE static_gtfs.shapes (
  feed_id uuid NOT NULL REFERENCES static_gtfs.feed_versions,
  shape_id text NOT NULL, geom geometry(LineString, 4326),
  PRIMARY KEY (feed_id, shape_id)
);
CREATE TABLE static_gtfs.shape_points (
  feed_id uuid NOT NULL, shape_id text NOT NULL,
  shape_pt_lat numeric NOT NULL CHECK (shape_pt_lat BETWEEN -90 AND 90),
  shape_pt_lon numeric NOT NULL CHECK (shape_pt_lon BETWEEN -180 AND 180),
  shape_pt_sequence integer NOT NULL CHECK (shape_pt_sequence >= 0),
  shape_dist_traveled numeric CHECK (shape_dist_traveled >= 0),
  source_record integer NOT NULL, extra jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (feed_id, shape_id, shape_pt_sequence),
  FOREIGN KEY (feed_id, shape_id) REFERENCES static_gtfs.shapes
);
CREATE TABLE static_gtfs.trips (
  feed_id uuid NOT NULL REFERENCES static_gtfs.feed_versions,
  route_id text NOT NULL, service_id text NOT NULL, trip_id text NOT NULL,
  trip_headsign text, trip_short_name text, direction_id integer CHECK (direction_id IN (0,1)),
  block_id text, shape_id text, wheelchair_accessible integer, bikes_allowed integer,
  source_record integer NOT NULL, extra jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (feed_id, trip_id),
  FOREIGN KEY (feed_id, route_id) REFERENCES static_gtfs.routes,
  FOREIGN KEY (feed_id, service_id) REFERENCES static_gtfs.services,
  FOREIGN KEY (feed_id, shape_id) REFERENCES static_gtfs.shapes
);
CREATE INDEX trips_route_service_idx ON static_gtfs.trips (feed_id, route_id, service_id);
CREATE INDEX trips_service_idx ON static_gtfs.trips (feed_id, service_id);
CREATE INDEX trips_shape_idx ON static_gtfs.trips (feed_id, shape_id);
CREATE TABLE static_gtfs.stop_times (
  feed_id uuid NOT NULL, trip_id text NOT NULL, stop_id text NOT NULL,
  stop_sequence integer NOT NULL CHECK (stop_sequence >= 0),
  -- Seconds from service-day start, NOT SQL time or a wall-clock timestamp.
  arrival_time integer CHECK (arrival_time >= 0), departure_time integer CHECK (departure_time >= arrival_time),
  stop_headsign text, pickup_type integer CHECK (pickup_type BETWEEN 0 AND 3),
  drop_off_type integer CHECK (drop_off_type BETWEEN 0 AND 3), shape_dist_traveled numeric CHECK (shape_dist_traveled >= 0),
  timepoint integer CHECK (timepoint IN (0,1)),
  source_record integer NOT NULL, extra jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (feed_id, trip_id, stop_sequence),
  FOREIGN KEY (feed_id, trip_id) REFERENCES static_gtfs.trips,
  FOREIGN KEY (feed_id, stop_id) REFERENCES static_gtfs.stops,
  CHECK ((arrival_time IS NULL) = (departure_time IS NULL))
);
CREATE INDEX stop_times_stop_departure_idx ON static_gtfs.stop_times (feed_id, stop_id, departure_time);
CREATE TABLE static_gtfs.feed_info (
  feed_id uuid PRIMARY KEY REFERENCES static_gtfs.feed_versions,
  feed_publisher_name text NOT NULL, feed_publisher_url text NOT NULL, feed_lang text NOT NULL,
  default_lang text, feed_version text, feed_start_date date, feed_end_date date,
  feed_contact_email text, feed_contact_url text,
  source_record integer NOT NULL, extra jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE static_gtfs.fare_attributes (
  feed_id uuid NOT NULL REFERENCES static_gtfs.feed_versions,
  fare_id text NOT NULL, price numeric NOT NULL CHECK (price >= 0), currency_type text NOT NULL,
  payment_method integer NOT NULL, transfers integer, agency_id text NOT NULL, transfer_duration integer,
  source_record integer NOT NULL, extra jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (feed_id, fare_id),
  FOREIGN KEY (feed_id, agency_id) REFERENCES static_gtfs.agencies
);
CREATE TABLE static_gtfs.fare_rules (
  feed_id uuid NOT NULL, fare_id text NOT NULL, route_id text, origin_id text, destination_id text, contains_id text,
  source_record integer NOT NULL, extra jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (feed_id, source_record),
  FOREIGN KEY (feed_id, fare_id) REFERENCES static_gtfs.fare_attributes,
  FOREIGN KEY (feed_id, route_id) REFERENCES static_gtfs.routes
);
CREATE INDEX fare_rules_fare_idx ON static_gtfs.fare_rules (feed_id, fare_id);
-- Supplemental records retain source column names and strings; no invented joins.
CREATE TABLE static_gtfs.supplemental_records (
  feed_id uuid NOT NULL REFERENCES static_gtfs.feed_versions,
  file_name text NOT NULL, source_record integer NOT NULL, data jsonb NOT NULL,
  PRIMARY KEY (feed_id, file_name, source_record)
);
CREATE TABLE static_gtfs.supplemental_documents (
  feed_id uuid NOT NULL REFERENCES static_gtfs.feed_versions,
  file_name text NOT NULL, content text NOT NULL,
  PRIMARY KEY (feed_id, file_name)
);

-- Calendar lookup for inspection/activation validation; no journey search.
CREATE FUNCTION static_gtfs.service_is_active(version uuid, service text, day date)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT exception_type = 1 FROM static_gtfs.calendar_dates
     WHERE feed_id = version AND service_id = service AND date = day),
    (SELECT day BETWEEN start_date AND end_date AND
       (ARRAY[monday,tuesday,wednesday,thursday,friday,saturday,sunday])[extract(isodow FROM day)::integer] = 1
     FROM static_gtfs.calendars WHERE feed_id = version AND service_id = service),
    false
  );
$$;
