# V8 Hosted QA Release Preflight (PROMPT 23)

**Verdict:** `V8_HOSTED_QA_PREFLIGHT_PASS`  
**Branch:** `V8` only  
**Recorded:** 2026-09-21  
**origin/V8 HEAD (this preflight):** `c3a73422cce1e90ce1804e4863151c6a11656192`  
**Implementation baseline:** `bacdaedd` (BB18-M / 84-screen package)  
**Coverage report:** `c3a73422` ([`V8_SCREEN_IMPLEMENTATION_COVERAGE.md`](./V8_SCREEN_IMPLEMENTATION_COVERAGE.md))  
**Production:** untouched  
**This prompt performed:** documentation + read-only verification only  

### Explicit non-actions (confirmed)

| Action | Performed? |
|--------|------------|
| Apply migrations 039–042 / 110–112 | **No** |
| Deploy / restart Hostinger apps | **No** |
| Write to hosted / shared testing DB | **No** (SELECT + `BEGIN READ ONLY` / `ROLLBACK` only) |
| Mutate existing hosted tenant data | **No** |
| Send real notifications | **No** |

---

## 1. Source verification

| Check | Result |
|-------|--------|
| `git fetch origin V8` | OK |
| Current branch | `V8` |
| Working tree at fetch | Clean, tracking `origin/V8` |
| `origin/V8` HEAD | `c3a73422cce1e90ce1804e4863151c6a11656192` |
| Contains `bacdaedd` | Yes (BB18-M implementation) |
| Screen package | **84/84** `IMPLEMENTED_AND_TESTED` · **0** `PARTIAL` · **0** `BLOCKED` |
| BB18-M | Closed (Stitch `108d56c422634faea23a285fde9f9cd5`) |

### Recent implementation commits (tip)

| SHA | Summary |
|-----|---------|
| `c3a73422` | Record PROMPT 22 coverage SHA |
| `bacdaedd` | Implement BB18-M branch membership overview (84/84) |
| `8933eea5` / `112c6883` | PROMPT 14 mobile closure (BB01/02/15/16-M) |
| `63a3de62` | Screen coverage audit |

---

## 2. Identity matrix (shared testing DB)

| Identity | Role | Verified |
|----------|------|----------|
| **V8 deployment** | `moovex-platform-v8-testing` | Live `/healthz` on neuniversity hosts · row `active` in `platform.deployments` |
| **Shared DB identity** | `moovex-platform-v7` / `testing` | `platform.database_identity.identity_key` |
| **V7 app deployment** | `moovex-platform-testing` | Row `active` (pronline control line) |
| Session cookie (V8) | `moovex_platform_v8_testing_sid` | From `/healthz` |
| Media write namespace (V8) | `testing-v8` | From `/healthz` |
| Expected DB env | `testing` | From `/healthz` |

**Coexistence model:** One shared testing database (`moovex-platform-v7`) serves both V7 (`moovex-platform-testing` / pronline) and V8 (`moovex-platform-v8-testing` / neuniversity) via distinct `PLATFORM_DEPLOYMENT_CODE` rows, session cookies, and media namespaces. Additive V8 migrations must not break V7 readers/writers.

---

## 3. Live hosted health (read-only HTTP)

Observed during preflight (no deploy performed by this prompt):

| Host | HTTP | `/healthz` |
|------|------|------------|
| `https://neuniversity.org/` | 200 | `ok` · `deploymentCode=moovex-platform-v8-testing` · `platformLine=v8` · `gitSha=c3a73422cce1` · `schemaCompatible=true` · `expectedIdentityKey=moovex-platform-v7` |
| `https://blessboard.neuniversity.org/` | 200 | Same deployment identity / tip SHA prefix |
| `https://activeclinic.neuniversity.org/` | 200 | Same deployment identity / tip SHA prefix |

**Note:** Hosted tip already matches `origin/V8` HEAD prefix `c3a73422`. That does **not** imply V2.0 feature schema is present — migrations below remain unapplied. `schemaCompatible=true` reflects **V7 required** migrations only (through website/registration gates), not SH/BB V2.0 tables.

---

## 4. Migration preflight (039–042 · 110–112)

### 4.1 Hosted application state (read-only)

| Query | Result |
|-------|--------|
| `platform.schema_migrations` for 039–042, 110–112 | **None applied** |
| Latest `platform` migration | `038_moovex_platform_v8_testing_deployment.sql` |
| Latest `blessboard` migration | `109_website_structured_draft_update_section_op.sql` |
| V8 feature tables (`tenant_forms`, `tenant_announcements`, intake/transfer tables, …) | **Absent** |
| V8 feature columns on existing tables | **Absent** |

**Conclusion:** Code tip can boot (`schemaCompatible=true`), but hosted QA of SH01–SH15 / BB01–BB22 / AN01–AN05 persistence paths **requires operator apply** of the seven migrations below (out of this prompt’s scope).

### 4.2 Compatibility matrix

| # | Filename | Additive? | Tables / columns | V7 dependencies | Data migration | Locking / rollback | V8 startup required? | V7 break risk | Lint |
|--:|----------|-----------|------------------|-----------------|----------------|--------------------|----------------------|---------------|------|
| 1 | `db/migrations/platform/039_shared_tenant_forms.sql` | **Yes** | New: `platform.tenant_forms`, `tenant_form_versions`, `tenant_form_access_tokens`, `tenant_form_submissions` (+ indexes/FKs to `organizations` / `identities`) | Existing `platform.organizations`, `platform.identities` | None (empty new tables) | CREATE IF NOT EXISTS; reverse = drop new tables (operator) | **No** for boot; **Yes** for SH01–SH07 | Low — new `platform.*` only | LINT_OK |
| 2 | `db/migrations/platform/040_shared_form_submission_review.sql` | **Yes** | ALTER `tenant_forms` (+`branch_id`,`facility_id`,`require_consent`); ALTER `tenant_form_submissions` (review/idempotency/consent/scope); new `tenant_form_submission_rate_limits`; backfill `review_status` | Requires **039** | Backfill `review_status` from legacy `status` (only rows in new table) | Brief ACCESS EXCLUSIVE on ALTER; SET NOT NULL after backfill | **No** for boot; **Yes** for SH08–SH15 review | Low if 039 empty; depends on 039 | LINT_OK |
| 3 | `db/migrations/platform/041_activity_registration_v8.sql` | **Yes** | Expand `tenant_forms.category` CHECK (+`visitor`,`ministry`); columns `linked_resource_*`, `registration_closed`, `max_submissions`; unique open-email index on submissions | Requires **039** (+ ideally **040** for `review_status`) | None | DROP/ADD CHECK (category expand); CREATE UNIQUE INDEX (fails only if duplicate open emails — none when tables new) | **No** for boot; **Yes** for BB08–BB10 | Low — expands allowed categories | LINT_OK |
| 4 | `db/migrations/platform/042_shared_tenant_announcements.sql` | **Yes** | New: `platform.tenant_announcements`, `tenant_announcement_events` (+ append-only triggers) | `platform.organizations`, `identities` | None | CREATE IF NOT EXISTS | **No** for boot; **Yes** for AN01–AN05 | Low — new tables | LINT_OK |
| 5 | `db/migrations/blessboard/110_membership_workflow_v8.sql` | **Yes** | New: `membership_intake_forms`, `member_registration_review_events`, `member_branch_transfer_requests`; ALTER `member_registrations` (+`intake_form_id`,`application_json`,`pastoral_notes*`); expand status CHECK (+`needs_follow_up`); recreate open unique indexes | Existing `blessboard.churches/branches/users/members/member_registrations` | None required; existing statuses ⊆ new CHECK | DROP/ADD CHECK + index rebuild (short exclusive); recreate indexes includes `needs_follow_up` in open set | **No** for boot; **Yes** for BB01–BB18 workflow | **Low** — status expansion; existing rows verified compatible (see §4.3) | LINT_OK |
| 6 | `db/migrations/blessboard/111_announcement_schedule_v8.sql` | **Yes** | ALTER `blessboard.announcements` (+`timezone`,`starts_at`,`ends_at`); expand status CHECK (+`scheduled`,`expired`); schedule consistency CHECKs | Existing `blessboard.announcements` | Defaults `timezone='UTC'` | DROP/ADD CHECK | **No** for boot; **Yes** for scheduled BB announcements | **Low** — expands statuses; V7 draft/published/archived unchanged | LINT_OK |
| 7 | `db/migrations/blessboard/112_announcement_public_audience_v8.sql` | **Yes** | Expand `announcement_audiences.audience_key` CHECK (+`public`) | Existing audiences | None | DROP/ADD CHECK | **No** for boot; **Yes** for BB21–BB22 public audience | **Low** — expands keys; existing `members`/`admins` remain | LINT_OK |

**Apply order (operator):** `039` → `040` → `041` → `042` → `110` → `111` → `112` (platform then blessboard; respect FK/category dependencies).

**Backward compatibility summary:** All seven pass `lintMigrationSqlForV7Compatibility`. No DROP TABLE of shared V7 relations. CHECK expansions are supersets of prior allowed values. New NOT NULL columns either have DEFAULT or are on new tables.

### 4.3 Existing hosted data vs expanded CHECKs (read-only)

| Relation | Observation | Compatible with target CHECK? |
|----------|-------------|-------------------------------|
| `blessboard.member_registrations` | **0 rows** | Yes |
| `blessboard.announcements` | `draft`×1, `published`×3 | Yes (⊆ draft/scheduled/published/expired/archived) |
| `blessboard.announcement_audiences` | `members`×4, `admins`×1 | Yes (⊆ members/admins/public) |
| Rows outside expanded status/key sets | **0** | Yes |
| `under_review` with `member_id` set | **0** | Would violate 110 review consistency — none present |

### 4.4 Does V8 startup require these migrations?

| Layer | Answer |
|-------|--------|
| Process boot / `/healthz` `schemaCompatible` | **No** — gate uses V7 `REQUIRED_MIGRATIONS` (027–034 / 093–099 family), already satisfied |
| V2.0 screen persistence (forms, membership intake, transfers, shared announcements) | **Yes** — routes/services expect 039–042 / 110–112 objects |
| Scheduler worker for AN03 | Still **unavailable by design** (`jobsEnabled=false`); lazy read-time visibility remains |

---

## 5. Shared-database safety verdict

| Question | Answer |
|----------|--------|
| Can V7 and V8 coexist after these migrations? | **Yes** — additive schema; distinct deployment codes/cookies/media namespaces |
| Schema change that breaks V7? | **None identified** after SQL lint + live data CHECK simulation |
| Compatibility uncertain? | **No** — do **not** block on compatibility grounds |
| Remaining operational gate | Operator must **apply** migrations before claiming hosted V2.0 feature PASS |

**Preflight compatibility:** **VERIFIED PASS** (required for `V8_HOSTED_QA_PREFLIGHT_PASS`).

---

## 6. Local automated tests (preflight)

| Suite | Pass | Fail | Skip | Notes |
|-------|-----:|-----:|-----:|-------|
| `v8-migration-contract` + `v8-db-compatibility-baseline` | 19 | 0 | 0 | Re-run this prompt |
| All seven migration SQL files | LINT_OK | — | — | `v8DbCompatibilityContract` |
| Prior PROMPT 22 gate (retained) | | | | |
| → `v8-bb-membership` | 9 | 0 | 0 | Includes BB18-M |
| → activity + announcements + V7 schema/identity | 57 | 0 | 0 | |
| → `shared-platform` | 361 | 0 | 0 | |
| → `compatibility` | 276 | 0 | 0 | |
| → `blessboard` | 241 | 0 | 0 | |

**Local tests ≠ hosted PASS.** Hosted write verification remains operator-owned after migrations.

---

## 7. Deployment prerequisites (operator — not executed here)

1. Confirm maintenance window on **testing** DB only (`identity_key=moovex-platform-v7`, `environment_code=testing`).
2. Snapshot / backup testing DB before migrate.
3. Apply migrations in order via approved migrator (`039`→`042`, `110`→`112`).
4. Re-check `platform.schema_migrations` for all seven filenames.
5. Confirm V8 `/healthz` still `ok` + `schemaCompatible=true` on all three neuniversity hosts.
6. Spot-check V7 control hosts (`*.pronline.org`) health + critical paths (login, booking, announcements list).
7. Provision **disposable** V8 QA tenants/churches/clinics for write tests — do not mutate long-lived demo tenants.
8. Keep production profiles and production DB out of scope.

---

## 8. Hosted QA test plan

### 8.1 Hosts

| Product | Base URL |
|---------|----------|
| Apex / platform | `https://neuniversity.org/` |
| BlessBoard | `https://blessboard.neuniversity.org/` |
| ActiveClinic | `https://activeclinic.neuniversity.org/` |
| V7 control (regression) | `https://blessboard.pronline.org/` · `https://activeclinic.pronline.org/` |

### 8.2 Pre-flight checks (every session)

- [ ] Hosted `gitSha` matches intended `origin/V8` tip (or documented deploy SHA)
- [ ] `/healthz`: `deploymentCode=moovex-platform-v8-testing`, `expectedIdentityKey=moovex-platform-v7`, `schemaCompatible=true`
- [ ] Confirm migrations 039–042 / 110–112 **applied** before feature PASS claims
- [ ] Media: `/media` mount healthy; V8 writes land under `testing-v8` namespace only

### 8.3 All 84 screens (desktop + mobile)

Use [`V8_SCREEN_IMPLEMENTATION_COVERAGE.md`](./V8_SCREEN_IMPLEMENTATION_COVERAGE.md) matrix.

- [ ] SH01–SH15 (−D/−M) on BB and/or AC mounts as applicable
- [ ] BB01–BB22 (−D/−M) including BB18-M membership overview at ~390px
- [ ] AN01–AN05 (−D/−M) shared studio + BB public announcements
- [ ] Record empty / loading / error / denied states where designed
- [ ] No horizontal overflow at 390px on mobile paths

### 8.4 Twelve end-to-end user flows (disposable tenants)

| # | Flow | Pass criteria |
|---|------|---------------|
| 1 | Shared form builder create → publish → share/QR | Form persists; public token works |
| 2 | Public form submit → admin review status change | Idempotency + review statuses; no cross-tenant leak |
| 3 | BB membership multi-step apply (BB03–BB07) | Confirmation ref; **no** auto login account |
| 4 | Membership review queue approve / needs_follow_up / reject | Audit events; pastoral notes RBAC |
| 5 | Branch member directory + profile edit (BB14–BB15 / BB18) | Scoped counts; search/filter; no pastoral notes on overview |
| 6 | Branch transfer request + review (BB16) | Same-church only; open transfer uniqueness |
| 7 | Visitor / event / ministry registration (BB08–BB10) | Capacity/closure; no role auto-grant |
| 8 | Shared announcement studio schedule/publish (AN01–AN05) | Lazy visibility without worker |
| 9 | BB public announcements list/detail (BB21–BB22) | `public` audience only on website |
| 10 | Login + RBAC (HQ vs branch vs platform) | Permission denied surfaces; CSRF on mutations |
| 11 | Tenant / branch isolation | Church A cannot read Church B members/forms/announcements |
| 12 | Media upload + public delivery | Persist under `testing-v8`; public `/media` bytes OK |

### 8.5 V7 regression (control)

- [ ] V7 healthz OK on pronline hosts
- [ ] V7 login / booking / public website / announcements still functional after V8 migrations
- [ ] No V7 session cookie collision with V8 (`moovex_platform_v8_testing_sid` vs V7 cookie)

### 8.6 Registration / login / RBAC extras

- [ ] Platform / HQ / branch / member personas on disposable orgs
- [ ] Inactive domain / unauthorized host remain fail-closed
- [ ] ActiveClinic staff invite + clinic registration paths smoke (existing V8 AC fixes)

---

## 9. Blockers

| ID | Type | Detail | Blocks preflight PASS? |
|----|------|--------|------------------------|
| B1 | Operational | Migrations 039–042 / 110–112 **not yet applied** on shared testing DB | **No** (compatibility verified; apply is next operator step) |
| B2 | Product/design | Announcement background scheduler still gated (`jobsEnabled=false`); lazy visibility only | **No** |
| B3 | Process | Hosted write QA not executed in this prompt | **No** — preflight scope is readiness, not hosted PASS |

**No compatibility blocker.** Do not claim **hosted feature PASS** until B1 is cleared and §8 flows are executed.

---

## 10. Evidence index

| Evidence | Location / method |
|----------|-------------------|
| Coverage 84/84 | `docs/releases/V8_SCREEN_IMPLEMENTATION_COVERAGE.md` @ `bacdaedd` / `c3a73422` |
| Migration SQL | `db/migrations/platform/039–042_*.sql`, `db/migrations/blessboard/110–112_*.sql` |
| Lint | `lintMigrationSqlForV7Compatibility` → all LINT_OK |
| Contract tests | `tests/v8-migration-contract.test.js` (+ baseline) **19/19 PASS** |
| Hosted healthz | HTTP GET neuniversity apex / BB / AC |
| DB identity + migration lag | Read-only SQL on shared testing DB (`BEGIN READ ONLY` / `ROLLBACK`) |

---

## 11. Return code

```
V8_HOSTED_QA_PREFLIGHT_PASS
```

Migration compatibility with shared database identity **`moovex-platform-v7`** is **verified**. V8 deployment identity **`moovex-platform-v8-testing`** is present and live. No migrations, deploys, or hosted data mutations were performed by this prompt.
