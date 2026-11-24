"use client";

import { useEffect, useId, useRef, useState } from 'react';
import type { CheckoutChoice, CheckoutSegment } from '@/lib/checkout-extras-contract';
import { displayMoney } from '@/lib/display-money';
import { TravelIcon } from './travel-icon';

type Seat = CheckoutSegment['options'][number];
type Props = {
  segments: CheckoutSegment[];
  types: string[];
  choices: CheckoutChoice[];
  hasOtherChanges: boolean;
  onClose: () => void;
  onConfirm: (choices: CheckoutChoice[]) => void;
};

const columns = ['A', 'B', 'C', 'D', 'E', 'F'];
const priceLabel = (seat: Seat) => seat.amountMinor > 0 ? `+${displayMoney(seat.amountMinor, true)}` : 'Included';

function cabinRows(seats: Seat[], occupied: Set<string>) {
  if (seats.some(seat => !seat.seatNumber)) return [];
  const rows = new Map<number, Set<string>>();
  for (const number of [...seats.map(seat => seat.seatNumber!), ...occupied]) {
    const match = /^(\d{1,3})([A-F])$/.exec(number);
    if (!match) return [];
    const row = Number(match[1]);
    const letters = rows.get(row) ?? new Set<string>();
    letters.add(match[2]);
    rows.set(row, letters);
  }
  // Use a single-aisle view only when a complete six-position row is present.
  // Keep gaps blank. Missing supplier positions have no reported status.
  return [...rows.values()].some(letters => letters.size === columns.length)
    ? [...rows.keys()].sort((a, b) => a - b)
    : [];
}

export default function CheckoutSeatPicker({ segments, types, choices, hasOtherChanges, onClose, onConfirm }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const travellers = types.flatMap((type, index) => type === 'INFANT' ? [] : [{ type, index }]);
  const [segmentId, setSegmentId] = useState(segments[0].id);
  const [travellerIndex, setTravellerIndex] = useState(travellers[0].index);
  const [draft, setDraft] = useState(choices.filter(choice => choice.kind === 'SEAT'));

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const segment = segments.find(item => item.id === segmentId) ?? segments[0];
  const occupied = new Set(segment.occupiedSeats ?? []);
  const seats = segment.options.filter(option => option.kind === 'SEAT' && !occupied.has(option.seatNumber ?? ''));
  const rows = cabinRows(seats, occupied);
  const byNumber = new Map(seats.map(seat => [seat.seatNumber, seat]));
  const assigned = new Set(draft.filter(seat => seat.segmentId === segmentId && seat.travellerIndex !== travellerIndex).map(seat => seat.code));
  const selection = draft.find(seat => seat.segmentId === segmentId && seat.travellerIndex === travellerIndex);
  const current = seats.find(seat => seat.code === selection?.code);
  const seatPrices = draft.map(item =>
    segments.find(leg => leg.id === item.segmentId)?.options.find(option => option.kind === 'SEAT' && option.code === item.code)?.amountMinor);
  const totalNeedsRecheck = seatPrices.some(price => price === undefined);
  const estimate = seatPrices.reduce<number>((total, price) => total + (price ?? 0), 0);

  function dismiss() {
    dialog.current?.close();
    onClose();
  }

  function choose(code: string) {
    setDraft(previous => {
      const next = previous.filter(seat => seat.segmentId !== segmentId || seat.travellerIndex !== travellerIndex);
      if (code) next.push({ kind: 'SEAT', code, segmentId, travellerIndex });
      return next;
    });
  }

  function seatButton(seat: Seat) {
    const selected = seat.code === selection?.code;
    const taken = assigned.has(seat.code);
    const status = seat.exitRow ? 'Exit row · contact support' : taken ? 'Selected by another traveller' : priceLabel(seat);
    return <button type="button" key={seat.code} className="cabin-seat"
      data-seat-status={seat.exitRow ? 'restricted' : taken ? 'assigned' : seat.extraLegroom ? 'legroom' : seat.amountMinor === 0 ? 'included' : 'paid'}
      aria-pressed={selected} aria-label={`${seat.label} · ${status}`} disabled={seat.exitRow || taken}
      onClick={() => choose(selected ? '' : seat.code)}>
      <strong>{seat.seatNumber ?? seat.label}{seat.extraLegroom && !seat.exitRow && <abbr title="Extra legroom" aria-hidden="true"> XL</abbr>}</strong>
      <small>{seat.exitRow ? 'Exit' : taken ? 'Taken' : seat.amountMinor > 0 ? displayMoney(seat.amountMinor, true) : 'Included'}</small>
    </button>;
  }

  return <dialog ref={dialog} className="checkout-cabin-dialog" aria-labelledby={titleId} onCancel={event => {event.preventDefault(); dismiss();}}>
    <div className="checkout-cabin-panel">
      <header className="checkout-cabin-header">
        <span className="checkout-cabin-mark"><TravelIcon name="airplane" size={22}/></span>
        <div><h3 id={titleId}>Choose your seats</h3><p>Optional · choose by flight and traveller</p></div>
        <button type="button" aria-label="Close seat picker" autoFocus onClick={dismiss}>×</button>
      </header>
      <div className="checkout-cabin-controls">
        <label>Flight<select aria-label="Flight" value={segmentId} onChange={event => setSegmentId(event.target.value)}>
          {segments.map((leg, index) => <option key={leg.id} value={leg.id}>{index + 1}. {leg.label.split(' · ', 1)[0]}</option>)}
        </select></label>
        <label>Traveller<select aria-label="Traveller" value={travellerIndex} onChange={event => setTravellerIndex(Number(event.target.value))}>
          {travellers.map(({type, index}) => <option key={index} value={index}>{index + 1} · {type[0] + type.slice(1).toLowerCase()}</option>)}
        </select></label>
        <p>{segment.label}</p>
      </div>
      <div className="checkout-cabin-scroll" role="region" aria-label={rows.length ? 'Cabin rows' : 'Seat options'} tabIndex={0}>
        <ul className="checkout-cabin-legend" aria-label="Seat types">
          <li data-seat-status="paid">Paid</li><li data-seat-status="included">Included</li>
          <li data-seat-status="legroom">Extra legroom</li><li data-seat-status="occupied">Unavailable</li><li data-seat-status="selected">Selected</li>
        </ul>
        {rows.length ? <div className="checkout-cabin-map" key={segmentId}>
          <div className="checkout-cabin-front">Front of cabin</div>
          <div className="checkout-cabin-row checkout-cabin-columns" aria-hidden="true">
            {columns.map((letter, index) => <span key={letter} style={{gridColumn: index < 3 ? index + 1 : index + 2}}>{letter}</span>)}
          </div>
          {rows.map(row => <div className="checkout-cabin-row" role="group" aria-label={`Row ${row}`} key={row}>
            <span className="checkout-cabin-row-number" aria-hidden="true">{row}</span>
            {columns.map((letter, index) => {
              const number = row + letter;
              const seat = byNumber.get(number);
              if (!seat && !occupied.has(number)) return null;
              return <div key={number} style={{gridColumn: index < 3 ? index + 1 : index + 2}}>
                {seat ? seatButton(seat) : <span className="cabin-seat" data-seat-status="occupied" role="img" aria-label={`Seat ${number} · occupied`}>{number}</span>}
              </div>;
            })}
          </div>)}
        </div> : <div className="checkout-cabin-list">
          <p>{seats.length ? 'The airline supplied seat options without a complete cabin layout.' : 'No seats are currently available to select on this flight.'}</p>
          <div>{seats.map(seatButton)}</div>
        </div>}
      </div>
      <footer className="checkout-cabin-footer">
        <div className="checkout-cabin-total" role="status">
          <span>{current
            ? `${current.seatNumber ? 'Seat ' + current.seatNumber : current.label} · ${priceLabel(current)}`
            : selection ? 'Previously selected seat unavailable' : 'No seat selected for this traveller'}</span>
          <strong>{totalNeedsRecheck ? 'Seat price needs rechecking' : `Seat estimate ${displayMoney(estimate, true)}`}</strong>
        </div>
        {selection && !current && <button type="button" className="inline-link" onClick={() => choose('')}>Remove previous seat</button>}
        {hasOtherChanges && <p>Your other pending extras will be applied when you confirm.</p>}
        <div className="checkout-cabin-actions">
          <button type="button" className="checkout-seat-dismiss" onClick={dismiss}>{choices.some(choice => choice.kind === 'SEAT') ? 'Cancel changes' : 'Skip'}</button>
          <button type="button" className="checkout-seat-confirm" onClick={() => {
            dialog.current?.close();
            onConfirm([...choices.filter(choice => choice.kind !== 'SEAT'), ...draft]);
          }}>Confirm seats</button>
        </div>
      </footer>
    </div>
  </dialog>;
}
