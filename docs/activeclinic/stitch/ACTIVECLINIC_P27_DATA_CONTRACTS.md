# ActiveClinic P27 — Data Contracts

## Identity model

- `platform.identities` — credentials
- `platform.identity_product_profiles` with `profile_type = activeclinic_patient` and `product_profile_id = patients.id`
- `activeclinic.patients.platform_identity_id` — reverse link (nullable, unique when set)

## Portal-visible booking fields

request_number, booking_kind, status, facility display name, service/procedure display name, preferred/confirmed times, timezone, referral_status (public-safe), preparation_instructions (config only).

## Never expose

consultation notes, diagnoses, vitals, prescriptions, lab/imaging internals, billing audit, staff personal contacts, UUIDs in HTML where avoidable, token hashes.

## Writes

- Link identity ↔ patient (verified phone + guest token or strong match)
- Profile: preferred_name, phone/email (reverify), address, preferred_contact_method
- Cancel/reschedule requests via existing public_booking_requests statuses
