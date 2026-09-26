-- Opt-in, immutable evidence sets. No proximity-generated edges or provider calls.
CREATE TABLE static_gtfs.pedestrian_graphs (
  feed_id uuid PRIMARY KEY REFERENCES static_gtfs.feed_versions,
  evidence_id text NOT NULL CHECK (length(evidence_id) > 0),
  rights_reference text NOT NULL CHECK (length(rights_reference) > 0),
  valid_from date NOT NULL,
  valid_through date NOT NULL CHECK (valid_through >= valid_from),
  retain_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE static_gtfs.pedestrian_links (
  feed_id uuid NOT NULL REFERENCES static_gtfs.pedestrian_graphs,
  link_id text NOT NULL,
  from_stop_id text NOT NULL,
  to_stop_id text NOT NULL CHECK (to_stop_id <> from_stop_id),
  duration_seconds integer NOT NULL CHECK (duration_seconds BETWEEN 0 AND 1800),
  distance_meters double precision NOT NULL CHECK (distance_meters >= 0 AND distance_meters <= 2500),
  provenance text NOT NULL CHECK (length(provenance) > 0),
  PRIMARY KEY (feed_id, link_id),
  UNIQUE (feed_id, from_stop_id, to_stop_id),
  FOREIGN KEY (feed_id, from_stop_id) REFERENCES static_gtfs.stops(feed_id, stop_id),
  FOREIGN KEY (feed_id, to_stop_id) REFERENCES static_gtfs.stops(feed_id, stop_id)
);
