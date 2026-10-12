# V2.09 Staff Onboarding Browser E2E

Status: BLOCKED; no staff/member browser result claimed.

Inspection confirmed the supported ActiveClinic local invitation mechanism is
the authorized UI's copyable activation URL. Tokens remain one-time,
expiring, and hashed; no email capture adapter or raw database-token
extraction is appropriate.

The requested self-contained AC and BB browser suites were not implemented or
executed in this pass. Existing registration tests do not export reusable
fixture helpers, and no new administrator credentials were persisted. No
product defect, database mutation, production access, reset, migration, or
push occurred.

## AC administrator-to-staff workflow

`tests/ac-staff-lifecycle.spec.cjs` passed once with fresh clinic,
administrator, staff identity, phone, and in-memory passwords. Chromium
registered the clinic, opened `/app/staff/invite`, created the invitation,
captured the displayed copyable activation URL, opened it in a fresh context,
completed activation, and logged in as staff. Patient creation, token replay,
and unauthorized-action checks were outside this focused workflow.
