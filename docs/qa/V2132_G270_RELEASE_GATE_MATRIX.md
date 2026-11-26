# V2132 G270 release gate matrix

Product versions: **2.13.4** (not 2.13.2). Candidate tip before this doc commit: `da2f93fd…`.

| Gate | Status | Owner / required approval | Operator action | Evidence | Post-action test | Release impact |
| --- | --- | --- | --- | --- | --- | --- |
| Safe suite | PASS 561×2 | Eng QA | None | `g270-safe1/2.log` | Re-run after source change | Blocks candidate if fail |
| HTTP (non-D25) | PASS | Eng QA | None | `g270-http*.log` | Re-run g79 | Blocks candidate if fail |
| D25 slot capacity | FAIL / UNAPPROVED | Product owner | Approve product rule or keep blocked | HTTP APT-01-03 | Focused D25 HTTP | Cannot claim capacity |
| D25 overlap | PASS | Eng QA | None | HTTP overlap | Concurrency HTTP | Security preserved |
| AC browser | PASS 32×2 | Eng QA | None | `g270-ac*.log` | g80 ac | Clinical browser gate |
| BB browser | PASS 23×2 | Eng QA | None | `g270-bb*.log` | g80 bb | BB browser gate |
| Community mock browser | PASS 9×2 | Eng QA | None | `g270-cb*.log` | community Playwright | Mock only |
| Disposable OTP PG | PASS | Eng QA | None | `g270-pg*.log` G185/G272 | OTP integration | Not live mailbox |
| Disposable Community PG | PASS posting_disabled | Eng QA | None | G206 | Community integration | No financial post |
| Lab components print | PASS (G266-01) | Eng QA | Hosted retest after deploy | G266 audit + AC G224 | Browser lab print | Hosted lag until deploy |
| Live Resend mailbox OTP | BLOCKED | Platform owner + security | Verify Resend domain; install sending-only QA key; set allowlist | G254 / G266 open defects | Authorized OTP E2E only | P0 gap; NO-GO for OTP |
| Migration 048 shared/hosted | NOT_APPLIED | DB owner | Separate SQL approval; backup first | Schema inventory | OTP PG on target DB | Forbidden without approval |
| Community posting / agreements | DISABLED | Product + legal | Keep disabled | G256 / G266 | Settlement refuse | Commercial hold |
| Public booking | DISABLED | Product | Keep disabled | AC-PUB-01 | Public `/book` | Safety hold |
| Hosted deploy of tip | NOT_PERFORMED | Owner | Explicit deploy approval using approval package | This matrix + package | Browser acceptance guide | Required for hosted SHA catch-up |
| Production release | NO-GO | Owner | Do not promote | All above | Full prod checklist (out of scope) | Forbidden |

## Aggregate

| Question | Answer |
| --- | --- |
| Local QA candidate strong? | YES for clinical/BB/security disposable evidence |
| Production ready? | NO |
| Hosted QA deploy ready for approval decision? | YES (package prepared; deploy not executed) |
| QA_GO_NO_GO | NO-GO |
