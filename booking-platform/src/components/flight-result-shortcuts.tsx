import { useId } from 'react';
import { durationLabel, type Flight, type FlightFare } from '@/lib/booking-presentation';
import { displayMoney } from '@/lib/display-money';
import { flightResultShortcuts } from '@/lib/flight-result-shortcuts';

type Props = {
  flights: readonly Flight[];
  group?: string;
  isCompatible: (fare: FlightFare) => boolean;
  sortBy: string;
  nonstop: boolean;
  onSort: (sort: 'price' | 'duration') => void;
  onToggleNonstop: () => void;
  disabled?: boolean;
};

export default function FlightResultShortcuts({ flights, group, isCompatible, sortBy, nonstop, onSort, onToggleNonstop, disabled }: Props) {
  const id = useId();
  if (!group || group === 'COMBO') return null;
  const options = flightResultShortcuts(flights, group, isCompatible);
  if (!options.lowest && !options.nonstop && !options.fastest && !nonstop) return null;

  const shortcuts = [
    { label: 'Lowest estimated price', result: options.lowest, active: sortBy === 'price', action: () => onSort('price') },
    { label: 'Lowest non-stop', result: options.nonstop, active: nonstop, action: onToggleNonstop },
    { label: 'Fastest', result: options.fastest, active: sortBy === 'duration', action: () => onSort('duration') },
  ];

  return <div className="flight-result-shortcuts" role="group" aria-label="Compare flight options">
    {shortcuts.map(({ label, result, active, action }, index) => <button
      key={label}
      type="button"
      aria-label={label}
      aria-describedby={`${id}-${index}`}
      aria-pressed={active}
      disabled={disabled || (!result && !(label === 'Lowest non-stop' && nonstop))}
      onClick={action}
    >
      <span className="flight-shortcut-label">{label}</span>
      {result ? <span className="flight-shortcut-metrics" id={`${id}-${index}`}>
        <strong>{result.priceMinor === null ? 'Price at review' : displayMoney(result.priceMinor)}</strong>
        {result.durationMinutes !== null && <small>{durationLabel(result.durationMinutes)}</small>}
      </span> : <span className="flight-shortcut-unavailable" id={`${id}-${index}`}>Unavailable</span>}
    </button>)}
  </div>;
}

export function FlightResultColumns() {
  return <div className="flight-result-columns" aria-hidden="true">
    <span>Airline</span><div><span>Departure</span><span>Duration</span><span>Arrival</span></div><span>Price</span>
  </div>;
}
