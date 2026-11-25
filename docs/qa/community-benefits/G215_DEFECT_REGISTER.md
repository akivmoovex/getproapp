# G215 defect register

The v1.2 PDF is still absent. These defects were found by reading `src/activeclinic/communityBenefits/` and the G193–G210 reports, then confirmed by tests that failed on the old behavior.

| ID | Severity | Defect | Repair |
| --- | --- | --- | --- |
| CB-01 | P1 | `GET /app/community/pass` returned membership status with no actor | The route now returns 401 unless the actor is reception, clinic admin, or the same person |
| CB-02 | P1 | Any signed-in actor could issue or rotate another person's pass | A mismatched person receives 403 and no pass is stored |
| CB-03 | P1 | Check-in GET rendered for a non-reception actor when the test actor switch was on | GET and POST both require reception or clinic admin |
| CB-04 | P1 | `status: ACTIVE` made an agreement eligible while `legalApproval` stayed `unapproved` | Eligibility requires both `ACTIVE` and `approved`. The reviewed SQL check matches that rule |
| CB-05 | P1 | Check-in used the first agreement for a clinic, so an older inactive draft hid a later approved version | `selectAgreementForClinic` chooses the highest approved in-force version |
| CB-06 | P1 | Clinic exit was not represented, so an introduction stayed eligible after the clinic relationship ended | `recordClinicExit` appends `CLINIC_EXITED` and blocks eligibility without deleting the introduction |
| CB-07 | P1 | A suspended membership could still be issued a new pass | `issuePass` returns `membership_blocked` for suspended and revoked memberships |
| CB-08 | P1 | The pass page replaced the membership status with the words `issued` and `rotated` | The page shows the stored membership status after issue and rotate |
| CB-09 | P1 | `Number("100000.5")` was rejected only inside the calculator, and a non-digit quote could be coerced | The route accepts whole ngwee only and discloses no discount for any other quote |
| CB-10 | P1 | Two ledger plans with one idempotency key were not serialized | `planLedger` and `planRefund` run on one serial key. Parallel calls keep one plan |
| CB-11 | P1 | `effectiveFrom` in the future did not block eligibility | The decision is `agreement_not_started` |
| CB-12 | P2 | An unsupported model threw out of `previewInvoice` | The preview returns `unsupported_model` and posts nothing |
| CB-13 | P2 | The link audit omitted the patient id and the presentation audit omitted the actor | Both are recorded. The token, fallback code, and diagnosis are still omitted |
| CB-14 | P2 | The reviewed schema used bare `CREATE TABLE`, had no status checks, and could not express the approval rule | The unapplied file now uses `CREATE TABLE IF NOT EXISTS`, organization ids, status checks, and `status <> 'ACTIVE' OR legal_approval = 'approved'` |

No defect was closed by deleting or weakening a test. Financial posting still returns `posting_disabled`. The schema file was not executed.
