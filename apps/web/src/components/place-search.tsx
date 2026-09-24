'use client';
import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Place } from '@dallas-transit/shared';
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
}: {
  target: 'origin' | 'destination';
  client: TransitClient;
  onSelect(place: Place): void;
  onClose(): void;
  initialQuery?: string;
  localPlaces?: Place[];
}) {
  const [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);
  const [active, setActive] = useState(-1);
  const id = useId();
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const search = useQuery({
    queryKey: ['places', debounced],
    queryFn: ({ signal }) => client.places(debounced, signal),
    enabled: debounced.length >= 2 && query.trim() === debounced,
  });
  const ready = query.trim() === debounced;
  const remotePlaces =
    ready && search.data?.status === 'ok' ? search.data.places : [];
  const matchingLocal = localPlaces.filter(
    (p, i, all) =>
      all.findIndex((other) => samePlace(p, other)) === i &&
      `${p.name} ${p.context ?? ''}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const places = [
    ...matchingLocal,
    ...remotePlaces.filter(
      (p) => !matchingLocal.some((other) => samePlace(p, other)),
    ),
  ].slice(0, 6);
  const loading = query.trim().length >= 2 && (!ready || search.isFetching);
  const message =
    query.trim().length < 2
      ? places.length
        ? 'Choose a place from this device, or search by name or street address.'
        : 'Enter a place name or street address.'
      : loading
        ? 'Searching places…'
        : search.error
          ? errorMessage(search.error)
          : search.data?.status === 'unavailable'
            ? search.data.reason === 'not-configured'
              ? 'Place search is not available yet. You can still use places already saved on this device.'
              : 'Place search is temporarily unavailable. Please try again shortly.'
            : places.length === 0
              ? 'No places found. Try a fuller name or street address.'
              : `${places.length} places found.`;
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
                onSelect(places[active]);
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
              onClick={() => onSelect(place)}
            >
              <Icon name="pin" />
              <span>
                <strong>{place.name}</strong>
                {place.context && (
                  <span className="secondary">{place.context}</span>
                )}
                {matchingLocal.some((p) => samePlace(p, place)) && (
                  <span className="secondary">On this device</span>
                )}
              </span>
              <Icon name="chevron" />
            </li>
          ))}
        </ul>
        {search.error && (
          <button
            className="secondary-button"
            onClick={() => void search.refetch()}
          >
            Try search again
          </button>
        )}
      </div>
    </Dialog>
  );
}
