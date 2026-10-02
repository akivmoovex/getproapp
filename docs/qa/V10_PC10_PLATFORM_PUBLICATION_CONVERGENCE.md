# V10 PC10 — Platform Publication Convergence

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_PC10_PLATFORM_PUBLICATION_CONVERGENCE` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisites** | `PC10D_PUBLISH_GATE_PASS` · `PC10_RESUME_AUTHORIZED: YES` |
| **Deploy / production** | **NOT TOUCHED** |
| **Verdict** | **`PLATFORM_PUBLICATION_CONVERGENCE_PASS`** |

---

## 1. Target shape

```text
Product HTTP / CMS paths (compatibility retained)
        ↓
Platform publicationOrchestrator
  · authorization contract invocation
  · lifecycle dispatch
  · soft savepoint TX helper
  · shared version mint (publicationService)
        ↓
BB publication governance adapter     AC publication governance adapter
  · HQ/branch/multi-site rules          · clinic submit/unpublish/publish
  · church readiness/validation         · review-before-publish policy
  · churchWebsitePublishService*        · publicationService /
  · createRestoredDraft*                  submissionService*
```

\* Compatibility implementation services — **not deleted**.

---

## 2. Shared mechanisms (platform)

| Mechanism | Module | Notes |
|-----------|--------|-------|
| Authz gate + dispatch | `src/platform/website/publicationOrchestrator.js` | Facade over `lifecycleOrchestrator`; no product `if` forests |
| Soft savepoint TX | `src/platform/website/publicationTransaction.js` → `runSoftSavepoint` | PC10C-safe compatibility projections |
| Draft→published / unpublish / restore-live | `src/platform/website/publicationService.js` | Shared engine instance publication |
| Version mint + moderation/audit | `publicationService.createPublicationVersion` | Re-exported on orchestrator |
| Submit packaging | `src/platform/website/submissionService.js` | Used by AC adapter only |
| Engine lifecycle entry | `publishProductWebsite` / `unpublish` / `restore` | Now alias orchestrator methods |

---

## 3. BB adapter

**File:** `src/blessboard/website/blessboardPublicationGovernanceAdapter.js`

Owns:

- HQ / branch / multi-site governance (via `churchWebsitePublishService`)
- Church readiness + validation gates
- Restore → draft (`createRestoredDraft`)
- No AC submit/unpublish clinic workflow

**Registration:** `registerBlessBoardPlatformContracts` → `registerPublicationGovernance(BLESSBOARD, adapter.lifecycleHandlers())`.

---

## 4. AC adapter

**File:** `src/activeclinic/website/activeClinicPublicationGovernanceAdapter.js`

Owns:

- Clinic publish / unpublish / restore-live
- Submit-for-review (`submit` on adapter; not registered as BB lifecycle action)
- Review-before-publish / policy locks remain inside `publicationService`

**Registration:** `registerActiveClinicPlatformContracts` → `registerPublicationGovernance(ACTIVECLINIC, adapter.lifecycleHandlers())`.

**Addition:** AC lifecycle now also registers **restore** (was publish/unpublish only).

---

## 5. Duplicate code removed

| Before | After |
|--------|-------|
| Inline `SAVEPOINT bb_publish_engine_project` in `churchWebsitePublishService` | `runSoftSavepoint(...)` |
| Inline `SAVEPOINT unpublished_engine_seed` | `runSoftSavepoint(...)` |
| Inline `SAVEPOINT bb_engine_seo_project` in `blessboardBridge` | `runSoftSavepoint(...)` |
| Bootstrap directly wiring service functions | Bootstrap wires **governance adapters** |

No permission catalogues merged. No tenant-isolation weakening. BB and AC workflows remain distinct.

---

## 6. Compatibility paths retained

| Path | Status |
|------|--------|
| `churchWebsitePublishService.publishChurchWebsite` / `unpublishChurchWebsite` | **Retained** — BB adapter + HTTP routes |
| `websiteDraftPublishService.publishWebsiteDrafts` | **Retained** |
| `publicationService.publishWebsiteDraft` / `unpublishWebsite` / `restoreWebsiteVersionLive` | **Retained** — AC adapter + routes |
| `submissionService.submitWebsiteChanges` | **Retained** — AC routes + adapter `submit` |
| `websitePublicationVersionService.createRestoredDraft` | **Retained** — BB restore |
| BB editor `publishChurchWebsite` string / AC `publishWebsiteDraft` + `/website/submit` + `/website/unpublish` | **Retained** (PC07 contract) |
| Classic CMS → engine bridge | **Retained** (soft-savepoint projections) |

---

## 7. Tests

| Suite | Result |
|-------|--------|
| `tests/v10-pc10-publication-convergence.test.js` (new) | **8 / 8 PASS** |
| `tests/v10-pc10b-bb-publish-baselines.test.js` | **PASS** |
| `tests/v10-pc10b-ac-website-workflow-baseline.test.js` | **PASS** |
| `tests/v7-website-engine-contract.test.js` | **PASS** |
| `tests/blessboard-church-website-publish.test.js` | **PASS** |
| `tests/v10-pc07-shared-website-editor-http.test.js` | **PASS** |
| `tests/v7-shared-website-authorization-entrypoint.test.js` | **PASS** |

PC10B markers reconfirmed green during extraction (no P0/P1, tenant-isolation, or authorization regression).

---

## 8. Remaining publication debt

1. **CMS vs engine dual publish** — BlessBoard still mints CMS publication versions *and* engine versions; full single-writer convergence deferred until parity proof on classic CMS retirement.
2. **Route-layer still calls product services directly** — intentional compatibility; optional later thin route → adapter hop without deleting service exports.
3. **Engine projection `23514` warning** — soft-savepointed; CMS publish remains green (known PC10C residual).
4. **`initial_foundation_publish_version` savepoint** — still local (rethrows on non-schema errors); candidate for a “soft with rethrow filter” helper later.
5. **Permission catalogues** — intentionally **not** merged (out of scope).
6. **BB submit vs AC submit** — different product workflows; do not unify.

---

## 9. Verdict

```text
PLATFORM_PUBLICATION_CONVERGENCE_PASS

PC10D_PUBLISH_GATE_PASS (prerequisite)
TENANT_ISOLATION_TESTS_PASS (PC10B reconfirmed)
RBAC_PERMISSION_MATRIX_PASS (PC10B reconfirmed)
WEBSITE_PUBLISH_PARITY_PASS (PC10B reconfirmed)
BB_MULTI_SITE_GOVERNANCE_BASELINE_PASS (PC10B reconfirmed)
AC_WEBSITE_WORKFLOW_BASELINE_PASS (PC10B reconfirmed)

Deploy: NOT TOUCHED
```
