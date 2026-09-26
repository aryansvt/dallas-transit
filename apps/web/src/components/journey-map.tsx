'use client';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import type { Map as LibreMap, StyleSpecification } from 'maplibre-gl';
import type { MapPoint } from '../lib/map-points';
import { Dialog } from './dialog';
import { Icon } from './icon';
import { useLiveJourney } from './live-journey';
import { liveClient, type TransitClient } from '../lib/api';

function VehicleMarkers({
  id,
  client,
  ready,
}: {
  id: string;
  client: TransitClient;
  ready: { map: LibreMap; runtime: typeof import('../lib/map-runtime') };
}) {
  const { data } = useLiveJourney(id, client);
  const markers = useRef(new Map<number, import('maplibre-gl').Marker>());
  useEffect(() => {
    const retained = markers.current;
    return () => {
      retained.forEach((m) => m.remove());
      retained.clear();
    };
  }, [ready]);
  useEffect(() => {
    const started = performance.now();
    const active = new Set<number>();
    for (const leg of data?.legs ?? []) {
      const vehicle = leg.vehicle;
      if (vehicle?.freshness !== 'LIVE' || !vehicle.coordinate) continue;
      active.add(leg.legIndex);
      let marker = markers.current.get(leg.legIndex);
      if (!marker) {
        const element = document.createElement('div');
        element.className = 'map-marker live-vehicle';
        element.textContent = '●';
        element.setAttribute('aria-label', 'Selected journey vehicle');
        marker = new ready.runtime.Marker({ element })
          .setLngLat([
            vehicle.coordinate.longitude,
            vehicle.coordinate.latitude,
          ])
          .addTo(ready.map);
        markers.current.set(leg.legIndex, marker);
      } else
        marker.setLngLat([
          vehicle.coordinate.longitude,
          vehicle.coordinate.latitude,
        ]);
    }
    for (const [key, marker] of markers.current)
      if (!active.has(key)) {
        marker.remove();
        markers.current.delete(key);
      }
    // Local measurement only; no location logging or analytics.
    performance.measure('linefinder-vehicle-markers', {
      start: started,
      end: performance.now(),
    });
    performance.clearMeasures('linefinder-vehicle-markers');
  }, [data, ready]);
  return null;
}

function MapCanvas({
  points,
  styleUrl,
  fixture,
  expanded,
  onExpand,
  liveId,
  client,
}: {
  points: MapPoint[];
  styleUrl: string | StyleSpecification | undefined;
  fixture: boolean;
  expanded: boolean;
  onExpand(): void;
  liveId: string | undefined;
  client: TransitClient;
}) {
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<LibreMap | null>(null);
  const [ready, setReady] = useState<{
    map: LibreMap;
    runtime: typeof import('../lib/map-runtime');
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(false);
  const configured = fixture || Boolean(styleUrl);
  useEffect(() => {
    if (!container.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!configured || !visible || !container.current) return;
    let disposed = false;
    let cleanup = () => {};
    void import('../lib/map-runtime')
      .then((runtime) => {
        if (disposed || !container.current) return;
        try {
          const { Map, NavigationControl } = runtime;
          const map = new Map({
            container: container.current,
            style: fixture
              ? {
                  version: 8,
                  sources: {},
                  layers: [
                    {
                      id: 'canvas',
                      type: 'background',
                      paint: { 'background-color': '#e9ede7' },
                    },
                  ],
                }
              : styleUrl!,
            center: [-96.797, 32.783],
            zoom: 12,
            attributionControl: {},
            refreshExpiredTiles: false,
          });
          instance.current = map;
          let initiallyLoaded = false;
          const onLoad = () => {
            if (disposed) return;
            initiallyLoaded = true;
            setFailed(false);
          };
          const onError = () => {
            // Unlike map.loaded(), this stays true while new tiles load on pan/zoom.
            // Recoverable source errors must not hide an already usable map.
            if (!disposed && !initiallyLoaded) setFailed(true);
          };
          const resize = new ResizeObserver(() => map.resize());
          cleanup = () => {
            resize.disconnect();
            map.off('load', onLoad);
            map.off('error', onError);
            map.remove();
            instance.current = null;
          };
          map.addControl(
            new NavigationControl({ showCompass: false }),
            'top-left',
          );
          map.on('load', onLoad);
          map.on('error', onError);
          resize.observe(container.current);
          setFailed(false);
          setReady({ map, runtime });
        } catch {
          setFailed(true);
        }
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      cleanup();
    };
  }, [configured, styleUrl, fixture, visible]);
  useEffect(() => {
    // A different journey changes markers, not the WebGL context/style/workers.
    if (!ready || ready.map !== instance.current) return;
    const {
      map,
      runtime: { Marker, Popup, LngLatBounds },
    } = ready;
    const markers = points.map((p) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = `map-marker ${p.kind}`;
      element.textContent = p.symbol;
      element.setAttribute('aria-label', p.label);
      return new Marker({ element })
        .setLngLat([p.coordinate.longitude, p.coordinate.latitude])
        .setPopup(new Popup({ offset: 22 }).setText(p.label))
        .addTo(map);
    });
    if (points.length > 1) {
      const bounds = new LngLatBounds();
      points.forEach((p) =>
        bounds.extend([p.coordinate.longitude, p.coordinate.latitude]),
      );
      map.fitBounds(bounds, { padding: 72, maxZoom: 15, duration: 0 });
    } else if (points[0])
      map.jumpTo({
        center: [points[0].coordinate.longitude, points[0].coordinate.latitude],
        zoom: 13,
      });
    return () => markers.forEach((marker) => marker.remove());
  }, [points, ready]);
  const fit = () => {
    if (!ready || ready.map !== instance.current || !points.length) return;
    const bounds = new ready.runtime.LngLatBounds();
    points.forEach((p) =>
      bounds.extend([p.coordinate.longitude, p.coordinate.latitude]),
    );
    ready.map.fitBounds(bounds, { padding: 72, maxZoom: 15, duration: 0 });
  };
  return (
    <div className={`map-canvas-wrap${expanded ? ' expanded' : ''}`}>
      {ready && liveId && (
        <VehicleMarkers
          key={liveId}
          id={liveId}
          client={client}
          ready={ready}
        />
      )}
      <div
        ref={container}
        className="map-canvas"
        role="region"
        aria-label="Journey map"
      />
      {!fixture &&
        typeof styleUrl === 'object' &&
        'mapbox-light' in styleUrl.sources && (
          <a
            className="mapbox-logo"
            href="https://www.mapbox.com/"
            aria-label="Mapbox"
          >
            <Image
              src="/mapbox-logo.svg"
              alt="Mapbox"
              width={121}
              height={30}
              unoptimized
            />
          </a>
        )}
      {(!configured || failed) && (
        <div className="map-unavailable">
          <Icon name="pin" />
          <strong>
            {failed ? 'The map could not load' : 'Street map unavailable'}
          </strong>
          <p>
            {points.length > 2
              ? 'Your boarding stops and directions are in the journey below.'
              : 'Plan your trip and follow the step-by-step directions.'}
          </p>
        </div>
      )}
      <div className="map-actions">
        {configured && !failed && (
          <button
            className="map-button"
            onClick={() => void fit()}
            aria-label="Fit journey on map"
          >
            <Icon name="location" />
            <span>Fit trip</span>
          </button>
        )}
        {!expanded && (
          <button data-expand-map className="map-button" onClick={onExpand}>
            <Icon name="expand" />
            <span>Expand map</span>
          </button>
        )}
      </div>
      {configured && !failed && (
        <div className="map-caption">
          {fixture
            ? 'Places and stops · no street map'
            : 'Places and stops · route paths unavailable'}
        </div>
      )}
    </div>
  );
}
export function JourneyMap({
  points,
  styleUrl,
  fixture = false,
  initiallyExpanded = false,
  liveId,
  client = liveClient,
}: {
  points: MapPoint[];
  styleUrl?: string | StyleSpecification;
  fixture?: boolean;
  initiallyExpanded?: boolean;
  liveId?: string;
  client?: TransitClient;
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const panel = useRef<HTMLElement>(null);
  const closeMap = () => {
    setExpanded(false);
    requestAnimationFrame(() =>
      panel.current
        ?.querySelector<HTMLButtonElement>('[data-expand-map]')
        ?.focus(),
    );
  };
  return (
    <section ref={panel} className="map-panel" aria-labelledby="map-heading">
      <div className="map-heading">
        <h2 id="map-heading">Journey map</h2>
      </div>
      {!expanded ? (
        <MapCanvas
          liveId={liveId}
          client={client}
          points={points}
          styleUrl={styleUrl}
          fixture={fixture}
          expanded={false}
          onExpand={() => setExpanded(true)}
        />
      ) : (
        <div className="map-expansion-placeholder">Map expanded</div>
      )}
      <div className="map-legend">
        <span>
          <i className="legend-origin" />
          Origin
        </span>
        <span>
          <i className="legend-stop" />
          Transit stop
        </span>
        <span>
          <i className="legend-destination" />
          Destination
        </span>
      </div>
      {expanded && (
        <Dialog title="Journey map" wide onClose={closeMap}>
          <MapCanvas
            liveId={liveId}
            client={client}
            points={points}
            styleUrl={styleUrl}
            fixture={fixture}
            expanded
            onExpand={() => {}}
          />
        </Dialog>
      )}
    </section>
  );
}
