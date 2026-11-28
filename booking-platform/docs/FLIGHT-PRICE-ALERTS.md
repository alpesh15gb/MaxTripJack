# Flight price alerts

Flight price alerts monitor one-way INR fares for one adult on a specific airport pair, departure date and cabin. Travellers can watch departures from tomorrow through 180 days ahead in India time. A verified personal account can save up to five active alerts. Each alert records an initial price when a recent production fare is available and emails once when a fresh observed price is lower. Users manage and remove alerts in their account. Observed prices can change before booking.

## Activation

1. Apply booking migration `035-flight-price-alerts` using the existing booking migration command.
2. Obtain the approved production Air Search URL and a separate Air Search credential from the TripJack partner team. Configure `TRIPJACK_PRICE_ALERT_SEARCH_URL` with the HTTPS TripJack subdomain and its exact `/fms/v1/air-search-all` path. Store the dedicated key as `TRIPJACK_PRICE_ALERT_API_KEY`.
3. Configure transactional SMTP, enable the existing notification worker, and set `FLIGHT_PRICE_ALERTS_ENABLED=true` for both the booking app and notification worker. The API checks for a recent `flight-price-alerts` heartbeat before accepting subscriptions.

The default is disabled. The alert worker reuses recent production observations and reserves at most one additional supplier search per minute across replicas, with at least six hours between checks for each airport pair, date and cabin. Booking and review use their existing provider settings. SMTP delivery uncertainty is recorded for the traveller because retrying a reserved alert could send a duplicate.
