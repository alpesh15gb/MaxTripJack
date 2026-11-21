"use client";

import {useEffect, useId, useState} from "react";
import {useClientReady} from "./use-client-ready";

const defaultAirportNames: Record<string,string> = {
  BOM: "Chhatrapati Shivaji Maharaj International Airport",
  DEL: "Indira Gandhi International Airport",
};

type Airport = {code:string; name:string; city:string; country:string};

export default function AirportPicker({name, label, initialCode, showSelectedCode = false, onCodeChange}: {
  name:string; label:string; initialCode:string; showSelectedCode?:boolean; onCodeChange?:(code:string) => void;
}) {
  const id = useId();
  const ready = useClientReady();
  const [query,setQuery] = useState(initialCode);
  const [rows,setRows] = useState<Airport[]>([]);
  const code = query.match(/\(([A-Z]{3})\)/)?.[1] ?? (/^[A-Za-z]{3}$/.test(query) ? query.toUpperCase() : "");
  const selected = rows.find(row => row.code === code);
  const country = selected?.country || (code in defaultAirportNames ? "IN" : "");
  const city = selected?.city || query.replace(/\s*\([A-Z]{3}\)$/, "");
  const term = showSelectedCode && code ? code : query.trim();
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
    onChange={event => setQuery(event.target.value)} placeholder="City or airport" autoComplete="off"
    title="Enter a 3-letter airport code or choose a city suggestion" pattern="[A-Za-z]{3}|.*\([A-Z]{3}\).*"/>;

  return <div><label className={showSelectedCode ? "stitch-airport-label" : undefined}>
    {showSelectedCode ? <><span className="stitch-airport-caption">
      <span className="stitch-wide-only">{name === "from" ? "From" : "To"}</span>
      <span className="stitch-phone-only">{name === "from" ? "From" : "To"} city / airport</span>
      {country && <b>{code === "DEL" ? "Capital hub" : country}</b>}
    </span>
      <span className="airport-edit">{field}
        {code && <span className="stitch-airport-value" aria-hidden="true"><strong className="airport-code-badge">{code}</strong>{city !== code && <span>{city}</span>}</span>}
      </span></> : <>{label}{field}</>}
    <input type="hidden" name={name} value={code}/>
    <datalist id={id}>{query.trim().length>=2 && rows.map(row => <option key={row.code} value={`${row.city || row.name} (${row.code})`}>{row.name} · {row.country}</option>)}</datalist>
    <small className="airport-hint">{showSelectedCode && code ? selected?.name || defaultAirportNames[code] || "Selected airport" : "City name or 3-letter airport code"}</small>
  </label></div>;
}
