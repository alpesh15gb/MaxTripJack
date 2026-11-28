import Link from 'next/link';
import { TravelIcon } from './travel-icon';

const products = [
  { id: 'hotels', label: 'Stays', icon: 'bed', href: '/hotels' },
  { id: 'flights', label: 'Flights', icon: 'airplane', href: '/flights/routes' },
  { id: 'packages', label: 'Holiday packages', icon: 'holiday', href: '/packages' },
  { id: 'activities', label: 'Tours & activities', icon: 'globe', href: '/contact?topic=activity' },
] as const;

export default function ReferenceProductNav({ active }: { active: (typeof products)[number]['id'] }) {
  return <nav className="reference-product-nav" aria-label="Travel products">
    {products.map(product => <Link href={product.href} key={product.id} aria-current={active === product.id ? 'page' : undefined}>
      <TravelIcon name={product.icon} size={24}/>{product.label}
    </Link>)}
  </nav>;
}
