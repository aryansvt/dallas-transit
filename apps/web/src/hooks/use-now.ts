'use client';
import { useEffect, useState } from 'react';

/** The current time, refreshed every 30 s so "next class" moves on; a
 * preview fixes it for repeatable screens. */
export function useNow(fixed?: string) {
  const [now, setNow] = useState(() => new Date(fixed ?? Date.now()));
  useEffect(() => {
    if (fixed) return;
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, [fixed]);
  return now;
}
