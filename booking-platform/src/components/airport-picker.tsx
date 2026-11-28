"use client";

import {useEffect, useId, useState} from "react";
import {useClientReady} from "./use-client-ready";

const defaultAirportNames: Record<string,string> = {
  BOM: "Chhatrapati Shivaji Maharaj International Airport",
  DEL: "Indira Gandhi International Airport",
};
const defaultAirportCities: Record<string,string> = { BOM: "Mumbai", DEL: "New Delhi" };

type Airport = {code:string; name:string; city:string; country:string};

export default function AirportPicker({name, label, caption = label, initialCode, showSelectedCode = false, hideHint = false, inlineCity = false, onCodeChange, onPicked}: {
  name:string; label:string; caption?:string; initialCode:string; showSelectedCode?:boolean; hideHint?:boolean; inlineCity?:boolean; onCodeChange?:(code:string) => void; onPicked?:() => void;
}) {
  const id = useId();
  const ready = useClientReady();
  const [query,setQuery] = useState(initialCode);
  const [rows,setRows] = useState<Airport[]>([]);
  const code = query.match(/\(([A-Z]{3})\)/)?.[1] ?? (/^[A-Za-z]{3}$/.test(query) ? query.toUpperCase() : "");
  const selected = rows.find(row => row.code === code);
  const country = selected?.country || (code in defaultAirportNames ? "IN" : "");
  const city = selected?.city || query.replace(/\s*\([A-Z]{3}\)$/, "");
  const inlineLabel = city.toUpperCase() !== code ? city : defaultAirportCities[code];
  const term = (showSelectedCode || inlineCity) && code ? code : query.trim();
  useEffect(() => {onCodeChange?.(code);}, [code, onCodeChange]);
  useEffect(() => {
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/travel/airports?q=${encodeURIComponent(term)}`, {signal:controller.signal}).then(async response => {
        const data = await response.json();
        if (response.ok && Array.isArray(data.airports)) setRows(data.airports);
      }).catch(() => {});
    }, 200);
    return () => {clearTimeout(timer); controller.abort();};
  }, [term]);

  const field = <input aria-label={label} data-airport-query={name} disabled={!ready} required list={id} value={query}
    onChange={event => {
      const value = event.target.value;
      setQuery(value);
      // A suggestion was chosen: let the form move to its next field.
      if (onPicked && rows.some(row => value === `${row.city || row.name} (${row.code})`)) setTimeout(onPicked, 0);
    }} placeholder="City or airport" autoComplete="off"
    title="Enter a 3-letter airport code or choose a city suggestion" pattern="[A-Za-z]{3}|.*\([A-Z]{3}\).*"/>;

  return <div><label className={showSelectedCode ? "stitch-airport-label" : undefined}>
    {showSelectedCode ? <><span className="stitch-airport-caption">
      <span className="stitch-wide-only">{name === "from" ? "From" : "To"}</span>
      <span className="stitch-phone-only">{name === "from" ? "From" : "To"} city / airport</span>
      {country && <b>{code === "DEL" ? "Capital hub" : country}</b>}
    </span>
      <span className="airport-edit">{field}
        {code && <span className="stitch-airport-value" aria-hidden="true"><strong className="airport-code-badge">{code}</strong>{city !== code && <span>{city}</span>}</span>}
      </span></> : inlineCity ? <><span>{caption}</span><span className="flight-inline-airport-field">{field}
        {code && <span className="flight-inline-airport-selection" aria-hidden="true"><strong>{code}</strong>{inlineLabel && <span>{inlineLabel}</span>}</span>}
      </span></> : <>{caption}{field}</>}
    <input type="hidden" name={name} value={code}/>
    <datalist id={id}>{query.trim().length>=2 && rows.map(row => <option key={row.code} value={`${row.city || row.name} (${row.code})`}>{row.name} · {row.country}</option>)}</datalist>
    {!hideHint&&<small className="airport-hint">{showSelectedCode && code ? selected?.name || defaultAirportNames[code] || "Selected airport" : "City name or 3-letter airport code"}</small>}
  </label></div>;
}
