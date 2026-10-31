# BlessBoard V2.12 Member Schema Diagnosis

Classification: `STALE_TEST_EXPECTATION` / `LEGACY_BASELINE_FAILURE`

Evidence:

- Failing assertion: `tests/blessboard-members-schema.test.js:170` requires `date_of_birth` to be absent from `blessboard.members` and `blessboard.member_registrations`.
- Migration `db/migrations/blessboard/120_member_domain_v204.sql` intentionally adds `date_of_birth` to `blessboard.members` at lines 73–74.
- The migration is identical in V11 and V12: SHA-256 `171cc0f0a9f6ea3a52e2b9f2ae46ee9d08db39bbbfdfdaf6bbf2dba31d8ebb27` in both refs; `git diff origin/V11..HEAD` is empty for this file.
- The member service/schema contract includes profile fields from the V2.04 member domain migration. The failing assertion is therefore older than the intentional schema evolution.

This is not a V2.12 regression and does not justify removing the column or changing a migration. The smallest correction would be a test-only expectation update after confirming the privacy contract for member responses; it was not applied in this phase.
