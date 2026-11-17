-- No backfill or redelivery: older enquiries keep an unclassified destination.
-- New application saves explicitly select Safar; only that sender claims them.
ALTER TABLE travel_enquiries ADD COLUMN crm_receiver text CHECK(crm_receiver='safar');
ALTER TABLE travel_enquiries ADD COLUMN crm_environment text CHECK(crm_environment IN ('test','live'));
CREATE INDEX travel_enquiries_safar_queue ON travel_enquiries(crm_event_id) WHERE crm_receiver='safar';
