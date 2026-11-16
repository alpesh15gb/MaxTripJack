import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { administrator } from '@/lib/access';
import { database, transaction } from '@/lib/db';
import { body, failure, HttpError, json, sameOrigin } from '@/lib/http';
const inputSchema=z.object({id:z.string().uuid(),version:z.number().int().nonnegative(),code:z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/),product:z.enum(['ALL','FLIGHT','HOTEL']),discountMinor:z.number().int().min(0).max(100000000),discountBasisPoints:z.number().int().min(0).max(10000),minimumMinor:z.number().int().min(0).max(100000000),maximumDiscountMinor:z.number().int().min(1).max(100000000).nullable(),expiresAt:z.string().datetime(),active:z.boolean(),discoverable:z.boolean().optional()}).strict();
export async function GET(request:Request){try{await administrator(request,'pricing:manage');return json({rows:(await database().query('SELECT * FROM promo_codes ORDER BY created_at DESC LIMIT 200')).rows});}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 sameOrigin(request);const actor=await administrator(request,'pricing:manage');const input=await body(request,inputSchema);
 if((input.discountMinor>0)===(input.discountBasisPoints>0))throw new HttpError(400,'Choose a fixed discount or a percentage discount.');
 const result=await transaction(async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`promo:${input.id}`]);
  const found=await tx.query('SELECT * FROM promo_codes WHERE id=$1 FOR UPDATE',[input.id]);const previous=found.rows[0];
  if((previous?.version??0)!==input.version)throw new HttpError(409,'This promo code changed. Refresh the list before editing.');
  const duplicate=await tx.query('SELECT id FROM promo_codes WHERE code=$1 AND id<>$2',[input.code,input.id]);if(duplicate.rowCount)throw new HttpError(409,'This promo code already exists.');
  if(previous&&input.code!==previous.code)throw new HttpError(400,'Create a new promotion to use a different code.');
  const discoverable = input.discoverable ?? previous?.discoverable ?? false;
  const updated=await tx.query(`
   INSERT INTO promo_codes(id,code,product,discount_minor,discount_basis_points,minimum_minor,maximum_discount_minor,expires_at,active,discoverable)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
   ON CONFLICT(id) DO UPDATE SET product=excluded.product,discount_minor=excluded.discount_minor,
    discount_basis_points=excluded.discount_basis_points,minimum_minor=excluded.minimum_minor,
    maximum_discount_minor=excluded.maximum_discount_minor,expires_at=excluded.expires_at,
    active=excluded.active,discoverable=excluded.discoverable,version=promo_codes.version+1 RETURNING id,version
  `,[input.id,input.code,input.product,input.discountMinor,input.discountBasisPoints,input.minimumMinor,input.maximumDiscountMinor,input.expiresAt,input.active,discoverable]);
  await tx.query('INSERT INTO audit_events(id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[randomUUID(),actor.userId,'ADMIN_PROMO_UPDATE',input.id,{before:previous??null,after:{...input,discoverable}}]);return updated.rows[0];
 });return json(result);
}catch(e){return failure(e);}}
