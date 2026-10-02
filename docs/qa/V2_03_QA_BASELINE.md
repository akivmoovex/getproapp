# V2.03 QA — Release Baseline Freeze (QA01)

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_QA_BASELINE` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Candidate SHA** | `039ad22193c97759ce9bd5ca73fe56b0e38886ab` |
| **Checkpoint** | `039ad221` — V10 PL01–PL14 + DBCL canonicalization |
| **Mode** | Freeze / inventory only — **no** product refactor, **no** production DB/data/deploy |
| **Verdict** | **`V203_QA_BASELINE_FREEZE_PASS`** |

---

## Freeze identity

| Item | Value |
|------|--------|
| Branch | `V10` (ahead of `origin/V10`; not pushed by this freeze) |
| Application / QA candidate SHA | `039ad22193c97759ce9bd5ca73fe56b0e38886ab` |
| Prior tip before checkpoint | `21ba521cb3fe7b4ec38de1f85c44720969000b53` |
| Architecture canonicalization | **COMPLETE** (PL14) |
| DB compatibility cleanup | **COMPLETE** (DBCL12) |
| DB compatibility state | **`CANONICAL_WITH_JUSTIFIED_COMPATIBILITY`** |
| P0 platform cleanup blockers | **0** |
| Major DB cleanup required | **NO** |

---

## Documentation presence

### PL01–PL14

| Doc | Present |
|-----|---------|
| `docs/qa/V10_PL01_PRELIVE_CANONICALIZATION_AUDIT.md` … `V10_PL14_CANONICAL_PLATFORM_CLOSURE.md` | **YES** (14/14) |

### DBCL

| Artefact | Present | Notes |
|----------|---------|-------|
| `docs/qa/V10_DBCL09_*.md` … `V10_DBCL12_*.md` | **YES** | Final review / dead-code / fresh-DB / burden closure |
| `db/scripts/v10-dbcl01-cleanliness-audit.js` | **YES** | DBCL01 executable audit |
| `tests/v10-dbcl04|07|08|09|10|11-*.test.js` | **YES** | Characterisation / cleanup nets |
| Standalone `docs/qa/V10_DBCL01`–`08` markdown | **NO** | Early DBCL steps were executed (script/tests + chat evidence); closure recorded in DBCL09–12 / DBCL12 burden audit. **Doc gap only — not a P0.** |

---

## Canonical migration ceiling (disk + library)

| Module | Ceiling | Filename |
|--------|--------:|----------|
| platform | **043** | `043_shared_data_jobs_and_preferences.sql` |
| blessboard | **118** | `118_activeclinic_management_data_permissions.sql` |
| activeclinic | **042** | `042_patient_visit_summary_releases.sql` |
| getpro | **001** | `001_create_getpro_schema.sql` |
| ngo | **001** | `001_create_ngo_schema.sql` |

Verifier: `db/scripts/lib/canonicalMigrationBaseline.js` → `assertCeilingMatchesDisk()` **0 mismatches**; discovered migrations **205** + seeds **9**.

---

## QA database identity

| Item | Value |
|------|--------|
| `DEPLOYMENT_ENV` | `testing` |
| `PLATFORM_DEPLOYMENT_CODE` | `moovex-platform-testing` |
| `DATABASE_IDENTITY_EXPECTED` / live | `moovex-platform-v7` |
| Live `environment_code` | `testing` |
| Instance id | `c9189f08-e8ab-432c-a454-5a609ac91e32` (post-PL10) |
| Host / DB | `aws-0-eu-central-1.pooler.supabase.com` / `postgres` |
| Applied ceiling | platform/**043** · blessboard/**118** · activeclinic/**042** · getpro/**001** · ngo/**001** |
| Domain counts (probe) | orgs **3** · churches **2** · healthcare_orgs **1** |

---

## Production (intentionally behind / untouched)

| Item | Value |
|------|--------|
| Identity | `moovex-platform-v7` / `production` |
| Instance id | `f07b8580-ff60-4a88-9748-680db53d7179` |
| Ceiling | platform/**035** · blessboard/**107** · activeclinic/**035** |
| PL12 / PL13 | Reset **BLOCKED** / **ABORTED** — no production wipe |
| This freeze | **READ-ONLY** identity/ceiling probe only — **no writes**, **no deploy** |

```text
Production: UNTOUCHED (intentionally behind V2.03 canonical ceiling)
```

---

## Test baseline (QA01 re-run)

Environment: `NODE_ENV=test` · `GETPRO_TEST_DB=1` · testing identity gates · logs `/tmp/qa01/*.log`.

| Suite | Exit | Tests | Pass | Fail |
|-------|-----:|------:|-----:|-----:|
| architecture (`npm run test:architecture`) | 0 | 7 | 7 | 0 |
| migrations (+ PL07/PL04–09 + DBCL04/07–11) | 0 | 136 | 136 | 0 |
| platform-core | 1 | 275 | 273 | 2 |
| ac-batch1 | 0 | 28 | 28 | 0 |
| ac-batch2 | 0 | 27 | 27 | 0 |
| ac-batch3 | 0 | 29 | 29 | 0 |
| platform-publish-reg | 1 | 111 | 108 | 3 |
| bb-critical | 1 | 68 | 66 | 2 |
| ac-website | 1 | 39 | 38 | 1 |
| ac-foundations | 1 | 85 | 80 | 5 |

**P0:** 0 · **P1:** 0 · Failures are the same **PL11 F1–F9** P2 class (`TEST_DEBT` / `PRE_EXISTING` / `ENVIRONMENTAL`).

| ID | Surface | Class |
|----|---------|-------|
| F1–F2 | AC platform-02/03 registration edit navigation | P2 TEST_DEBT |
| F3–F4 | BB draft/live path-public + CDN demo | P2 PRE_EXISTING / ENVIRONMENTAL |
| F5 | AC website availability `user_roles` insert (freeze) | P2 PRE_EXISTING / TEST_DEBT |
| F6 | ACW09 CSS `?v=` pin | P2 TEST_DEBT |
| F7 | Patient portal guest token | P2 PRE_EXISTING / TEST_DEBT |
| F8 | Unified login host mismatch | P2 ENVIRONMENTAL / TEST_DEBT |
| F9 | Content Library `wantsHtml` local pin | P2 TEST_DEBT |

---

## Known intentional compatibility

From DBCL12 / PL14 (retained, not cleanup blockers):

- Classic ↔ engine website dual-write (`blessboardBridge` / `syncDraftToEngine` / overlay)
- Dual media stores (platform `website_media` + BB operational `media_assets`)
- `v7CompatibleWebsitePublish` / classic CMS adapters
- Frozen `blessboard.user_roles` table (runtime R/W **0**)
- Audit `COLS_LEGACY` until production receives 037+ / reset
- `server.legacy.js` active bootstrap (DBCL09 keep)
- V4→V5 / V5→V7 rollback migrators
- Class-E platform composition allowlist (size 30) — on-touch only

---

## Known P2 / P3 debt (non-blocking for QA start)

### P2 (PL14 / PC25 residuals)

| ID | Item |
|----|------|
| R-P2-01 | Class-E composition-root shrink (on-touch) |
| R-P2-02 | Editor route thinning (on-touch) |
| R-P2-03 | Classic CMS route/service retirement (product-gated) |
| R-P2-04 | Publish/CMS shim retirement (on-touch) |
| R-P2-05 | Minor test-contract pins (F1–F9 class) |

### P3

| ID | Item |
|----|------|
| R-P3-01 | gp-ops adoption on-touch |
| R-P3-03 | Thin platform re-exports on-touch |
| R-P3-04 | Finder stitch design-reference dirs (intentional retain) |
| R-P3-05 | Engine projection soft-savepoint residual |

### Doc gap

- DBCL01–08 standalone markdown reports not filed (evidence lives in scripts/tests + DBCL09–12).

---

## Explicit non-actions this freeze

- No product behavior refactor beyond already-completed V10 checkpoint
- No production deploy
- No production DB mutate / reset
- No force-push
- V2.01/V2.02 untracked QA screenshot dumps left **out** of the checkpoint (unrelated)

---

## Required marker

```text
V203_QA_BASELINE_FREEZE_PASS

candidate_sha: 039ad22193c97759ce9bd5ca73fe56b0e38886ab
branch: V10
qa_db: moovex-platform-v7 / testing @ ceiling platform/043 · blessboard/118 · activeclinic/042
db_state: CANONICAL_WITH_JUSTIFIED_COMPATIBILITY
architecture: PASS (7/7)
migrations+PL/DBCL nets: PASS (136/136)
ac_batch_1_2_3: PASS
critical_platform_bb_ac: PASS with known P2 F1–F9 only (P0=0 P1=0)
production: UNTOUCHED (ceiling 035/107/035 — intentionally behind)
```

---

## Next

Proceed with V2.03 QA against candidate SHA `039ad22193c97759ce9bd5ca73fe56b0e38886ab` on testing only.
