-- Lightweight token-prefix search, scoped to the activated static publication.
CREATE INDEX stops_search_name ON static_gtfs.stops USING gin
  (to_tsvector('simple', regexp_replace(stop_name, '[^[:alnum:]]+', ' ', 'g')));
