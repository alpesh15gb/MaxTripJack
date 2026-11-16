'use client';

import {useEffect, useId, useRef, useState, useSyncExternalStore} from 'react';

const mobileQuery = '(max-width: 1100px)';
function subscribeViewport(callback: () => void) {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}
const isMobile = () => window.matchMedia(mobileQuery).matches;
const serverViewport = () => false;

type Props = {
  sort: string;
  onSort: (value: string) => void;
  hasDuration: boolean;
  hasDeparture: boolean;
  group: string;
  airlines: string[];
  airline: string;
  onAirline: (value: string) => void;
  stops: string;
  onStops: (value: string) => void;
  departure: string;
  onDeparture: (value: string) => void;
  budget: string;
  onBudget: (value: string) => void;
  count: number;
  disabled: boolean;
};

/** One set of controls: a sidebar on desktop and a native modal on phones. */
export default function FlightResultsControls(props: Props) {
  const mobile = useSyncExternalStore(subscribeViewport, isMobile, serverViewport);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const activeCount = Number(props.airline !== 'ALL') + Number(props.stops !== 'ALL') +
    Number(props.departure !== 'ALL') + Number(Boolean(props.budget));

  function close() {
    dialog.current?.close();
    setOpen(false);
    trigger.current?.focus({preventScroll: true});
  }

  useEffect(() => {
    const query = window.matchMedia(mobileQuery);
    // Resizing unmounts the mobile dialog, so its close event cannot reset state.
    const closeOnDesktop = () => {
      if (!query.matches) setOpen(false);
    };
    query.addEventListener('change', closeOnDesktop);
    return () => query.removeEventListener('change', closeOnDesktop);
  }, []);

  useEffect(() => {
    const modal = dialog.current;
    if (!mobile || !open || !modal) return;
    modal.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      if (modal.open) modal.close();
      document.body.style.overflow = overflow;
    };
  }, [mobile, open]);

  function reset() {
    props.onStops('ALL');
    props.onAirline('ALL');
    props.onDeparture('ALL');
    props.onBudget('');
  }

  const fields = <div id={`${id}-fields`} className="flight-extra-filters is-expanded">
    <div className="flight-filter-intro"><strong>Refine your flights</strong><p>Filter loaded options. Times are local to the departure airport.</p></div>
    <label>Airline (any segment)<select aria-label="Airline (any segment)" value={props.airline} onChange={event => props.onAirline(event.target.value)} disabled={props.disabled}>
      <option value="ALL">All airlines</option>{props.airlines.map(name => <option key={name} value={name}>{name}</option>)}
    </select></label>
    <label>Stops<select aria-label="Stops" value={props.stops} disabled={props.disabled || props.group === 'COMBO'} onChange={event => props.onStops(event.target.value)}>
      <option value="ALL">Any number of stops</option><option value="0">Non-stop</option><option value="1">1 stop</option><option value="2">2 stops</option>
    </select></label>
    <label>Departure time<select aria-label="Departure time" value={props.departure} disabled={props.disabled || props.group === 'COMBO'} onChange={event => props.onDeparture(event.target.value)}>
      <option value="ALL">Any departure time</option><option value="EARLY">Before 06:00</option><option value="MORNING">06:00–11:59</option><option value="AFTERNOON">12:00–17:59</option><option value="EVENING">18:00–23:59</option>
    </select></label>
    <label>Maximum total for all travellers (₹)<input type="number" min="0" step="1" inputMode="numeric" placeholder="No limit" value={props.budget} disabled={props.disabled} onChange={event => props.onBudget(event.target.value)}/></label>
    <p className="flight-filter-note">Estimated journey total for all travellers. Only compatible fares are compared. Unpriced options are excluded when a limit is set.</p>
    {props.group === 'COMBO' && <p className="muted">Complete itineraries: inspect each flight below. Stop and departure filters do not apply across multiple journeys.</p>}
    <button className="secondary" type="button" disabled={props.disabled} onClick={reset}>Reset flight filters</button>
  </div>;

  return <div className="results-toolbar flight-shopping-controls" aria-label="Flight result controls">
    <label className="flight-sort-select">Sort by<select aria-label="Sort by" value={props.sort} disabled={props.disabled} onChange={event => props.onSort(event.target.value)}>
      <option value="price">Lowest estimated price</option><option value="duration" disabled={!props.hasDuration}>Shortest known duration</option><option value="departure" disabled={!props.hasDeparture}>Earliest departure</option>
    </select></label>
    <button ref={trigger} type="button" className="secondary mobile-filter-toggle" disabled={props.disabled} aria-expanded={mobile && open} aria-haspopup="dialog" aria-controls={`${id}-dialog`} onClick={() => setOpen(true)}>Filters{activeCount ? ` (${activeCount})` : ''}</button>
    {mobile ? <dialog ref={dialog} id={`${id}-dialog`} className="flight-filter-dialog" aria-labelledby={`${id}-title`}
      onCancel={event => {event.preventDefault(); close();}}
      onClick={event => {if (event.target === event.currentTarget) close();}}>
      <div className="flight-filter-sheet">
        <header><div><h2 id={`${id}-title`}>Filter flights</h2><p role="status">{props.count} matching option{props.count === 1 ? '' : 's'}</p></div><button type="button" className="secondary" onClick={close}>Close filters</button></header>
        <div className="flight-filter-sheet-body">{fields}</div>
        <footer><button type="button" className="primary" onClick={close}>Show {props.count} flight{props.count === 1 ? '' : 's'}</button></footer>
      </div>
    </dialog> : fields}
  </div>;
}
