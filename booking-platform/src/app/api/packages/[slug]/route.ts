import { fetchPackageCatalogue, PackageCatalogueError } from '@/lib/package-catalogue';
export async function GET(_request: Request, {params}: {params:Promise<{slug:string}>}) {
  try { const {slug} = await params; const {packages:[item]} = await fetchPackageCatalogue(slug); return Response.json({package:item}, {headers:{'Cache-Control':'no-store'}}); }
  catch (error) { return Response.json({error:error instanceof PackageCatalogueError ? error.message : 'Packages unavailable.'}, {status:error instanceof PackageCatalogueError ? error.status : 503,headers:{'Cache-Control':'no-store'}}); }
}
