# V10 PC10A — Publish Blocker Triage

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_PC10A_PUBLISH_BLOCKER_TRIAGE` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Risk** | **HIGH (gate)** |
| **Code / DB / deploy** | **NONE** (read + reproduce only) |
| **Verdict** | **`PC10A_PUBLISH_BLOCKER_TRIAGE_COMPLETE`** · **`PC10_READY: NO`** |

Depends on: [`V10_PC10_PUBLICATION_CONVERGENCE_BLOCKED.md`](./V10_PC10_PUBLICATION_CONVERGENCE_BLOCKED.md), [`V10_PLATFORM_CONSOLIDATION_FINAL_RECONCILIATION.md`](./V10_PLATFORM_CONSOLIDATION_FINAL_RECONCILIATION.md).

---

## 1. Scope honored

- Read PC10/PC14 + publish paths; reproduced BB suites only.
- **No** publish refactor, code fix, DB/migration change, or deploy.

Repro (local foundation DB):

```text
tests/blessboard-church-website-publish.test.js
tests/blessboard-website-draft-review-publish.test.js
→ 16 tests · 10 pass · 6 fail  (/tmp/pc10a-repro.log)
```

PC01–PC09 commits touch **no** publish services, `PUBLIC_PAGE_KEYS`, path-public routes, or these two test files (`git log origin/V10..HEAD` — none).

---

## 2. Failure reports (reproduced)

### F1 — Default shell page count (`9 !== 8`)

| Field | Detail |
|-------|--------|
| **test/scenario** | `blessboard-church-website-publish` · `1–2. Foundation and Growth…` · assert `pages.rows.length === 8` after provision |
| **expected** | 8 HQ `public_pages` rows (draft, `branch_id` null) |
| **actual** | **9** rows |
| **root cause** | `PUBLIC_PAGE_KEYS` includes **9** keys (`home`…`giving`). Provision/`publishChurchWebsite` correctly emit all keys. Test still hard-codes **8**. Same constants on `origin/V10`. |
| **severity** | **P1** (suite contract drift; does not prove publish TX failure) |
| **affected layer** | Test baseline vs `publicContentConstants` / provision |
| **pre-existing vs PC** | **PRE_EXISTING** |

### F2 — Publish `pageCount` (`9 !== 8`)

| Field | Detail |
|-------|--------|
| **test/scenario** | Same suite · `4–7. Readiness gates, atomic publish…` · `assert.equal(published.pageCount, 8)` after successful `publishChurchWebsite` |
| **expected** | `pageCount: 8` |
| **actual** | `pageCount: 9` (publish itself returned `ok: true` before assert) |
| **root cause** | Same as F1 — engine reports `PUBLIC_PAGE_KEYS.length` (9). |
| **severity** | **P1** |
| **affected layer** | Test vs `churchWebsitePublishService` pageCount contract |
| **pre-existing vs PC** | **PRE_EXISTING** |

### F3 — Apex path-public home returns **301** not **200**

| Field | Detail |
|-------|--------|
| **test/scenario** | Same suite · `8–10. Public path available after publish…` · `GET /c/${organizationKey}` on apex host |
| **expected** | **200** with tenant-public shell |
| **actual** | **301** (logged: `GET /c/website-grw-… 301`) |
| **root cause** | Intentional routing: `pathPublicRoutes` org home `/c/:organizationKey` → **301** to primary-branch home (`orgHomeRedirectTarget` / `handleOrgHomeRedirect`). Publish succeeded (`published.ok === true`); failure is **legacy URL vs redirect contract**, not publish engine. |
| **severity** | **P1** (parity suite blocker; routing contract stale in test) |
| **affected layer** | Path-public routing (`pathPublicRoutes` / `pathPublicBranchRouting`) vs test |
| **pre-existing vs PC** | **PRE_EXISTING** (not introduced by PC01–PC09) |

### F4 — HQ service `publishWebsiteDrafts` → `forbidden`

| Field | Detail |
|-------|--------|
| **test/scenario** | `blessboard-website-draft-review-publish` · `HQ admin can publish when allowed…` · direct `publishWebsiteDrafts(…, actorRole: "church_hq_admin")` |
| **expected** | `published.ok === true` |
| **actual** | `ok: false`, `reason: "forbidden"` |
| **root cause** | `resolvePublishCapability` only treats HQ as `organisation_administrator` \| `church_system_administrator` \| `platform_administrator` \| `!actorRole`. Literal **`church_hq_admin`** falls through → `action: "forbidden"`. HTTP `POST /hq/content/draft-changes/publish` **passes** in the same run because routes use `resolveActorRole` → `organisation_administrator`. |
| **severity** | **P0** (governance publish capability contract broken for legacy/chrome role labels used by suite + some chrome helpers) |
| **affected layer** | `websiteDraftReviewService.resolvePublishCapability` ↔ callers/tests using `church_hq_admin` |
| **pre-existing vs PC** | **PRE_EXISTING** (identical at `origin/V10`; no PC touch) |

### F5 — Branch trusted publish capability → `forbidden` not `publish`

| Field | Detail |
|-------|--------|
| **test/scenario** | Same suite · `branch admin publishes when governance allows (trustedActive)` · `resolvePublishCapability({ actorRole: "branch_admin", canPublish: true, … })` |
| **expected** | `action: "publish"` |
| **actual** | `action: "forbidden"` (fails **before** `publishWebsiteDrafts`) |
| **root cause** | Capability resolver only accepts `branch_administrator` \| `branch_pastor`. Test/chrome label **`branch_admin`** is unknown → forbidden. (Service has a stray `opts.actorRole === "branch_admin"` check later, but capability gate never opens.) |
| **severity** | **P0** |
| **affected layer** | `resolvePublishCapability` role vocabulary vs BB multi-site governance labels |
| **pre-existing vs PC** | **PRE_EXISTING** |

### F6 — Branch submit-for-approval capability → `forbidden` not `submit_for_approval`

| Field | Detail |
|-------|--------|
| **test/scenario** | Same suite · `branch admin submits for approval when required` · `resolvePublishCapability` with `branch_admin` |
| **expected** | `action: "submit_for_approval"` |
| **actual** | `action: "forbidden"` |
| **root cause** | Same role-alias gap as F5. |
| **severity** | **P0** |
| **affected layer** | Same as F5 |
| **pre-existing vs PC** | **PRE_EXISTING** |

---

## 3. What still works (important negatives)

| Path | Result in repro |
|------|-----------------|
| `publishChurchWebsite` / readiness / unpublish (beyond pageCount assert) | Engine reaches success where exercised |
| HTTP Save and Publish (`/hq/content/draft-changes/publish`) | **PASS** |
| Confirm-publish guard, discard, cross-org reject | **PASS** |
| HQ CSRF publish entitlements subtest | **PASS** |
| Cross-tenant preview isolation subtest | **PASS** |

Platform `publicationService` / AC submit-unpublish were **not** failing in the reported BB P0/P1 set; no AC failure was reproduced in this triage run.

---

## 4. Missing baselines (still absent)

| Marker | Status |
|--------|--------|
| `TENANT_ISOLATION_TESTS_PASS` | **MISSING** (sample suites green elsewhere; no named PASS artifact) |
| `RBAC_PERMISSION_MATRIX_PASS` | **MISSING** |
| `WEBSITE_PUBLISH_PARITY_PASS` | **MISSING / blocked by F1–F6** |
| `BB_MULTI_SITE_GOVERNANCE_BASELINE_PASS` | **MISSING** (F4–F6 are the concrete governance-label gap) |
| `AC_WEBSITE_WORKFLOW_BASELINE_PASS` | **MISSING** (not exercised as a named baseline; no AC P0/P1 reproduced here) |
| `V10_CLEAN_CHECKPOINT_CREATED` | Still **ABSENT** (PC01/PC10) |

---

## 5. Inventory notes (read-only)

| Component | Role |
|-----------|------|
| `churchWebsitePublishService` (~1401) | BB lifecycle publish/unpublish; pageCount = `PUBLIC_PAGE_KEYS.length` (9) |
| `publicationService` (~375) | Shared AC-oriented engine — not implicated in these 6 fails |
| `websiteDraftPublishService` | Orchestrates draft apply + church publish; authz via RBAC `website.publish` then `resolvePublishCapability` |
| `websiteDraftReviewService.resolvePublishCapability` | HQ/branch action matrix — **role string mismatch** |
| `contentAdminRoutes` | Maps live HTTP roles to `organisation_administrator` / `branch_administrator` (explains HTTP green) |
| `pathPublicRoutes` | Apex `/c/:org` → 301 primary branch |

---

## 6. Verdict block

```text
PC10A_PUBLISH_BLOCKER_TRIAGE_COMPLETE

P0:
- F4 HQ publishWebsiteDrafts forbidden: resolvePublishCapability rejects actorRole "church_hq_admin" (expects organisation_administrator|…)
- F5 branch trusted capability: rejects "branch_admin" (expects branch_administrator|branch_pastor)
- F6 branch submit_for_approval capability: same role-alias gap

P1:
- F1/F2 public_pages / pageCount 9 !== 8 (PUBLIC_PAGE_KEYS has giving; tests hard-code 8)
- F3 GET /c/:org after publish returns 301 (intentional primary-branch redirect) vs test 200

MISSING_BASELINES:
- TENANT_ISOLATION_TESTS_PASS
- RBAC_PERMISSION_MATRIX_PASS
- WEBSITE_PUBLISH_PARITY_PASS
- BB_MULTI_SITE_GOVERNANCE_BASELINE_PASS
- AC_WEBSITE_WORKFLOW_BASELINE_PASS
- (+ V10_CLEAN_CHECKPOINT_CREATED still absent)

PC01-PC09_REGRESSIONS:
- NONE attributed (publish/path-public/constants/these tests untouched by PC commits; behavior matches origin/V10)

PRE_EXISTING_FAILURES:
- F1, F2, F3, F4, F5, F6 (all six)

PC10_READY: NO
```
