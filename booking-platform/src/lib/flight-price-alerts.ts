import 'server-only';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import airports from '@/data/airports.json';
import {configuredAuthBaseURL} from './auth-origin';
import {customerEmail} from './customer-identity';
import {database,transaction} from './db';
import {CABINS} from './fare-calendar-core';
import {flightAlertProviderConfig,observeProductionAlertFare,type FlightAlertRoute} from './flight-alert-provider';
import {isFlightPriceAlertDate} from './flight-price-alert-dates';
import {HttpError} from './http';
import {mailReady,sendMail} from './mail';
import {day} from './providers/contracts';
import type {PricingRule} from './pricing-calculation';

const airportCodes = new Set(airports.map(airport => airport.code));
const airportCode = z.string().regex(/^[A-Z]{3}$/).refine(code=>airportCodes.has(code),'Choose an airport from the supported catalogue.');
export const flightPriceAlertSchema = z.object({from:airportCode,to:airportCode,date:day,cabin:z.enum(CABINS)}).strict()
  .refine(route=>route.from!==route.to,{path:['to'],message:'Choose different airports.'});
export const flightPriceAlertId = z.string().uuid();
export const FLIGHT_PRICE_ALERT_HEARTBEAT = 'flight-price-alerts';

const indiaDay = "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date";
const verifiedEmail = `u."emailVerified"=true AND btrim(u.email) <> '' AND lower(btrim(u.email)) NOT LIKE '%@phone.maxtravel.invalid'`;
const recipientHash = "sha256(convert_to(lower(btrim(u.email)), 'UTF8'))";
const productionRoute = `o.origin_code=a.origin_code AND o.destination_code=a.destination_code
  AND o.departure_date=a.departure_date AND o.cabin=a.cabin AND o.provider_environment='production'`;
const freshObservation = "o.observed_at BETWEEN now()-interval '30 minutes' AND now()";
const personallyEligible = `${verifiedEmail} AND a.recipient_hash=${recipientHash}
  AND COALESCE(account.active,true) AND account.company_id IS NULL`;
const alertColumns = `a.id,a.origin_code AS "from",a.destination_code AS "to",to_char(a.departure_date,'YYYY-MM-DD') AS date,a.cabin,
  a.baseline_minor,a.notified_minor,CASE
    WHEN a.notified_at IS NOT NULL THEN 'notified'
    WHEN a.dispatched_at IS NOT NULL THEN 'delivery_unknown'
    WHEN a.departure_date <= ${indiaDay} THEN 'expired'
    WHEN a.baseline_minor IS NULL THEN 'waiting'
    ELSE 'watching'
  END AS status`;

type AlertStatus = 'waiting'|'watching'|'notified'|'expired'|'delivery_unknown';
type AlertRow = FlightAlertRoute & {id:string;status:AlertStatus;baseline_minor:string|null;notified_minor:string|null};
type AlertDelivery = FlightAlertRoute & {id:string;email:string;notified_minor:string};
type AlertCheck = FlightAlertRoute & {checkedAt:Date};
function alertProjection({baseline_minor,notified_minor,...alert}:AlertRow) {
  return {...alert,baselineMinor:baseline_minor===null?null:Number(baseline_minor),notifiedMinor:notified_minor===null?null:Number(notified_minor)};
}

export function flightPriceAlertsAvailable() {
  return Boolean(process.env.DATABASE_URL && mailReady() && configuredAuthBaseURL() && flightAlertProviderConfig());
}

export async function flightPriceAlertSubscriptionsReady() {
  if (!flightPriceAlertsAvailable()) return false;
  const result = await database().query("SELECT 1 FROM worker_heartbeats WHERE name=$1 AND last_seen>now()-interval '90 seconds'",[FLIGHT_PRICE_ALERT_HEARTBEAT]);
  return result.rowCount===1;
}

export async function listFlightPriceAlerts(userId:string) {
  const result = await database().query<AlertRow>(`SELECT ${alertColumns}
    FROM flight_price_alerts a JOIN "user" u ON u.id=a.user_id
    LEFT JOIN customer_accounts account ON account.user_id=u.id
    WHERE a.user_id=$1 AND ${personallyEligible} ORDER BY a.created_at DESC LIMIT 20`,[userId]);
  return result.rows.map(alertProjection);
}

export async function subscribeFlightPriceAlert(userId:string,route:FlightAlertRoute) {
  if (!isFlightPriceAlertDate(route.date))
    throw new HttpError(400,'Choose a future departure within the next 180 days.');
  return transaction(async tx=>{
    // Serialize subscribe attempts by verified owner, including retries on multiple tabs.
    const owner = await tx.query<{hash:Buffer}>(`SELECT ${recipientHash} AS hash FROM "user" u
      LEFT JOIN customer_accounts account ON account.user_id=u.id
      WHERE u.id=$1 AND ${verifiedEmail} AND COALESCE(account.active,true) AND account.company_id IS NULL
      FOR UPDATE OF u`,[userId]);
    const hash = owner.rows[0]?.hash;
    if (!hash) throw new HttpError(403,'Flight price alerts require a verified personal email.');
    // Consent for a prior email address never transfers to a newly verified address.
    await tx.query('DELETE FROM flight_price_alerts WHERE user_id=$1 AND recipient_hash<>$2',[userId,hash]);
    const values = [userId,route.from,route.to,route.date,route.cabin];
    const existing = await tx.query<AlertRow>(`SELECT ${alertColumns} FROM flight_price_alerts a
      WHERE a.user_id=$1 AND a.origin_code=$2 AND a.destination_code=$3 AND a.departure_date=$4 AND a.cabin=$5`,values);
    if (existing.rows[0]) return alertProjection(existing.rows[0]);
    const {rows:[counts]} = await tx.query<{total:number;active:number}>(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE dispatched_at IS NULL AND departure_date>${indiaDay})::int AS active
      FROM flight_price_alerts WHERE user_id=$1`,[userId]);
    if (counts.active>=5 || counts.total>=20) throw new HttpError(409,'Remove a saved alert before adding another.');
    const created = await tx.query<AlertRow>(`INSERT INTO flight_price_alerts AS a
      (user_id,origin_code,destination_code,departure_date,cabin,id,recipient_hash,baseline_minor,baseline_at)
      SELECT $1,$2,$3,$4,$5,$6,$7,o.lowest_adult_minor,o.observed_at
      FROM (SELECT 1) AS subscription LEFT JOIN flight_fare_calendar_verified o
        ON o.origin_code=$2 AND o.destination_code=$3 AND o.departure_date=$4 AND o.cabin=$5
        AND o.provider_environment='production' AND o.lowest_adult_minor IS NOT NULL AND ${freshObservation}
      RETURNING ${alertColumns}`,[...values,randomUUID(),hash]);
    return alertProjection(created.rows[0]);
  });
}

export async function removeFlightPriceAlert(userId:string,id:string) {
  await database().query('DELETE FROM flight_price_alerts WHERE user_id=$1 AND id=$2',[userId,id]);
}

async function seedAlertBaselines() {
  await database().query(`WITH candidate AS (
    SELECT a.id,o.lowest_adult_minor,o.observed_at FROM flight_price_alerts a
    JOIN flight_fare_calendar_verified o ON ${productionRoute}
    JOIN "user" u ON u.id=a.user_id LEFT JOIN customer_accounts account ON account.user_id=u.id
    WHERE a.baseline_minor IS NULL AND a.departure_date>${indiaDay}
      AND o.lowest_adult_minor IS NOT NULL AND ${freshObservation} AND o.observed_at>=a.created_at AND ${personallyEligible}
    ORDER BY a.created_at LIMIT 20 FOR UPDATE OF a SKIP LOCKED
  ) UPDATE flight_price_alerts a SET baseline_minor=candidate.lowest_adult_minor,baseline_at=candidate.observed_at
    FROM candidate WHERE a.id=candidate.id`);
}

// Reserve the outgoing attempt atomically after rechecking consent, ownership,
// verified recipient, and fresh production fare. SMTP timeouts are ambiguous,
// so a reserved attempt is never retried automatically.
export async function dispatchObservedPriceAlert(send:(alert:AlertDelivery)=>Promise<void>,stopping=()=>false) {
  await seedAlertBaselines();
  if (stopping()) return;
  const {rows:[alert]} = await database().query<AlertDelivery>(`WITH candidate AS (
    SELECT a.id,btrim(u.email) AS email,o.lowest_adult_minor FROM flight_price_alerts a
    JOIN flight_fare_calendar_verified o ON ${productionRoute}
    JOIN "user" u ON u.id=a.user_id LEFT JOIN customer_accounts account ON account.user_id=u.id
    WHERE a.dispatched_at IS NULL AND a.departure_date>${indiaDay}
      AND o.lowest_adult_minor<a.baseline_minor AND o.observed_at>a.baseline_at
      AND ${freshObservation} AND ${personallyEligible}
    ORDER BY a.created_at LIMIT 1 FOR UPDATE OF a SKIP LOCKED
  ) UPDATE flight_price_alerts a SET dispatched_at=now(),notified_minor=candidate.lowest_adult_minor
  FROM candidate WHERE a.id=candidate.id
  RETURNING a.id,a.origin_code AS "from",a.destination_code AS "to",
    to_char(a.departure_date,'YYYY-MM-DD') AS date,a.cabin,a.notified_minor,candidate.email`);
  if (!alert || stopping()) return;
  if (!customerEmail(alert)) throw new Error('Verified flight alert address unavailable.');
  await send(alert);
  await database().query('UPDATE flight_price_alerts SET notified_at=now() WHERE id=$1',[alert.id]);
}

// Advisory lock serializes the database schedule across replicas. The prior
// attempt check is a separate statement with a fresh READ COMMITTED snapshot.
export async function reservePriceAlertSearch() {
  return transaction(async tx=>{
    const {rows:[lock]} = await tx.query<{held:boolean}>('SELECT pg_try_advisory_xact_lock(534726814,1) AS held');
    if (!lock.held) return;
    const result = await tx.query<AlertCheck>(`WITH candidate AS (
      SELECT a.origin_code,a.destination_code,a.departure_date,a.cabin
      FROM flight_price_alerts a
      JOIN "user" u ON u.id=a.user_id LEFT JOIN customer_accounts account ON account.user_id=u.id
      LEFT JOIN flight_price_alert_checks s USING(origin_code,destination_code,departure_date,cabin)
      LEFT JOIN flight_fare_calendar_verified o ON ${productionRoute}
      WHERE a.dispatched_at IS NULL AND a.departure_date>${indiaDay} AND ${personallyEligible}
        AND (s.last_started_at IS NULL OR s.last_started_at<now()-interval '6 hours')
        AND (o.observed_at IS NULL OR o.observed_at<now()-interval '6 hours')
        AND NOT EXISTS (SELECT 1 FROM flight_price_alert_checks WHERE last_started_at>now()-interval '1 minute')
      GROUP BY a.origin_code,a.destination_code,a.departure_date,a.cabin,s.last_started_at
      ORDER BY s.last_started_at NULLS FIRST,min(a.created_at) LIMIT 1
    ) INSERT INTO flight_price_alert_checks AS reserved(origin_code,destination_code,departure_date,cabin,last_started_at)
      SELECT origin_code,destination_code,departure_date,cabin,now() FROM candidate
      ON CONFLICT(origin_code,destination_code,departure_date,cabin) DO UPDATE SET last_started_at=EXCLUDED.last_started_at
      RETURNING reserved.origin_code AS "from",reserved.destination_code AS "to",
        to_char(reserved.departure_date,'YYYY-MM-DD') AS date,reserved.cabin,reserved.last_started_at AS "checkedAt"`);
    return result.rows[0];
  });
}

async function refreshAlertObservation(config: NonNullable<ReturnType<typeof flightAlertProviderConfig>>,stopping:()=>boolean) {
  const route = await reservePriceAlertSearch();
  if (!route || stopping()) return;
  const {rows:[pricingRule]} = await database().query<PricingRule>(
    "SELECT * FROM pricing_rules WHERE active=true AND product='FLIGHT' AND company_id IS NULL ORDER BY created_at DESC LIMIT 1",
  );
  if (stopping()) return;
  const amount = await observeProductionAlertFare(route,config,pricingRule);
  await database().query(`INSERT INTO flight_fare_calendar_verified(origin_code,destination_code,cabin,departure_date,lowest_adult_minor,provider_environment,observed_at)
    VALUES($1,$2,$3,$4,$5,'production',$6) ON CONFLICT(origin_code,destination_code,cabin,departure_date,provider_environment)
    DO UPDATE SET lowest_adult_minor=EXCLUDED.lowest_adult_minor,observed_at=EXCLUDED.observed_at
    WHERE flight_fare_calendar_verified.observed_at<EXCLUDED.observed_at`,[route.from,route.to,route.cabin,route.date,amount,route.checkedAt]);
}

async function sendFlightPriceAlert(alert:AlertDelivery) {
  const amount = new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(Number(alert.notified_minor)/100);
  const cabin = alert.cabin.toLowerCase().replaceAll('_',' ');
  const manage = new URL('/account?returnTo=%2Faccount%23flight-price-alerts#flight-price-alerts',configuredAuthBaseURL()!).toString();
  await sendMail(alert.email,`Max Travel fare alert for ${alert.from} to ${alert.to}`,
    `We observed a lower one-way fare of ${amount} for one adult in ${cabin} on ${alert.date} from ${alert.from} to ${alert.to}. Fares and availability can change.\n\nManage your alerts:\n${manage}`);
}

export async function runFlightPriceAlertCycle(stopping:()=>boolean) {
  const config = flightAlertProviderConfig();
  if (!config || !flightPriceAlertsAvailable() || stopping()) return;
  // A failed search must not prevent delivery of an existing fresh observation.
  await Promise.allSettled([
    refreshAlertObservation(config,stopping),
    dispatchObservedPriceAlert(sendFlightPriceAlert,stopping),
  ]).then(results => {
    if (results.some(result=>result.status==='rejected')) throw new Error('Flight price alert cycle incomplete.');
  });
}
