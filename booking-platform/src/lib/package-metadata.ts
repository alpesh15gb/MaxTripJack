import {pageMetadata} from './seo';
import {packageSlug,type TravelPackage} from './travel-packages';
export function publishedPackageMetadata(item:TravelPackage){
 const slug=packageSlug.parse(item.slug);
 // Package paths remain outside the indexing registry. No launch gate is changed.
 return pageMetadata(`/packages/${slug}`,`${item.title} | Travel package`,item.summary);
}
