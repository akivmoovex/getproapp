# GetPro Church — database model

PostgreSQL tables use the `church_` prefix. Migration: `db/postgres/049_church_core.sql`. Boot hook: `src/db/pg/ensureChurchSchema.js`.

## Entity overview

```
tenants (platform regional)
    └── church_organizations (platform_tenant_id)
            ├── church_branches
            ├── church_members
            ├── church_branch_admins
            ├── church_hq_admins
            ├── church_attendance_records
            ├── church_giving_summaries
            ├── church_monthly_reports
            └── church_audit_logs
```

## Tables (Phase 0)

| Table | Purpose |
|-------|---------|
| `church_organizations` | HQ org; unique `slug` (host slug, e.g. `kafuebaptist`) |
| `church_branches` | Branch under org; public copy fields for homepage |
| `church_members` | Member records; `status`: pending / verified / rejected / inactive |
| `church_branch_admins` | Branch-scoped admin credentials |
| `church_hq_admins` | Org-scoped HQ credentials |
| `church_attendance_records` | Service attendance headcounts |
| `church_giving_summaries` | Manual monthly giving totals (no payments) |
| `church_monthly_reports` | Branch monthly report workflow |
| `church_audit_logs` | Audit trail for admin actions |

## Host slug resolution

For `{orgSlug}.church.{BASE}`, the primary branch is resolved by joining `church_organizations.slug` → first active `church_branches` row (`findBranchByHostSlug`).

## Sample seed

Boot-time idempotent seed (`src/seeds/seedChurchSampleOrganization.js`):

- Organization: `kafuebaptist` / Kafue Baptist Church
- Branch: `main` with welcome message, service times, location

## Explicitly out of scope (MVP)

- Online payment / Stripe tables
- Full accounting / ledger
- QR attendance
- LMS / certificates

## Repositories (Phase 0–1)

| Module | Functions |
|--------|-----------|
| `src/db/pg/church/organizationsRepo.js` | `findOrganizationBySlug`, `createOrganization` |
| `src/db/pg/church/branchesRepo.js` | `findBranchBySlug`, `findBranchByHostSlug`, `createBranch`, `listBranchesForOrganization` |
