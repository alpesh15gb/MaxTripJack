'use client';

import {useEffect, useId, useRef, useState, useSyncExternalStore} from 'react';
import type {FlightSort} from '@/lib/flight-result-shortcuts';
import {useCompanyProfile} from './company-profile-context';
import {StitchSymbol} from './stitch-symbol';
import {displayMoney} from '@/lib/display-money';
import {estimatedFare,flightStops,type Flight} from '@/lib/booking-presentation';

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
  sortBy: FlightSort;
  onSort: (sort: FlightSort) => void;
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

export function FlightDesktopFilters(props: FlightFilterFieldsProps & {flights: readonly Flight[]}) {
  const stopPrices = new Map<string, number>(), airlinePrices = new Map<string, number>();
  let lowest=Infinity, highest=0;
  for(const flight of props.flights){
    const fare=estimatedFare(flight);
    if(!Number.isFinite(fare))continue;
    lowest=Math.min(lowest,fare);highest=Math.max(highest,fare);
    const stops=flightStops(flight,props.group);
    if(stops!==null)stopPrices.set(String(stops),Math.min(stopPrices.get(String(stops))??Infinity,fare));
    for(const segment of flight.sI){const name=segment.fD.aI.name;airlinePrices.set(name,Math.min(airlinePrices.get(name)??Infinity,fare));}
  }
  const min=Math.floor(lowest/100),max=Math.ceil(highest/100);
  const choice=(value:string,label:string,selected:string,onChange:(value:string)=>void,estimate?:number)=><button type="button" className="stitch-facet-option" key={value} disabled={props.disabled} aria-label={`Filter by ${label}`} aria-pressed={selected===value} onClick={()=>onChange(selected===value?'ALL':value)}><span className="stitch-facet-tick" aria-hidden="true">{selected===value?'✓':''}</span><span>{label}</span><small>{estimate!==undefined?displayMoney(estimate):'—'}</small></button>;
  return <aside className="results-toolbar flight-shopping-controls flight-desktop-filters" aria-label="Flight result controls">
    <div className="stitch-flight-facets">
      <div className="stitch-facets-header"><h3>Filters</h3><button type="button" aria-label="Reset flight filters" onClick={()=>resetFlightFilters(props)} disabled={props.disabled}>Reset all</button></div>
      {props.airlineQuery&&<p className="flight-filter-note">Matching {props.airlineQuery} on every segment.</p>}
      {props.group!=='COMBO'&&<>
        <section><div className="stitch-facet-heading"><h4>Stops</h4><select aria-label="Stops" value={props.stops} onChange={e=>props.onStops(e.target.value)}><option value="ALL">All</option><option value="0">Non-stop</option><option value="1">1 stop</option><option value="2">2 stops</option></select></div>
          {['Non-stop','1 stop','2 stops'].map((label,i)=>choice(String(i),label,props.stops,props.onStops,stopPrices.get(String(i))))}</section>
        <section><div className="stitch-facet-heading"><h4>Departure time</h4><select aria-label="Departure time" value={props.departure} onChange={e=>props.onDeparture(e.target.value)}><option value="ALL">All</option>{Object.keys(departureLabels).map(key=><option key={key} value={key}>{departureLabels[key]}</option>)}</select></div>
          <div className="stitch-time-grid">{[['EARLY','wb_twilight','Early morning','00–06'],['MORNING','wb_sunny','Morning','06–12'],['AFTERNOON','partly_cloudy_day','Afternoon','12–18'],['EVENING','nights_stay','Evening','18–00']].map(([key,icon,title,hours])=><button key={key} type="button" aria-pressed={props.departure===key} disabled={props.disabled} onClick={()=>props.onDeparture(props.departure===key?'ALL':key)}><StitchSymbol name={icon} size={18}/><strong>{title}</strong><small>{hours}</small></button>)}</div></section>
      </>}
      {props.group==='COMBO'&&<section><div className="stitch-facet-heading"><h4>Stops</h4><select aria-label="Stops" disabled value="ALL"><option value="ALL">All</option></select></div><p className="flight-filter-note">Check stops for each flight in the complete itinerary.</p></section>}
      <section><div className="stitch-facet-heading"><h4>Airlines</h4><select aria-label="Airline (any segment)" value={props.airline} disabled={props.disabled} onChange={e=>props.onAirline(e.target.value)}><option value="ALL">All</option>{props.airlines.map(name=><option key={name} value={name}>{name}</option>)}</select></div>
        {props.airlines.slice(0,6).map(name=>choice(name,name,props.airline,props.onAirline,airlinePrices.get(name)))}</section>
      <section className="stitch-facet-budget"><h4>Price range</h4>
        {Number.isFinite(min)&&max>min&&<><input aria-label="Maximum fare slider" type="range" min={min} max={max} step="1" value={props.budget?Math.max(min,Math.min(max,Number(props.budget)||max)):max} onChange={e=>props.onBudget(Number(e.target.value)===max?'':e.target.value)} disabled={props.disabled}/><div><small>{displayMoney(min*100)}</small><small>{displayMoney(max*100)}</small></div></>}
        <label>Maximum total for all travellers (₹)<input type="number" min="0" step="1" inputMode="numeric" placeholder="No limit" value={props.budget} disabled={props.disabled} onChange={e=>props.onBudget(e.target.value)}/></label>
      </section>
    </div>
    <FlightDeskLink/>
  </aside>;
}

export function FlightDeskLink() {
  const company = useCompanyProfile();
  return <a className="flight-desk-link" href={company.phoneHref}>
    <StitchSymbol name="verified_user" size={20}/>
    <span><strong>{company.name} Assurance</strong><small>{company.address.addressLocality} desk · {company.phone}</small></span>
    <StitchSymbol name="call" size={18}/>
  </a>;
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
      <div className="shopping-filter-actions">
      <label className="flight-dock-sort">
        <span>Sort by</span>
        <select aria-label="Sort flights by" value={props.sortBy} disabled={props.disabled || !props.count} onChange={event=>props.onSort(event.target.value as FlightSort)}>
          <option value="price">Cheapest</option><option value="duration">Fastest</option><option value="departure">Earliest departure</option>
        </select>
      </label>
      <button ref={trigger} type="button" className="flight-filter-trigger" disabled={props.disabled} aria-expanded={mobile && open} aria-haspopup="dialog" aria-controls={mobile ? `${id}-dialog` : undefined} aria-label={activeCount ? `Filters (${activeCount})` : 'Filters'} onClick={() => setOpen(true)}>
        <span className="flight-filter-trigger-icon" aria-hidden="true"><i/><i/><i/></span>
        Filters{activeCount>0&&<span className="flight-filter-button-count" aria-hidden="true">{activeCount}</span>}
      </button>
      </div>
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
