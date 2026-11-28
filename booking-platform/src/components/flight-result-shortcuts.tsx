import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { durationLabel, type Flight, type FlightFare } from '@/lib/booking-presentation';
import { displayMoney } from '@/lib/display-money';
import { flightArrivalKey, flightResultShortcuts, flightSortChoices, type FlightSort } from '@/lib/flight-result-shortcuts';
import { TravelIcon } from './travel-icon';

type Props = {
  flights: readonly Flight[];
  group?: string;
  isCompatible: (fare: FlightFare) => boolean;
  sortBy: FlightSort;
  onSort: (sort: FlightSort) => void;
  disabled?: boolean;
};

function price(minor: number | null | undefined) {
  return minor == null ? 'Price at review' : displayMoney(minor);
}

export default function FlightResultShortcuts({ flights, group, isCompatible, sortBy, onSort, disabled }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const more = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const options = menu.current;
    const active = options?.querySelector<HTMLButtonElement>('[aria-checked="true"]:not(:disabled)');
    (active ?? options?.querySelector<HTMLButtonElement>('button:not(:disabled)'))?.focus({preventScroll:true});
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !more.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  if (!group || !flights.length) return null;
  const { lowest, fastest, earliest } = flightResultShortcuts(flights, group, isCompatible);
  const canSortArrival = group !== 'COMBO' && flights.some(flight => flight.totalPriceList.some(isCompatible) && flightArrivalKey(flight));
  const unavailable = {price:false, duration:!fastest, departure:!earliest, arrival:!canSortArrival};
  const currentLabel = flightSortChoices.find(([sort]) => sort === sortBy)?.[1];

  const cards = [
    {
      sort: 'price',
      label: 'Cheapest',
      value: price(lowest?.priceMinor),
      detail: lowest?.durationMinutes != null ? durationLabel(lowest.durationMinutes) : '',
    },
    {
      sort: 'duration',
      label: 'Shortest',
      value: fastest?.durationMinutes != null ? durationLabel(fastest.durationMinutes) : 'Time unavailable',
      detail: fastest ? price(fastest.priceMinor) : '',
    },
    {
      sort: 'departure',
      label: 'Earliest departure',
      value: earliest ? 'Leave first' : 'Time unavailable',
      detail: earliest ? `${earliest.departureLabel} departure, airport local time. ${price(earliest.priceMinor)}` : '',
    },
  ] as const;

  function closeMoreSorts() {
    trigger.current?.focus({preventScroll:true});
    setOpen(false);
  }

  function navigateMenu(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMoreSorts();
      return;
    }
    if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const index = options.findIndex(option => option === document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 :
      (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    options[next]?.focus();
  }

  return <div className="flight-result-shortcuts" role="group" aria-label="Sort flights" aria-describedby="flight-sort-fare-scope">
    {cards.map(({ sort, label, value, detail }) => {
      const active = sortBy === sort;
      const description = `${id}-${sort}`;
      return <button
        key={sort}
        type="button"
        className="flight-sort-card"
        aria-label={label}
        aria-describedby={description}
        aria-pressed={active}
        disabled={disabled || unavailable[sort]}
        onClick={() => onSort(sort)}
      >
        <span className="flight-sort-card-label">{label}</span>
        <span className="flight-sort-card-value">
          {value}{sort === 'price' && lowest?.priceMinor != null && <> <small>INR</small></>}
        </span>
        <span className="sr-only" id={description}>{value}{detail && `. ${detail}`}</span>
      </button>;
    })}
    <div className="flight-more-sorts" ref={more} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <button ref={trigger} type="button" className="flight-sort-card flight-sort-menu-trigger" aria-label="More sorts" aria-describedby={`${id}-sort-current`} aria-haspopup="menu" aria-expanded={open} aria-controls={`${id}-sort-menu`} disabled={disabled} onClick={() => setOpen(value => !value)} onKeyDown={event => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          setOpen(false);
          return;
        }
        if (!['ArrowDown','ArrowUp'].includes(event.key)) return;
        event.preventDefault();
        setOpen(true);
      }}>
        <span className="flight-sort-card-label">More sorts</span>
        <span className="flight-sort-card-value flight-sort-menu-current" id={`${id}-sort-current`}><span>{currentLabel}</span><TravelIcon name="chevron" size={15}/></span>
      </button>
      <div ref={menu} className="flight-sort-menu" id={`${id}-sort-menu`} role="menu" aria-label="Flight sort options" hidden={!open} onKeyDown={navigateMenu}>
        {flightSortChoices.map(([sort,label]) => <button key={sort} type="button" role="menuitemradio" aria-checked={sortBy === sort} tabIndex={-1} disabled={disabled || unavailable[sort]} onClick={() => {
          onSort(sort);
          closeMoreSorts();
        }}>{label}</button>)}
      </div>
    </div>
  </div>;
}

export function FlightResultColumns() {
  return <div className="flight-result-columns" aria-hidden="true">
    <span>Airline</span><div><span>Departure</span><span>Duration</span><span>Arrival</span></div><span>Price</span>
  </div>;
}
