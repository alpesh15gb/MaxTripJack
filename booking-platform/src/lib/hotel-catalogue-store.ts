import 'server-only';
import {database} from './db';
import {catalogueEnvironment, type HotelCatalogueEnvironment} from './hotel-catalogue';
import {createHotelCatalogueRepository, type HotelCatalogueStats} from './hotel-catalogue-repository';

export class CatalogueUnavailableError extends Error {
  constructor() { super('Hotel information is temporarily unavailable.'); this.name = 'CatalogueUnavailableError'; }
}
function repository() {
  return createHotelCatalogueRepository((sql,values) => database().query(sql,values),catalogueEnvironment());
}
export async function getCatalogueHotel(hotelId: string) {
  try { return await repository().get(hotelId); } catch { throw new CatalogueUnavailableError(); }
}
export async function listCatalogueHotels(input: {page?:number;pageSize?:number;query?:string} = {}) {
  try { return await repository().list(input); } catch { return {available:false,hotels:[],total:0}; }
}
export async function getCatalogueStats(): Promise<HotelCatalogueStats> {
  try { return await repository().stats(); } catch {
    const environment: HotelCatalogueEnvironment = process.env.HOTEL_CATALOGUE_ENVIRONMENT === 'production' ? 'production' : 'uat';
    return {available:false,environment,total:0,indexableTotal:0,productionIndexableTotal:0,countriesTotal:0,countriesCompleted:0,mappedHotels:0,contentFetched:0,missingContent:0,syncComplete:false};
  }
}
export async function listCatalogueSitemapHotels(shard: number, limit = 10_000) {
  try { return await repository().sitemap(shard,limit); } catch { throw new CatalogueUnavailableError(); }
}
