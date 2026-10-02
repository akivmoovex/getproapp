# ActiveClinic P27 — Implementation Report

**Phase:** P27 Juflona Patient Portal  
**Stitch project:** `projects/17813606734422395399`  
**Stability:** STABLE (Inspection A = Inspection B = 30 screens)  
**Implementation date:** 2026-08-04  
**Visual status:** FUNCTIONAL_ONLY (no pixel MATCHED claims)

## What shipped

| Area | Implementation |
|------|----------------|
| Identity | `platform.identities` + `identity_product_profiles` type `activeclinic_patient` + `patients.platform_identity_id` |
| Migrations | platform `026`, activeclinic `020` |
| Auth | Tenant-scoped `/clinics/:clinicKey/patient/*`; session `context_json.principalKind=patient` |
| Registration | Guest-token activation + phone-match activation (no arbitrary clinical create) |
| Dashboard | Real patient-scoped bookings grouped pending / upcoming / past |
| Bookings | List + detail by request number; cancel/reschedule request (not auto-confirm) |
| Profile | Safe contact fields only |
| Password | Forgot/reset honesty path — no SMS/email delivery claims |
| Session isolation | Patient sessions redirected away from `/app` without cookie clear |
| UI | Lightweight `ac-patient.css` / inline render helpers — not staff shell |

## Canonical routes

All under `/clinics/:clinicKey/patient/...` (no competing `/portal` family).

## Screen status summary

All 30 Stitch screens: **PARTIAL** / **FUNCTIONAL_ONLY**.  
Notifications, verify-phone OTP delivery, and offline pattern screens are honesty/placeholder where delivery/offline infra is absent.

## Security posture

- Ownership via linked `platform_identity_id` + session patient context (not phone-alone)
- CSRF on state-changing POSTs
- Rate limits on login/register/reset
- Enumeration-safe forgot-password messaging
- Unauthorized booking → privacy-safe not-found
- No clinical notes/diagnoses/prescriptions exposed

## Tests

`tests/activeclinic-patient-portal.test.js` — login, session isolation, guest link, forgot-password honesty, CSRF.
