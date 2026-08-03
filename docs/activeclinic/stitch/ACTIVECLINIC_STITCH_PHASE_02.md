# ActiveClinic Stitch — Phase 2 (`P02`)

**Exact Stitch phase label:** `P02`
**Module:** Patients
**Audited:** 2026-08-04
**Screens:** 18 (Desktop 11 · Mobile 7 · Tablet 0)

Patient list, registration wizard, profile, edit, duplicates, print card, shared states

## Status summary

| Status | Count |
|--------|------:|
| PARTIAL | 17 |
| PRODUCT_DECISION | 1 |

## Screens

| Exact name | ID | Form | Viewport | Route | View | Loader | Write | Permission | Backend | Status | Notes |
|------------|----|------|----------|-------|------|--------|-------|------------|---------|--------|-------|
| P02 – Duplicate Patient Warning | `91e41fecc2b64496893b52317b7ab985` | DESKTOP | 2560×2048 | `POST /app/patients (duplicate gate)` | `patient-form / inline warning` | `activeClinicPatientDuplicateService` | `register with override` | `patients.write + override` | READY | PARTIAL |  |
| P02 – Edit Patient Details – Desktop | `0c3315d05469499d9b645bc7978001bf` | DESKTOP | 2560×2048 | `GET/POST /app/patients/:patientNumber/edit` | `views/activeclinic/app/patient-form-content.ejs` | `loadActiveClinicPatientFormScreen` | `updateActiveClinicPatient` | `patients.write` | READY | PARTIAL |  |
| P02 – Edit Patient Details – Mobile | `4c6a5fe1c21c46709679f3707b8bf4dc` | MOBILE | 780×2496 | `GET/POST /app/patients/:patientNumber/edit` | `views/activeclinic/app/patient-form-content.ejs` | `loadActiveClinicPatientFormScreen` | `updateActiveClinicPatient` | `patients.write` | READY | PARTIAL |  |
| P02 – Patient List – Desktop | `5a6728d97b674200823562bb015e10ed` | DESKTOP | 2560×2048 | `GET /app/patients` | `views/activeclinic/app/patients-list-content.ejs` | `loadActiveClinicPatientListScreen` | `—` | `patients.read` | READY | PARTIAL |  |
| P02 – Patient List – Mobile | `58bd5e04f71340ff8d067721eb5562d4` | MOBILE | 780×1768 | `GET /app/patients` | `views/activeclinic/app/patients-list-content.ejs` | `loadActiveClinicPatientListScreen` | `—` | `patients.read` | READY | PARTIAL |  |
| P02 – Patient Profile Overview – Desktop | `1a15f0bf4e564c4993ca33aa2d578a58` | DESKTOP | 2560×2208 | `GET /app/patients/:patientNumber` | `views/activeclinic/app/patient-profile-content.ejs` | `loadActiveClinicPatientProfileScreen` | `—` | `patients.read` | READY | PARTIAL |  |
| P02 – Patient Profile Overview – Mobile | `99eb441b48a24fa19855e76669c0da86` | MOBILE | 780×2072 | `GET /app/patients/:patientNumber` | `views/activeclinic/app/patient-profile-content.ejs` | `loadActiveClinicPatientProfileScreen` | `—` | `patients.read` | READY | PARTIAL |  |
| P02 – Patient Registration Success – Desktop | `cd688e761cca43a1af299769014cb5f0` | DESKTOP | 2560×2048 | `GET /app/patients/:patientNumber?registered=1` | `views/activeclinic/app/patient-success-content.ejs` | `loadActiveClinicPatientProfileScreen` | `—` | `patients.read` | READY | PARTIAL |  |
| P02 – Patient Registration Success – Mobile | `b9615559155d41d591dbb91e18c6a090` | MOBILE | 780×1794 | `GET /app/patients/:patientNumber?registered=1` | `patient-success-content.ejs` | `loadActiveClinicPatientProfileScreen` | `—` | `patients.read` | READY | PARTIAL |  |
| P02 – Patient Shared States – Desktop | `f98b2e6f2a4a4953a4d811af7b3737a2` | DESKTOP | 2560×2048 | `patients empty/error/restricted` | `patients-list + access-state` | `loadActiveClinicPatientListScreen` | `—` | `patients.read` | PARTIAL | PARTIAL | Real data where available; Stitch sample KPIs/clinical fields not fabricated |
| P02 – Print Patient Card Preview | `3c113fe684604dfcaeb8f6b2c071a6ca` | DESKTOP | 2560×2048 | `—` | `—` | `—` | `—` | `patients.read` | BLOCKED | PRODUCT_DECISION | Needs product decision before implementation |
| P02 – Register Patient Contact – Desktop | `e1ef5e5d8a1840bcbf1f4dc859f7b812` | DESKTOP | 2560×2048 | `GET/POST /app/patients/new (contact section)` | `views/activeclinic/app/patient-form-content.ejs` | `loadActiveClinicPatientFormScreen` | `registerActiveClinicPatient` | `patients.write` | READY | PARTIAL |  |
| P02 – Register Patient Contact – Mobile | `44fb7852e24f4f7f9f6b355a195fd250` | MOBILE | 780×2158 | `GET/POST /app/patients/new` | `views/activeclinic/app/patient-form-content.ejs` | `loadActiveClinicPatientFormScreen` | `registerActiveClinicPatient` | `patients.write` | READY | PARTIAL |  |
| P02 – Register Patient Emergency and Medical – Desktop | `026d2e6c69cd4181a282213ba1bb55da` | DESKTOP | 2560×3136 | `GET/POST /app/patients/new + emergency-contacts` | `patient-form-content.ejs` | `loadActiveClinicPatientFormScreen` | `registerActiveClinicPatient / addEmergencyContact` | `patients.write` | PARTIAL | PARTIAL | Real data where available; Stitch sample KPIs/clinical fields not fabricated |
| P02 – Register Patient Emergency and Medical – Mobile | `7a495a471fed49b098de3c1605eda76e` | MOBILE | 780×1768 | `GET/POST /app/patients/new` | `patient-form-content.ejs` | `loadActiveClinicPatientFormScreen` | `registerActiveClinicPatient` | `patients.write` | PARTIAL | PARTIAL | Real data where available; Stitch sample KPIs/clinical fields not fabricated |
| P02 – Register Patient Identity – Desktop | `40d2005b64864f35ac8df831ddae7084` | DESKTOP | 2560×2048 | `GET/POST /app/patients/new` | `views/activeclinic/app/patient-form-content.ejs` | `loadActiveClinicPatientFormScreen` | `registerActiveClinicPatient` | `patients.write` | READY | PARTIAL |  |
| P02 – Register Patient Review – Desktop | `8ef4b4d96f1f4224994d0c627bb7550e` | DESKTOP | 2560×2098 | `GET/POST /app/patients/new (review)` | `patient-form-content.ejs` | `loadActiveClinicPatientFormScreen` | `registerActiveClinicPatient` | `patients.write` | PARTIAL | PARTIAL | Real data where available; Stitch sample KPIs/clinical fields not fabricated |
| P02 – Register Patient Review – Mobile | `a6d496f38f8e4d5cb8eb4d91667c6db7` | MOBILE | 780×2332 | `GET/POST /app/patients/new` | `patient-form-content.ejs` | `loadActiveClinicPatientFormScreen` | `registerActiveClinicPatient` | `patients.write` | PARTIAL | PARTIAL | Real data where available; Stitch sample KPIs/clinical fields not fabricated |

## Checkpoint

See `ACTIVECLINIC_STITCH_IMPLEMENTATION_LEDGER.md`.
