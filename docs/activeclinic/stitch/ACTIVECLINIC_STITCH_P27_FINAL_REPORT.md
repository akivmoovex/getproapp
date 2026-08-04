# ActiveClinic Stitch P27 — Final Report

**Verdict:** `ACTIVECLINIC_STITCH_P27_COMPLETE_WITH_DOCUMENTED_PRODUCT_GAPS`  
**Date:** 2026-08-04  
**Branch:** `V6`  
**Starting SHA:** `775131ade26997d7caf9a23dc153a01a9b2f50a8`  
**Ending SHA:** `4499b24852ee01dc06daad8e705b34396b3b97e9`  
**Production touched:** no · **Deployed:** no · **Pushed:** no

## Stability evidence

| Inspection | Count | Match |
|------------|------:|-------|
| A | 30 | — |
| B | 30 | Exact names + IDs vs A |
| P28 mixed | no | |
| Unfinished names | no | |
| Prior inventory IDs | matched | `ACTIVECLINIC_STITCH_PHASE_27.md` |

Classification: **STABLE** → implemented.

## Architecture

- Auth: platform identity credentials
- Healthcare identity: `activeclinic.patients`
- Link: `patients.platform_identity_id` + `identity_product_profiles` (`activeclinic_patient`)
- Guest booking: reuse P26 hashed access tokens (consume on successful portal link)
- Sessions: shared cookie name with typed `principalKind: patient` in `context_json`
- Staff `/app/*` refuses patient sessions without clearing the patient cookie

## Intentional product gaps

1. No SMS/email OTP delivery — contact-clinic / unavailable messaging only  
2. Visual FUNCTIONAL_ONLY vs Stitch desktop/mobile assets  
3. Booking-management portal only — not EMR  
4. Notifications screen = honesty empty / no fabricated clinician messages  
5. Phone verification screens without delivery backend → honesty states  
6. Ambiguous patient matches rejected (no auto-merge)

## Migrations

| Migration | Purpose |
|-----------|---------|
| `platform/026_activeclinic_patient_identity_profile.sql` | Patient profile type + action token purposes |
| `activeclinic/020_patient_portal_identity.sql` | `platform_identity_id`, `patient_portal_link_events` |

Checksum integrity preserved (append-only). Not applied to production.

## Tests run (local)

| Command | Result |
|---------|--------|
| `NODE_ENV=test node --test tests/activeclinic-patient-portal.test.js` | pass 5/5 |
| `... appointment-foundation + authentication-foundation + product-isolation + public-website` | pass 30/30 combined |

## Next safe phase

Inspect Public Ecosystem project for the next closed package after P27 (likely P28 if present and stable). **Do not implement in this mission.**
