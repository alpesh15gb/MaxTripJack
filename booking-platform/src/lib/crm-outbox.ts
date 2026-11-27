import type {PoolClient} from 'pg';

export const CRM_HTTP_TIMEOUT_MS = 15_000;
const LEASE_DURATION_MS = 60_000;
const ACK_MARGIN_MS = 15_000;

/** An attempt counts before dispatch. A timed-out database reply never permits
 * sending, and a late renewal cannot resurrect another worker's lease. */
export async function reserveCrmDispatch(client: Pick<PoolClient,'query'>, eventId: string, lease: string) {
  const started = performance.now();
  const reservation = await client.query(`
    UPDATE outbox_events SET attempts=attempts+1,lease_until=clock_timestamp()+($3 * interval '1 millisecond')
    WHERE id=$1 AND lease_token=$2 AND lease_until>clock_timestamp() AND delivered_at IS NULL AND attempts<12
  `, [eventId,lease,LEASE_DURATION_MS]);
  return reservation.rowCount === 1 && performance.now() - started < LEASE_DURATION_MS - CRM_HTTP_TIMEOUT_MS - ACK_MARGIN_MS;
}
