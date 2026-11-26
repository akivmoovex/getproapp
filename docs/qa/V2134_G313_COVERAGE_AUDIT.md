# V2134 G313 coverage audit

Branch `V13`. Work started from `1fd1144be49a4e5c8593cbe6ee6c3bb4a9f7dad8`.
Product versions during this audit remain 2.13.2 until the separate G314 version commit.

Reject page-load-only and mock-only claims as end-to-end coverage.
Community mock Playwright is reported separately from PostgreSQL persistence.

## Inventory

| Workflow | UNIT | CONTRACT | HTTP | BROWSER | POSTGRESQL | SECURITY | ACTUAL_EXECUTION | BLOCKER |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OTP challenge store / rate / consume | Y | Y | Y | N | Y | Y | PASS (D14C/D16/G185) | Live Resend mailbox + production activation |
| OTP production activation closed | Y | Y | Y | N/A | Y | Y | PASS | Production activation deferred |
| Community membership / QR / intro | Y | Y | N | MOCK | Y | Y | PG PASS; browser mock | Live agreements / posting |
| Community Model B 10% preview | Y | N | N | MOCK | Y | Y | PASS preview math | Commercial activation deferred |
| Community settlement / posting refuse | Y | Y | N | MOCK | Y | Y | PASS posting_disabled | Financial posting DISABLED |
| Consent notice draft | Y | N | N | N | N | Y | PASS unit | Live enrollment deferred |
| Laboratory order→result→read-back | Y | Y | Y | Y | Y | Y | PASS | None actionable |
| Radiology order→report→read-back | Y | Y | Y | Y | Y | Y | PASS | None actionable |
| Clinical print (SOAP/vitals/Rx/lab/rad/referral/card) | Y | N | N | PARTIAL | N | PARTIAL | Print regions present | Hosted print visual retest |
| Patient registration / activation | Y | Y | Y | Y | Y | Y | PASS | Public self-reg disabled (preserved) |
| Reception / vitals correction | Y | Y | Y | Y | Y | Y | PASS | None actionable |
| Clinical documentation / pharmacy | Y | Y | Y | Y | Y | Y | PASS | None actionable |
| Website edit / publish | Y | Y | Y | Y | Y | Y | PASS | Production media upload disabled |
| BlessBoard church/members/invites/roles | Y | Y | Y | Y | Y | Y | PASS | None actionable |
| BlessBoard sermons/events/announcements/branches | Y | Y | Y | Y | Y | Y | PASS | None actionable |
| Tenant isolation AC/BB | Y | Y | Y | Y | Y | Y | PASS | None actionable |
| Appointment same-staff overlap (D25) | Y | Y | Y | N | Y | Y | PASS | None for overlap |
| Appointment slot capacity (D25) | Y | Y | Y | N | BLOCKED | Y | FAIL expected | Policy UNAPPROVED |
| Public booking | Y | Y | Y | N | N | Y | DISABLED preserved | Feature disabled |
| Version / About | Y | Y | Y | Y | N/A | Y | PASS at 2.13.2 pre-bump | Separate 2.13.4 commit |

## Additional gaps after this cycle

### P0 open

- Real Resend mailbox OTP browser proof (operator secret/recipient dependency)
- Hosted QA retest (separate authorization)

### P1 open

- Hosted visual verification of clinical print layouts
- SOAP/referral field-by-field matrix depth beyond print-ready regions
- Live Community Benefits agreement/consent activation package (policy, not defect)

### Policy / external gates (not defects)

- D25 slot capacity invention forbidden
- Financial posting DISABLED
- Production OTP DISABLED
- Public booking DISABLED
- Production media upload DISABLED
- `main` unchanged / no hosted deploy

## Suite evidence (dual after final source changes, pre-version bump)

| Suite | Run 1 | Run 2 |
| --- | --- | --- |
| Safe unit/contract/quality | 602 exec / 600 pass / 0 fail / 2 skip | same |
| HTTP/PostgreSQL (g79) | 40 / 39 / 1 (D25 slot only) | same |
| ActiveClinic Playwright | 32 pass | 32 pass |
| BlessBoard Playwright | 23 pass | 23 pass |
| Community Benefits Playwright (mock) | 9 pass | 9 pass |
| Community PostgreSQL persistence | PASS via g206/g308 | PASS |
| OTP D14C / D16 / G185 | PASS | PASS |
