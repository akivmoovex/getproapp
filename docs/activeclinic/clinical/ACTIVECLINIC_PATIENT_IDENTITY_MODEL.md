# ActiveClinic — Patient Identity Model

**Prompt:** AC-V6-C01  
**Status:** Backend foundation complete  
**Scope:** Administrative patient identity only (no clinical records)

## Ownership

- Every patient belongs to exactly one ActiveClinic **healthcare organization (HCO)**.
- Platform `organization_id` is retained for tenancy FKs; clinical ownership is the HCO.
- A patient may be associated with multiple **facilities** inside that HCO via `patient_facility_links`.
- Cross-organization patient sharing is **not** implemented.
- The same real person in two unrelated HCOs is two separately governed patient records.

## Identity boundaries

| Concept | Table / model | Role |
|---------|---------------|------|
| Login principal | `platform.identities` | Authentication only |
| Staff subject | `activeclinic.staff_members` | Authorization / employment |
| Patient record | `activeclinic.patients` | Healthcare recipient (administrative) |
| BlessBoard member | `blessboard.members` / users | Unchanged; never used as patients |

- A patient does **not** require a platform login identity.
- Portal identity linking is deferred to a governed future workflow.
- Patients are never staff and never BlessBoard members.

## Core table: `activeclinic.patients`

Key fields: demographics, optional contacts/address, `patient_number`, `status`, `deceased_at`, `archived_at`, actor staff FKs.

Statuses: `active` | `inactive` | `deceased` | `archived`  
Status is **not** clinical condition.

## Patient number

Format: **`AC-YYYY-NNNNNN`** (e.g. `AC-2026-000001`)

- Unique within HCO
- Generated server-side via `patient_number_counters` + row lock
- Immutable after create
- Not derived from national ID or phone
- Not an authentication secret

## Unknown / unidentified patients

**Deferred.** Ordinary registration requires first + last name. No fabricated DOBs or national IDs.

## Deferred

- Patient merge
- Portal identities
- Clinical encounters / diagnoses / notes
- Document scans / biometrics
- National registry integration
- Guardianship / legal consent authority
