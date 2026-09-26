'use client';
import { useEffect, useId, useRef, useState } from 'react';
import {
  ProviderError,
  type Place,
  type PlaceSuggestion,
  type SearchContext,
  type SearchResults,
} from '@dallas-transit/shared';
import { dallasParts } from '../lib/time';
import { errorMessage, type TransitClient } from '../lib/api';
import { Dialog } from './dialog';
import { Icon } from './icon';
import { samePlace } from '../lib/local-places';

export function PlaceSearch({
  target,
  client,
  onSelect,
  onClose,
  initialQuery = '',
  localPlaces = [],
  context,
}: {
  target: 'origin' | 'destination';
  client: TransitClient;
  onSelect(place: Place): void;
  onClose(): void;
  initialQuery?: string;
  localPlaces?: Place[];
  context?: SearchContext;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<{
    query: string;
    data: SearchResults;
  } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [session] = useState(() => client.createPlaceSession?.());
  const selection = useRef<AbortController | null>(null);
  const [active, setActive] = useState(-1);
  const id = useId();
  const date = context?.serviceDate ?? dallasParts(new Date()).date;
  const publicationId = context?.publicationId;
  const latitude = context?.proximity?.latitude;
  const longitude = context?.proximity?.longitude;
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setError('');
      if (query.trim().length < 2) {
        session?.close();
        setLoading(false);
        return;
      }
      setLoading(true);
      const searchContext: SearchContext = {
        serviceDate: date,
        ...(publicationId ? { publicationId } : {}),
        ...(latitude !== undefined && longitude !== undefined
          ? { proximity: { latitude, longitude } }
          : {}),
      };
      const work = session
        ? session.suggest(query.trim(), searchContext, controller.signal)
        : client
            .places(query.trim(), controller.signal)
            .then((r): SearchResults => ({
              suggestions: r.places.map((p, i) => ({
                id: `fixture:${i}`,
                name: p.name,
                ...(p.context ? { context: p.context } : {}),
                kind: p.transit ? 'transit' : 'place',
                place: p,
              })),
              failures:
                r.status === 'ok'
                  ? []
                  : [{ source: 'places', reason: r.reason }],
            }));
      void work
        .then((data) => {
          if (!controller.signal.aborted)
            setResult({ query: query.trim(), data });
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(errorMessage(e));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    const expiry = setTimeout(() => {
      controller.abort();
      session?.close();
      setResult(null);
      setLoading(false);
      if (query.trim().length >= 2)
        setError('Search expired. Edit your search to refresh the results.');
    }, 175000);
    return () => {
      clearTimeout(timer);
      clearTimeout(expiry);
      controller.abort();
    };
  }, [query, client, session, date, publicationId, latitude, longitude]);
  useEffect(
    () => () => {
      selection.current?.abort();
      session?.close();
    },
    [session],
  );
  const remotePlaces =
    result?.query === query.trim() ? result.data.suggestions : [];
  const matchingLocal = localPlaces.filter(
    (p, i, all) =>
      all.findIndex((other) => samePlace(p, other)) === i &&
      `${p.name} ${p.context ?? ''}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const places = [
    ...matchingLocal.map((p, i): PlaceSuggestion => ({
      id: `saved:${i}`,
      name: p.name,
      ...(p.context ? { context: p.context } : {}),
      kind: p.transit ? 'transit' : 'place',
      place: p,
    })),
    ...remotePlaces.filter(
      (p) =>
        !p.place || !matchingLocal.some((other) => samePlace(p.place!, other)),
    ),
  ].slice(0, 6);
  const choose = async (suggestion: PlaceSuggestion) => {
    if (selecting) return;
    selection.current?.abort();
    const controller = new AbortController();
    selection.current = controller;
    setSelecting(true);
    setError('');
    try {
      const place =
        suggestion.place ??
        (await session!.retrieve(suggestion, controller.signal));
      if (!controller.signal.aborted) {
        session?.close();
        onSelect(place);
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof ProviderError && e.code === 'timeout'
            ? 'Place details took too long. Search again.'
            : 'Place details are unavailable. Search again to refresh the results.',
        );
    } finally {
      if (!controller.signal.aborted) setSelecting(false);
    }
  };
  const failures = result?.query === query.trim() ? result.data.failures : [];
  const failureText = failures
    .map((f) =>
      f.source === 'stops'
        ? 'DART stop search is temporarily unavailable.'
        : f.reason === 'not-configured'
          ? 'Place search is not available yet. You can still use places already saved on this device.'
          : f.reason === 'rate-limited'
            ? 'Place search is busy. Please wait a moment before trying again.'
            : f.reason === 'unauthorized'
              ? 'Place search is unavailable because its access configuration needs attention.'
              : f.reason === 'timeout'
                ? 'Place search took too long. Please try again.'
                : 'Place search is temporarily unavailable. Please try again shortly.',
    )
    .join(' ');
  const message =
    error ||
    (selecting
      ? 'Getting place details…'
      : query.trim().length < 2
        ? places.length
          ? 'Choose a place from this device, or search by name or street address.'
          : 'Enter a place name or street address.'
        : loading || result?.query !== query.trim()
          ? 'Searching places…'
          : failureText
            ? failureText
            : places.length === 0
              ? 'No places found. Try a fuller name or street address.'
              : `${places.length} places found.`);
  return (
    <Dialog
      title={target === 'origin' ? 'Your starting point' : 'Your destination'}
      onClose={onClose}
    >
      <div className="search-content">
        <label htmlFor={id} className="field-label">
          Search places in Dallas
        </label>
        <div className="search-input">
          <Icon name="search" />
          <input
            id={id}
            data-autofocus
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={places.length > 0}
            aria-controls={`${id}-results`}
            aria-activedescendant={
              active >= 0 && places[active] ? `${id}-${active}` : undefined
            }
            autoComplete="off"
            maxLength={160}
            placeholder="Place name or street address"
            value={query}
            disabled={selecting}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(-1);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) =>
                  places.length
                    ? i < 0 && e.key === 'ArrowUp'
                      ? places.length - 1
                      : (i + (e.key === 'ArrowDown' ? 1 : -1) + places.length) %
                        places.length
                    : -1,
                );
              }
              if (e.key === 'Enter' && places[active]) {
                e.preventDefault();
                void choose(places[active]);
              }
            }}
          />
        </div>
        <p className="search-status" role="status">
          {message}
        </p>
        <ul
          id={`${id}-results`}
          role="listbox"
          aria-label="Places"
          className="search-results"
        >
          {places.map((place, i) => (
            <li
              key={`${place.name}-${i}`}
              id={`${id}-${i}`}
              role="option"
              aria-selected={active === i}
              className={active === i ? 'active' : ''}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => void choose(place)}
            >
              <Icon name="pin" />
              <span>
                <strong>{place.name}</strong>
                {place.kind === 'transit' && (
                  <span className="secondary">DART transit stop</span>
                )}
                {place.context && (
                  <span className="secondary">{place.context}</span>
                )}
                {place.place &&
                  matchingLocal.some((p) => samePlace(p, place.place!)) && (
                    <span className="secondary">On this device</span>
                  )}
              </span>
              <Icon name="chevron" />
            </li>
          ))}
        </ul>
        {result?.data.attribution && (
          <p className="secondary">{result.data.attribution}</p>
        )}
      </div>
    </Dialog>
  );
}
