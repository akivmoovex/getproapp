# V13 G79 ActiveClinic HTTP results

Database: `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432` only.
Role: `v13_regression_213101`.
Final run marker: `G79_PREFLIGHT_OK` in `.v13-isolated-pg/g79-http10.log`.
Fixture suffix: `g78http05`.
Identity: `testing` / `moovex-platform-v7`.
Migrations 043 and 044 were present. Public booking stayed disabled.
The existing regression database and port 5432 were not used.

Leaf tests in the final run: 34 executed, 16 passed, 18 failed, 0 skipped.
ActiveClinic rows below are the ActiveClinic portion of that run. A failed node test is not counted as a pass.

## Passed

| Test | What it showed |
| --- | --- |
| AC-AUTH-04 | Forgot-password uses the testing outbox, rejects an expired token without a reset form, and signs in with the new password. |
| AC-REG-01 | Duplicate clinic phone denies a mismatched password and allows credential reuse. |
| AC-WEB-09 | The selected clinic theme is previewed and published, and a church theme is rejected. |
| G03 | A laboratory request outside the organization is denied. |
| G04 | A dispense by a staff member outside the organization is denied. |
| G05 | Paper destruction is refused and no record is written. |
| G66 | Preview stays non-persistent. `laboratory_reference_rules` and `record_migration_batches` both exist. No reference range was inserted. |
| D24 PAT-01 | An empty patient-portal registration is denied with `invalid_input`. |

## Failed

| Test | Result | Cause |
| --- | --- | --- |
| AC-WEB-08 | Failed | Section settings GET returned 404, so the edit request had no CSRF field. |
| AC-REC-02 | Failed | Patient POST did not render `Patient created`. Walk-in and service-point assertions did not run to a pass. |
| AC-REC-03 | Failed | Same patient-create page. Heart-rate and unauthorized-session assertions did not complete. |
| AC-PUB-01 | Failed | Public page did not render `Online booking is not enabled`. |
| D16 appointment | Failed | Clinic registration returned without a facility and administrator (`v13d19-clinic-a-g78http05-c1`). Appointment, collision, and cross-clinic checks did not run. |
| D25 slot capacity | Failed | `APT-01-03_NOT_IMPLEMENTED`: slot capacity lock is not in the product. |
| D25 staff overlap | Failed | `BLOCKED_APPROVAL_REQUIRED`: the overlap check is still outside the appointment transaction. |

## Scenario coverage

| Scenario | Result |
| --- | --- |
| Clinic registration | AC-REG-01 passed for duplicate-phone reuse. A fresh D16 registration did not return a facility. |
| Duplicate phone / identity | Passed in AC-REG-01. |
| Patient registration | D24 denied an empty registration. The reception patient form did not confirm creation. |
| Patient identity lookup | Not executed as its own passing test. |
| Visit creation | Not executed. |
| Reception check-in | Failed in AC-REC-02. |
| Service-point selection | Failed in AC-REC-02. |
| Queue transitions | Not executed. |
| Nursing vitals | Failed in AC-REC-03. |
| Clinical consultation | Not executed. |
| Laboratory order creation | Not executed. Cross-organization denial passed in G03. |
| Reference-rule configuration | Not executed. G66 confirmed storage exists and preview does not persist. |
| Result interpretation | Not executed. |
| Result acknowledgement | Not executed. |
| Prescription entry | Not executed. |
| Pharmacy queue eligibility | Not executed. Cross-organization dispense denial passed in G04. |
| Dispensing and remaining quantities | Not executed. |
| Duplicate dispense denial | Not executed. |
| Billing and payment | Not executed. |
| Encounter closeout | Not executed. |
| Medical-record retrieval | Not executed. |
| Retention / legal hold / consent | G05 passed: paper destruction was refused and nothing was written. |
| Facility isolation | Not executed as a separate facility-boundary test. |
| Tenant isolation | G03 and G04 passed for cross-organization denial. |

## Fixes applied before the final run

- HTTP launch may target only `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432` when `GETPRO_V13_HTTP_AUTHORIZED=1`. The old regression database and port 5432 stay refused.
- Fixture keys, emails, phones, and clinic display names are unique per authorized HTTP apply so G78 rows are not reused or deleted.
- Cleanup deletes church-owned rows and does not delete append-only `platform.audit_events`.
- Password-reset expiry moves `created_at` with `expires_at` so the existing `expires_at > created_at` constraint stays intact.
- The appointment runner creates a catalogue service before booking. D16 did not reach that step.

## Blockers

- AC-WEB-08 section id is not resolved by the section settings route (404).
- Reception patient creation does not show `Patient created`.
- Public booking copy does not show `Online booking is not enabled`.
- D16 clinic provisioning returns success without a facility.
- Slot capacity lock and in-transaction staff-overlap protection are not implemented. Those tests stay failed on purpose.
