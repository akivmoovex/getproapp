# G215 independent QA audit

The v1.2 PDF is not in the workspace. This audit reads the G193–G210 reports and the source under `src/activeclinic/communityBenefits/`. The planned figure of 190 was not executed. `G215_FINAL_COVERAGE.json` maps 42 source requirements.

Fourteen defects in `G215_DEFECT_REGISTER.md` were reproducible from the source and are fixed. The important ones are: a pass page that disclosed membership without an actor, an agreement that became eligible from `ACTIVE` alone, check-in choosing the oldest agreement, no clinic-exit state, a new pass after suspension, and two plans sharing one idempotency key. Fixes keep the flag off, keep `createAgreement` inactive and unapproved, and keep `commitLedger` on `posting_disabled`.

Clinic A, B, and C are covered in `tests/v13/unit/g211-community-hardening.test.js`: a platform introduction stays eligible on a repeat visit, a walk-in stays ineligible after enrollment, a later introduction qualifies only the new clinic, clinic C is independent, a QR presentation adds no introduction and no ledger row, and clinic exit blocks eligibility while the introduction row remains.

Browser evidence is `BROWSER_MOCK_BACKED`. Eight community browser tests passed twice. They check enrollment, pass issue and rotate, check-in outcomes, clinic A versus B, invalid and revoked codes, ambiguous linking, a reused form token, a fractional quote, and a missing actor. They do not use PostgreSQL. `COMMUNITY_POSTGRES_E2E_PASS` is 0.

Two safe runs each executed 594, passed 592, failed 0, and skipped 2. Two HTTP runs each executed 36, passed 33, and failed D14C, D16, and D25 slot capacity. Same-staff overlap passed both. Two ActiveClinic Playwright runs each passed 30. Two BlessBoard Playwright runs each passed 23.

The reviewed schema now follows the later ActiveClinic migration shape: `CREATE TABLE IF NOT EXISTS`, UUID keys, status checks, and a check that an `ACTIVE` row must be `approved`. It was not copied into `db/migrations` and it was not executed.

No independently actionable P0 or P1 remains in the source. The remaining blockers need a separate approval: apply the reviewed schema on the disposable database only, and approve a commercial agreement before any model can become active. QA is NO-GO. Nothing was deployed. `main` was not modified.
