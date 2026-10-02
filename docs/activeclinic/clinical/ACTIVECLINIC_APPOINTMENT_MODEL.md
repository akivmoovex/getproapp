# ActiveClinic — Appointment Model

**Prompt:** AC-V6-C03  
**Status:** Backend foundation (no Stitch UI)  
**Scope:** Administrative scheduling only — never creates clinical encounters

## Ownership

| Field | Rule |
|-------|------|
| `organization_id` | Platform tenant FK |
| `healthcare_organization_id` | Clinical/admin owner (required) |
| `facility_id` | Required booking location |
| `patient_id` | Required; must belong to same HCO |
| `service_type_id` | Required catalogue entry for the HCO |
| `assigned_staff_id` | Optional unless service requires staff |

Cross-HCO patient appointments are rejected. BlessBoard tables are untouched.

## Tables

### `activeclinic.appointment_service_types`

HCO-scoped service catalogue (consultation, follow-up, etc.). Not clinical procedure coding.

### `activeclinic.appointments`

Primary booking row. Optimistic concurrency via `version`. Soft status transitions only — no hard delete.

### `activeclinic.appointment_status_events`

Append-only history (`from_status` → `to_status`). Never updated or deleted.

### `activeclinic.appointment_reminder_requests`

Reminder **metadata** only. Allowed delivery states: `not_requested`, `queued`, `unavailable`, `failed`. **Never** `sent` — no SMS/email provider in C03.

## Statuses

`scheduled` | `confirmed` | `checked_in` | `in_progress` | `completed` | `cancelled` | `no_show` | `rescheduled`

`in_progress` / `completed` are reserved for future encounter workflow and are not driven by clinical charting in C03.

## Explicit non-goals

- Encounter / visit clinical records
- Diagnoses, notes, prescriptions, lab, pharmacy, billing
- External reminder delivery
- Appointment Stitch UI (later prompt)
- Patient merge / portal identity
