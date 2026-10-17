import "server-only";
import { database } from "./db";
import { HttpError } from "./http";
export async function requestLimit(userId:string,scope:string,limit:number){const result=await database().query("INSERT INTO request_buckets(user_id,scope,bucket) VALUES($1,$2,date_trunc('minute',now())) ON CONFLICT(user_id,scope,bucket) DO UPDATE SET hits=request_buckets.hits+1 RETURNING hits",[userId,scope]);if(result.rows[0].hits>limit)throw new HttpError(429,"Too many requests. Please wait a minute and try again.");}
