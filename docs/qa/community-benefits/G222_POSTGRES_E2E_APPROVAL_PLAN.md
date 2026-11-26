# G222 PostgreSQL E2E approval plan

Reviewed SQL: `docs/qa/community-benefits/V2132_COMMUNITY_BENEFITS_SCHEMA.sql`.

This cycle did not execute that SQL. It did not create database objects, apply the OTP script, or reset a database. The future target, after a separate approval, is `127.0.0.1:55432` database `getpro_v13_e2e_g78d2301` only.

## SQL check against the service

The reviewed script now includes the tables the service already uses in memory: memberships, passes, acquisitions, introductions, patient links, agreements, eligibility decisions, audit events, and settlement batches. Settlement batches are constrained to status `PENDING_APPROVAL` and `posted = false`. Agreement rows default to `INACTIVE` and unapproved, and an active status still requires approved legal state. Membership uniqueness, QR hash storage, clinic attribution, introduction evidence, and idempotency keys remain in the earlier statements.

The script is still `CREATE TABLE IF NOT EXISTS` under `docs/qa/`. It is not a migration under `db/migrations/`.

## Fail-closed test

`tests/v13/integration/g206-community-benefits.integration.test.js` selects `to_regclass` for `activeclinic.community_memberships` and `activeclinic.community_settlement_batches`. If either is absent it throws `BLOCKED_BY_MIGRATION` and does not create a table. An authorized run against the disposable database in this cycle threw `BLOCKED_BY_MIGRATION: activeclinic.community_memberships is not present. Refusing to create it.` Exit code 1. That run is not a persistence pass and is not part of the 36 HTTP tests.

## Tests that run only after an approved schema application

The same integration file refuses to continue even if both tables exist, until a later approved persistence implementation is written. Planned negative cases for that later run:

- Cross-clinic chart and settlement access
- Ambiguous identity with no automatic link
- Forged introduction source
- Invalid QR and revoked QR
- Parallel redemption of one pass
- Duplicate settlement batch key
- Agreement activation without legal approval
- Financial posting while `financialPostingEnabled()` is false

Mock-backed Playwright in `playwright.v13-ac-community.config.cjs` is not PostgreSQL E2E. Community PostgreSQL browser tests passed 0.
