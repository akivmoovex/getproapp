# ActiveClinic demo clinic audit

**Date:** 2026-08-04  
**Branch:** V6  
**Database:** `blessboard-platform-v5` / `environment_code=testing`  
**Production touched:** no

## Pre-seed finding

`ACTIVECLINIC_DEMO_CLINIC_NOT_FOUND`

- No ActiveClinic healthcare organizations existed.
- Product catalogue row `activeclinic` and deployment `activeclinic-org-v6` were missing (seed `004` pending).
- BlessBoard demo churches exist on the same testing DB; they are unrelated and were not modified.

## Canonical Juflona reference

There is **no live Juflona tenant** in the testing database.

Structural reference used:

- Public website tests (`tests/activeclinic-public-website.test.js`)
- Visibility service + P20–P26 public routes
- Stitch Public Ecosystem content depth (supported public modules)

**Not copied:** private contacts, passwords, patient/appointment/clinical/billing/audit records, real clinician biographies.

## After seed

| Clinic | Organization key | Found | Website | Directory |
|--------|------------------|-------|---------|-----------|
| ActiveClinic Demo Centre | `activeclinic-demo` | yes | published | published |
| Julflona Clinic | `julflona-clinic` | yes | published | published |

### ActiveClinic Demo Centre

- Facility: ActiveClinic Demo Centre – Lusaka
- Public URL: `/clinics/activeclinic-demo`
- Admin display name: ActiveClinic Demo Administrator
- Admin email: `demo.admin@activeclinic.example`
- Role: `activeclinic_facility_admin` (Clinic Administrator scope)
- Password: not set by default (requires `--reset-demo-password` with an explicit demo password option)

### Julflona Clinic

- Facility: Julflona Clinic – Lusaka
- Public URL: `/clinics/julflona-clinic`
- Admin display name: Julflona Clinic Administrator
- Admin email: `julflona@gmail.com`
- Role: `activeclinic_facility_admin`
- Requested credential outcome: `JULFLONA_PASSWORD_POLICY_BLOCKED` (global min length 10)
- Temporary policy-compliant secret issued once via seed handoff; `must_change_password=true`
- Login verified via authenticated HTTP session (redirect `/app` after clearing must-change for org-context check; production handoff keeps must-change)

## Safety

- No BlessBoard behaviour changed
- No production database writes intended for production identity
- No password hashes committed
- No plaintext secrets in this document
