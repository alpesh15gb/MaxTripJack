import {z} from 'zod';
import {shoppingAccess} from '@/lib/guest-shopping';
import {database} from '@/lib/db';
import {json,failure} from '@/lib/http';
export async function GET(request:Request){try{await shoppingAccess(request,'catalogue');const query=z.string().trim().min(2).max(80).parse(new URL(request.url).searchParams.get('q'));const result=await database().query("SELECT min(region_id) AS region_id,min(name) AS name,min(country) AS country,min(label) AS label FROM hotel_destinations WHERE lower(name) LIKE $1 ESCAPE '!' GROUP BY lower(trim(name)),lower(trim(country)),lower(trim(label)) ORDER BY (lower(trim(country))='india') DESC,name LIMIT 20",[query.toLowerCase().replace(/[!%_]/g,'!$&')+'%']);return json({destinations:result.rows});}catch(error){return failure(error);}}
