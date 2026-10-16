'use client';
import { useEffect, useState } from 'react';

/** A value kept in this device's storage. Fixtures never touch storage, and a
 * storage failure keeps the value for this visit with a message. */
export function useDeviceStore<T>(
  read: (storage: Storage) => T,
  write: (storage: Storage, value: T) => boolean,
  empty: () => T,
  fixture: T | undefined,
  device: boolean,
  unavailable: string,
) {
  const [value, setValue] = useState<T>(fixture ?? empty());
  const [storageMessage, setStorageMessage] = useState('');
  useEffect(() => {
    if (!device) return;
    let mounted = true;
    void Promise.resolve().then(() => {
      if (!mounted) return;
      try {
        setValue(read(localStorage));
      } catch {
        setValue(empty());
      }
    });
    return () => {
      mounted = false;
    };
  }, [device, read, empty]);
  const persist = (next: T) => {
    setValue(next);
    if (!device) return;
    try {
      if (!write(localStorage, next)) setStorageMessage(unavailable);
    } catch {
      setStorageMessage(unavailable);
    }
  };
  return { value, persist, storageMessage };
}
