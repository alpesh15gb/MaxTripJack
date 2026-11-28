import { transaction } from "./db";

export async function maintainTransientData() {
  return transaction(async tx => {
    const buckets = await tx.query("DELETE FROM request_buckets WHERE bucket<now()-interval '2 days'");
    const phoneChallenges = await tx.query("DELETE FROM auth_phone_challenges WHERE expires_at<now()-interval '1 day'");
    const quotes = await tx.query("DELETE FROM supplier_quotes q WHERE q.expires_at<now()-interval '2 days' AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.quote_id=q.id)");
    const searches = await tx.query("DELETE FROM supplier_searches s WHERE s.expires_at<now()-interval '2 days' AND NOT EXISTS(SELECT 1 FROM supplier_quotes q WHERE q.search_id=s.id)");
    const priceAlerts = await tx.query("DELETE FROM flight_price_alerts WHERE departure_date < (now() AT TIME ZONE 'Asia/Kolkata')::date-30");
    const alertChecks = await tx.query("DELETE FROM flight_price_alert_checks WHERE last_started_at<now()-interval '30 days'");
    return {buckets:buckets.rowCount,phoneChallenges:phoneChallenges.rowCount,quotes:quotes.rowCount,searches:searches.rowCount,priceAlerts:priceAlerts.rowCount,alertChecks:alertChecks.rowCount};
  });
}
