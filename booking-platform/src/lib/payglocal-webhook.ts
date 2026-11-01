import {z} from 'zod';
import type {PoolClient} from 'pg';
const id=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const schema=z.object({merchantId:id,merchantTxnId:id,gid:id,amount:z.string().regex(/^(0|[1-9]\d{0,13})(\.\d{1,2})?$/),currency:z.string().regex(/^[A-Z]{3}$/),status:z.string().regex(/^[A-Z_0-9]{1,64}$/)});
export function payGlocalWebhookHint(value:unknown,merchantId=process.env.PAYGLOCAL_MERCHANT_ID){
 const result=schema.safeParse(value);if(!result.success||!merchantId||result.data.merchantId!==merchantId)return null;
 const [whole,fraction='']=result.data.amount.split('.');return {...result.data,amountMinor:(BigInt(whole)*BigInt(100)+BigInt(fraction.padEnd(2,'0'))).toString()};
}
/** Fast durable enqueue only. Public webhook identity fields are hints, not
 * authentication. Match our reference/amount/currency, coalesce at one/minute,
 * and leave every financial state and gateway ID unchanged until server GET. */
export async function enqueuePayGlocalWebhook(tx:Pick<PoolClient,'query'>,hint:NonNullable<ReturnType<typeof payGlocalWebhookHint>>){
 const args=[hint.merchantId,hint.merchantTxnId,hint.amountMinor,hint.currency,hint.gid];
 await tx.query("UPDATE payglocal_attempts SET webhook_received_at=now(),next_check=LEAST(next_check,now()) WHERE merchant_id=$1 AND merchant_txn_id=$2 AND amount_minor=$3::bigint AND currency=$4 AND (gid IS NULL OR gid=$5) AND state<>'CAPTURED' AND (webhook_received_at IS NULL OR webhook_received_at<now()-interval '60 seconds')",args);
 // Lock the refund before its attempt, matching refund execution/finance flows.
 await tx.query("WITH eligible AS (SELECT r.id FROM refunds r JOIN payments p ON p.id=r.payment_id JOIN payglocal_refund_attempts a ON a.refund_id=r.id WHERE p.provider='PAYGLOCAL' AND r.status='PROCESSING' AND a.merchant_id=$1 AND a.merchant_txn_id=$2 AND a.amount_minor=$3::bigint AND p.currency=$4 AND (a.gid IS NULL OR a.gid=$5) FOR UPDATE OF r), hinted AS (UPDATE payglocal_refund_attempts a SET webhook_received_at=now() FROM eligible e WHERE a.refund_id=e.id AND (a.gid IS NULL OR a.gid=$5) AND (a.webhook_received_at IS NULL OR a.webhook_received_at<now()-interval '60 seconds') RETURNING a.refund_id) UPDATE refunds r SET next_check=LEAST(r.next_check,now()) FROM hinted h WHERE r.id=h.refund_id AND r.status='PROCESSING'",args);
}
