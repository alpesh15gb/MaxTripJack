import type {ReactNode} from 'react';

export default function BookingResultsHeading({id, title, context, status, children}: {
  id: string;
  title: string;
  context?: string;
  status: ReactNode;
  children?: ReactNode;
}) {
  return <div className="results-heading booking-results-heading">
    <h2 id={id} tabIndex={-1}>{title}</h2>
    {context && <p className="booking-results-context">{context}</p>}
    <p className="results-count booking-results-count" role="status">{status}</p>
    {children && <div className="booking-results-meta">{children}</div>}
  </div>;
}
