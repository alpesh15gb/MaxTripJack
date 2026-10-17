import { z } from "zod";
import { principal } from "@/lib/access";
import { database } from "@/lib/db";
import { json,failure } from "@/lib/http";
export async function GET(request:Request){try{await principal(request);const query=z.string().trim().min(2).max(80).parse(new URL(request.url).searchParams.get("q"));const result=await database().query("SELECT region_id,name,country,label FROM hotel_destinations WHERE lower(name) LIKE $1 ESCAPE '!' ORDER BY country='INDIA' DESC,name LIMIT 20",[query.toLowerCase().replace(/[!%_]/g,"!$&")+"%"]);return json({destinations:result.rows});}catch(e){return failure(e);}}
