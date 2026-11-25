# V2.13.2 G143 — QA acceptance matrix

Source: ActiveClinic report of 23 November 2026, plus the BlessBoard regression sheet in `docs/qa/V2132_G143_QA_EXECUTION_GUIDE.md`. A local pass is not hosted QA and is not a release approval.

| QA ID | Feature | Role | Status | Evidence | Blocker |
| --- | --- | --- | --- | --- | --- |
| AC-FU-PORTAL-01 | Staff-created patient activates one portal account | Admin, then patient | VERIFIED_LOCAL_E2E | Playwright `AC-FU-PORTAL-01` | Hosted identities not provisioned by this cycle |
| AC-FU-PORTAL-02 | Unknown public registration | Visitor | POLICY_MISMATCH | Same test shows the no-match copy and no new chart | Approved policy does not create a patient |
| AC-FU-PORTAL-03 | Public booking | Visitor | BLOCKED_BY_POLICY | `AC-PUB-01` | Booking stays disabled |
| AC-FU-PORTAL-04 | Patient OTP recovery | Patient | BLOCKED_BY_MIGRATION | D14C and D16 platform OTP fail | `platform.otp_challenges` is absent |
| AC-FU-WEB-01 | Edit an existing section | Clinic admin | VERIFIED_LOCAL_E2E | `AC-WEB-08` | Binary upload stays off |
| AC-FU-WEB-02 | New text and HTTPS image after publish | Clinic admin | VERIFIED_LOCAL_E2E | `AC-FU-WEB-02` | Production file upload stays off |
| AC-FU-WEB-03 | Theme draft and publish | Clinic admin | VERIFIED_LOCAL_E2E | `AC-WEB-09` | None |
| AC-FU-REC-01 | Staff patient registration | Reception or admin | VERIFIED_LOCAL_E2E | Create step inside `AC-FU-PORTAL-01` | None |
| AC-FU-REC-02 | Walk-in service point | Receptionist | VERIFIED_LOCAL_E2E | `AC-REC-02` | None |
| AC-FU-REC-03 | New patient on the waiting queue | Receptionist | VERIFIED_LOCAL_E2E | `AC-FU-REC-03` | None |
| AC-FU-REC-04 | Existing patient number, no second chart | Receptionist | VERIFIED_LOCAL_E2E | `AC-FU-REC-04` | None |
| AC-FU-REC-05 | Clinical staff see the worklist | Clinician | VERIFIED_LOCAL_E2E | `AC-FU-REC-05` | Does not assert one named ticket |
| AC-FU-CLIN-01 | Clinician queue offers start encounter | Clinician | VERIFIED_LOCAL_E2E | `AC-FU-CLIN-01` | Does not start the encounter |
| AC-FU-CLIN-02 | Record the first vital | Clinician | VERIFIED_LOCAL_E2E | `AC-REC-03` stores 72 bpm | None |
| AC-FU-CLIN-03 | Correction keeps the original | Clinician | VERIFIED_LOCAL_E2E | `AC-REC-03` shows 72 and 80; HTTP stale retry stays rejected | None |

Mapped scenarios: 15. Direct named assertions exist for PORTAL-01, WEB-02, REC-03, REC-04, REC-05, and CLIN-01. The other rows cite the specific automated id above, not a general suite pass.

## BlessBoard acceptance

| Check | Status | Evidence |
| --- | --- | --- |
| Church registration conflict | VERIFIED_LOCAL_E2E | `BB-REG-07` |
| Member form and pending activation | VERIFIED_LOCAL_E2E | `BB-05`, `BB-MEM-01` |
| CSRF | VERIFIED_LOCAL_E2E | `BB-MEM-02` returns 403 without the token |
| Invitation, activation, login | VERIFIED_LOCAL_E2E | `BB-06` |
| Website, sermon, event, announcement isolation | VERIFIED_LOCAL_E2E | `BB-01`, `BB-WEB-09`, `BB-WEB-10`, `BB-ANN-01` |
| Cross-product theme | VERIFIED_LOCAL_E2E | `BB-WEB-08` |
| Recovery | VERIFIED_LOCAL_E2E on the testing path | `BB-AUTH-04`. This is not production OTP |
| Media upload | DISABLED | `BB-ANN-02` refuses an upload while the flag is unset |

## Open items that are not bugs to close in this candidate

1. Production OTP is disabled.
2. Patient OTP recovery is not release-ready.
3. D25 slot capacity has no approved number.
4. Public self-registration is not an approved feature.
5. Public appointment booking remains disabled.
6. Production binary media upload remains disabled.
7. Hosted QA may still be serving an older commit until a separate deploy.
8. A Resend domain name does not prove OTP delivery.
