"use client";
import { useEffect, useRef } from "react";

export function Modal({ titleId, onClose, className = '', children }: {
  titleId: string; onClose: () => void; className?: string; children: React.ReactNode;
}) {
  const dialog = useRef<HTMLElement>(null), close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const focusables = () => [...dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex]:not([tabindex="-1"])')].filter(node => node.offsetParent !== null && node.tabIndex >= 0);
    (dialog.current?.querySelector<HTMLElement>('[data-initial-focus]') ?? focusables()[0])?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const nodes = focusables(), first = nodes[0], last = nodes[nodes.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    // Capture before Leaflet consumes Escape; the dialog must always have a keyboard exit.
    document.addEventListener('keydown', keydown, true);
    return () => { document.removeEventListener('keydown', keydown, true); document.body.style.overflow = previousOverflow; previous?.focus(); };
  }, []);
  return <div className="ct-modal-backdrop" onClick={onClose}><section ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId}
    className={`ct-modal ${className}`} onClick={event => event.stopPropagation()}>{children}</section></div>;
}
