import { PackageExperience } from '@/components/package-experience';
import { pageMetadata } from '@/lib/seo';
import './packages.css';
export const metadata = pageMetadata('/packages','Travel packages | Max Travel','Explore Max Travel packages and sample itineraries. Ask our travel team for confirmed availability and a personalised quote.');
export default function PackagesPage() { return <PackageExperience/>; }
