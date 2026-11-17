/** Separate queue boundaries: this worker cannot claim ordinary booking events. */
export const claimSafarEnquirySql=`UPDATE outbox_events SET lease_token=$1,lease_until=now()+interval '60 seconds'
WHERE id=(SELECT o.id FROM outbox_events o JOIN travel_enquiries e ON e.crm_event_id=o.id
 WHERE o.event_type='enquiry.created' AND e.crm_receiver='safar' AND e.crm_environment IN ('test','live') AND e.id=o.aggregate_id
 AND o.delivered_at IS NULL AND o.attempts<12 AND o.next_attempt<=now()
 AND (o.lease_until IS NULL OR o.lease_until<now())
 ORDER BY o.created_at FOR UPDATE OF o SKIP LOCKED LIMIT 1) RETURNING outbox_events.*,
 (SELECT crm_environment FROM travel_enquiries WHERE crm_event_id=outbox_events.id) AS crm_environment`;

// Lock in the same order as staff retry (enquiry, then outbox). Validate and lock
// the current lease before writing either receipt metadata or delivery status.
export const recordSafarEnquirySql=`WITH locked_enquiry AS (
 SELECT crm_event_id FROM travel_enquiries WHERE crm_receiver='safar' AND crm_event_id=$1 AND crm_environment=$5 FOR UPDATE
), owned AS (
 SELECT o.id FROM outbox_events o JOIN locked_enquiry e ON e.crm_event_id=o.id
 WHERE o.id=$1 AND o.lease_token=$2 AND o.lease_until>clock_timestamp()
 AND o.event_type='enquiry.created' AND o.delivered_at IS NULL FOR UPDATE OF o
), saved AS (
 UPDATE travel_enquiries SET crm_reference=$3,crm_lead_id=$4,updated_at=now()
 WHERE crm_event_id IN (SELECT id FROM owned)
 RETURNING crm_event_id
) UPDATE outbox_events SET delivered_at=now(),lease_token=NULL,lease_until=NULL
 WHERE id IN (SELECT crm_event_id FROM saved) AND lease_token=$2`;

export const deferSafarEnquirySql=`UPDATE outbox_events SET attempts=attempts+1,next_attempt=now()+($3 * interval '1 second'),lease_token=NULL,lease_until=NULL
 WHERE id=$1 AND lease_token=$2 AND lease_until>clock_timestamp() AND event_type='enquiry.created' AND delivered_at IS NULL
 AND EXISTS(SELECT 1 FROM travel_enquiries WHERE crm_event_id=$1 AND crm_receiver='safar')`;

export type SafarEnquiryJob={id:string;aggregate_id:string;event_type:string;delivery_payload:string|null;attempts:number;crm_environment:string|null};
export function frozenSafarEnquiry(job:SafarEnquiryJob){
 if(job.event_type!=='enquiry.created'||!job.delivery_payload||Buffer.byteLength(job.delivery_payload,'utf8')>65536)throw Error('Expected a bounded frozen enquiry.');
 const event=JSON.parse(job.delivery_payload);
 if(event?.schemaVersion!==2||!['test','live'].includes(event.environment)||event.environment!==job.crm_environment||event.eventType!=='enquiry.created'||event.eventId!==job.id||event.aggregateId!==job.aggregate_id||event.payload?.enquiryId!==job.aggregate_id||!/^ME-[A-F0-9]{12}$/.test(event.payload?.reference??''))throw Error('Frozen enquiry identity mismatch.');
 return {body:job.delivery_payload,reference:event.payload.reference as string,environment:event.environment as 'test'|'live'};
}
