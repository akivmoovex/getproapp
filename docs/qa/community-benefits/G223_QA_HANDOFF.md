# G223 QA handoff

Base: `f2ea819fc1a0d208dd5d7b95c78edb0d8a7701ab`. Branch V13. Versions stay 2.13.2. This file does not name its own commit.

## What changed

Reception can search local patients by name or exact phone inside the signed-in clinic and facility. Results are masked. Duplicate candidates require an explicit chart confirmation. Search does not create a referral, a link, or a second chart.

Settlement preparation builds one idempotent clinic batch in `PENDING_APPROVAL`, with agreement version snapshots, integer ngwee totals, and refund lines. Commit still returns `posting_disabled`. No receivable or payable is posted.

## Evidence

Two safe runs each executed 596, passed 594, failed 0, and skipped 2. The two skips are the existing PostgreSQL identity checks when no database URL is set.

Two HTTP runs each executed 36, passed 33, and failed 3. The failures are D14C OTP, D16 platform OTP, and D25 slot capacity. Same-staff overlap passed both runs. The three failures are the same authorized blocks as G218. They were not converted to skips.

Two ActiveClinic Playwright runs each passed 30. Two BlessBoard Playwright runs each passed 23. Two community mock-browser runs each passed 9. Community PostgreSQL browser passed 0. Community PostgreSQL persistence passed 0. The authorized schema probe threw `BLOCKED_BY_MIGRATION` and created no table. That probe is not one of the 36 HTTP tests.

New tests: 2 unit, 0 HTTP, 1 browser. Authorization denials for the wrong clinic and a billing role are inside the new unit tests, not a separate suite.

## Decision

QA is NO-GO. Release is not ready. Financial posting stays disabled. No migration was executed. No deployment was performed.

Next action is a separate approval to apply the reviewed community schema on the disposable database only, then write the PostgreSQL tests that this plan names. Commercial rates, consent text, agreement activation, and settlement execution stay blocked until those approvals exist. Do not deploy.
