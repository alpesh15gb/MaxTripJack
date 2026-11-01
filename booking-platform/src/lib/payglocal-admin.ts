import {database} from './db';
import {synchronizePayGlocalPayment} from './payglocal-runtime';
import {randomUUID} from 'node:crypto';
export async function reconcilePayGlocalForAdmin(bookingId:string,actorId:string){
 await synchronizePayGlocalPayment(bookingId);
 const row=(await database().query('SELECT state FROM payglocal_attempts WHERE order_id=$1',[bookingId])).rows[0];
 await database().query("INSERT INTO audit_events(id,actor_id,action,entity_id,detail) VALUES($1,$2,'PAYGLOCAL_STATUS_CHECK',$3,$4)",[randomUUID(),actorId,bookingId,{state:row?.state??'UNCONFIRMED'}]);
 return {message:row?.state==='CAPTURED'?'Captured payment verified against PayGlocal. Check the booking for supplier confirmation.':'Payment remains unconfirmed. The original reference is preserved; no new payment was initiated. Status checks respect the reconciliation cooldown.'};
}
