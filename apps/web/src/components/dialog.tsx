'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './icon';

export function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose(): void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = ref.current!;
    dialog.showModal();
    const autofocus = dialog.querySelector<HTMLElement>('[data-autofocus]');
    autofocus?.focus();
    return () => {
      dialog.close();
      opener?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`sheet${wide ? ' sheet-map' : ''}`}
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="sheet-header">
        <h2 id="dialog-title">{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label={`Close ${title.toLowerCase()}`}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
