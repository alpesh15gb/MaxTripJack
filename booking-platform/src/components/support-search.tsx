'use client';

import Link from 'next/link';
import Form from 'next/form';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { findSupportQuestions } from '@/lib/support-faq';
import { TravelIcon } from './travel-icon';

export default function SupportSearch({ initialQuery = '' }: { initialQuery?: string }) {
  const field=useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [showMatches, setShowMatches] = useState(false);
  const matching = query.trim() ? findSupportQuestions(query).slice(0, 5) : [];
  const readInitialField=useEffectEvent(()=>{
    const input=field.current;
    if(!input||input.value===initialQuery)return;
    setQuery(input.value);
    setShowMatches(input===document.activeElement);
  });
  useEffect(()=>{readInitialField();},[]);
  return <Form className="help-search" action="/customer-support/faq" prefetch={false} role="search" aria-label="Frequently asked questions"
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setShowMatches(false); }}
    onKeyDown={event => { if (event.key === 'Escape') setShowMatches(false); }}>
    <button type="submit" aria-label="Search help"><TravelIcon name="search" size={23}/></button>
    <input ref={field} type="search" name="q" aria-label="Search frequently asked questions" placeholder="Search help: baggage, refunds" maxLength={80}
      defaultValue={initialQuery} onFocus={event=>{setQuery(event.currentTarget.value);setShowMatches(true);}} onInput={event=>{setQuery(event.currentTarget.value);setShowMatches(true);}} />
    {showMatches && query.trim() && <div className="help-search-results">
      {matching.length ? <ul aria-label="Matching questions">{matching.map(question => <li key={question.id}>
        <Link href={`/customer-support/faq?answer=${question.id}#${question.id}`}
          onPointerDown={event=>{
            // Keep the suggestion mounted until WebKit dispatches the click.
            if(event.button===0)event.preventDefault();
          }}
          onClick={() => setShowMatches(false)}>{question.title}</Link>
      </li>)}</ul> : <p role="status">No matching questions.</p>}
    </div>}
  </Form>;
}
