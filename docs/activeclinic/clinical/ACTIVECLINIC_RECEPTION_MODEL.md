# ActiveClinic — Reception/Queue Model

**Prompt:** AC-V6-C05  
**Status:** Backend foundation (no Stitch UI)  
**Scope:** Reception check-in and queue management — no clinical encounters or triage

## Ownership

| Field | Rule |
|-------|------|
| `organization_id` | Platform tenant FK |
| `healthcare_organization_id` | Clinical/admin owner (required) |
| `facility_id` | Required location for check-in and queue |
| `patient_id` | Required; must belong to same HCO |
| `appointment_id` | Optional for walk-in; required for scheduled check-in |
| `service_point_id` | Required queue destination |

Cross-HCO patient check-ins are rejected. BlessBoard tables are untouched.

## Tables

### `activeclinic.service_points`

Facility-scoped service points (triage, consultation, pharmacy, etc.). Each has capacity limits and accepts walk-in/scheduled flags.

### `activeclinic.queue_priorities`

HCO-scoped priority definitions. Lower `priority_level` = higher priority. Used for queue ordering.

### `activeclinic.reception_arrivals`

Immutable check-in event log. Records patient arrival with optional appointment link. Source: `scheduled_appointment`, `walk_in`, `referral`, `transfer`, `other`.

### `activeclinic.queue_entries`

Active queue entries per service point. Optimistic concurrency via `version`. Atomic `queue_number` allocation per service point per day. `queue_position` is logical ordering (governed by priority and arrival time). Status-driven lifecycle.

### `activeclinic.queue_status_events`

Append-only queue status history (`from_status` → `to_status`). Never updated or deleted.

### `activeclinic.reception_notes`

Administrative notes only. Never contains clinical observations. Categories: `general`, `complaint`, `appointment_conflict`, `payment_issue`, `special_need`, `other`.

## Statuses

`waiting` | `called` | `serving` | `paused` | `completed` | `cancelled` | `left_before_service` | `transferred`

`completed` means service point interaction finished — does not imply clinical encounter creation (out of scope for C05).

## Rules

- **Patient required**: Must already exist — no patient creation inside queue service.
- **Appointment optional**: Walk-in check-in does not require appointment; scheduled check-in does.
- **No duplicate active entry**: One patient can only have one active queue entry per service point (statuses: `waiting`, `called`, `serving`, `paused`).
- **Atomic queue position**: `queue_number` allocated via row-level lock to prevent collisions.
- **Priority governed**: Optional priority link affects queue ordering (lower level = higher priority).
- **Status transitions validated**: Append-only history; no client-authoritative queue order.
- **Capacity enforcement**: Service points can define `max_queue_capacity`; exceeded capacity blocks queue entry creation.
- **No clinical scope**: Reception/queue does not create encounters, triage records, or clinical notes.

## Explicit non-goals

- Clinical triage or assessment
- Encounter / visit clinical records
- Diagnoses, vitals, prescriptions, lab, pharmacy
- Walk-in appointment creation (deferred; only link existing appointment)
- Patient merge / portal identity
- Reception Stitch UI (later prompt)
