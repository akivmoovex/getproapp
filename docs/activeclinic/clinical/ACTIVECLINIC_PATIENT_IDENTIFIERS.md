# ActiveClinic — Patient Identifiers

**Prompt:** AC-V6-C01

## Table

`activeclinic.patient_identifiers` — HCO-scoped external identifiers.

## Types

`national_id` | `passport` | `birth_certificate` | `insurance_member_number` | `facility_legacy_number` | `other`

Patients may have **zero** formal identifiers.

## Normalization

- Display spelling preserved in `identifier_value_display`
- `identifier_value_normalized` = uppercased, whitespace-stripped
- Verification (`unverified` | `verified` | `rejected` | `expired`) is separate from presence

## Uniqueness

Within one HCO, live (non-archived) rows are unique on `(identifier_type, identifier_value_normalized)`.

Same identifier in another HCO does not conflict and is not searchable cross-tenant.

## Masking

List / search contexts show masked values (last 4 characters). Full values require `manage_identifiers` (or sensitive contact policy on detail views).

## Archive

Identifiers are soft-archived (`status=archived`, `archived_at`). No hard delete. Historical rows retained.

## Non-goals

- Document image storage
- Global identifier registry
- Automatic patient merge on identifier match
