# DART Data Feasibility Report

Status: NOT YET COMPLETED

## Official GTFS Schedule source

Record:
- official page:
- direct current feed:
- access date:
- archive availability:
- update guidance:
- license/terms:

## Feed inventory

| File | Present? | Rows | Notes |
|---|---:|---:|---|
| agency.txt | | | |
| routes.txt | | | |
| stops.txt | | | |
| trips.txt | | | |
| stop_times.txt | | | |
| calendar.txt | | | |
| calendar_dates.txt | | | |
| shapes.txt | | | |
| transfers.txt | | | |
| pathways.txt | | | |
| frequencies.txt | | | |

## Route types

Document all GTFS route_type values in the feed.

## Stop hierarchy

Document:
- location_type use
- parent_station use
- station/platform relationships
- duplicate/nearby stops
- accessibility fields

## Time/calendar quirks

Check:
- times beyond 24:00
- weekend service
- exceptions
- overnight service
- special event changes

## Shapes

Check:
- shape coverage
- shape point density
- shape-trip relationships

## Transfers

Check:
- transfer file presence
- station/pathway data
- whether inferred walking transfers will be needed

## GTFS-Realtime

### Access

- official source:
- endpoint(s):
- auth:
- rate limit:
- terms:
- access date:

### Feed entities

| Entity | Available? | Notes |
|---|---:|---|
| VehiclePositions | | |
| TripUpdates | | |
| Alerts | | |

### Freshness

Record:
- feed timestamp behavior
- typical update interval
- stale-feed behavior

### Identifier compatibility

Check whether realtime consistently references:
- trip_id
- route_id
- stop_id
- vehicle_id

## Risks

List each risk with:
- impact
- likelihood
- mitigation

## Decision

At the end answer:
1. Can schedule routing be built from official data?
2. Can realtime vehicle tracking be built from a legitimate source?
3. What realtime features remain uncertain?
4. What must the architecture avoid assuming?
