import 'server-only';
import {cache} from 'react';
import {notFound} from 'next/navigation';
import {customerPackageDetail,PackageCatalogueError} from './package-catalogue';
import {travelPackageSchema} from './travel-packages';

/** React cache is request-scoped: page and metadata share one current public snapshot.
 * There is no cross-request cache that could retain an unpublished package. */
export const getPackageDetail = cache(async (slug:string) => {
 try {
  const result=await customerPackageDetail(slug);
  return {status:'ready',item:travelPackageSchema.parse(result.package),planningOnly:result.source==='trip-ideas'} as const;
 } catch(error) {
  if(!(error instanceof PackageCatalogueError))throw error;
  if(error.status===404)notFound();
  return {status:'unavailable'} as const;
 }
});
