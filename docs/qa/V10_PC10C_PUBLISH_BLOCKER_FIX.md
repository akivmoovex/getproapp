# V10 PC10C — Publish Blocker Fix

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_PC10C_PUBLISH_BLOCKER_FIX` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisites** | PC10A + PC10B complete |
| **Consolidation** | **NOT PERFORMED** |
| **Production / DB deploy** | **NOT TOUCHED** |
| **Verdict** | **`PC10C_PUBLISH_BLOCKERS_FIXED: YES`** |

---

## Root causes (from PC10A/PC10B)

### P0

1. **Role alias gap** — `resolvePublishCapability` only recognized catalogue keys (`organisation_administrator`, `branch_administrator`, …). Callers/tests/chrome still pass `church_hq_admin` / `branch_admin`, so capability returned `forbidden` even when `website.publish` RBAC allowed.
2. **Restore version mint aborted** — `projectPublishedFieldsToPages` (and SEO projection) could throw SQL (`23514` observed). A bare `catch` left the PostgreSQL transaction aborted; the subsequent `COMMIT` silently rolled back the newly inserted CMS publication version while still returning `ok: true`.

### P1

3. **Stale page-count contract** — suites hard-coded `8` while `PUBLIC_PAGE_KEYS` has **9** (includes `giving`).
4. **Stale path-public contract** — apex `/c/:org` (and church-wide page paths) intentionally **301** to primary-branch URLs; tests expected **200**.

---

## Fixes (minimal)

| Fix | File(s) | Change |
|-----|---------|--------|
| Role aliases | `src/blessboard/services/websiteDraftReviewService.js` | Accept `church_hq_admin` as HQ publisher label; `branch_admin` as branch publisher label. Does **not** widen RBAC — `website.publish` still required. |
| SAVEPOINT around engine projection | `src/blessboard/services/churchWebsitePublishService.js` | `SAVEPOINT bb_publish_engine_project` around `projectPublishedFieldsToPages`; rollback to savepoint on failure; log warning. |
| SAVEPOINT around SEO projection | `src/platform/website-engine/blessboardBridge.js` | Same pattern for `projectPublishedSeoToBranchScope`. |
| Restore mint recovery | `src/blessboard/services/websitePublicationVersionService.js` | Pass `deferServiceTimes: true`; if draft restoration remains pending after publish, mint version via `recordPublishVersionInTransaction` in a fresh TX; `ok` requires new current version id ≠ restored-from id. |
| P1 suite alignment | `tests/blessboard-church-website-publish.test.js` | `EXPECTED_PAGE_COUNT = PUBLIC_PAGE_KEYS.length`; follow 301 for apex path-public. |

No schema changes. No authorization widening. Server-derived scope unchanged. Architecture preserved (no publication convergence).

---

## Tests

### Focused (P0/P1 blockers)

```text
tests/v10-pc10b-bb-publish-baselines.test.js
tests/blessboard-website-draft-review-publish.test.js
tests/blessboard-church-website-publish.test.js
→ 28 pass · 0 fail
```

### Shared authorization / tenant

```text
tests/blessboard-p0-publish-auth.test.js
tests/v7-website-rbac.test.js
tests/v8-shared-rbac-tenant-isolation.test.js
tests/v7-shared-website-governance.test.js
tests/v7-shared-website-authorization-entrypoint.test.js
→ 57 pass · 0 fail
```

### AC / publish regression

```text
tests/v10-pc10b-ac-website-workflow-baseline.test.js
tests/v7-clinic-website-autonomy-acceptance.test.js
tests/phase4-publish-website.test.js
→ 27 pass · 0 fail
```

---

## Markers

```text
BB_PUBLISH_P0_PASS
BB_PUBLISH_P1_PASS
```

PC10B baseline status after fix (from focused run): all five baselines green, including `WEBSITE_PUBLISH_PARITY_BASELINE`.

---

## Remaining failures / out of scope

- Publication **convergence** (PC10 proper) not started.
- Legacy suites outside the runs above not re-audited exhaustively.
- Engine projection still logs `23514` warnings — CMS publish/version mint now survives; engine field projection remains best-effort.

---

## Verdict

```text
PC10C_PUBLISH_BLOCKERS_FIXED: YES

root causes:
- capability role alias gap (church_hq_admin / branch_admin)
- aborted TX from swallowed engine projection SQL → phantom restore versions
- stale tests for pageCount=8 and apex 200

files changed:
- src/blessboard/services/websiteDraftReviewService.js
- src/blessboard/services/churchWebsitePublishService.js
- src/blessboard/services/websitePublicationVersionService.js
- src/platform/website-engine/blessboardBridge.js
- tests/blessboard-church-website-publish.test.js

remaining failures: none in focused BB publish + shared authz + AC publish sample
```
