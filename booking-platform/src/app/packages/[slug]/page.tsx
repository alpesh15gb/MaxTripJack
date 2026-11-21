import {PackageExperience} from '@/components/package-experience';
import {getPackageDetail} from '@/lib/package-detail-server';
import {pageMetadata} from '@/lib/seo';
import {publishedPackageMetadata} from '@/lib/package-metadata';
import '../packages.css';
type Props={params:Promise<{slug:string}>};
export async function generateMetadata({params}:Props){
 const {item,planningOnly}=await getPackageDetail((await params).slug);
 return planningOnly
  ? pageMetadata(`/packages/${item.slug}`,item.title,item.summary)
  : publishedPackageMetadata(item);
}
export default async function PackagePage({params}:Props){
 const {slug}=await params;
 const {item,planningOnly}=await getPackageDetail(slug);
 return <PackageExperience slug={slug} initialPackage={item} planningOnly={planningOnly}/>;
}
