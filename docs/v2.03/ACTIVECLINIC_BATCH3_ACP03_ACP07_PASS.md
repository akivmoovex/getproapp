# ActiveClinic V2.03 Batch 3 — AC-P03 + AC-P07 Leaf Pass

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_BATCH3_ACP03_ACP07_PASS` |
| **Date** | 2026-09-26 |
| **Branch** | `V10` |
| **Precondition** | `V2_03_BATCH3_ACN17_ACN19_PASS` (`4550b501`) |
| **Stitch project** | `3741389873539108242` |
| **Verdict** | `V2_03_BATCH3_ACP03_ACP07_PASS` |

---

## Ownership (reused)

| Screen | Route | View | Service | Auth |
|--------|-------|------|---------|------|
| **AC-P03** My Appointments | `GET /clinics/:clinicKey/patient/bookings` | `patient/bookings.ejs` | `listPatientBookings` | Patient portal session |
| **AC-P07** Profile & Contact | `GET/POST /clinics/:clinicKey/patient/profile` | `patient/profile.ejs` | `getPatientProfile` / `updatePatientProfile` | Patient portal session |

**Untouched frozen staff surfaces:** Patients workspace, Appointment Detail, Clinical encounter shell, Billing, Facilities, staff tokens/nav.

**Cache bump:** patient portal `ASSET_VERSION` → `v2-03-b3-acp03-07-01` in `renderActiveClinicPatient.js`.

---

## Stitch references

| Code | Desktop | Mobile |
|------|---------|--------|
| AC-P03 | `e5bc2a1492da4e1fb675d14c884ec059` | `2ea963ee11384dd680b21978b3f56ea1` |
| AC-P07 | `e042789d436d48e8843e4bb3f99f379b` | `c15fcece57e2481cb4d5ff988b325730` |

---

## Intentional omissions (no schema invented)

- AC-P03: schedule calendar widget, visit summaries, lab notes, policy FAQ blocks
- AC-P07: pronouns, preferred language, landline, emergency contact block

Wired existing backend fields previously missing from the profile form: postal code, country code, preferred contact method.

---

## Tests

- `tests/activeclinic-batch3-acp03-acp07.test.js` — **pass** (markers + HTTP render/RBAC isolation + profile field write)
- Portal regressions exercised: login/session, bookings status filter, link-guest-booking, forgot-password, verify-phone, CSRF — **pass**
- MF08 static chrome + staff isolation + 390px register markers — **pass**

**Pre-existing (not introduced by this leaf):** guest/phone-first register HTTP posts that still send legacy `phone` instead of `phone_national` fail 400 in `activeclinic-patient-portal.test.js` and `activeclinic-mf08-patient-registration.test.js`. Confirmed identical failure with this leaf diff stashed.

---

## Production / deploy

**Not pushed. Not deployed.**
