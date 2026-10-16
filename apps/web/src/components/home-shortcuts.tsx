import { copyPlace, type Place } from '@dallas-transit/shared';
import type { PresetName, Presets } from '../lib/presets';
import { STUDENT_PLACES } from '../lib/student-places';
import { Icon } from './icon';

const labels = { home: 'Home', school: 'School' } as const;

/** Home and School presets as one-tap destinations, then student places. */
export function HomeShortcuts({
  presets,
  onChoose,
  onEdit,
}: {
  presets: Presets;
  onChoose(place: Place): void;
  onEdit(name: PresetName): void;
}) {
  return (
    <div className="shortcuts">
      <section aria-label="Home and School">
        <ul className="preset-list">
          {(['home', 'school'] as const).map((name) => {
            const place = presets[name];
            return (
              <li key={name}>
                {place ? (
                  <>
                    <button
                      className="local-place"
                      aria-label={`${labels[name]}, ${place.name}`}
                      onClick={() => onChoose(place)}
                    >
                      <Icon name={name} />
                      <span>
                        <strong>{labels[name]}</strong>
                        <span className="secondary" title={place.name}>
                          {place.name}
                        </span>
                      </span>
                      <Icon name="chevron" />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Change ${labels[name]}`}
                      onClick={() => onEdit(name)}
                    >
                      <Icon name="edit" />
                    </button>
                  </>
                ) : (
                  <button
                    className="local-place unset-preset"
                    onClick={() => onEdit(name)}
                  >
                    <Icon name={name} />
                    <span>
                      <strong>Set {labels[name]}</strong>
                      <span className="secondary">
                        One tap to plan trips{' '}
                        {name === 'home' ? 'home' : 'to school'}
                      </span>
                    </span>
                    <Icon name="chevron" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      <section aria-labelledby="student-places-title">
        <h2 id="student-places-title">Student places</h2>
        <ul className="place-chips">
          {STUDENT_PLACES.map(copyPlace).map((place) => (
            <li key={place.name}>
              <button
                className="place-chip"
                title={place.context}
                onClick={() => onChoose(place)}
              >
                {place.name}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
