'use client';
import { useEffect, useState } from 'react';

/** The current time, refreshed every 30 s so "next class" moves on; a
 * preview fixes it for repeatable screens, or runs it a minute per 1.5 s so
 * changing values can be reviewed. */
export function useNow(fixed?: string, fast = false) {
  const [now, setNow] = useState(() => new Date(fixed ?? Date.now()));
  useEffect(() => {
    if (fixed && !fast) return;
    const timer = setInterval(
      () => setNow((t) => (fast ? new Date(t.getTime() + 60000) : new Date())),
      fast ? 1500 : 30000,
    );
    return () => clearInterval(timer);
  }, [fixed, fast]);
  return now;
}
