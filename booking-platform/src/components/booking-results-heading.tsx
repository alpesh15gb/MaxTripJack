import type {ReactNode} from 'react';

export default function BookingResultsHeading({id, title, context, status, children, level = 2}: {
  id: string;
  title: string;
  context?: string;
  status: ReactNode;
  children?: ReactNode;
  level?: 1 | 2;
}) {
  const Heading=level===1?'h1':'h2';
  return <div className="results-heading booking-results-heading">
    <Heading id={id} tabIndex={-1}>{title}</Heading>
    {context && <p className="booking-results-context">{context}</p>}
    <p className="results-count booking-results-count" role="status">{status}</p>
    {children && <div className="booking-results-meta">{children}</div>}
  </div>;
}
