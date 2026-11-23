import {PackageExperience} from '@/components/package-experience';
import PackageUnavailable from '@/components/package-unavailable';
import {getPackageDetail} from '@/lib/package-detail-server';
import {pageMetadata} from '@/lib/seo';
import {publishedPackageMetadata} from '@/lib/package-metadata';
import '../packages.css';
type Props={params:Promise<{slug:string}>};
export async function generateMetadata({params}:Props){
 const {slug}=await params;
 const detail=await getPackageDetail(slug);
 if(detail.status==='unavailable')return {...pageMetadata(`/packages/${slug}`,'Package information temporarily unavailable','Browse holiday packages or contact MaxTravel for help with this itinerary.'),robots:{index:false,follow:true}};
 const {item,planningOnly}=detail;
 return planningOnly
  ? pageMetadata(`/packages/${item.slug}`,item.title,item.summary)
  : publishedPackageMetadata(item);
}
export default async function PackagePage({params}:Props){
 const {slug}=await params;
 const detail=await getPackageDetail(slug);
 if(detail.status==='unavailable')return <PackageUnavailable/>;
 const {item,planningOnly}=detail;
 return <PackageExperience slug={slug} initialPackage={item} planningOnly={planningOnly}/>;
}
