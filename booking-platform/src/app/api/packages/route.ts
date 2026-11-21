import { customerPackageCatalogue, PackageCatalogueError } from '@/lib/package-catalogue';
export async function GET() {
  try { return Response.json(await customerPackageCatalogue(), {headers:{'Cache-Control':'no-store'}}); }
  catch (error) { return Response.json({error:error instanceof PackageCatalogueError ? error.message : 'Packages unavailable.'}, {status:503,headers:{'Cache-Control':'no-store'}}); }
}
