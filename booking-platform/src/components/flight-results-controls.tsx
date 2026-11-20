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
const stopOptions = [
  { value: 'ALL', label: 'Any' },
  { value: '0', label: 'Non-stop' },
  { value: '1', label: '1 stop' },
  { value: '2', label: '2 stops' },
];
const departureSlots = [
  { value: 'EARLY', title: 'Early', range: 'Before 6 AM' },
  { value: 'MORNING', title: 'Morning', range: '6 AM – 12 PM' },
  { value: 'AFTERNOON', title: 'Afternoon', range: '12 PM – 6 PM' },
  { value: 'EVENING', title: 'Evening', range: 'After 6 PM' },
];
const budgetPresets = ['5000', '8000', '12000', '20000'];

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
  const combo = props.group === 'COMBO';
  const hasActive = props.airline !== 'ALL' || Boolean(props.airlineQuery?.trim()) || (!combo && props.stops !== 'ALL') || (!combo && props.departure !== 'ALL') || Boolean(props.budget.trim());

  return <div className="flight-extra-filters is-expanded ux-filter-panel">
    <div className="flight-filter-intro ux-filter-head">
      <div>
        <strong>Filter flights</strong>
        <p>Instant 1-click filters · local airport times</p>
      </div>
      {hasActive && <button type="button" className="ux-filter-reset-inline" disabled={props.disabled} onClick={() => resetFlightFilters(props)}>Reset</button>}
    </div>

    {props.airlineQuery && <p className="flight-filter-note">Matching carrier: <strong>{props.airlineQuery}</strong> on every segment.</p>}

    {/* 1-Click Stops Pills (MakeMyTrip & Yatra pattern) */}
    <div className="ux-filter-group">
      <span className="ux-filter-label">Stops</span>
      <div className="ux-pill-grid" role="group" aria-label="Stops">
        {stopOptions.map(opt => {
          const active = props.stops === opt.value;
          return <button
            key={opt.value}
            type="button"
            className={`ux-filter-pill${active ? ' is-active' : ''}`}
            aria-pressed={active}
            disabled={props.disabled || combo}
            onClick={() => props.onStops(active && opt.value !== 'ALL' ? 'ALL' : opt.value)}
          >{opt.label}</button>;
        })}
      </div>
    </div>

    {/* 2x2 Visual Departure Time Tiles (MakeMyTrip & Yatra pattern) */}
    <div className="ux-filter-group">
      <span className="ux-filter-label">Departure time</span>
      <div className="ux-time-grid" role="group" aria-label="Departure time">
        {departureSlots.map(slot => {
          const active = props.departure === slot.value;
          return <button
            key={slot.value}
            type="button"
            className={`ux-time-tile${active ? ' is-active' : ''}`}
            aria-pressed={active}
            disabled={props.disabled || combo}
            onClick={() => props.onDeparture(active ? 'ALL' : slot.value)}
          >
            <strong>{slot.title}</strong>
            <small>{slot.range}</small>
          </button>;
        })}
      </div>
    </div>

    {/* 1-Click Airline Check List */}
    <div className="ux-filter-group">
      <span className="ux-filter-label">Airlines</span>
      <div className="ux-airline-list" role="group" aria-label="Airline (any segment)">
        <button
          type="button"
          className={`ux-airline-row${props.airline === 'ALL' ? ' is-active' : ''}`}
          aria-pressed={props.airline === 'ALL'}
          disabled={props.disabled}
          onClick={() => props.onAirline('ALL')}
        >
          <span className="ux-check-box" aria-hidden="true">{props.airline === 'ALL' ? '✓' : ''}</span>
          <span>All airlines ({props.airlines.length})</span>
        </button>
        {props.airlines.map(name => {
          const active = props.airline === name;
          return <button
            key={name}
            type="button"
            className={`ux-airline-row${active ? ' is-active' : ''}`}
            aria-pressed={active}
            disabled={props.disabled}
            onClick={() => props.onAirline(active ? 'ALL' : name)}
          >
            <span className="ux-check-box" aria-hidden="true">{active ? '✓' : ''}</span>
            <span>{name}</span>
          </button>;
        })}
      </div>
    </div>

    {/* Max Budget Input + 1-Tap Quick Caps */}
    <div className="ux-filter-group">
      <label className="ux-budget-label">
        <span className="ux-filter-label">Max total for all travellers (₹)</span>
        <input type="number" min="0" step="1" inputMode="numeric" placeholder="No limit" value={props.budget} disabled={props.disabled} onChange={event => props.onBudget(event.target.value)} />
      </label>
      <div className="ux-budget-chips" role="group" aria-label="Quick maximum budget">
        {budgetPresets.map(val => {
          const active = props.budget === val;
          return <button
            key={val}
            type="button"
            className={`ux-filter-pill${active ? ' is-active' : ''}`}
            aria-pressed={active}
            disabled={props.disabled}
            onClick={() => props.onBudget(active ? '' : val)}
          >≤ ₹{Number(val).toLocaleString('en-IN')}</button>;
        })}
      </div>
    </div>

    {combo && <p className="muted">Complete itineraries: stop and departure filters apply to individual legs.</p>}
    <button className="secondary" type="button" disabled={props.disabled || !hasActive} onClick={() => resetFlightFilters(props)}>Reset flight filters</button>
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
    const sidebar=toolbar.current?.closest('.flight-shopping')?.querySelector<HTMLButtonElement>('.flight-desktop-filters button');
    (sidebar ?? toolbar.current)?.focus({preventScroll:true});
  }

  useEffect(() => {
    const query = window.matchMedia(mobileQuery);
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
