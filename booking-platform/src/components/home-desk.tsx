"use client";

import Link from "next/link";
import {useState, type FormEvent} from "react";
import {TravelIcon} from "./travel-shell";

const questions = [
  ["How much cabin baggage can I take?", "/flight-booking-guide"],
  ["How can I plan my visa application?", "/visa-guide"],
  ["What should I check before booking a hotel?", "/customer-support"],
] as const;

export default function HomeDesk({enabled}:{enabled:boolean}) {
  const [message,setMessage] = useState("");
  const compose = (text:string) => window.dispatchEvent(new CustomEvent("maxtravel:compose-message", {detail:text}));
  function submit(event:FormEvent) {
    event.preventDefault();
    if (message.trim()) compose(message.trim());
  }
  return <section className="stitch-office-card stitch-ai-card">
    <header><span><TravelIcon name="globe" size={24}/></span><div><small>Instant guidance</small><h2>{enabled ? "Ask Max AI Concierge" : "Travel planning desk"}</h2></div></header>
    <p>Get help with airport connections, baggage, visa planning and your next hotel stay.</p>
    <div className="stitch-ai-questions">{questions.map(([question,url]) => enabled
      ? <button type="button" key={url} onClick={()=>compose(question)}>{question}<TravelIcon name="arrow" size={14}/></button>
      : <Link key={url} href={url}>{question}<TravelIcon name="arrow" size={14}/></Link>)}</div>
    {enabled && <form onSubmit={submit}><label className="visually-hidden" htmlFor="home-desk-question">Your question for Max AI</label>
      <input id="home-desk-question" value={message} onChange={event=>setMessage(event.target.value)} maxLength={2000} placeholder="Type your travel question"/>
      <button type="submit" disabled={!message.trim()} aria-label="Open this question in Max AI"><TravelIcon name="arrow" size={18}/></button>
    </form>}
  </section>;
}
