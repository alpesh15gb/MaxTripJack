import {useCallback, useId, useLayoutEffect, useRef, useState, type FocusEvent, type ReactNode} from 'react';

export default function FareOptionsRail({count, locked, readOnly, children}: {
  count: number;
  locked: boolean;
  readOnly: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const track = useRef<HTMLDivElement>(null);
  const focusFrame = useRef(0);
  const [edges, setEdges] = useState({previous: false, next: false});
  const syncEdges = useCallback(() => {
    const node = track.current;
    if (!node) return;
    const previous = node.scrollLeft > 2;
    const next = node.scrollLeft < node.scrollWidth - node.clientWidth - 2;
    setEdges(current => current.previous === previous && current.next === next ? current : {previous, next});
  }, []);

  useLayoutEffect(() => {
    const node = track.current;
    if (!node) return;
    syncEdges();
    const observer = new ResizeObserver(syncEdges);
    observer.observe(node);
    return () => { observer.disconnect(); cancelAnimationFrame(focusFrame.current); };
  }, [syncEdges, count, readOnly]);

  function scrollToCard(direction: number) {
    const node = track.current;
    if (!node || locked) return;
    const cards = Array.from(node.children) as HTMLElement[];
    const origin = cards[0]?.offsetLeft ?? 0;
    const current = cards.findIndex(card => card.offsetLeft - origin >= node.scrollLeft - 2);
    const step = direction === -1 ? (current < 0 ? cards.length - 1 : current - 1) : current + 1;
    const card = cards[step];
    const left = card ? card.offsetLeft - origin : direction > 0 ? node.scrollWidth : 0;
    node.scrollTo({left, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  }

  function revealFocusedFare(event: FocusEvent<HTMLDivElement>) {
    const node = event.currentTarget;
    const control = event.target;
    const card = control.closest<HTMLElement>('.fare-option');
    if (!card) return;
    cancelAnimationFrame(focusFrame.current);
    focusFrame.current = requestAnimationFrame(() => {
      if (document.activeElement !== control) return;
      control.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'instant'});
      const left = card.offsetLeft - (node.firstElementChild as HTMLElement).offsetLeft;
      if (left < node.scrollLeft - 2 || left + card.offsetWidth > node.scrollLeft + node.clientWidth - 4) {
        node.scrollTo({left, behavior: 'instant'});
      }
    });
  }

  if (readOnly) return <div>{children}</div>;
  return <div className="fare-options-rail" data-single={count === 1 || undefined}>
    {(edges.previous || edges.next) && <div className="fare-options-nav">
      <span>{count} fares</span>
      <div>
        <button type="button" aria-controls={id} aria-label="Previous fare options" disabled={locked || !edges.previous} onClick={() => scrollToCard(-1)}>‹</button>
        <button type="button" aria-controls={id} aria-label="Next fare options" disabled={locked || !edges.next} onClick={() => scrollToCard(1)}>›</button>
      </div>
    </div>}
    <div id={id} ref={track} className="fare-decision-grid" role="group" aria-label="Fare options" onScroll={syncEdges} onFocus={revealFocusedFare}>
      {children}
    </div>
  </div>;
}
