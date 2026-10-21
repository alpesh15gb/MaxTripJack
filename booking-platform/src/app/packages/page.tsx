import { PackageExperience } from '@/components/package-experience';
import { pageMetadata } from '@/lib/seo';
import './packages.css';
export const metadata = pageMetadata('/packages','Travel packages | Max Travel','Explore published Max Travel itineraries, inclusions and enquiry options. Availability and final quotes confirmed by our team.');
export default function PackagesPage() { return <PackageExperience/>; }
