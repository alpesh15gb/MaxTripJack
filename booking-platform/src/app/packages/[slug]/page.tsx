import {PackageExperience} from '@/components/package-experience';
import {getPublishedPackage} from '@/lib/package-detail-server';
import {publishedPackageMetadata} from '@/lib/package-metadata';
import '../packages.css';
type Props={params:Promise<{slug:string}>};
export async function generateMetadata({params}:Props){return publishedPackageMetadata(await getPublishedPackage((await params).slug));}
export default async function PackagePage({params}:Props){
 const {slug}=await params;const item=await getPublishedPackage(slug);
 return <PackageExperience slug={slug} initialPackage={item}/>;
}
