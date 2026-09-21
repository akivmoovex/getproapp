# V8 Minimum QA Readiness (PROMPT 42)

**Verdict:** `V8_READY_FOR_MANUAL_QA`  
**Branch:** `V8` only  
**Recorded:** 2026-09-21  
**Hosted application SHA:** `ecfddf5c1d78` (`origin/V8`)  
**Deployment:** `moovex-platform-v8-testing` (neuniversity)  
**Tenants:** disposable V8 QA only (`bb-v8qa-mub23a6v6a6b`)

### Explicit non-claims / non-actions

| Item | Status |
|------|--------|
| 84/84 hosted visual PASS | **Not claimed** |
| AN01 / AN04 visual polish | **Deferred** (remain in backlog) |
| Migrations / production / V7 tenant writes | **Not performed** |
| V7 code or deploy changes | **None** |

---

## 1. Fixes shipped

| Defect | Fix | Hosted evidence |
|--------|-----|-----------------|
| **BB21** list 404 | `churchUrlHelper` now uses `PUBLIC_PAGE_KEYS` from `publicContentConstants` (includes `announcements`) so church-wide `/c/:org/announcements` redirects to primary-branch list | **301** → `/c/…/hq/announcements` **200**; detail `122289ff-…` **200** |
| **BB13-M** overlap | Branch-admin CSS: decision panel `order: -1` at ≤899px; decision actions static (no sticky cover) | CSS `branch-admin.css?v=48` on `ecfddf5c` |
| **BB14-M** overlap | HQ CSS: `.bb-hq-actions--sticky` static in document flow at ≤799px on member profile forms | CSS `hq-admin.css?v=87` on `ecfddf5c` |

### Re-verified on hosted (not local-only)

| Check | Result |
|-------|--------|
| SH15 branch → HQ Form Studio | **403** HTML with `data-screen="SH15"` |
| BB03–BB06 membership wizard | Path-public `/register` **200**; stepper markers BB03–BB06; `tenant-auth.css?v=17` |
| BB21 list → detail | Redirect + list + published detail **PASS** |

---

## 2. Twelve end-to-end flows (preflight §8.4)

Harness: `scripts/local/v8-qa-readiness-p42-hosted.js`  
Artifact: `/tmp/v8-auth-qa/prompt42-qa-readiness.json`

| # | Flow | Result | Notes |
|---|------|--------|-------|
| 1 | Shared form create → publish → share/QR | **PASS** | Form + `/f/…` token |
| 2 | Public submit → admin review status | **PASS** | Submission persisted; status → `in_review` |
| 3 | BB membership multi-step apply | **PASS** | `/register/submitted`; no auto-login |
| 4 | Membership review decisions | **PASS** | HQ session → branch-admin detail; Approve / Follow-up / Decline present |
| 5 | Branch directory + profile | **PASS** | Save + Transfer UI present |
| 6 | Branch transfer request | **PASS** | Transfer UI on HQ member profile |
| 7 | Visitor / event / ministry registration | **PASS** | Disposable event/ministry seeded; register URLs **200** |
| 8 | Shared announcement studio | **PASS** | `/hq/announcement-studio` **200** |
| 9 | BB public announcements list/detail | **PASS** | List redirect + detail |
| 10 | Login + RBAC | **PASS** | HQ OK; branch Form Studio SH15 deny |
| 11 | Tenant / branch isolation | **PASS** | Other org path **404** / no leak |
| 12 | Media / public asset delivery | **PASS** | Static `/blessboard/…` asset **200** |

**Summary:** PASS **12** · FAIL **0** · BLOCKED **0**

---

## 3. Fixtures

| Fixture | Action |
|---------|--------|
| Published event + ministry | Seeded on disposable QA church for Flow 07 (testing DB, V8 deployment code only) |
| Forms / membership / announcements | Reused existing disposable QA tenant data; no V7/production tenants |

---

## 4. Regressions + V7 read-only

| Check | Result |
|-------|--------|
| `tests/v8-bb-qa-church-path-public.test.js` (incl. BB21 redirect) | PASS |
| `tests/v8-bb-announcements.test.js` | PASS |
| `tests/v8-shared-forms*.test.js` | PASS |
| `tests/v8-bb-membership*.js` | PASS |
| V7 `blessboard.pronline.org` `/healthz` | `moovex-platform-testing` · `03a89106e2fe` · `schemaCompatible=true` |
| V7 home HTTP | **200** |
| V8 hosts SHA | `ecfddf5c1d78` on BB + AC + apex |

---

## 5. Backlog

Updated [`docs/backlog/V8_V2_VISUAL_QA_BACKLOG.md`](../backlog/V8_V2_VISUAL_QA_BACKLOG.md):

- Closed **VQ-P0-001 / 002 / 003** (functional)
- **AN01 / AN04** remain OPEN (deferred polish)
- Remaining fixture BLOCKED rows unchanged except Flow 07 seeds

---

## 6. Return code

```
V8_READY_FOR_MANUAL_QA
```
