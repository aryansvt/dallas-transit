'use client';
import { useState } from 'react';
import {
  civilInstant,
  dallasParts,
  departureAt,
  displayDate,
  DALLAS_TIMEZONE,
} from '../lib/time';
import { Dialog } from './dialog';
export type Departure =
  | { mode: 'now' }
  | { mode: 'at'; date: string; time: string; previousDay: boolean };
export const departureLabel = (d: Departure) =>
  d.mode === 'now'
    ? 'Leave now'
    : `Depart ${displayDate(d.date)}, ${new Intl.DateTimeFormat('en-US', { timeZone: DALLAS_TIMEZONE, hour: 'numeric', minute: '2-digit' }).format(civilInstant(d.date, d.time))}`;
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
  const [date, setDate] = useState(value.mode === 'at' ? value.date : now.date);
  const [time, setTime] = useState(value.mode === 'at' ? value.time : now.time);
  const [previousDay, setPreviousDay] = useState(
    value.mode === 'at' && value.previousDay,
  );
  const [error, setError] = useState('');
  return (
    <Dialog title="When do you want to leave?" onClose={onClose}>
      <form
        className="departure-content"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            if (mode === 'at') departureAt(date, time, previousDay);
            onSelect(
              mode === 'now' ? { mode } : { mode, date, time, previousDay },
            );
          } catch (e) {
            setError(
              e instanceof Error ? e.message : 'Check your departure time.',
            );
          }
        }}
      >
        <fieldset>
          <legend className="sr-only">Departure options</legend>
          <label className="radio-row">
            <input
              type="radio"
              name="departure"
              checked={mode === 'now'}
              onChange={() => setMode('now')}
            />
            Leave now
          </label>
          <label className="radio-row">
            <input
              type="radio"
              name="departure"
              checked={mode === 'at'}
              onChange={() => setMode('at')}
            />
            Depart at…
          </label>
        </fieldset>
        {mode === 'at' && (
          <>
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
                Time
                <input
                  type="time"
                  required
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </label>
            </div>
            <p className="secondary">All times are Dallas local time.</p>
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
          </>
        )}
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        <button className="primary-button" type="submit">
          Set departure
        </button>
      </form>
    </Dialog>
  );
}
