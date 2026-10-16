import { useState } from 'react';
import type { Place } from '@dallas-transit/shared';
import {
  isSaved,
  SAVED_FULL_MESSAGE,
  savedFull,
  toggleSaved,
  type LocalPlaces,
} from '../lib/local-places';
import { Icon } from './icon';

export function LocalPlaceList({
  places,
  onChoose,
  onUpdate,
}: {
  places: LocalPlaces;
  onChoose(p: Place): void;
  onUpdate(p: LocalPlaces): void;
}) {
  const [full, setFull] = useState(false);
  if (!places.recent.length && !places.saved.length)
    return (
      <p className="local-note">
        Your recent destinations will appear here, on this device.
      </p>
    );
  return (
    <div className="local-places">
      {(['saved', 'recent'] as const).map(
        (kind) =>
          places[kind].length > 0 && (
            <section
              key={kind}
              aria-label={
                kind === 'saved' ? 'Saved places' : 'Recent destinations'
              }
            >
              <div className="section-heading">
                <h2>
                  {kind === 'saved' ? 'Saved places' : 'Recent destinations'}
                </h2>
                {kind === 'recent' && (
                  <button
                    className="text-button"
                    onClick={() => onUpdate({ ...places, recent: [] })}
                  >
                    Clear
                  </button>
                )}
              </div>
              <ul>
                {places[kind].map((p, i) => {
                  const saved = isSaved(places, p);
                  return (
                    <li key={`${p.name}-${i}`}>
                      <button
                        className="local-place"
                        onClick={() => onChoose(p)}
                      >
                        <Icon name={kind === 'saved' ? 'star' : 'clock'} />
                        <span>
                          <strong>{p.name}</strong>
                          {p.context && (
                            <span className="secondary" title={p.context}>
                              {p.context}
                            </span>
                          )}
                        </span>
                        <Icon name="chevron" />
                      </button>
                      <button
                        className="icon-button local-save"
                        aria-label={`${saved ? 'Unsave' : 'Save'} ${p.name}`}
                        aria-pressed={saved}
                        onClick={() => {
                          const refused = !saved && savedFull(places);
                          setFull(refused);
                          if (!refused) onUpdate(toggleSaved(places, p));
                        }}
                      >
                        <Icon name="star" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ),
      )}
      {full && (
        <p className="notice save-limit" role="status">
          {SAVED_FULL_MESSAGE}
        </p>
      )}
      <p className="local-note">Stored only on this device.</p>
    </div>
  );
}
