# V10 PL04 — Canonical Publication

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_CANONICAL_PUBLICATION` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisites** | PL01–PL03 PASS |
| **DB deletion** | **NONE** (PL01–PL09 rule) |
| **Verdict** | **`V10_CANONICAL_PUBLICATION_PASS`** |

---

## Canonical path

```text
HTTP / workflow entry
  → platform publicationOrchestrator
       (authz gate: website.publish / website.restore)
  → BB governance adapter  XOR  AC governance adapter
  → product impl
       BB: churchWebsitePublishService / createRestoredDraft
       AC: publicationService (+ submit via submissionService, not merged)
```

BB HQ/branch governance and AC submit/unpublish semantics remain **separate adapters**. No BB↔AC merge.

---

## Old paths removed (entry bypass)

| Former direct call | Now |
|--------------------|-----|
| `blessboardWebsiteEditorRoutes` → `publishChurchWebsite` | `publicationOrchestrator.publish` |
| `churchWebsiteAdminRoutes` → `lifecycleOrchestrator` aliases | `publicationOrchestrator.publish/unpublish` |
| `websiteDraftPublishService` → `publishChurchWebsite` (in TX) | `publicationOrchestrator.publish` (same client TX) |
| `websiteChangeSubmissionService` approve → `publishChurchWebsite` | `publicationOrchestrator.publish` |
| `websitePublicationVersionService` restore-republish → `publishChurchWebsite` | `publicationOrchestrator.publish` |
| `websitePublicationVersionAdminRoutes` → `createRestoredDraft` | `publicationOrchestrator.restore` |
| `configureDemoChurch.publishScope` → `publishChurchWebsite` | `publicationOrchestrator.publish` |
| `platformAdminWebsitesService` → `unpublishChurchWebsite` (direct BB require) | `publicationOrchestrator.unpublish` |
| `activeClinicWebsiteRoutes` publish/unpublish → `publicationService.*` | `publicationOrchestrator.publish/unpublish` |

---

## Remaining compatibility (and why)

| Residual | Why kept |
|----------|----------|
| `churchWebsitePublishService` / `publicationService` / `submissionService` | **Impl** behind adapters (PL03 P5-3); not deleted |
| `blessboardBridge.publishFromLegacy` inside BB publish impl | Dual-writer engine projection — **PL06** (not PL04); still required for current BB live+engine consistency |
| `syncDraftToEngine` on inline/structured drafts | Draft dual-write — **PL06**; characterization test asserts still present |
| `publishInitialFoundationWebsite` in provision/repair | First-publish bootstrap TX helper (not HTTP dual entry); product provision semantics |
| AC `submitWebsiteChanges` via `submissionService` | AC-only workflow; deliberately **not** on BB adapter |
| Classic↔engine soft-savepoint / `23514` residual | Tied to dual-write; retire with PL06 |

---

## Preserved

- BB HQ/branch publish governance + readiness gates (adapter → church service)
- AC submit / unpublish / publish clinic autonomy (adapter → publication/submission services)
- RBAC: orchestrator `assertWebsiteAction` + product route checks (no grant widening)
- Tenant isolation suites green
- Versions / restore: draft-live integrity publish+restore subtests **PASS**
- Audit/history: still recorded inside product impl / version services

---

## Tests

| Suite | Result |
|-------|--------|
| `npm run test:architecture` | **PASS** (7/7) |
| `v10-pc10-publication-convergence` + `v10-pl04-canonical-publication` + PC10B BB/AC | **PASS** (33/33) |
| BB publish (`church-website-publish`, `p0-publish-auth`, `phase4-publish`) | **PASS** (29/29) |
| Tenant isolation + RBAC (`v8-tenant-product-isolation`, `v8-shared-rbac-tenant-isolation`, `batch2-rbac-isolation`) | **PASS** (29/29) |
| `v8-shared-website-lifecycle` + `v10-pc02` characterization | **PASS** (32/32) |
| `v7-website-draft-live-integrity` | Publish/restore subtests **PASS**; 2 fails = **PRE_EXISTING** path-public **301** + CDN demo image (**PC23 F2/F3**) — not PL04 publication regressions |

---

## Required marker

```text
V10_CANONICAL_PUBLICATION_PASS

Canonical: publicationOrchestrator + BB adapter + AC adapter
Removed: direct HTTP/workflow bypass of orchestrator (listed above)
Remaining: impl services; draft/engine dual-write (PL06); foundation first-publish helper
```
