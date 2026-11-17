import {database} from '../src/lib/db';
import {getCatalogueStats} from '../src/lib/hotel-catalogue-store';
import {getFlightRouteCatalogueStats} from '../src/lib/flight-route-store';
import {indexingEnabled} from '../src/lib/seo';

// Read-only aggregate counts. Never prints credentials, supplier payloads or customer data.
try {
  const [hotels, flights] = await Promise.allSettled([getCatalogueStats(), getFlightRouteCatalogueStats()]);
  const hotelStats = hotels.status === 'fulfilled' ? hotels.value : {available:false};
  const flightStats = flights.status === 'fulfilled' ? {available:true,...flights.value} : {available:false};
  console.log(JSON.stringify({
    readOnly:true, supplierRequests:false, crmRequests:false,
    publicIndexingEnabled:indexingEnabled(), hotels:hotelStats, flightRoutes:flightStats,
    note:'Eligible pages are not proof of Google indexing or rank. UAT records are not indexable.',
  },null,2));
  if (!hotelStats.available || !flightStats.available) process.exitCode = 1;
} finally { try { await database().end(); } catch { /* Missing configuration was reported above. */ } }
