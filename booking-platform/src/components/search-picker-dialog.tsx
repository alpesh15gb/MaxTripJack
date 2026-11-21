'use client';

import { useLayoutEffect, useRef, type KeyboardEventHandler, type ReactNode } from 'react';

/** An anchored picker on desktop and a native modal sheet on narrow screens. */
export default function SearchPickerDialog({ id, label, className, children, onDismiss, onKeyDown }: {
  id: string;
  label: string;
  className: string;
  children: ReactNode;
  onDismiss: () => void;
  onKeyDown?: KeyboardEventHandler<HTMLDialogElement>;
}) {
  const panel = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = panel.current;
    if (!dialog) return;
    const trigger = dialog.parentElement?.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]');
    const narrow = window.matchMedia('(max-width:700px)');
    if (narrow.matches) dialog.showModal();
    else dialog.show();
    const dismissOutside = (event: Event) => {
      if (!narrow.matches && !dialog.parentElement?.contains(event.target as Node)) onDismiss();
    };
    narrow.addEventListener('change', onDismiss);
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('focusin', dismissOutside);
    return () => {
      narrow.removeEventListener('change', onDismiss);
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('focusin', dismissOutside);
      const hadFocus = dialog.contains(document.activeElement);
      dialog.close();
      if (hadFocus && trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [onDismiss]);

  return <dialog ref={panel} id={id} className={`search-picker-dialog ${className}`} aria-label={label}
    onCancel={event => { event.preventDefault(); onDismiss(); }}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); onDismiss(); }
      else onKeyDown?.(event);
    }}
    onClick={event => {
      if (event.target !== event.currentTarget || !event.currentTarget.matches(':modal')) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onDismiss();
    }}>
    <header className="search-picker-title">
      <strong>{label}</strong>
      <button type="button" aria-label={`Close ${label.toLowerCase()}`} onClick={onDismiss}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m6 6 12 12M18 6 6 18"/></svg>
      </button>
    </header>
    {children}
  </dialog>;
}
