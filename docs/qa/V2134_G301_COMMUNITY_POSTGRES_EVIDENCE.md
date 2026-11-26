# V2134 Community Benefits PostgreSQL evidence

## Schema

Reviewed script
`docs/qa/community-benefits/V2132_COMMUNITY_BENEFITS_SCHEMA.sql` was applied
only to `127.0.0.1:55432` / `getpro_v13_e2e_g78d2301`.

Tables present:

- `activeclinic.community_memberships`
- `activeclinic.clinic_acquisitions`
- `activeclinic.community_introductions`
- `activeclinic.community_passes`
- `activeclinic.community_patient_links`
- `activeclinic.community_agreements` (default `INACTIVE`)
- `activeclinic.community_audit_events`
- `activeclinic.community_settlement_batches` (`PENDING_APPROVAL`, `posted=false`)

## Executed persistence journey

`tests/v13/integration/g206-community-benefits.integration.test.js` via
`runCommunityPostgresPersistence` verified:

- membership create and activation fields
- QR issue/rotation (one active hash)
- Clinic A walk-in `CLINIC_DIRECT` exclusion
- Clinic B platform introduction
- patient link uniqueness
- forged introduction source rejection
- ACTIVE agreement without legal approval rejection
- Model B 10% contribution preview math (1000 bps)
- inactive agreement remains non-eligible for live discount
- settlement batch idempotency and schema refusal of `posted=true`
- `financialPostingEnabled() === false` and `posting_disabled` commit path

Mock Playwright remains separately reported and is not counted as PostgreSQL E2E.

## Dual execution summary

| Layer | Result |
| --- | --- |
| Schema on disposable DB | APPLIED |
| g206 / g308 PostgreSQL persistence | PASS (membership, QR rotate, Clinic A walk-in exclusion, Clinic B intro, patient link, inactive agreement, Model B 1000 bps preview, settlement idempotency, posting refuse) |
| Community Playwright (`playwright.v13-ac-community.config.cjs`) ×2 | 9 pass (mock-backed UI/security paths) |
| Financial posting | DISABLED |
| Agreements | INACTIVE in real E2E |
| Live consent enrollment | NOT PERFORMED (draft only) |
