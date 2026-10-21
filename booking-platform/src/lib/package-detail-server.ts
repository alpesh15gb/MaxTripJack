import 'server-only';
import {cache} from 'react';
import {notFound} from 'next/navigation';
import {fetchPackageCatalogue,PackageCatalogueError} from './package-catalogue';
import {travelPackageSchema} from './travel-packages';

/** React cache is request-scoped: page and metadata share one current public snapshot.
 * There is no cross-request cache that could retain an unpublished package. */
export const getPublishedPackage = cache(async (slug:string) => {
 try {
  const result=await fetchPackageCatalogue(slug);
  return travelPackageSchema.parse(result.packages[0]);
 } catch(error) {
  if(error instanceof PackageCatalogueError&&error.status===404)notFound();
  throw error; // Temporary failure uses the framework error boundary, never a false404.
 }
});
