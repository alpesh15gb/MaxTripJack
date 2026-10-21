import Link from 'next/link';
import {TravelHeader,TravelFooter} from '@/components/travel-shell';
import '../packages.css';
export default function PackageNotFound(){return <div className="travel-app"><TravelHeader active="packages"/><main id="main-content" className="package-main"><section className="package-state"><span className="package-eyebrow">Travel packages</span><h1>Package unavailable</h1><p>This package is no longer published or the link is not valid. No booking has been created.</p><Link className="package-button" href="/packages">Browse published packages</Link><Link href="/contact">Talk to Max Travel</Link></section></main><TravelFooter/></div>;}
