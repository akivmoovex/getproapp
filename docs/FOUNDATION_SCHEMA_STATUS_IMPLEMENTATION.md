# Foundation Schema & Status Implementation (Phase 1)

**Date:** 2026-07-19  
**Scope:** Database schema only — applications status split, onboarding, support contacts, Free `max_branches` reconciliation.  
**Database:** BlessBoard V5 testing (`identity_key=blessboard-platform-v5`, `environment_code=testing`)

---

## 1. Migration summary

| Item | Value |
|------|--------|
| Filename | `db/migrations/blessboard/027_foundation_schema_and_status.sql` |
| Module / order | `blessboard` / **027** (after `026`) |
| Command | `npm run db:migrate` (`DATABASE_URL` only) |
| Live result | Applied once; re-run skipped (checksum match) |

---

## 2. Pre-migration live-schema findings

| Object | Finding |
|--------|---------|
| `blessboard.platform_church_registration_applications` | Present (026). PK `id` UUID. Columns: `status` (`pending\|contacted\|closed`, default `pending`), church/contact fields, `selected_plan`, `created_at`/`updated_at`. **No** `organization_id`, **no** application/provisioning status columns. Indexes on `(status, created_at DESC)` and email. |
| `platform.organizations` | Canonical tenant; status `active\|inactive\|retired` |
| `blessboard.churches` | 1:1 profile via `organization_id` |
| `blessboard.branches` | Product-owned; `branch_type` includes **`hq`** (HQ is a branch row) |
| `blessboard.users` / `user_roles` | V5 identity; `platform_admin` roles live here |
| `blessboard.user_invitations` | Canonical V5 staff invite table (migration 032); hash-only tokens; password set on accept — included in foundation product-table allowlist |
| `blessboard.public_pages` | Page publication truth (`draft\|published\|archived`) |
| Plans | Product `blessboard`; Free plan key **`free`**; features in `platform.plan_features` |
| Free `max_branches` | Live **2**; seed `003` already specifies **1** (seed not re-applied after first ledger entry) |
| Free `custom_domain` | `boolean false` |
| Ledger | Through blessboard **026** |

**HQ / branch limit interpretation:** HQ is `blessboard.branches` with `branch_type='hq'` and counts toward `max_branches`. Foundation Free therefore needs **`max_branches = 1`** (one HQ branch), not zero.

---

## 3. Existing application-row analysis (pre-migrate)

| Metric | Value |
|--------|--------|
| Total rows | **3** |
| Status values | `pending` only (3) |
| Linked `organization_id` | n/a (column absent) |
| Ambiguous legacy statuses | **0** |
| Duplicate emails / names | Not blocking; left intact |

---

## 4–6. Tables changed / created / columns

### Changed: `blessboard.platform_church_registration_applications`

**Added columns:**

| Column | Notes |
|--------|--------|
| `organization_id` | UUID NULL → `platform.organizations(id)` ON DELETE RESTRICT |
| `application_status` | NOT NULL DEFAULT `submitted` |
| `provisioning_status` | NOT NULL DEFAULT `not_started` |
| `provisioning_started_at` | timestamptz NULL |
| `provisioned_at` | timestamptz NULL |
| `provisioning_failed_at` | timestamptz NULL |
| `provisioning_error_code` | text NULL (≤120) |
| `provisioning_error_detail` | text NULL (≤2000) |

**Retained:** legacy `status` (`pending\|contacted\|closed`) + existing indexes — **compatibility until Phase 4**.

**New indexes:** org FK (partial), `(application_status, created_at DESC)`, `(provisioning_status, created_at DESC)`.

**CHECK consistency:**

- `provisioned` ⇒ `organization_id` AND `provisioned_at` present  
- `provisioning_failed` ⇒ `provisioning_failed_at` present  
- `provisioning` ⇒ `provisioning_started_at` present  
- `application_status=closed` does **not** require provisioned (manual close allowed)

### Created: `blessboard.organization_onboarding`

1:1 `organization_id` PK → organizations; optional `registration_application_id`; `onboarding_status`; `follow_up_status`; `assigned_support_user_id` → **`blessboard.users`**; contact/onboarding timestamps; flags `preview_acknowledged`, `onboarding_dismissed`, `support_requested` only (other checklist derived later).

### Created: `blessboard.organization_support_contacts`

Append-only: `organization_id`, optional `registration_application_id`, `created_by_user_id` → **`blessboard.users`**, `contact_method` (`phone|email|message|meeting|internal_note`), `outcome` allowlist, `note` 1–2000, `contacted_at`, optional `next_follow_up_at`.

### Plan update

`platform.plan_features.max_branches` for `blessboard` / `free` → **1** when previously distinct.

---

## 7. Backfill rules

| Legacy `status` | `application_status` | `provisioning_status` |
|-----------------|----------------------|------------------------|
| `pending` | `submitted` | `not_started` |
| `contacted` | `submitted` | `not_started` |
| `closed` without org | `closed` | `not_started` (do **not** infer provisioned) |
| `closed` + `organization_id` (future-safe) | `closed` | `provisioned` + `provisioned_at` ← `updated_at` if null |
| Unexpected status | Migration **aborts** | |

Payload fields (`church_name`, email, etc.) untouched.

**Live backfill:** 3× `pending` → `submitted` / `not_started`; no rows lost.

---

## 8. Free-plan branch-limit result

| | Before | After |
|--|--------|-------|
| Free `max_branches` | **2** | **1** |
| Free `custom_domain` | false | false (unchanged) |
| Growth / professional / partner limits | Pre-existing live values | **Unchanged by this migration** |

Seed `db/seeds/003_blessboard_plans.sql` already documents Free `max_branches=1` for new databases.

---

## 9. Migration command

```bash
DATABASE_URL=… npm run db:migrate
```

Uses `db/scripts/migrate.js` → `DATABASE_URL` only; no `GETPRO_DATABASE_URL`; no runtime DDL.

---

## 10. Migration test results

Suite: `tests/blessboard-foundation-schema-status.test.js` — **11/11 pass**  
Also green: `tests/db-bootstrap-foundation.test.js`, `tests/blessboard-register-church.test.js` (41 combined after verify allowlist update).

Coverage includes catalogue order, empty + upgrade paths, CHECKs, Free limit, re-run skip, no legacy public tables.

---

## 11. Live testing-database result

| Check | Result |
|-------|--------|
| Identity | `blessboard-platform-v5` / `testing` |
| Applied | `blessboard/027_foundation_schema_and_status.sql` |
| Ledger | Row present; checksum matches file |
| Apps after | Still **3**; all `pending` + `submitted` + `not_started`; none linked |
| Onboarding / contacts rows | **0** (tables empty — expected) |
| Orgs / branches / users / domains / subs / pages | Unchanged counts (1/1/0/1/0/0) |
| Re-run migrate | All skipped |

---

## 12. Compatibility concerns

Current code still depends on legacy `status`:

| Location | Dependency |
|----------|------------|
| `platformChurchRegistrationRepository.createApplication` | Inserts `status='pending'` |
| `findRecentPendingDuplicate` / `countPending` | Filters `status='pending'` |
| `SELECT_COLUMNS` | Omits new status/org columns |
| Register-church service/tests | Assert pending enquiry behavior |

New columns receive defaults on insert (`submitted` / `not_started`), so POST continues to work.

---

## 13. Deferred code changes

| Phase | Work |
|-------|------|
| **Phase 2** | `manageTransaction: false` on provision services (no schema) |
| **Phase 3** | Orchestrator writes `provisioning_*`, `organization_id`, onboarding row |
| **Phase 4** | Registration dual-write / switch to `application_status`; stop relying solely on `status`; later deprecate/drop legacy `status` |
| **Phase 5+** | Admin applications UI using new columns |

---

## 14. Rollback guidance

- Prefer **forward fix** (additive migration).  
- Ledger records 027; editing applied SQL causes checksum drift rejection.  
- Emergency: restore DB snapshot from before migrate; do not hand-edit checksums.  
- Dropping new tables/columns requires a new numbered migration after cutover planning — not done here.

---

## 15. Scope boundary confirmation

- No registration route behavior changes  
- No provisioning orchestrator / TX refactor  
- No portal / admin screens / dashboard / path or host routing  
- No domain records, users, orgs, branches, roles, or subscriptions created by this phase  
- No V4 / legacy inquiry tables  
- Runtime DDL remains disabled; `GETPRO_DATABASE_URL` unused  

**Companion docs:** entity/admin · onboarding/status · provisioning · path routing delivery plans.
