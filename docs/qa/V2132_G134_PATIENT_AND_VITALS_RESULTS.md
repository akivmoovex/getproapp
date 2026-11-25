# V2.13.2 G134 — patient portal activation and vitals correction

Branch `V13`. Writes used only `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432` after `G79_PREFLIGHT_OK` (`churches=66`, `clinics=596` on the final HTTP run). Shared PostgreSQL on port 5432 was not used. `getpro_v13_e2e_regression213101` was not used. No migration was executed. No new migration file was added. `platform.otp_challenges` was not created.

## Patient activation

Status: VERIFIED_LOCAL_G78.

Staff review now resubmits `phone_country` and `phone_national`. Before that, confirm created the patient with a null phone, and the portal match correctly returned no match. `registerPatientWithPhoneMatch` now normalizes the same structured national number and clinic country that staff registration stores. The guest-token normalizer was not changed.

The function still does not insert into `activeclinic.patients`. It locks one active unlinked patient in the same organization and healthcare organization, requires the submitted first and last names, and links `platform_identity_id`. Ambiguous rows and an already linked patient are rejected. A phone that already has an identity is rejected before the patient query, including on another clinic, without disclosing that clinic's patient.

Playwright `AC-FU-PORTAL-01` in `tests/e2e/v13/v13-ac-platform-qa.spec.js`:

1. Staff created one synthetic patient and the test read `patient_number` back. `count(*)` for that number was 1.
2. After the staff cookie was cleared, registration with that phone and name redirected to patient login.
3. Login reached `/clinics/<clinic>/patient` and the page contained `Welcome back, Portal`.
4. The profile page contained the same patient number.
5. An unknown name and a different phone on the same clinic stayed on registration with `No matching patient record` and `does not create a new patient record`.
6. The same activated phone on the other clinic was rejected (`already exists` or `No matching patient record`).
7. `count(*)` for the original patient number was still 1.

OTP was not required for this phone-and-name path and was not bypassed. D14C, D16, and AC-FU-PORTAL-04 stay blocked because `platform.otp_challenges` is absent.

| Required case | Where it ran |
|---|---|
| Existing patient success | `AC-FU-PORTAL-01` browser |
| Correct login | `AC-FU-PORTAL-01` browser |
| Record association after login | Profile contains the same `patient_number` |
| Unauthorized / wrong clinic | Other-clinic registration rejected; staff cookie cleared before the public form. Existing `PAT-01` still denies wrong-clinic registration. |
| Invalid verification | In-memory `d24-patient-portal-security.test.js` (short phone, weak password, name mismatch) |
| Duplicate identity | In-memory identity rejection, and the browser other-clinic rejection after the phone already has an identity |
| Ambiguous patient | In-memory `AMBIGUOUS_MATCH` |
| Already linked identity | In-memory linked-patient rejection |

The browser test did not insert a second matching patient in order to exercise ambiguity, already-linked replay, or a name mismatch. Those three remain unit coverage, not a second browser fixture.

## New patient policy

Status: POLICY_MISMATCH.

Unknown public users are not given a path that inserts a clinical patient. The registration page tells them patients are registered by clinic staff and that the form does not create a patient record. The original QA expectation of public self-registration is a product-policy mismatch. It is not a pass.

Activation stays separate from public appointment booking. Public booking stays disabled.

## Vitals correction

Status: VERIFIED_LOCAL_G78.

`correctVitalSignObservation` was extended with tests, not copied. It inserts a new `activeclinic.vital_sign_observations` row with `corrects_observation_id` and `correction_reason`. It does not update or delete the original. A second correction of an already corrected id returns `STALE_VERSION`. Columns already exist, so no migration was prepared.

HTTP `AC-REC-03` in `tests/v13/integration/d05RegressionRunners.js` posts the correction using the vitals page CSRF token, expects `corrected=1`, keeps `72 bpm` and `80 bpm` with `Superseded`, rejects the stale retry, and rejects the other clinic. The other clinic receives 400, 403, or 404 because a missing observation in that facility is `OBSERVATION_NOT_FOUND` (400). The foreign body must not contain the attempted `99 bpm`.

Playwright `AC-REC-03` opens the saved vitals, submits the visible correction form, and checks the original, the new value, and `Superseded`. The unauthorized session still cannot replace those values.

Unit `tests/v13/unit/g125-vitals-correction.test.js` and contract `tests/v13/contract/g122-patient-activation.test.js` still require the append-only correction and the visible reason field.

## Runs

Final HTTP run: 34 tests, 31 passed, 3 failed, 0 skipped. Failures: D14C, D16 platform OTP, D25 slot (`BLOCKED_APPROVAL_REQUIRED`). D25 overlap passed. D05, including AC-REC-03, passed. An earlier one-off D16 ActiveClinic fixture miss (`registration did not return a facility and administrator`) did not recur on this run. The fixture assertion was not weakened.

Playwright `AC-FU-PORTAL-01`, `AC-FU-WEB-02`, and `AC-REC-03` passed together, then the full ActiveClinic file passed 22 tests, 0 failed.

Database-free suite after these edits: 554 tests, 552 passed, 0 failed, 2 skipped. The two skips are the PostgreSQL identity checks when no database is configured.
