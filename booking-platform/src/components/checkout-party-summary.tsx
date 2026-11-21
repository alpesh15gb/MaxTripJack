type Props = {
  party: string[];
  roomIndexes?: number[];
  entered: { names: string[]; email: string; phone: string } | null;
  disabled: boolean;
  onEdit: (field: string) => void;
};

export function CheckoutPartySummary({ party, roomIndexes, entered, disabled, onEdit }: Props) {
  const person = roomIndexes ? 'guest' : 'traveller';
  return <section className="booking-payment-review checkout-party-summary" aria-labelledby="checkout-contact-preview-title">
    <h4 id="checkout-contact-preview-title">{roomIndexes ? 'Guests & contact' : 'Travellers & contact'}</h4>
    <div className="final-traveller-summary">
      <ul className="checkout-party-people">
        {party.map((type, index) => {
          const name = entered?.names[index];
          const identity = `${type[0]}${type.slice(1).toLowerCase()} ${index + 1}`;
          const room = roomIndexes ? `Room ${roomIndexes[index] + 1} · ` : '';
          return <li key={index} className="checkout-party-row">
            <div>
              <small id={`summary-person-${index}`}>{room}{identity}</small>
              <strong>{name || 'Name needed'}</strong>
            </div>
            <button type="button" className="checkout-party-edit" disabled={disabled}
              aria-label={index === 0 ? `Edit ${person} details` : `Edit ${person} ${index + 1} details`}
              aria-controls={`guest-first-${index}`} aria-describedby={`summary-person-${index}`}
              onClick={() => onEdit(`first-${index}`)}>Edit</button>
          </li>;
        })}
      </ul>
      <div className="checkout-party-row checkout-party-contact">
        <div>
          <small>Booking updates</small>
          {entered?.email && <strong>{entered.email}</strong>}
          {entered?.phone && <span>{entered.phone}</span>}
          {!entered?.email && !entered?.phone && <strong>Contact details needed</strong>}
        </div>
        <button type="button" className="checkout-party-edit" disabled={disabled} aria-label="Edit contact details"
          aria-controls="booking-contact-details" onClick={() => onEdit(entered?.email && !entered.phone ? 'phone' : 'email')}>
          Edit
        </button>
      </div>
    </div>
  </section>;
}
