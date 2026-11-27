'use client';

import {useEffect, useId, useRef, useState, useSyncExternalStore} from 'react';
import type {FlightSort} from '@/lib/flight-result-shortcuts';
import {useCompanyProfile} from './company-profile-context';
import {StitchSymbol} from './stitch-symbol';
import {displayMoney} from '@/lib/display-money';
import {estimatedFare,flightStops,type Flight} from '@/lib/booking-presentation';
import {flightConnectionAirports,flightDepartureWindows,type FlightDepartureWindow} from '@/lib/flight-results';

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
  departureWindows: readonly FlightDepartureWindow[];
  onDeparture: (value: FlightDepartureWindow[]) => void;
  connections: readonly string[];
  onConnections: (value: string[]) => void;
  budget: string;
  onBudget: (value: string) => void;
  disabled: boolean;
};

type FlightFilterFieldsProps = FlightFilterProps & { airlines: string[] };
type Props = FlightFilterFieldsProps & {
  flights?: readonly Flight[];
  count: number;
  nonstopCount?: number;
  sortBy: FlightSort;
  onSort: (sort: FlightSort) => void;
};

const departureOptions = {
  EARLY:{title:'Early morning',icon:'wb_twilight',hours:'00–06',label:'Before 06:00'},
  MORNING:{title:'Morning',icon:'wb_sunny',hours:'06–12',label:'Morning · 06:00–11:59'},
  AFTERNOON:{title:'Afternoon',icon:'partly_cloudy_day',hours:'12–18',label:'Afternoon · 12:00–17:59'},
  EVENING:{title:'Evening',icon:'nights_stay',hours:'18–00',label:'Evening · 18:00–23:59'},
} satisfies Record<FlightDepartureWindow,{title:string;icon:string;hours:string;label:string}>;

function toggleFilter<T>(current:readonly T[],value:T):T[] {
  return current.includes(value)?current.filter(selected=>selected!==value):[...current,value];
}

function resetFlightFilters(props:FlightFilterProps) {
  props.onStops('ALL');props.onAirline('ALL');props.onDeparture([]);props.onConnections([]);props.onBudget('');
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
    ...flightDepartureWindows.filter(window=>props.departureWindows.includes(window)).map(window=>({key:window,label:departureOptions[window].label,removeLabel:props.departureWindows.length===1?'Remove departure time filter':`Remove departure time filter: ${departureOptions[window].title}`,remove:()=>props.onDeparture(toggleFilter(props.departureWindows,window)),inactive:completeItinerary})),
    ...props.connections.map(code=>({key:`connection-${code}`,label:`Via ${code}`,removeLabel:`Remove connection airport ${code}`,remove:()=>props.onConnections(toggleFilter(props.connections,code)),inactive:completeItinerary})),
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

function FlightFilterFields(props: FlightFilterFieldsProps & {flights?: readonly Flight[]}) {
  return <div className="flight-extra-filters is-expanded flight-sheet-facets">
    <FlightFacets {...props}/>
    {props.group === 'COMBO' && <p className="muted">Complete itineraries: inspect each flight below. Stop and departure filters do not apply across multiple journeys.</p>}
  </div>;
}

/** One-click facets shared by the desktop sidebar and the phone filter sheet. */
function FlightFacets(props: FlightFilterFieldsProps & {flights?: readonly Flight[]}) {
  const stopPrices = new Map<string, number>(), airlinePrices = new Map<string, number>();
  const connectionAirports = new Map<string,{label:string;fare:number}>();
  let lowest=Infinity, highest=0;
  for(const flight of props.flights ?? []){
    const fare=estimatedFare(flight);
    for(const airport of flightConnectionAirports(flight,props.group)) {
      const previous=connectionAirports.get(airport.code);
      const location=airport.city||airport.name;
      connectionAirports.set(airport.code,{label:location?`${location} (${airport.code})`:previous?.label??airport.code,fare:Math.min(previous?.fare??Infinity,fare)});
    }
    if(!Number.isFinite(fare))continue;
    lowest=Math.min(lowest,fare);highest=Math.max(highest,fare);
    const stops=flightStops(flight,props.group);
    if(stops!==null)stopPrices.set(String(stops),Math.min(stopPrices.get(String(stops))??Infinity,fare));
    for(const segment of flight.sI){const name=segment.fD.aI.name;airlinePrices.set(name,Math.min(airlinePrices.get(name)??Infinity,fare));}
  }
  const min=Math.floor(lowest/100),max=Math.ceil(highest/100);
  // Quick caps from the loaded fares (not fixed amounts), rounded up to ₹500.
  const caps=Number.isFinite(min)&&max>min?[...new Set([0.25,0.5,0.75].map(step=>Math.ceil((min+(max-min)*step)/500)*500))].filter(cap=>cap>min&&cap<max):[];
  const choice=(value:string,label:string,selected:string,onChange:(value:string)=>void,estimate?:number)=><button type="button" className="stitch-facet-option" key={value} disabled={props.disabled} aria-label={`Filter by ${label}`} aria-pressed={selected===value} onClick={()=>onChange(selected===value?'ALL':value)}><span className="stitch-facet-tick" aria-hidden="true">{selected===value?'✓':''}</span><span>{label}</span><small>{estimate!==undefined?displayMoney(estimate):'—'}</small></button>;
  return <>
    <div className="stitch-flight-facets">
      <div className="stitch-facets-header"><h3>Filters</h3><button type="button" aria-label="Reset flight filters" onClick={()=>resetFlightFilters(props)} disabled={props.disabled}>Reset all</button></div>
      {props.airlineQuery&&<p className="flight-filter-note">Matching {props.airlineQuery} on every segment.</p>}
      {props.group!=='COMBO'&&<>
        <section><div className="stitch-facet-heading"><h4>Stops</h4></div>
          {['Non-stop','1 stop','2 stops'].map((label,i)=>choice(String(i),label,props.stops,props.onStops,stopPrices.get(String(i))))}</section>
        <section><div className="stitch-facet-heading"><h4>Departure time</h4></div>
          <div className="stitch-time-grid" role="group" aria-label="Departure time (choose any)">{flightDepartureWindows.map(window=>{
            const {icon,title,hours}=departureOptions[window];
            return <button key={window} type="button" aria-pressed={props.departureWindows.includes(window)} disabled={props.disabled} onClick={()=>props.onDeparture(toggleFilter(props.departureWindows,window))}><StitchSymbol name={icon} size={18}/><strong>{title}</strong><small>{hours}</small></button>;
          })}</div></section>
        {connectionAirports.size>0&&<section><div className="stitch-facet-heading"><h4>Connection airports</h4></div>
          <div role="group" aria-label="Connection airports (choose any)">{[...connectionAirports].sort(([,left],[,right])=>left.label.localeCompare(right.label)).map(([code,{label,fare}])=><button key={code} type="button" className="stitch-facet-option" disabled={props.disabled} aria-label={`Connect via ${label}`} aria-pressed={props.connections.includes(code)} onClick={()=>props.onConnections(toggleFilter(props.connections,code))}><span className="stitch-facet-tick" aria-hidden="true">{props.connections.includes(code)?'✓':''}</span><span>{label}</span><small>{Number.isFinite(fare)?displayMoney(fare):'—'}</small></button>)}</div></section>}
      </>}
      {props.group==='COMBO'&&<section><div className="stitch-facet-heading"><h4>Stops</h4></div><p className="flight-filter-note">Check stops for each flight in the complete itinerary.</p></section>}
      <section><div className="stitch-facet-heading"><h4>Airlines</h4></div>
        {props.airlines.slice(0,6).map(name=>choice(name,name,props.airline,props.onAirline,airlinePrices.get(name)))}
        {props.airlines.length>6&&<details className="stitch-more-airlines" open={props.airlines.slice(6).includes(props.airline)||undefined}>
          <summary>More airlines ({props.airlines.length-6})</summary>
          {props.airlines.slice(6).map(name=>choice(name,name,props.airline,props.onAirline,airlinePrices.get(name)))}
        </details>}</section>
      <section className="stitch-facet-budget"><h4>Price range</h4>
        {Number.isFinite(min)&&max>min&&<><input aria-label="Maximum fare slider" type="range" min={min} max={max} step="1" value={props.budget?Math.max(min,Math.min(max,Number(props.budget)||max)):max} onChange={e=>props.onBudget(Number(e.target.value)===max?'':e.target.value)} disabled={props.disabled}/><div><small>{displayMoney(min*100)}</small><small>{displayMoney(max*100)}</small></div></>}
        <label>Maximum total for all travellers (₹)<input type="number" min="0" step="1" inputMode="numeric" placeholder="No limit" value={props.budget} disabled={props.disabled} onChange={e=>props.onBudget(e.target.value)}/></label>
      {caps.length>0&&<div className="stitch-budget-caps" role="group" aria-label="Quick maximum total">{caps.map(cap=><button key={cap} type="button" aria-pressed={props.budget===String(cap)} disabled={props.disabled} onClick={()=>props.onBudget(props.budget===String(cap)?'':String(cap))}>Up to {displayMoney(cap*100)}</button>)}</div>}
      </section>
    </div>
  </>;
}

export function FlightDesktopFilters(props: FlightFilterFieldsProps & {flights: readonly Flight[]}) {
  return <aside className="results-toolbar flight-shopping-controls flight-desktop-filters" aria-label="Flight result controls">
    <FlightFacets {...props}/>
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
    (props.group==='COMBO'?0:props.departureWindows.length+props.connections.length) + Number(Boolean(props.budget.trim()));

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
    const sidebar=toolbar.current?.closest('.flight-shopping')?.querySelector<HTMLButtonElement>('.flight-desktop-filters button:not(:disabled)');
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
