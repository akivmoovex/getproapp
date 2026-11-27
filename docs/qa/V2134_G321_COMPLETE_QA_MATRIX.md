# V2134 G321 complete QA matrix

Candidate: `27a940e7809bd2f01ee22e9032443414b76a8dfa`  
Executed evidence: G318, G319, and the G320 twice-run suites.  
Disposable database: `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432`.

A mock-browser pass is not a live email pass. A fixture OTP pass is not a Resend delivery.

## Suite totals

| Suite | Run 1 | Run 2 | Meaning |
| --- | --- | --- | --- |
| Safe contract and unit | 682 pass, 0 fail, 0 skipped | 682 pass, 0 fail, 0 skipped | No database writes |
| Authorized HTTP | 41 pass, 0 fail, 0 skipped | 41 pass, 0 fail, 0 skipped | Disposable PostgreSQL |
| BlessBoard browser | 23 pass | 23 pass | Regression, staff OTP fail-closed |
| BlessBoard OTP spec | 10 pass | 10 pass | Dedicated member-login observer |
| ActiveClinic browser | 32 pass | 32 pass | Regression, includes reset-link AC-AUTH-04 |
| ActiveClinic OTP spec | 9 pass | 9 pass | Dedicated recovery observer |
| Community mock browser | 9 pass | 9 pass | In-memory server, not PostgreSQL |

## BlessBoard

| Area | Result | Evidence |
| --- | --- | --- |
| About version | PASS `2.13.4` | Shared build info and apex About template |
| Staff login | PASS | Browser regression, historical session path |
| Member login | PASS | Browser activation and login |
| Email OTP | PASS_FIXTURE | Dedicated spec 10/10 twice; live mail NO |
| Account recovery | PASS | Browser recovery hides the testing code |
| Tenant isolation | PASS | Dedicated OTP wrong-church denial |
| Role restrictions | PASS | Invitation and staff permission browser cases |
| Session lifecycle | PASS | Session withheld until OTP, then bound to member and church |
| CSRF | PASS | Member registration rejects a missing token |
| Member onboarding | PASS | Registration and activation browser cases |
| Church administration | PASS | Homepage, announcement, event, sermon, and theme cases |

## ActiveClinic

| Area | Result | Evidence |
| --- | --- | --- |
| About version | PASS `2.13.4` | Shared build info and public About template |
| Login and recovery | PASS | Administrator, staff, and reset-link browser cases |
| Email OTP | PASS_FIXTURE | Dedicated recovery spec 9/9 twice; live mail NO |
| Patient activation | PASS | Portal activation and one-record activation |
| Walk-in registration | PASS | Browser and HTTP |
| Patient search | PASS | Chart read-back and phone search |
| Vitals correction | PASS | Heart-rate record and correction; other clinic denied |
| SOAP persistence | PASS | Signed consultation draft |
| Referral printing | PASS | Print region and print action in the consultation case |
| Prescription printing | PASS | Print region and print action |
| Laboratory lifecycle | PASS | Collection, receipt, verification, clinician read-back |
| Radiology lifecycle | PASS | Order, verification, filters, clinician read-back |
| Queue filters and counters | PASS | Reception queue and radiology filters |
| Cross-clinic authorization | PASS | Wrong-clinic portal, encounter, and walk-in denial |
| AC-05 | PASS | Lower-privilege user denied test-database management |

## Community Benefits

| Area | Result | Evidence |
| --- | --- | --- |
| PostgreSQL persistence | PASS | HTTP community suite, twice |
| Clinic-specific referral attribution | PASS | Disposable persistence suite |
| Network-wide membership | PASS | Disposable persistence suite |
| QR security | PASS_FIXTURE | Mock browser pass presentation; not a live device scan |
| Lookup isolation | PASS | Mock browser and disposable persistence |
| Settlement-preview idempotency | PASS | Disposable persistence; preview only |
| Posting | DISABLED_BY_POLICY | Posting remains disabled |

## Appointments

| Area | Result | Evidence |
| --- | --- | --- |
| Option C non-overlap | PASS | Authorized HTTP, twice |
| Slot-capacity integer | PASS_POLICY | No integer exists; capacity stays blocked |
| Concurrent same-staff booking | PASS | One winner, other staff and next interval kept |
| Browser same-slot rejection | PASS | ActiveClinic browser, twice |

## Shared platform

| Area | Result | Evidence |
| --- | --- | --- |
| D14C | PASS | HTTP and fail-closed BlessBoard browser gate |
| D16 | PASS | Shared OTP HTTP and ActiveClinic auth HTTP |
| CSRF | PASS | BlessBoard member CSRF and platform requirement on browser servers |
| OTP replay | PASS | Dedicated BlessBoard and ActiveClinic specs |
| Rate limits | PASS | Dedicated exhaustion case; production caps unchanged |
| Cross-worker persistence | PASS | G185 inside both HTTP runs |
| Cross-product isolation | PASS | Church and clinic theme cases |
| Migration 048 | BLOCKED_BY_SCHEMA | File remains absent |
| Live Resend | BLOCKED_BY_EXTERNAL_PROVIDER | No message received |
| Hosted candidate | BLOCKED_BY_HOSTED_DEPLOYMENT | Health SHA `7b9b31d0c478`, branch `V11` |
| Public booking | DISABLED_BY_POLICY | Enabled count stayed 0 |

## Open issue IDs

| ID | Severity | Status |
| --- | --- | --- |
| OTP-LIVE-MAILBOX | P0 | BLOCKED_BY_EXTERNAL_PROVIDER |
| OTP-MIGRATION-048 | P0 | BLOCKED_BY_SCHEMA |
| PUBLIC-BOOKING | P0 | DISABLED_BY_POLICY |
| CB-POSTING | P1 | DISABLED_BY_POLICY |
| HOSTED-RETEST | P1 | BLOCKED_BY_HOSTED_DEPLOYMENT |

No P2 issue is open. No failed G320 case was recorded as skipped.
