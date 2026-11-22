ALTER TABLE travel_enquiries DROP CONSTRAINT travel_enquiries_service_check;
ALTER TABLE travel_enquiries ADD CONSTRAINT travel_enquiries_service_check
  CHECK (service IN ('VISA','INSURANCE','HOLIDAY','CRUISE','BUS','PARTNERSHIP'));
ALTER TABLE travel_enquiries ADD CONSTRAINT travel_enquiries_office_destination_check
  CHECK (service NOT IN ('BUS','PARTNERSHIP') OR (crm_receiver IS NULL AND crm_environment IS NULL));
