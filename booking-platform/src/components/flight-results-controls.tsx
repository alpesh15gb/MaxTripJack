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

export type FlightFilterProps = {
  group: string;
  airline: string;
  airlineQuery?: string;
  onAirline: (value: string) => void;
  stops: string;
  onStops: (value: string) => void;
  departure: string;
  onDeparture: (value: string) => void;
  budget: string;
  onBudget: (value: string) => void;
  disabled: boolean;
};

type FlightFilterFieldsProps = FlightFilterProps & { airlines: string[] };
type Props = FlightFilterFieldsProps & {
  count: number;
  nonstopCount?: number;
};

const departureLabels:Record<string,string> = {EARLY:'Before 06:00',MORNING:'Morning · 06:00–11:59',AFTERNOON:'Afternoon · 12:00–17:59',EVENING:'Evening · 18:00–23:59'};
function resetFlightFilters(props:FlightFilterProps) {
  props.onStops('ALL');props.onAirline('ALL');props.onDeparture('ALL');props.onBudget('');
}

/** Lives above the result cards, so phone users can undo filters without reopening the drawer. */
export function FlightActiveFilterChips(props: FlightFilterProps & {withNonstopToggle?: boolean; restoreFocus?: () => void}) {
  const carrier=props.airlineQuery?.trim();
  const completeItinerary=props.group==='COMBO';
  const nonstopShownInToolbar=props.withNonstopToggle && props.stops==='0';
  const budget=Number(props.budget);
  const budgetLabel=Number.isFinite(budget)&&budget>=0?`Up to ₹${new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(budget)} · all travellers`:'Budget needs review';
  const filters=[
    ...(props.airline!=='ALL'?[{key:'airline',label:`${props.airline} · any segment`,removeLabel:`Remove airline filter ${props.airline}`,remove:()=>props.onAirline('ALL'),inactive:false}]:[]),
    ...(carrier?[{key:'carrier-query',label:`${carrier} · every segment`,removeLabel:`Remove airline preference ${props.airlineQuery}`,remove:()=>props.onAirline(props.airline),inactive:false}]:[]),
    ...(props.stops!=='ALL'&&!nonstopShownInToolbar?[{key:'stops',label:props.stops==='0'?'Non-stop':`${props.stops} stop${props.stops==='1'?'':'s'}`,removeLabel:'Remove stops preference',remove:()=>props.onStops('ALL'),inactive:completeItinerary}]:[]),
    ...(props.departure!=='ALL'?[{key:'departure',label:departureLabels[props.departure]??'Departure preference',removeLabel:'Remove departure time filter',remove:()=>props.onDeparture('ALL'),inactive:completeItinerary}]:[]),
    ...(props.budget.trim()?[{key:'budget',label:budgetLabel,removeLabel:'Remove budget filter',remove:()=>props.onBudget(''),inactive:false}]:[]),
  ];
  if(!filters.length&&!nonstopShownInToolbar)return null;
  return <section className="flight-active-filter-panel" aria-label="Active flight filters">
    {filters.length>0&&<ul>{filters.map(filter=><li key={filter.key}><button type="button" className={`flight-filter-chip${filter.inactive?' is-inactive':''}`} disabled={props.disabled} aria-label={filter.removeLabel} onClick={event=>{
      const item=event.currentTarget.parentElement;
      const adjacent=item?.nextElementSibling ?? item?.previousElementSibling;
      const next=adjacent?.querySelector<HTMLButtonElement>('button');
      filter.remove();
      if(next)next.focus({preventScroll:true});
      else props.restoreFocus?.();
    }}>
      <span>{filter.label}{filter.inactive&&<small>Not applied to complete itineraries</small>}</span><span className="flight-filter-chip-close" aria-hidden="true">×</span>
    </button></li>)}</ul>}
    <button type="button" className="flight-filter-clear-all" disabled={props.disabled} onClick={()=>{
      resetFlightFilters(props);
      props.restoreFocus?.();
    }}>Clear all filters</button>
  </section>;
}

function FlightFilterFields(props: FlightFilterFieldsProps) {
  return <div className="flight-extra-filters is-expanded">
    <div className="flight-filter-intro"><strong>Refine your flights</strong><p>Filter loaded options. Times are local to the departure airport.</p></div>
    {props.airlineQuery&&<p className="flight-filter-note">Matching carrier: <strong>{props.airlineQuery}</strong> on every segment. Choose an airline below to replace this preference.</p>}
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
    <button className="secondary" type="button" disabled={props.disabled} onClick={()=>resetFlightFilters(props)}>Reset flight filters</button>
  </div>;
}

export function FlightDesktopFilters(props: FlightFilterFieldsProps) {
  return <aside className="results-toolbar flight-shopping-controls flight-desktop-filters" aria-label="Flight result controls">
    <FlightFilterFields {...props}/>
  </aside>;
}

/** Quick filters remain beside comparison controls. The full set opens in a dialog on phones. */
export default function FlightResultsControls(props: Props) {
  const mobile = useSyncExternalStore(subscribeViewport, isMobile, serverViewport);
  const [open, setOpen] = useState(false);
  const toolbar = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const nonstopTrigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const canFilterStops = props.group !== 'COMBO';
  const nonstopSelected = props.stops === '0';
  const nonstopUnavailable = props.nonstopCount === 0 && !nonstopSelected;
  const activeCount = Number(props.airline !== 'ALL') + Number(Boolean(props.airlineQuery?.trim())) + Number(props.group!=='COMBO'&&props.stops !== 'ALL') +
    Number(props.group!=='COMBO'&&props.departure !== 'ALL') + Number(Boolean(props.budget.trim()));

  function close() {
    dialog.current?.close();
    setOpen(false);
    trigger.current?.focus({preventScroll: true});
  }

  function restoreFilterFocus() {
    const quickControl=mobile?trigger.current:nonstopTrigger.current;
    if(quickControl&&!quickControl.disabled){
      quickControl.focus({preventScroll:true});
      return;
    }
    const sidebar=toolbar.current?.closest('.flight-shopping')?.querySelector<HTMLSelectElement>('.flight-desktop-filters select');
    (sidebar ?? toolbar.current)?.focus({preventScroll:true});
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

  return <section className="flight-filter-toolbar" aria-label="Flight filters" ref={toolbar} tabIndex={-1}>
    <div className="flight-filter-quick">
      <button ref={trigger} type="button" className="flight-filter-trigger" disabled={props.disabled} aria-expanded={mobile && open} aria-haspopup="dialog" aria-controls={mobile ? `${id}-dialog` : undefined} aria-label={activeCount ? `Filters (${activeCount})` : 'Filters'} onClick={() => setOpen(true)}>
        <span className="flight-filter-trigger-icon" aria-hidden="true"><i/><i/><i/></span>
        Filters{activeCount>0&&<span className="flight-filter-button-count" aria-hidden="true">{activeCount}</span>}
      </button>
      {canFilterStops&&<button ref={nonstopTrigger} type="button" className="flight-nonstop-toggle" disabled={props.disabled || nonstopUnavailable} aria-pressed={nonstopSelected}
        aria-label="Non-stop" aria-description={props.nonstopCount === 0 ? 'No non-stop flights match the current filters.' : undefined} onClick={()=>props.onStops(nonstopSelected?'ALL':'0')}>
        <span className="flight-nonstop-mark" aria-hidden="true">{nonstopSelected?'✓':'+'}</span>
        Non-stop{props.nonstopCount!==undefined&&<span className="flight-filter-button-count" aria-hidden="true">{props.nonstopCount}</span>}
      </button>}
    </div>
    <FlightActiveFilterChips {...props} withNonstopToggle={canFilterStops} restoreFocus={restoreFilterFocus}/>
    {mobile&&<dialog ref={dialog} id={`${id}-dialog`} className="flight-filter-dialog" aria-labelledby={`${id}-title`}
      onCancel={event => {event.preventDefault(); close();}}
      onClick={event => {if (event.target === event.currentTarget) close();}}>
      <div className="flight-filter-sheet">
        <header><div><h2 id={`${id}-title`}>Filter flights</h2><p role="status">{props.count} matching option{props.count === 1 ? '' : 's'}</p></div><button type="button" className="secondary" onClick={close}>Close filters</button></header>
        <div className="flight-filter-sheet-body"><FlightFilterFields {...props}/></div>
        <footer><button type="button" className="primary" onClick={close}>Show {props.count} flight{props.count === 1 ? '' : 's'}</button></footer>
      </div>
    </dialog>}
  </section>;
}
