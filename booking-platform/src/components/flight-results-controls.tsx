'use client';

import {useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode} from 'react';
import {useCompanyProfile} from './company-profile-context';
import {StitchSymbol} from './stitch-symbol';
import {TravelIcon} from './travel-icon';
import {displayMoney} from '@/lib/display-money';
import {estimatedFare,flightStops,type Flight} from '@/lib/booking-presentation';
import {flightAlliance, flightAlliances, type FlightAlliance} from '@/lib/flight-alliances';
import {flightConnectionAirports,flightDepartureWindows,flightHasCheckedBag,flightLayovers,type FlightDepartureWindow} from '@/lib/flight-results';

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
  airlineFilters: readonly string[];
  allianceFilters: readonly FlightAlliance[];
  airlineQuery?: string;
  onAirlines: (value: string[]) => void;
  onAlliances: (value: FlightAlliance[]) => void;
  stops: string;
  onStops: (value: string) => void;
  departureWindows: readonly FlightDepartureWindow[];
  onDeparture: (value: FlightDepartureWindow[]) => void;
  arrivalWindows?: readonly FlightDepartureWindow[];
  onArrival?: (value: FlightDepartureWindow[]) => void;
  bagOnly?: boolean;
  onBagOnly?: (value: boolean) => void;
  maxConnection?: string;
  onMaxConnection?: (value: string) => void;
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
  summary?: ReactNode;
};

const departureOptions = {
  EARLY:{title:'Early morning',icon:'wb_twilight',hours:'12am – 5am',label:'Before 05:00'},
  MORNING:{title:'Morning',icon:'wb_sunny',hours:'5am – 12pm',label:'Morning · 05:00–11:59'},
  AFTERNOON:{title:'Afternoon',icon:'partly_cloudy_day',hours:'12pm – 6pm',label:'Afternoon · 12:00–17:59'},
  EVENING:{title:'Evening',icon:'nights_stay',hours:'6pm – 12am',label:'Evening · 18:00–23:59'},
} satisfies Record<FlightDepartureWindow,{title:string;icon:string;hours:string;label:string}>;

function toggleFilter<T>(current:readonly T[],value:T):T[] {
  return current.includes(value)?current.filter(selected=>selected!==value):[...current,value];
}

function resetFlightFilters(props:FlightFilterProps) {
  props.onStops('ALL');props.onAirlines([]);props.onAlliances([]);props.onDeparture([]);props.onConnections([]);props.onBudget('');
  props.onArrival?.([]);props.onBagOnly?.(false);props.onMaxConnection?.('');
}

function countFlightFilters(props: FlightFilterProps) {
  const legFilters = props.group === 'COMBO' ? 0 : Number(props.stops !== 'ALL') + props.departureWindows.length + props.connections.length + (props.arrivalWindows?.length ?? 0) + Number(Boolean(props.maxConnection));
  return Number(Boolean(props.bagOnly)) + props.airlineFilters.length + props.allianceFilters.length + Number(Boolean(props.airlineQuery?.trim())) + legFilters + Number(Boolean(props.budget.trim()));
}

/** Lives above the result cards, so phone users can undo filters without reopening the drawer. */
export function FlightActiveFilterChips(props: FlightFilterProps & {withNonstopToggle?: boolean; restoreFocus?: () => void}) {
  const carrier=props.airlineQuery?.trim();
  const completeItinerary=props.group==='COMBO';
  const nonstopShownInToolbar=props.withNonstopToggle && props.stops==='0';
  const budget=Number(props.budget);
  const budgetLabel=Number.isFinite(budget)&&budget>=0?`Up to ₹${new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(budget)} · all travellers`:'Budget needs review';
  const filters=[
    ...props.airlineFilters.map(name=>({key:`airline-${name}`,label:`${name} · any segment`,removeLabel:`Remove airline filter ${name}`,remove:()=>props.onAirlines(props.airlineFilters.filter(selected=>selected!==name)),inactive:false})),
    ...flightAlliances.filter(([alliance])=>props.allianceFilters.includes(alliance)).map(([alliance,label])=>({
      key:alliance,label,removeLabel:`Remove alliance filter ${label}`,remove:()=>props.onAlliances(props.allianceFilters.filter(selected=>selected!==alliance)),inactive:false,
    })),
    ...(carrier?[{key:'carrier-query',label:`${carrier} · every segment`,removeLabel:`Remove airline preference ${props.airlineQuery}`,remove:()=>props.onAirlines([...props.airlineFilters]),inactive:false}]:[]),
    ...(props.stops!=='ALL'&&!nonstopShownInToolbar?[{key:'stops',label:props.stops==='0'?'Non-stop':`${props.stops} stop${props.stops==='1'?'':'s'}`,removeLabel:'Remove stops preference',remove:()=>props.onStops('ALL'),inactive:completeItinerary}]:[]),
    ...flightDepartureWindows.filter(window=>props.departureWindows.includes(window)).map(window=>({key:window,label:departureOptions[window].label,removeLabel:props.departureWindows.length===1?'Remove departure time filter':`Remove departure time filter: ${departureOptions[window].title}`,remove:()=>props.onDeparture(toggleFilter(props.departureWindows,window)),inactive:completeItinerary})),
    ...props.connections.map(code=>({key:`connection-${code}`,label:`Via ${code}`,removeLabel:`Remove connection airport ${code}`,remove:()=>props.onConnections(toggleFilter(props.connections,code)),inactive:completeItinerary})),
    ...flightDepartureWindows.filter(window=>props.arrivalWindows?.includes(window)).map(window=>({key:`arrive-${window}`,label:`Arrive ${departureOptions[window].label.toLowerCase()}`,removeLabel:`Remove arrival time filter: ${departureOptions[window].label}`,remove:()=>props.onArrival?.(toggleFilter(props.arrivalWindows??[],window)),inactive:completeItinerary})),
    ...(props.maxConnection?[{key:'max-connection',label:`Layovers up to ${props.maxConnection}h`,removeLabel:'Remove connection time filter',remove:()=>props.onMaxConnection?.(''),inactive:completeItinerary}]:[]),
    ...(props.bagOnly?[{key:'bag',label:'Checked bag included',removeLabel:'Remove checked bag filter',remove:()=>props.onBagOnly?.(false),inactive:false}]:[]),
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

type FlightFacetOptionProps = {
  label: string;
  accessibleName: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  onOnly?: () => void;
  count?: number;
  fare?: number;
};

function FlightFacetOption({label, accessibleName, checked, disabled, onToggle, onOnly, count, fare}: FlightFacetOptionProps) {
  const id = useId();
  const flightCount = count === undefined ? undefined : `${count} flight${count === 1 ? '' : 's'}`;
  const minimum = fare !== undefined && Number.isFinite(fare) ? displayMoney(fare) : undefined;
  const description = [flightCount && `${id}-count`, minimum && `${id}-fare`].filter(Boolean).join(' ') || undefined;
  return <div className="flight-facet-option-line">
    <button type="button" className="stitch-facet-option" disabled={disabled} aria-label={accessibleName}
      aria-describedby={description} aria-pressed={checked} onClick={onToggle}>
      <span className="stitch-facet-tick" aria-hidden="true">{checked ? '✓' : ''}</span>
      <span className="flight-facet-text"><span>{label}</span>{flightCount && <small id={`${id}-count`}>{flightCount}</small>}</span>
      {minimum && <small className="flight-facet-price" id={`${id}-fare`}><span className="sr-only">Estimated minimum </span>{minimum}</small>}
    </button>
    {onOnly && <button type="button" className="flight-facet-only" disabled={disabled} aria-label={`Only ${label}`} onClick={onOnly}>Only</button>}
  </div>;
}

/** Facets shared by the desktop sidebar and the phone filter sheet. */
function FlightFacets(props: FlightFilterFieldsProps & {flights?: readonly Flight[]}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const stopPrices = new Map<string, number>();
  const carriers = new Map<string, {count: number; fare: number}>();
  const allianceCounts = new Map<FlightAlliance, number>();
  const connectionAirports = new Map<string, string>();
  let lowest=Infinity, highest=0, bagFlights=0, connectingFlights=0;
  for(const flight of props.flights ?? []){
    if(flightHasCheckedBag(flight))bagFlights++;
    if(flightLayovers(flight).length)connectingFlights++;
    const fare=estimatedFare(flight);
    const alliance=flightAlliance(flight);
    if(alliance)allianceCounts.set(alliance,(allianceCounts.get(alliance)??0)+1);
    for(const airport of flightConnectionAirports(flight,props.group)) {
      const location=airport.city?.trim()||airport.name?.trim();
      if (location || !connectionAirports.has(airport.code)) connectionAirports.set(airport.code,location?`${location} (${airport.code})`:airport.code);
    }
    for (const name of new Set(flight.sI.map(segment=>segment.fD.aI.name).filter(Boolean))) {
      const previous = carriers.get(name);
      carriers.set(name, {count: (previous?.count ?? 0) + 1, fare: Math.min(previous?.fare ?? Infinity, fare)});
    }
    if(!Number.isFinite(fare))continue;
    lowest=Math.min(lowest,fare);highest=Math.max(highest,fare);
    const stops=flightStops(flight,props.group);
    if(stops!==null)stopPrices.set(String(stops),Math.min(stopPrices.get(String(stops))??Infinity,fare));
  }
  const min=Math.floor(lowest/100),max=Math.ceil(highest/100);
  // Quick caps from the loaded fares (not fixed amounts), rounded up to ₹500.
  const caps=Number.isFinite(min)&&max>min?[...new Set([0.25,0.5,0.75].map(step=>Math.ceil((min+(max-min)*step)/500)*500))].filter(cap=>cap>min&&cap<max):[];
  const carrierOption=(name:string)=><FlightFacetOption key={name} label={name} accessibleName={`Filter by ${name}`}
    checked={props.airlineFilters.includes(name)} disabled={props.disabled} {...carriers.get(name)}
    onToggle={()=>props.onAirlines(toggleFilter(props.airlineFilters,name))} onOnly={()=>props.onAirlines([name])}/>;
  return <div className="stitch-flight-facets flight-reference-facets">
      <div className="stitch-facets-header"><h3 ref={heading} tabIndex={-1}>Filters</h3>{countFlightFilters(props)>0&&<button type="button" aria-label="Reset flight filters" onClick={()=>{
        resetFlightFilters(props);
        heading.current?.focus({preventScroll:true});
      }} disabled={props.disabled}>Reset all</button>}</div>
      {props.airlineQuery&&<p className="flight-filter-note">Matching {props.airlineQuery} on every segment.</p>}
      {props.group!=='COMBO'&&<>
        <section><div className="stitch-facet-heading"><h4>Stops</h4></div>
          <div className="flight-stop-options">
            <button type="button" aria-pressed={props.stops==='0'} disabled={props.disabled} onClick={()=>props.onStops('0')}><StitchSymbol name="flight" size={16}/>Direct only{stopPrices.has('0')&&<small>{displayMoney(stopPrices.get('0')!)}</small>}</button>
            <button type="button" aria-pressed={props.stops==='ALL'} disabled={props.disabled} onClick={()=>props.onStops('ALL')}><TravelIcon name="swap" size={16}/>All flights{Number.isFinite(lowest)&&<small>{displayMoney(lowest)}</small>}</button>
          </div>
          <details className="flight-more-stops" open={['1','2'].includes(props.stops)||undefined}><summary>More stop filters</summary>{['1','2'].map(value=>{
            const label=`${value} stop${value==='1'?'':'s'}`;
            return <FlightFacetOption key={value} label={label} accessibleName={`Filter by ${label}`} checked={props.stops===value}
              disabled={props.disabled} fare={stopPrices.get(value)} onToggle={()=>props.onStops(props.stops===value?'ALL':value)}/>;
          })}</details>
        </section>
        <section><div className="stitch-facet-heading"><h4>Departure time</h4></div>
          <div className="stitch-time-grid" role="group" aria-label="Departure time (choose any)">{flightDepartureWindows.map(window=>{
            const {icon,title,hours}=departureOptions[window];
            return <button key={window} type="button" aria-pressed={props.departureWindows.includes(window)} disabled={props.disabled} onClick={()=>props.onDeparture(toggleFilter(props.departureWindows,window))}><StitchSymbol name={icon} size={18}/><strong>{title}</strong><small>{hours}</small></button>;
          })}</div></section>
        {props.onArrival&&<section><div className="stitch-facet-heading"><h4>Arrival time</h4></div>
          <div className="stitch-time-grid" role="group" aria-label="Arrival time (choose any)">{flightDepartureWindows.map(window=>{
            const {icon,title,hours}=departureOptions[window];
            return <button key={window} type="button" aria-label={`Arrive ${title.toLowerCase()} ${hours}`} aria-pressed={Boolean(props.arrivalWindows?.includes(window))} disabled={props.disabled} onClick={()=>props.onArrival?.(toggleFilter(props.arrivalWindows??[],window))}><StitchSymbol name={icon} size={18}/><strong>{title}</strong><small>{hours}</small></button>;
          })}</div></section>}
        {props.onMaxConnection&&connectingFlights>0&&<section><div className="stitch-facet-heading"><h4>Connection time</h4></div>
          <div className="flight-connection-limits" role="group" aria-label="Longest layover">{[['','Any'],['2','Up to 2h'],['4','Up to 4h'],['6','Up to 6h']].map(([value,label])=>
            <button key={value||'any'} type="button" aria-pressed={(props.maxConnection??'')===value} disabled={props.disabled} onClick={()=>props.onMaxConnection?.(value)}>{label}</button>)}</div></section>}
        {connectionAirports.size>0&&<section><div className="stitch-facet-heading"><h4>Layover airports</h4></div>
          <div role="group" aria-label="Connection airports (choose any)">{[...connectionAirports].map(([code,label])=>
            <FlightFacetOption key={code} label={label} accessibleName={`Connect via ${label}`} checked={props.connections.includes(code)} disabled={props.disabled}
              onToggle={()=>props.onConnections(toggleFilter(props.connections,code))} onOnly={()=>props.onConnections([code])}/>)}</div></section>}
      </>}
      {props.onBagOnly&&bagFlights>0&&<section><div className="stitch-facet-heading"><h4>Baggage</h4></div>
        <FlightFacetOption label="Checked bag included" accessibleName="Only flights with a checked bag included" checked={Boolean(props.bagOnly)} disabled={props.disabled} count={bagFlights} onToggle={()=>props.onBagOnly?.(!props.bagOnly)}/></section>}
      {props.group==='COMBO'&&<section><div className="stitch-facet-heading"><h4>Stops</h4></div><p className="flight-filter-note">Check stops for each flight in the complete itinerary.</p></section>}
      {allianceCounts.size>0&&<section>
        <div className="stitch-facet-heading"><h4>Alliances</h4></div>
        <p className="flight-filter-note">Matches when the listed airlines on every segment belong to the same alliance.</p>
        {flightAlliances.map(([alliance,label])=>{
          const count=allianceCounts.get(alliance);
          if(!count)return null;
          return <FlightFacetOption key={alliance} label={label} accessibleName={`Filter by ${label}`} count={count}
            checked={props.allianceFilters.includes(alliance)} disabled={props.disabled}
            onToggle={()=>props.onAlliances(toggleFilter(props.allianceFilters,alliance))} onOnly={()=>props.onAlliances([alliance])}/>;
        })}
      </section>}
      <section><div className="stitch-facet-heading"><h4>Airlines</h4></div>
        {props.airlines.slice(0,6).map(carrierOption)}
        {props.airlines.length>6&&<details className="stitch-more-airlines" open={props.airlines.slice(6).some(name=>props.airlineFilters.includes(name))||undefined}>
          <summary>More airlines ({props.airlines.length-6})</summary>
          {props.airlines.slice(6).map(carrierOption)}
        </details>}</section>
      <section className="stitch-facet-budget"><h4>Price range</h4>
        {Number.isFinite(min)&&max>min&&<><input aria-label="Maximum fare slider" type="range" min={min} max={max} step="1" value={props.budget?Math.max(min,Math.min(max,Number(props.budget)||max)):max} onChange={e=>props.onBudget(Number(e.target.value)===max?'':e.target.value)} disabled={props.disabled}/><div><small>{displayMoney(min*100)}</small><small>{displayMoney(max*100)}</small></div></>}
        <label>Maximum total for all travellers (₹)<input type="number" min="0" step="1" inputMode="numeric" placeholder="No limit" value={props.budget} disabled={props.disabled} onChange={e=>props.onBudget(e.target.value)}/></label>
      {caps.length>0&&<div className="stitch-budget-caps" role="group" aria-label="Quick maximum total">{caps.map(cap=><button key={cap} type="button" aria-pressed={props.budget===String(cap)} disabled={props.disabled} onClick={()=>props.onBudget(props.budget===String(cap)?'':String(cap))}>Up to {displayMoney(cap*100)}</button>)}</div>}
      </section>
    </div>;
}

export function FlightDesktopFilters(props: FlightFilterFieldsProps & {flights: readonly Flight[]; topAction?:ReactNode}) {
  return <aside className="results-toolbar flight-shopping-controls flight-desktop-filters" aria-label="Flight result controls">
    {props.topAction}
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

/** The full set opens in a dialog on phones. */
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
  const activeCount = countFlightFilters(props);

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
    <div className="flight-filter-action-row">
      {props.summary}
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
