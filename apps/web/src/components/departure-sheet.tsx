'use client';
import { useState } from 'react';
import {
  arriveBy,
  civilInstant,
  dallasParts,
  departureAt,
  displayDate,
  DALLAS_TIMEZONE,
} from '../lib/time';
import { Dialog } from './dialog';
export type Departure =
  | { mode: 'now' }
  | { mode: 'at'; date: string; time: string; previousDay: boolean }
  | { mode: 'by'; date: string; time: string; bufferMinutes: number };
const BUFFER_CHOICES = [0, 5, 10, 15, 20, 30];
const clock = (date: string, time: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: DALLAS_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(civilInstant(date, time));
export const departureLabel = (d: Departure) =>
  d.mode === 'now'
    ? 'Leave now'
    : d.mode === 'at'
      ? `Depart ${displayDate(d.date)}, ${clock(d.date, d.time)}`
      : `Arrive by ${displayDate(d.date)}, ${clock(d.date, d.time)}${d.bufferMinutes ? ` · ${d.bufferMinutes}\u00a0min\u00a0early` : ''}`;
export function DepartureSheet({
  value,
  onSelect,
  onClose,
}: {
  value: Departure;
  onSelect(value: Departure): void;
  onClose(): void;
}) {
  const now = dallasParts(new Date());
  const [mode, setMode] = useState(value.mode);
  const [date, setDate] = useState(
    value.mode === 'now' ? now.date : value.date,
  );
  const [time, setTime] = useState(
    value.mode === 'now' ? now.time : value.time,
  );
  const [previousDay, setPreviousDay] = useState(
    value.mode === 'at' && value.previousDay,
  );
  const [buffer, setBuffer] = useState(
    value.mode === 'by' ? value.bufferMinutes : 0,
  );
  const [error, setError] = useState('');
  const options: [Departure['mode'], string][] = [
    ['now', 'Leave now'],
    ['at', 'Depart at…'],
    ['by', 'Arrive by…'],
  ];
  return (
    <Dialog title="When are you traveling?" onClose={onClose}>
      <form
        className="departure-content"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            if (mode === 'at') departureAt(date, time, previousDay);
            if (mode === 'by') arriveBy(date, time);
            onSelect(
              mode === 'now'
                ? { mode }
                : mode === 'at'
                  ? { mode, date, time, previousDay }
                  : { mode, date, time, bufferMinutes: buffer },
            );
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Check your time.');
          }
        }}
      >
        <fieldset>
          <legend className="sr-only">Time options</legend>
          {options.map(([key, label]) => (
            <label key={key} className="radio-row">
              <input
                type="radio"
                name="departure"
                checked={mode === key}
                onChange={() => {
                  setMode(key);
                  setError('');
                }}
              />
              {label}
            </label>
          ))}
        </fieldset>
        {mode !== 'now' && (
          <div className="time-fields">
            <div className="date-fields">
              <label>
                Date
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label>
                {mode === 'by' ? 'Arrive by' : 'Time'}
                <input
                  type="time"
                  required
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </label>
            </div>
            {mode === 'by' && (
              <label className="buffer-field">
                Arrive early
                <select
                  value={buffer}
                  onChange={(e) => setBuffer(Number(e.target.value))}
                >
                  {BUFFER_CHOICES.map((m) => (
                    <option key={m} value={m}>
                      {m ? `${m} min early` : 'Right on time'}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="secondary">All times are Dallas local time.</p>
            {mode === 'at' && (
              <details className="overnight-help">
                <summary>Traveling after midnight?</summary>
                <p>
                  Only one day’s schedule is searched. Trips continuing from the
                  previous day may be missing.
                </p>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={previousDay}
                    onChange={(e) => setPreviousDay(e.target.checked)}
                  />
                  Search the previous day’s overnight service
                </label>
              </details>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        <button className="primary-button" type="submit">
          Set time
        </button>
      </form>
    </Dialog>
  );
}
