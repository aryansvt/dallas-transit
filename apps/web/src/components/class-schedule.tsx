'use client';
import { useId, useState, type ReactNode } from 'react';
import {
  CLASS_BUFFER_MINUTES,
  classDestination,
  importSchedule,
  nextClass,
  ongoingClass,
  type ClassTime,
} from '../lib/class-schedule';
import {
  IcsError,
  MAX_ICS_LENGTH,
  type ClassSeries,
  type SkipReason,
} from '../lib/ics';
import {
  civilInstant,
  clockTime,
  dallasParts,
  displayDate,
  shiftDate,
} from '../lib/time';
import { matchBuilding } from '../lib/utd-buildings';
import { Icon } from './icon';
import { Clock } from './journey';

const skippedNouns: Record<SkipReason, [string, string]> = {
  'all-day': ['all-day event', 'all-day events'],
  'time-zone': ['event outside Dallas time', 'events outside Dallas time'],
  recurrence: [
    'event with a repeat we cannot read',
    'events with a repeat we cannot read',
  ],
  cancelled: ['cancelled event', 'cancelled events'],
  invalid: ['event we could not read', 'events we could not read'],
};
const problems: Record<IcsError['code'], string> = {
  'not-calendar':
    'This is not a calendar file. Export your schedule as an .ics file and try again.',
  'too-large':
    'This file is too large for a class schedule. Export just your classes as an .ics file.',
  'too-many':
    'This calendar has more than 80 upcoming events. Export just your class schedule.',
};
const counted = (n: number, [one, many]: [string, string]) =>
  `${n} ${n === 1 ? `${one} was` : `${many} were`}`;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayLabel(start: Date, now: Date) {
  const day = dallasParts(start).date;
  const today = dallasParts(now).date;
  if (day === today) return 'Today';
  return day === shiftDate(today, 1) ? 'Tomorrow' : displayDate(day);
}
function meets(series: ClassSeries) {
  const days =
    series.count === 1
      ? displayDate(series.startDate)
      : series.weekdays.map((d) => WEEKDAYS[d]).join(', ');
  return `${days} · ${clockTime(civilInstant(series.startDate, series.startTime))}`;
}
/** Where a class is, in words; no status by color alone. */
function placeStatus(series: ClassSeries, withStatus = true) {
  if (!series.location) return 'No room listed';
  const found = matchBuilding(series.location);
  if (!found)
    return withStatus
      ? `${series.location} · not on the campus map`
      : series.location;
  // a matched room reads short, so a pasted campus address cannot fill the card
  const { building, room } = found;
  const where = room ? `${building.code} ${room}` : building.code;
  return building.entrance || !withStatus
    ? `${where} · ${building.name}`
    : `${where} · ${building.name}, no official entrance yet`;
}

/** A label around a hidden file input, so the picker, keyboard focus and drop
 * all stay native. Drag states adapted from @corr/file-upload-dropzone. */
function ScheduleFile({
  className,
  onFile,
  children,
}: {
  className: string;
  onFile(file: File): void;
  children: ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <label
      className={`${className}${dragging ? ' dragging' : ''}`}
      onDragEnter={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
    >
      <input
        type="file"
        className="sr-only"
        accept=".ics,text/calendar"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFile(file);
        }}
      />
      {children}
    </label>
  );
}

/** Class schedule on this device: import, the next class and the list. The
 * file is read in the browser and is never stored or sent. */
export function ClassSchedule({
  classes,
  now,
  onImport,
  onRemove,
  onPlan,
  onChoose,
}: {
  classes: readonly ClassSeries[];
  now: Date;
  onImport(classes: ClassSeries[]): void;
  onRemove(): void;
  onPlan(next: ClassTime): void;
  onChoose(query: string): void;
}) {
  const [summary, setSummary] = useState('');
  const [problem, setProblem] = useState('');
  const [open, setOpen] = useState(false);
  const listId = useId();
  const read = async (file: File) => {
    setSummary('');
    setProblem('');
    try {
      if (file.size > MAX_ICS_LENGTH) throw new IcsError('too-large');
      const result = importSchedule(await file.text(), now);
      const notes = Object.entries(result.skipped).map(
        ([reason, n]) =>
          `${counted(n, skippedNouns[reason as SkipReason])} skipped.`,
      );
      if (result.ended)
        notes.push(
          `${counted(result.ended, ['past event', 'past events'])} left out.`,
        );
      if (!result.classes.length) {
        setProblem(
          ['No upcoming classes were found in this file.', ...notes].join(' '),
        );
        return;
      }
      onImport(result.classes);
      const n = result.classes.length;
      setSummary(
        [`Imported ${n} class${n === 1 ? '' : 'es'}.`, ...notes].join(' '),
      );
    } catch (e) {
      setProblem(
        e instanceof IcsError
          ? problems[e.code]
          : 'We could not read this file. Try exporting your schedule again.',
      );
    }
  };
  const feedback = (
    <>
      {summary && (
        <p className="notice import-note" role="status">
          {summary}
        </p>
      )}
      {problem && (
        <p className="notice import-note" role="alert">
          {problem}
        </p>
      )}
    </>
  );
  if (!classes.length)
    return (
      <section className="class-panel" aria-labelledby="class-import-title">
        <ScheduleFile className="import-zone" onFile={(f) => void read(f)}>
          <span className="import-icon" aria-hidden="true">
            <Icon name="calendar" />
          </span>
          <span>
            <strong id="class-import-title">Add your class schedule</strong>
            <span className="secondary">
              Choose or drop the .ics file from Galaxy or Google Calendar. It
              stays on this device.
            </span>
          </span>
        </ScheduleFile>
        {feedback}
      </section>
    );
  const next = nextClass(classes, now);
  const current = ongoingClass(classes, now);
  const destination = next && classDestination(next.series);
  return (
    <section className="class-panel" aria-labelledby="next-class-title">
      <div className="section-heading">
        <h2 id="next-class-title">Your next class</h2>
        <button
          className="text-button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((o) => !o)}
        >
          Schedule
        </button>
      </div>
      {feedback}
      <div className="next-class">
        {current && (
          <p className="class-now">
            <Icon name="clock" />
            In class until {clockTime(current.end)}
          </p>
        )}
        {next ? (
          <>
            <p className="next-class-time">
              <span className="next-class-clock">
                <Clock text={clockTime(next.start)} />
              </span>
              <span>{dayLabel(next.start, now)}</span>
            </p>
            <p className="next-class-title">{next.series.title}</p>
            {/* the note below explains a missing entrance; say it once */}
            <p className="next-class-room">{placeStatus(next.series, false)}</p>
            {destination && 'place' in destination ? (
              <button className="primary-button" onClick={() => onPlan(next)}>
                <span>
                  Plan trip to arrive{' '}
                  <time>
                    {clockTime(
                      new Date(
                        next.start.getTime() - CLASS_BUFFER_MINUTES * 60000,
                      ),
                    )}
                  </time>
                </span>
                <Icon name="arrow" />
              </button>
            ) : (
              <>
                <p className="next-class-note">
                  {destination
                    ? `${destination.building} has no official entrance location yet. Choose where to go.`
                    : 'We could not place this room on the campus map. Choose where to go.'}
                </p>
                <button
                  className="secondary-button on-board"
                  onClick={() =>
                    onChoose(
                      destination ? destination.building : next.series.location,
                    )
                  }
                >
                  Choose destination
                </button>
              </>
            )}
          </>
        ) : (
          <p className="next-class-note">No classes in the next two weeks.</p>
        )}
      </div>
      {/* stays mounted so it can expand and collapse; inert while closed */}
      <div className="expander" data-open={open}>
        <div>
          <div className="class-list" id={listId} inert={!open}>
            <ul>
              {classes.map((c) => (
                <li key={c.id}>
                  <strong>{c.title}</strong>
                  <span className="secondary">{meets(c)}</span>
                  <span className="secondary">{placeStatus(c)}</span>
                </li>
              ))}
            </ul>
            <div className="class-actions">
              <ScheduleFile
                className="secondary-button"
                onFile={(f) => void read(f)}
              >
                Replace schedule
              </ScheduleFile>
              <button className="text-button" onClick={onRemove}>
                Remove schedule
              </button>
            </div>
            <p className="local-note">
              Classes are stored only on this device. The file itself is not
              kept.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
