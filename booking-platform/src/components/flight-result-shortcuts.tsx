import { useId, type ComponentProps } from 'react';
import { durationLabel, type Flight, type FlightFare } from '@/lib/booking-presentation';
import { displayMoney } from '@/lib/display-money';
import { flightResultShortcuts, type FlightSort } from '@/lib/flight-result-shortcuts';
import { TravelIcon } from './travel-shell';

type SortCard = {
  sort: FlightSort;
  label: string;
  icon: ComponentProps<typeof TravelIcon>['name'];
  value: string;
  detail?: string;
  unavailable?: boolean;
};

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
  if (!group || !flights.length) return null;
  const { lowest, fastest, earliest } = flightResultShortcuts(flights, group, isCompatible);

  const cards: SortCard[] = [
    {
      sort: 'price',
      label: 'Cheapest',
      icon: 'receipt',
      value: price(lowest?.priceMinor),
      detail: lowest?.durationMinutes != null ? durationLabel(lowest.durationMinutes) : undefined,
    },
    {
      sort: 'duration',
      label: 'Fastest',
      icon: 'clock',
      value: fastest?.durationMinutes != null ? durationLabel(fastest.durationMinutes) : 'Time unavailable',
      detail: fastest ? price(fastest.priceMinor) : undefined,
      unavailable: !fastest,
    },
    {
      sort: 'departure',
      label: 'Earliest',
      icon: 'plane',
      value: earliest?.departureLabel ?? 'Time unavailable',
      detail: earliest ? price(earliest.priceMinor) : undefined,
      unavailable: !earliest,
    },
  ];

  return <div className="flight-result-shortcuts" role="group" aria-label="Sort flights" aria-describedby="flight-sort-fare-scope">
    {cards.map(({ sort, label, icon, value, detail, unavailable }) => {
      const active = sortBy === sort;
      const description = `${id}-${sort}`;
      return <button
        key={sort}
        type="button"
        className="flight-sort-card"
        aria-label={label}
        aria-describedby={description}
        aria-pressed={active}
        disabled={disabled || unavailable}
        onClick={() => onSort(sort)}
      >
        <span className="flight-sort-card-heading">
          <span className="flight-sort-card-icon"><TravelIcon name={icon} size={16}/></span>
          <span className="flight-sort-card-label">{label}</span>
          {active && <span className="flight-sort-card-selected"><TravelIcon name="check" size={12}/></span>}
        </span>
        <span className="flight-sort-card-metrics" id={description}>
          <strong>{value}</strong>
          {sort === 'departure' && !unavailable && <span className="visually-hidden"> departure, airport local time</span>}
          {detail && <span>{detail}</span>}
        </span>
      </button>;
    })}
  </div>;
}

export function FlightResultColumns() {
  return <div className="flight-result-columns" aria-hidden="true">
    <span>Airline</span><div><span>Departure</span><span>Duration</span><span>Arrival</span></div><span>Price</span>
  </div>;
}
