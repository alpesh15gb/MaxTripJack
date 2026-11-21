import {useCallback, useId, useLayoutEffect, useRef, useState, type FocusEvent, type ReactNode} from 'react';

export default function FareOptionsRail({options, locked, readOnly, children}: {
  options: string[];
  locked: boolean;
  readOnly: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const count = options.length;
  const track = useRef<HTMLDivElement>(null);
  const focusFrame = useRef(0);
  const [view, setView] = useState({previous: false, next: false, first: 1, last: 1});
  const syncEdges = useCallback(() => {
    const node = track.current;
    if (!node) return;
    const previous = node.scrollLeft > 2;
    const next = node.scrollLeft < node.scrollWidth - node.clientWidth - 2;
    const cards = Array.from(node.children) as HTMLElement[];
    const origin = cards[0]?.offsetLeft ?? 0;
    // A small sliver of the next card is a swipe cue, not a visible fare.
    const visible = cards.flatMap((card, index) => {
      const middle = card.offsetLeft - origin + card.offsetWidth / 2;
      return middle >= node.scrollLeft && middle <= node.scrollLeft + node.clientWidth ? [index + 1] : [];
    });
    const first = visible[0] ?? 1;
    const last = visible.at(-1) ?? first;
    setView(current => current.previous === previous && current.next === next && current.first === first && current.last === last
      ? current : {previous, next, first, last});
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
    const card = direction > 0
      ? cards.find(card => card.offsetLeft - origin > node.scrollLeft + 2)
      : cards.findLast(card => card.offsetLeft - origin < node.scrollLeft - 2);
    const left = card ? card.offsetLeft - origin : direction > 0 ? node.scrollWidth : 0;
    node.scrollTo({left, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  }

  function jumpToFare(index: number) {
    const node = track.current;
    const card = node?.children.item(index) as HTMLElement | null;
    if (!node || !card || locked) return;
    node.scrollTo({left: card.offsetLeft - (node.children[0] as HTMLElement).offsetLeft, behavior: 'instant'});
    const heading = card.querySelector('h4');
    heading?.focus({preventScroll: true});
    heading?.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'instant'});
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
    {(view.previous || view.next) && <div className="fare-options-nav">
      {count > 3 ? <label className="fare-jump">
        <span>Jump to fare</span>
        <select aria-controls={id} disabled={locked} value="" onChange={event => jumpToFare(Number(event.target.value))}>
          <option value="" disabled>{view.first === view.last ? view.first : `${view.first}–${view.last}`} of {count}</option>
          {options.map((label, index) => <option key={index} value={index}>{label}</option>)}
        </select>
      </label> : <span>{view.first === view.last ? `Fare ${view.first}` : `Fares ${view.first}–${view.last}`} of {count}</span>}
      <div>
        <button type="button" aria-controls={id} aria-label="Previous fare options" disabled={locked || !view.previous} onClick={() => scrollToCard(-1)}>‹</button>
        <button type="button" aria-controls={id} aria-label="Next fare options" disabled={locked || !view.next} onClick={() => scrollToCard(1)}>›</button>
      </div>
    </div>}
    <div id={id} ref={track} className="fare-decision-grid" role="group" aria-label="Fare options" onScroll={syncEdges} onFocus={revealFocusedFare}>
      {children}
    </div>
  </div>;
}
