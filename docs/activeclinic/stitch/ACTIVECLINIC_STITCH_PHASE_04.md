# ActiveClinic Stitch — Phase 4 (`P04`)

**Exact Stitch phase label:** `P04`
**Module:** Triage / Consultation / Clinical notes
**Audited:** 2026-08-04
**Screens:** 12 (Desktop 10 · Mobile 2 · Tablet 0)

Clinical queue, triage, vitals, consultation, orders

## Status summary

| Status | Count |
|--------|------:|
| SCHEMA_BLOCKED | 12 |

## Screens

| Exact name | ID | Form | Viewport | Route | View | Loader | Write | Permission | Backend | Status | Notes |
|------------|----|------|----------|-------|------|--------|-------|------------|---------|--------|-------|
| P04 – Clinical Escalation Alert | `99757cfd7d3747d490f00ac342faa519` | DESKTOP | 2560×2048 | `/app/… (not implemented)` | `—` | `—` | `—` | `TBD` | BLOCKED | SCHEMA_BLOCKED | No ActiveClinic schema/services for this clinical/finance module |
| P04 – Clinical Queue – Desktop | `b8d47f05a83c4959ac2d3d6ca83c7dfb` | DESKTOP | 2560×2048 | `/app/… (not implemented)` | `—` | `—` | `—` | `TBD` | BLOCKED | SCHEMA_BLOCKED | No ActiveClinic schema/services for this clinical/finance module |
| P04 – Clinical Queue – Mobile | `16897ac752a94750bf00225db66ff768` | MOBILE | 780×1768 | `/app/… (not implemented)` | `—` | `—` | `—` | `TBD` | BLOCKED | SCHEMA_BLOCKED | No ActiveClinic schema/services for this clinical/finance module |
| P04 – Consultation Workspace – Desktop | `5e4dbc7265ad4e17b060b1f641996db3` | DESKTOP | 2560×2048 | `/app/… (not implemented)` | `—` | `—` | `—` | `TBD` | BLOCKED | SCHEMA_BLOCKED | No ActiveClinic schema/services for this clinical/finance module |
| P04 – Consultation Workspace – Mobile | `15c6c639c2b04bbda97b54f127c500f8` | MOBILE | 780×1768 | `/app/… (not implemented)` | `—` | `—` | `—` | `TBD` | BLOCKED | SCHEMA_BLOCKED | No ActiveClinic schema/services for this clinical/finance module |
| P04 – Create Laboratory Request | `969bbfbdf9634dbc8af598ec2277e92f` | DESKTOP | 2560×2536 | `/app/… (not implemented)` | `—` | `—` | `—` | `TBD` | BLOCKED | SCHEMA_BLOCKED | No ActiveClinic schema/services for this clinical/finance module |
| P04 – Create Prescription | `ee9bf2322b924cd79e86619a4635f702` | DESKTOP | 2560×2048 | `/app/… (not implemented)` | `—` | `—` | `—` | `TBD` | BLOCKED | SCHEMA_BLOCKED | No ActiveClinic schema/services for this clinical/finance module |
| P04 – Create Radiology Request | `bc4ffd8f0e8c44f48f38cc15a069656a` | DESKTOP | 2560×2048 | `/app/… (not implemented)` | `—` | `—` | `—` | `TBD` | BLOCKED | SCHEMA_BLOCKED | No ActiveClinic schema/services for this clinical/finance module |
| P04 – Diagnosis Entry | `33a522e2f4eb45c9bdbede9ba34e0bee` | DESKTOP | 2560×2048 | `/app/… (not implemented)` | `—` | `—` | `—` | `TBD` | BLOCKED | SCHEMA_BLOCKED | No ActiveClinic schema/services for this clinical/finance module |
| P04 – Nursing Intake – Desktop | `7959616d1673403ba3bf6ff71d18a77b` | DESKTOP | 2560×2048 | `/app/… (not implemented)` | `—` | `—` | `—` | `TBD` | BLOCKED | SCHEMA_BLOCKED | No ActiveClinic schema/services for this clinical/finance module |
| P04 – Triage Assessment – Desktop | `3c8f7b43b7984718acf661e381c1e6f7` | DESKTOP | 2560×2146 | `/app/… (not implemented)` | `—` | `—` | `—` | `TBD` | BLOCKED | SCHEMA_BLOCKED | No ActiveClinic schema/services for this clinical/finance module |
| P04 – Vital Signs Entry – Desktop | `dede5e72277d413497e1f870f6b4a0e1` | DESKTOP | 2560×2048 | `/app/… (not implemented)` | `—` | `—` | `—` | `TBD` | BLOCKED | SCHEMA_BLOCKED | No ActiveClinic schema/services for this clinical/finance module |

## Blocker

**SCHEMA_BLOCKED / CLINICAL_SAFETY:** ActiveClinic migrations currently cover organizations, facilities, staff, RBAC, and patients only. No appointments, queues, clinical notes, pharmacy, lab, or billing tables exist under `db/migrations/activeclinic/`.

Safe overnight action: do not invent clinical schemas or fake operational data. Record gaps; continue independent screens in other phases.

## Checkpoint

See `ACTIVECLINIC_STITCH_IMPLEMENTATION_LEDGER.md`.
