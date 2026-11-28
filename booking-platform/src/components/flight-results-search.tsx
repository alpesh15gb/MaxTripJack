'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { nearbyFlightSearch } from '@/lib/nearby-flight-dates';
import AirportPicker from './airport-picker';
import { TravelIcon } from './travel-icon';

export type FlightJourney = 'round-trip' | 'one-way' | 'multi-city';

const journeyChoices = [
  ['round-trip', 'Round trip'],
  ['one-way', 'One way'],
  ['multi-city', 'Multi-city'],
] as const satisfies readonly (readonly [FlightJourney, string])[];

export function FlightJourneyButtons({value, onChange}: {value: FlightJourney; onChange: (journey: FlightJourney) => void}) {
  return <div className="flight-inline-journeys" role="group" aria-label="Journey type">
    {journeyChoices.map(([journey, label]) => <button key={journey} type="button" aria-pressed={value === journey} onClick={() => onChange(journey)}>{label}</button>)}
  </div>;
}

export function FlightResultsRoute({from, to, departure, returning, searchButton}: {
  from: string; to: string; departure: ReactNode; returning?: ReactNode; searchButton: ReactNode;
}) {
  const [airports, setAirports] = useState({from, to, revision: 0});
  function swap(event: React.MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form;
    const origin = form?.querySelector<HTMLInputElement>('[data-airport-query="from"]');
    const destination = form?.querySelector<HTMLInputElement>('[data-airport-query="to"]');
    if (!origin || !destination) return;
    setAirports(current => ({from: destination.value, to: origin.value, revision: current.revision + 1}));
  }
  return <div className="flight-inline-route">
    <div className="flight-inline-airports">
      <div><TravelIcon name="departure" size={18}/><AirportPicker key={`from-${airports.revision}`} name="from" label="From airport" caption="From" initialCode={airports.from} hideHint inlineCity/></div>
      <button type="button" className="flight-inline-swap" aria-label="Swap airports" onClick={swap}><TravelIcon name="swap" size={16}/></button>
      <div><TravelIcon name="arrival" size={18}/><AirportPicker key={`to-${airports.revision}`} name="to" label="To airport" caption="To" initialCode={airports.to} hideHint inlineCity/></div>
    </div>
    <div className="flight-inline-dates">{departure}{returning}</div>
    {searchButton}
  </div>;
}

export function FlightAdjacentDay({day, direction, onPrepare, onSelect}: {
  day: ReturnType<typeof nearbyFlightSearch>; direction: 'previous' | 'next'; onPrepare: (criteria: Record<string, string>) => void; onSelect: (criteria: Record<string, string>) => void;
}) {
  const criteria = day?.criteria;
  const prepare = () => { if (criteria) onPrepare(criteria); };
  return <button type="button" className={`flight-inline-adjacent flight-inline-adjacent--${direction}`} aria-label={direction === 'next' ? 'Next day' : 'Previous day'} disabled={!criteria} onFocus={prepare} onPointerEnter={prepare} onClick={() => { if (criteria) onSelect(criteria); }}>
    <TravelIcon name="chevron" size={15}/>
  </button>;
}

export type AirlinePreference = {name: string; code?: string};

export function PreferredAirlines({choices, value, onChange}: {choices: AirlinePreference[]; value: string; onChange: (value: string) => void}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) input.current?.focus({preventScroll:true}); }, [open]);
  function apply() {
    onChange(draft.trim());
  }
  return <div className="flight-inline-preferred">
    <button ref={trigger} type="button" aria-expanded={open} aria-controls={id} onClick={() => {
      setDraft(value);
      setOpen(!open);
    }}><TravelIcon name="airplane" size={16}/><span>Preferred airlines</span>{value && <span className="flight-inline-airline-value" title={value}>{value}</span>}</button>
    <div id={id} className="flight-inline-preferred-field" hidden={!open} onKeyDown={event=>{
      if(event.key==='Escape'){setOpen(false);trigger.current?.focus();}
    }}>
      <label htmlFor={`${id}-airline`}>Preferred airlines</label>
      <input ref={input} id={`${id}-airline`} type="search" placeholder="Airline name or code" list={`${id}-choices`} value={draft} maxLength={80} onChange={event => setDraft(event.currentTarget.value)} onKeyDown={event => {
        if (event.key === 'Enter') { event.preventDefault(); apply(); }
      }}/>
      <datalist id={`${id}-choices`}>{choices.map(({name, code}) => <option key={code || name} value={code || name}>{name}</option>)}</datalist>
      {value && <button type="button" onClick={() => {setDraft(''); onChange('');}}>Clear</button>}
      {draft.trim() !== value && <button type="button" onClick={apply}>Apply</button>}
    </div>
  </div>;
}
