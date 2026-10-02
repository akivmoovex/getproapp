# ActiveClinic P06 — Diagnostics Domain Architecture

**Phase:** P06 Laboratory / Imaging / Specimens
**Created:** 2026-08-04
**Status:** Foundation implementation

## Overview

P06 extends clinical order fulfillment (P04 `clinical_orders`) with laboratory and radiology workflows: specimen collection, processing, result entry, verification, and release. No clinical interpretation inference. No fabricated reference ranges.

## Scope

- **Laboratory:** specimen collection → processing → result entry → verification → release
- **Radiology:** imaging request → study performance → report entry → verification → release
- **Critical results:** manual flagging only (no automated severity assessment)
- **Amendments:** append-only corrections; never delete released results

## Domain boundaries

**P04 clinical_orders:** creates `laboratory` / `radiology` order types
**P06 diagnostics:** fulfills those orders through specimen/result/verification lifecycle

No direct billing integration (P07). No external lab/PACS interfaces (future).

## Core entities

### Laboratory requests
- Links to `clinical_orders.id` where `order_type = 'laboratory'`
- Tracks test panel, urgency, clinical notes
- Status: `pending_collection` → `collected` → `processing` → `resulted` → `verified` → `released`

### Specimens
- Unique specimen identifier per collection
- Type: blood, urine, tissue, etc.
- Events: `collected`, `received`, `rejected` (append-only)
- Rejection reasons: hemolyzed, insufficient quantity, unlabeled, etc.

### Laboratory results
- Links to laboratory_request_id
- Multiple result_components per request (CBC → WBC, RBC, HGB, etc.)
- Each component: test_name, value, unit, reference_range (nullable or clinician-entered)
- Result entry → verification → release (separate staff/timestamps)

### Radiology requests
- Links to `clinical_orders.id` where `order_type = 'radiology'`
- Study type: X-ray, CT, MRI, ultrasound
- Status: `pending` → `in_progress` → `completed` → `verified` → `released`

### Radiology reports
- Findings text (structured or free-text)
- Impression/conclusion
- Reporting radiologist / verifying consultant
- No DICOM storage in P06 (future external PACS)

### Result verifications
- Separate table: result_id, verified_by_staff_id, verified_at
- Verifier must differ from result_entry_staff_id (enforce in service layer)

### Result amendments
- Append-only corrections
- Original result + amendment text + reason + amending_staff_id
- Never delete/overwrite released results

### Critical result alerts
- Manual flag: `is_critical` boolean on result
- Triggers alert entry (clinical_alerts with type='critical_result')
- Clinician must acknowledge + document recipient

## Schema design principles

1. **Append-only:** specimens, results, verifications, amendments never deleted
2. **Immutability:** released results cannot be edited; amendments create new rows
3. **No inference:** reference ranges nullable or manually entered; no automated severity
4. **Isolation:** tenant + facility + patient boundaries enforced via FK constraints
5. **Audit trail:** all state transitions logged with staff_id + timestamp

## Permissions

- `diagnostics.view` — view lab/radiology worklists + results
- `diagnostics.collect` — record specimen collection/receipt/rejection
- `diagnostics.result` — enter lab results / radiology reports
- `diagnostics.verify` — verify + release results (restricted to senior staff)

Grant to network+facility admins; clinicians get subset via role-based assignment.

## UI structure

### Laboratory
- `/app/diagnostics/laboratory/dashboard` — pending/in-progress/verified counts
- `/app/diagnostics/laboratory/queue` — test request worklist
- `/app/diagnostics/laboratory/worklist` — specimen processing list
- `/app/diagnostics/laboratory/request/:id` — request detail + specimen events
- `/app/diagnostics/laboratory/collect/:id` — collect specimen
- `/app/diagnostics/laboratory/receive/:id` — receive specimen at lab
- `/app/diagnostics/laboratory/reject/:id` — reject specimen with reason
- `/app/diagnostics/laboratory/result/:id` — enter test results
- `/app/diagnostics/laboratory/critical-alert/:id` — critical result notification

### Radiology
- `/app/diagnostics/radiology/dashboard` — pending/completed/verified studies
- `/app/diagnostics/radiology/queue` — imaging request worklist
- `/app/diagnostics/radiology/report/:id` — enter radiology report

### Shared
- Critical result alert modal (manual trigger)

## Non-goals (P06)

- External lab interfaces (Cerner, Epic, etc.)
- PACS/DICOM integration
- Automated critical value detection
- Reference range libraries (use nullable or manual entry)
- Billing integration (P07)
- Quality control / proficiency testing
- Specimen tracking barcodes (future)

## Testing requirements

### Foundation tests
- Create lab order → collect specimen → enter result → verify → release
- Create radiology order → enter report → verify → release
- Reject specimen with reason (blocks result entry)
- Amend released result (append-only)
- Critical result alert (manual flag + acknowledgment)
- Unauthorized result verification denial (permission check)
- Tenant/facility/patient isolation (cross-org access denial)
- CSRF protection on all POST/PUT routes
- Audit log entries for state transitions
- No BlessBoard table mutation

### UI smoke tests
- Dashboard renders pending counts
- Queue lists unactioned requests
- Request detail shows specimen events
- Collection form validates required fields
- Result entry form accepts components
- Verification requires different staff than entry
- Critical alert modal displays + acknowledges
- Mobile responsive (dashboard + queue)

## Migration sequence

1. `017_diagnostics.sql` — core schema (laboratory_requests, specimens, results, verifications)
2. `086_activeclinic_diagnostics_permissions.sql` — RBAC permissions

## Rollout safety

- No auto-enrollment: facilities manually enable diagnostics via admin
- No fabricated data: all results require manual entry
- No clinical inference: reference ranges nullable; no severity scoring
- Permissions default-deny: explicit grant required for result verification

## Future enhancements (post-P06)

- External lab interface (HL7 / FHIR)
- PACS integration (DICOM viewer)
- Barcode specimen tracking
- Automated reference range libraries
- Quality control workflows
- Billing integration (P07)
- Patient result portal (P08)
