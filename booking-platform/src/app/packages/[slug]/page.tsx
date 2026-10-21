import { PackageExperience } from '@/components/package-experience';
import { privatePageMetadata } from '@/lib/seo';
import '../packages.css';
export const metadata = privatePageMetadata('Travel package details | Max Travel');
export default async function PackagePage({params}:{params:Promise<{slug:string}>}) { const {slug} = await params; return <PackageExperience slug={slug}/>; }
