# V5/V6 → V7 Production Migration Runbook

**Status:** operator tooling — **do not run against live production without rehearsal on clones.**  
**Application RC frozen:** runtime `4ed02a19`, repository `ac75d944`, tag `v1.0.0-rc1`.  
**PRODUCTION TOUCHED: NO** (this document only).

## Strategy

Parallel greenfield cutover:

1. Legacy **BlessBoard V5** (`blessboard-platform-v5 / production`) and **ActiveClinic V6** sources remain **read-only**.
2. New Supabase project: **`moovex-platform-v7 / production`**.
3. ETL via `migrate-v5-to-v7` into empty V7 target.
4. Media binaries copied separately via `migrate-v5-to-v7-media`.
5. Post-import: `blessboard:website-engine:backfill` (operator, with explicit production gate).
6. Validate on new Hostinger `moovex-platform-production` app **before** apex DNS cutover.

**Never** run `db:identity:migrate-testing-to-moovex-v7` against production.

## Prerequisites

- Supabase **snapshots** of BB prod + AC v6 sources.
- Isolated rehearsal clones for first full dry-run.
- Fresh V7 target DB: `npm run db:migrate` + `db:identity:init --env production --identity-key moovex-platform-v7 --confirm`.
- Env files **separate** from testing (never reuse testing `DATABASE_URL`).

## Required environment variables

| Variable | Purpose |
| -------- | ------- |
| `V5_BB_SOURCE_DATABASE_URL` | Read-only BB V5 source (prod snapshot clone for rehearsal) |
| `V6_AC_SOURCE_DATABASE_URL` | Read-only AC v6 source (optional; defaults to BB URL if unified) |
| `V7_TARGET_DATABASE_URL` | Empty/rehearsal/production V7 target |
| `V7_SOURCE_IDENTITY_EXPECTED` | `blessboard-platform-v5` |
| `V7_TARGET_IDENTITY_EXPECTED` | `moovex-platform-v7` |
| `V7_SOURCE_ENVIRONMENT_EXPECTED` | `production` (or `testing` on clones) |
| `V7_TARGET_ENVIRONMENT_EXPECTED` | `rehearsal` / `testing` / `production` |
| `V7_MIGRATION_ALLOW_HOSTED=1` | Required for Supabase URLs |
| `V7_MIGRATION_CONFIRM_PRODUCTION_TARGET=1` | Required when target env is `production` |
| `V7_MIGRATION_STATE_DIR` | Persistent migration state directory (required across phases) |
| `V7_MIGRATION_AC_CLINICAL=0` | Exclude patients/appointments from AC import |
| `V7_MEDIA_SOURCE_SUPABASE_URL` + service role key | Supabase media source (hosted rehearsal) |
| `V7_MEDIA_TARGET_SUPABASE_URL` + service role key | Supabase media target |

**Forbidden:** `GETPRO_DATABASE_URL`, unqualified `DATABASE_URL` as sole input.

Set `V6_AC_SOURCE_DATABASE_URL` only when AC source is a **separate** database. Omit it when BB and AC share one connection (fingerprint deduped automatically).

## Commands

```bash
# Local fixture rehearsal (BB + AC + delta; no hosted DBs)
npm run migrate:v5-to-v7:rehearsal

# Hosted clone rehearsal
export V7_MIGRATION_ALLOW_HOSTED=1
export V7_MIGRATION_STATE_DIR=/secure/path/v5-to-v7-state
# ... set V5_BB_SOURCE_DATABASE_URL, V6_AC_SOURCE_DATABASE_URL (if separate), V7_TARGET_DATABASE_URL ...

npm run migrate:v5-to-v7:plan
npm run migrate:v5-to-v7:dry-run
npm run migrate:v5-to-v7:apply
npm run migrate:v5-to-v7:verify

# Optional: run website engine backfills inside the same apply transaction phase
node db/scripts/migrate-v5-to-v7.js apply --confirm --auto-backfill

# Delta (after initial import; uses state/watermark.json)
node db/scripts/migrate-v5-to-v7.js apply --confirm --delta --state-dir="$V7_MIGRATION_STATE_DIR"
node db/scripts/migrate-v5-to-v7.js verify --state-dir="$V7_MIGRATION_STATE_DIR"

# Media binaries (after metadata import)
npm run migrate:v5-to-v7-media:plan
npm run migrate:v5-to-v7-media:dry-run
npm run migrate:v5-to-v7-media:apply
npm run migrate:v5-to-v7-media:verify

# Post-import website engine (manual if not using --auto-backfill)
ALLOW_PRODUCTION_BACKFILL=1 npm run blessboard:website-engine:backfill
node scripts/activeclinic/backfill-clinic-websites.js --apply
```

## Entity order

1. `platform.organizations` + `organization_products` (product_id remapped by `product_key`)
2. `blessboard.churches`, `branches`, `users`
3. **`platform.identities`** + `identity_product_profiles` + `blessboard.users.platform_identity_id`
4. `blessboard.user_role_assignments` (role_id remapped by `role_key`)
5. `blessboard.public_pages`, `page_sections`, `media_assets`, `platform.website_instances`
6. AC: `platform.organizations` → `organization_products` → identities → `healthcare_organizations` → `facilities` → `staff_members` → roles → services → (optional clinical) → `website_instances` / `website_media`
7. Post-import: `blessboard:website-engine:backfill` + ActiveClinic website backfill

## Migration state directory

Use one persistent directory for the full cutover sequence:

```text
$V7_MIGRATION_STATE_DIR/
  state/manifest.json      # source/target fingerprint; refuses mismatched reuse
  state/id-map.json        # stable UUID mappings across apply + delta
  state/watermark.json     # delta watermark (capturedAt)
  state/media-resume.json  # media copy resume map
  audit.json               # per-entity counts (no PII)
```

CLI: `--state-dir=/path` or `V7_MIGRATION_STATE_DIR`.

## Identity merge (apply)

| Category | Behavior |
| -------- | -------- |
| `exact_safe_match` | Reuse one `platform.identities` row; add second product profile |
| `ambiguous_match` | Audit + skip; **fail apply** if V1-required admin/staff |
| `no_match` | Create identity; preserve AC source UUID when safe |

Passwords: bcrypt copied verbatim. Unsupported hashes → `must_change_password=true` (count only in audit).

## Delta / freeze

1. Initial `apply --confirm` captures `state/watermark.json` (`capturedAt` at cycle start).
2. Legacy remains writable until freeze.
3. `apply --confirm --delta` imports rows with `updated_at > capturedAt`.
4. Full reconcile (no timestamp filter): `blessboard.page_sections`, `platform.identity_product_profiles`.
5. Re-run delta is idempotent (upsert + skip unchanged).

## Exclusions (default)

Demo/QA tenants: `activeclinic-demo`, `demo-church`, `julflona-clinic`, patterns `qa-`, `example.test`, `example.invalid`. Override with `V7_MIGRATION_EXCLUDE_ORG_KEYS`.

## ActiveClinic scope

| Domain | Classification |
| ------ | -------------- |
| Organizations, facilities, staff, website | **MUST_MIGRATE** |
| Patients, appointments, clinical | **MUST_MIGRATE** if pilot continuity required |
| Demo/QA org keys | **EXCLUDE** |

## Identity / passwords

- BB users → `platform.identities` + `identity_product_profiles` + `users.platform_identity_id`.
- AC staff → existing `platform.identities` migrated/merged; `staff_members.platform_identity_id` remapped.
- Sessions: **not migrated**.
- Cross-product collisions classified in `plan` output; ambiguous V1 accounts block `apply`.


## Validation

- `migrate:v5-to-v7:verify` semantic matrix.
- Host-header smoke on new app before apex DNS.

## Notification safety (rehearsal)

- Do not set `ACTIVECLINIC_EMAIL_DELIVERY_ADAPTER=resend` on rehearsal targets.
- Omit `RESEND_API_KEY`.

## Automated tests

```bash
npm run test:migration:v5-to-v7
```

## Output artifacts

`tmp/v5-to-v7-migration/` (or `V7_MIGRATION_STATE_DIR` / `--state-dir`):

- `audit.json`
- `state/manifest.json`
- `state/id-map.json`
- `state/watermark.json`
- `state/media-resume.json`
