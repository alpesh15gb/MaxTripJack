import { StitchSymbol } from './stitch-symbol';

export default function BookingActivity({ title, detail, product, takingLonger = false, id, heading = false }: {
  title: string;
  detail?: string;
  product?: 'FLIGHT' | 'HOTEL';
  takingLonger?: boolean;
  id?: string;
  heading?: boolean;
}) {
  const icon = product === 'FLIGHT' ? 'flight_takeoff' : product === 'HOTEL' ? 'hotel' : 'search';
  return (
    <div id={id} className="stitch-booking-activity" role="status" aria-label="Search and booking activity">
      <span className="stitch-activity-icon" aria-hidden="true">
        <StitchSymbol name={icon} size={22}/>
      </span>
      <div className="stitch-activity-text">
        {heading ? <h1>{title}</h1> : <strong>{title}</strong>}
        {detail && <p>{detail}</p>}
        {takingLonger && <p className="stitch-activity-delay">Still checking with the supplier. You can keep waiting or edit your search.</p>}
      </div>
    </div>
  );
}
