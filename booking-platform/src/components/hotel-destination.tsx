"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { uniqueDestinations } from "@/lib/hotel-destination-pages";
import { useClientReady } from "./use-client-ready";

type Destination = { region_id: string; label: string };

export default function HotelDestination({ initialQuery = "", initialHotelIds = [], initialRegionId = "", initialDestinationCursor = "", onResolvingChange }: {
  initialQuery?: string; initialHotelIds?: string[]; initialRegionId?: string; initialDestinationCursor?: string;
  onResolvingChange?: (resolving: boolean) => void;
}) {
  const ready = useClientReady();
  const id = useId();
  const list = useRef<HTMLDivElement>(null);
  const mapping = useRef<AbortController | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [region, setRegion] = useState(initialRegionId);
  const [ids, setIds] = useState(initialHotelIds);
  const [cursor, setCursor] = useState(initialDestinationCursor);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const expanded = !dismissed && !busy && destinations.length > 0;

  useEffect(() => {
    if (query.trim().length < 2 || region || ids.length) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/travel/destinations?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (response.status === 401) { setNeedsSignIn(true); setMessage(""); return; }
        if (!response.ok) throw Error();
        const cities = uniqueDestinations<Destination>(data.destinations);
        setDestinations(cities);
        setMessage(cities.length ? "" : "No matching destinations. Try a nearby city or check the spelling.");
      } catch {
        if (!controller.signal.aborted) setMessage("Destinations could not be loaded. Edit the city name to try again.");
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, region, ids.length]);

  useEffect(() => () => { mapping.current?.abort(); onResolvingChange?.(false); }, [onResolvingChange]);
  useEffect(() => {
    if (expanded && active >= 0) list.current?.children[active]?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [expanded, active]);

  function edit(value: string) {
    mapping.current?.abort();
    onResolvingChange?.(false);
    setBusy(false); setQuery(value); setRegion(""); setIds([]); setCursor("");
    setDestinations([]); setDismissed(false); setActive(-1); setNeedsSignIn(false);
    setMessage(value.trim().length >= 2 ? "Looking for destinations…" : "");
  }

  async function select(city: Destination) {
    mapping.current?.abort();
    const controller = new AbortController();
    mapping.current = controller;
    onResolvingChange?.(true);
    setBusy(true); setMessage(""); setActive(-1); setNeedsSignIn(false);
    try {
      const response = await fetch("/api/travel/destination-hotels", {
        method: "POST", headers: { "Content-Type": "application/json" },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        body: JSON.stringify({ regionId: city.region_id }),
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (response.status === 401) { setNeedsSignIn(true); return; }
      if (!response.ok) throw Error(data.error || "Stays are temporarily unavailable. Choose the destination again.");
      if (!data.hotelIds.length && !data.nextCursor) {
        setMessage("No stays are listed for this destination yet. Try a nearby city or contact Max Travel.");
        return;
      }
      setRegion(city.region_id); setQuery(city.label); setDestinations([]);
      setIds(data.hotelIds); setCursor(data.nextCursor ?? "");
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error instanceof Error && error.name === "Error" ? error.message : "Stays are temporarily unavailable. Choose the destination again.");
    } finally {
      if (!controller.signal.aborted) { setBusy(false); onResolvingChange?.(false); }
    }
  }

  function navigate(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || !destinations.length || busy) return;
    if (event.key === "Escape" && expanded) {
      event.preventDefault(); setDismissed(true); setActive(-1);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); setDismissed(false);
      setActive(index => event.key === "ArrowDown" ? Math.min(index + 1, destinations.length - 1) : index < 0 ? destinations.length - 1 : Math.max(0, index - 1));
    } else if (event.key === "Enter" && expanded && active >= 0) {
      event.preventDefault(); void select(destinations[active]);
    }
  }

  return <div className="hotel-destination" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) { setDismissed(true); setActive(-1); }
  }}>
    <label htmlFor={id}>Destination</label>
    <input id={id} name="city" role="combobox" aria-autocomplete="list" aria-expanded={expanded}
      aria-controls={expanded ? `${id}-list` : undefined} aria-activedescendant={expanded && active >= 0 ? `${id}-option-${active}` : undefined}
      disabled={!ready} value={query} placeholder="Search city, e.g. Mumbai" autoComplete="off"
      onFocus={() => setDismissed(false)} onChange={event => edit(event.target.value)} onKeyDown={navigate}/>
    <input type="hidden" name="hotelIds" value={ids.join(",")}/>
    <input type="hidden" name="regionId" value={region}/>
    <input type="hidden" name="destinationCursor" value={cursor}/>
    {expanded && <div ref={list} className="destination-suggestions" id={`${id}-list`} role="listbox" aria-label="Destination suggestions">
      {destinations.map((city, index) => <button key={city.region_id} id={`${id}-option-${index}`} className="secondary" type="button" role="option"
        aria-selected={index === active} tabIndex={-1} onMouseDown={event => event.preventDefault()} onClick={() => void select(city)}>{city.label}</button>)}
    </div>}
    {needsSignIn && <p className="lookup-gate" role="status">Sign in to look up available destinations. <Link href="/account">Sign in or create an account</Link></p>}
    {(busy || message) && <p role="status">{busy ? "Finding stays in this destination…" : message}</p>}
  </div>;
}
