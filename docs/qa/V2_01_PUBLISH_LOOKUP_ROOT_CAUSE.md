# V2.01 Publish / Lookup Root Cause

**Task:** `V2_01_PUBLISH_LOOKUP_ROOT_CAUSE`  
**Date:** 2026-09-25  
**Branch:** `V8` @ `550d5dc0c362` (hosted tip matched)  
**Deployment:** `moovex-platform-v8-testing`  
**Database:** `moovex-platform-v7` / `environment_code=testing`  
**Products:** BlessBoard + ActiveClinic (shared engine)  
**Priority:** P0  

**Verdict:** `V2_01_PUBLISH_ROOT_CAUSE_CONFIRMED`

---

## Executive summary

1. **The opaque “lookup error” on BlessBoard publish is not evidence of a database identity failure.** It is a **catch-all remap**: many real publish/apply/engine-bridge failures are returned as `status: "lookup_error"` / `reason: "lookup_error"`, then shown as generic UI copy.
2. **Multi-item publish of valid drafts works on current tip** for BlessBoard (same-page and cross-page) and ActiveClinic. A systemic “batch publish always fails” bug was **not reproduced**.
3. **ActiveClinic publish does not use `lookup_error`** on the publish route; it returns explicit `publicationService` codes (400/403/404).
4. **Hostinger application logs for 2026-09-24/25 were not accessible** from this environment (no SSH/hPanel log API). No invented log lines.
5. **Production was not modified** (`moovex-platform-production` / `03a89106e2fe`).

---

## 1. Source audit (Phase 1)

### Two publish stacks

| Stack | Entry | Core | Used by |
|-------|-------|------|---------|
| **A. Shared engine** | `POST …/website/publish` | `publicationService.publishWebsiteDraft` | ActiveClinic; BlessBoard via bridge |
| **B. BlessBoard classic + Phase 7 drafts** | `POST …/draft-changes/publish`, `…/api/inline-field/publish`, editor `…/website/publish` | `publishWebsiteDrafts` → `applyWebsiteDraftsInTransaction` → `publishChurchWebsite` → `publishFromLegacy` → **A** | BlessBoard HQ / branch / public editor |

### Flow (BlessBoard batch / pending changes)

```
editor save (draft only)
  → website_inline_field_drafts / website_structured_drafts
  → POST draft-changes/publish OR editor /website/publish OR inline-field/publish
  → authorize website.publish (RBAC preserved)
  → applyWebsiteDraftsInTransaction (all pending drafts)
  → publishChurchWebsite (same TX)
       → validate / readiness
       → mark public_pages published
       → record CMS publication version
       → publishFromLegacy → publicationService.publishWebsiteDraft
  → COMMIT → public LIVE rendering
```

Authorization (`website.publish`) and tenant scoping (`assertWebsiteInstanceScope` / session org) remain in front of publish. This investigation did **not** recommend weakening them.

### Where “lookup error” is manufactured

| Location | Behavior |
|----------|----------|
| `churchWebsitePublishService.js` ~899–919 | **Any** thrown error in publish TX except `PARTIAL_PAGE_PUBLISH` → `{ status: LOOKUP_ERROR, reason: "lookup_error" }`. Includes `WEBSITE_ENGINE_PUBLISH` from bridge (`engineCode` logged, not returned to UI). |
| `churchWebsitePublishService.js` ~351–359 | Readiness evaluation catch → `gaps: ["lookup_error"]` |
| `websiteDraftPublishService.js` ~315–319 | Unexpected TX errors (incl. apply throws) → `LOOKUP_ERROR` / `reason: "publish_failed"` |
| `websiteDraftPublishService.js` ~185–201 | Org lookup / authz exceptions → `LOOKUP_ERROR` |
| `websitePublicationValidationService.js` | Validation catch / message matching `/lookup/` → issue code `lookup_error` |

Structured engine-bridge failures **are logged** as JSON `event: "blessboard.website.engine_bridge"` via `logBlessBoardEngineBridgeFailure` (organizationId, instanceId, `engineCode`, …) — but the **HTTP/UI path still collapses** to opaque lookup/generic retry text.

### User-facing mapping (BlessBoard)

| Trigger status | HTTP / redirect | User copy |
|----------------|-----------------|-----------|
| `lookup_error` on `api/inline-field/publish` | **500** | “We could not publish these changes. Please try again.” |
| `lookup_error` / publish fail on draft-changes | **303** `?error=publish_failed` | “We could not publish… Drafts were preserved…” |
| Editor JSON publish | **400** with `code: "lookup_error"` | JSON only |
| Authz RBAC `LOOKUP_ERROR` (pre-publish) | **503** | “Access check is temporarily unavailable.” (different path) |
| `not_ready` | **409** / `?error=not_ready` | “Website is not ready to publish…” |

### ActiveClinic difference

`activeClinicWebsiteRoutes.js` publish returns `{ ok:false, code: <publicationService.code> }` with 400/403/404. **No `lookup_error` on the publish route.** Codes include `website_instance_not_found`, `forbidden`, `website_publish_locked`, `v8_incompatible_publish`, etc.

### Historical related defect (already mitigated)

`docs/qa/V1_3_BB_QA_RELEASE_NOTES.md`: empty `body_text ""` violated `page_sections_body_text_len` (PG **23514**) and surfaced publish as **`lookup_error`**. Shared add/apply later persist `NULL` instead of `""`. This is evidence that **constraint/apply failures have been mislabeled as lookup errors before**.

---

## 2. Hostinger logs (Phase 2)

| Item | Result |
|------|--------|
| Access path | **Inaccessible** — no Hostinger SSH, hPanel log download, or in-repo log pull for `neuniversity.org` workers from this agent environment |
| Invented evidence | **None** |
| What would be required | Operator export of Node app stdout for 2026-09-24–25 filtering `blessboard.website.engine_bridge`, `lookup_error`, `WEBSITE_ENGINE_PUBLISH`, `publish`, HTTP 4xx/5xx, PG codes |

**Implication:** Sep 24 “lookup error” reports cannot be timestamp-correlated to a specific `engineCode` without operator logs. Source + live repro remain the evidence base.

---

## 3. Database / content (Phase 3) — read-only

| Check | Result |
|-------|--------|
| Identity | `platform.database_identity` = `moovex-platform-v7` / `testing` |
| Sep 24–25 `website.published` audits | **62 success**, **0 non-success** for that action_key window |
| Sep 24 CMS versions | Church `test-gods-salvation` (`77297825-…`) versions **45→62** published/superseded through `2026-09-24T18:42:38Z` — aligns with “single-item publishing succeeded” QA narrative |
| Pending drafts (live) | Structured `draft` rows remain on several orgs (e.g. `demo-church`, `evangelical-church-in-zambia`, `test-new-baptist-church`); **not** on V8 QA org after repro cleanup |
| V8 QA BB instance | `fa6c908c-…`, product `blessboard`, `publish_policy=TENANT_PUBLISH`, `lifecycle_status=provisional` |
| Destructive ops | **None** |

No evidence of a shared-DB outage or identity mismatch causing Sep 24 publishes to fail; successful publishes dominate the audit trail.

---

## 4. Reproduction matrix (Phase 4)

Environment: hosted `550d5dc0c362`, tenants `bb-v8qa-mub23a6v6a6b` / `ac-v8-qa-mub23a6v6a6b`.  
Artifacts: `/tmp/v2-01-publish-lookup-repro.json`, `/tmp/v2-01-publish-lookup-repro2.json`, `/tmp/v2-01-publish-lookup-crosspage.json`, `scripts/local/v2-01-publish-lookup-repro-hosted.js`.

| ID | Scenario | Product | Expected | Actual | Classification |
|----|----------|---------|----------|--------|----------------|
| **PUB-01** | Multiple text edits one page → publish | BB | All live | 3 valid keys saved → `code=published` → all markers public (`e62274134a073a004a4d4302`) | **NOT REPRODUCED** (failure) |
| **PUB-01-AC** | Multiple text drafts → publish | AC | Explicit codes; live | 2 keys saved → `code=published` v2 (`6dfb2d9f71c2d0bdc520192e`); no lookup | **NOT REPRODUCED** (failure) |
| **PUB-02** | Multiple image edits | Both | — | Not re-run; prior V2 image hosted scripts PASS | **NOT TESTED** (this pass) |
| **PUB-03** | Mixed text (engine keys) | BB | Batch OK | Covered by PUB-01 + PUB-04 | **NOT REPRODUCED** (failure) |
| **PUB-04** | Edits across pages → draft-changes publish | BB | Batch OK | home+about+contact heroes → `notice=published`; all 3 markers live | **NOT REPRODUCED** (failure) |
| **PUB-05** | Multiple dynamic items | BB | — | Structured multi-item not automated here | **NOT TESTED** |
| **PUB-06** | Stale editor / concurrent admins | Both | — | Needs dual sessions | **NOT TESTED** |
| **PUB-07** | Retry after failure | BB | Retry works | First publish succeeded (`87f9ccd9abbea5cd4526a3fb`); no failure to retry | **NOT REPRODUCED** (failure path) |
| **PUB-08** | New media then publish | Both | — | Covered by prior V2 media hosted PASS | **NOT TESTED** (this pass) |
| **CTRL-A** | Invalid content keys then publish | BB | Explicit reject | `400 unknown_content_key` (e.g. `30d2ad5edff7d2a19b11f305`); **not** lookup_error | Control observation |
| **CTRL-B** | draft-changes with no ready drafts | BB | not_ready | `?error=not_ready` — **not** lookup_error | Control observation |
| **SRC-1** | Engine bridge failure remap | BB | Opaque lookup | Source contract: `WEBSITE_ENGINE_PUBLISH` / any TX throw → `LOOKUP_ERROR` (`churchWebsitePublishService.js:899–919`) | **CONFIRMED ROOT CAUSE** (opacity) |

---

## 5. Root cause classification (Phase 5)

### CONFIRMED ROOT CAUSE — Opaque “lookup error” on BlessBoard publish

**What QA likely saw:** a publish failure labeled “lookup error” / generic “could not publish”, especially when multiple pending changes made apply/bridge more likely to throw.

**Actual mechanism:** BlessBoard publish catch-alls remap **engine bridge failures, apply exceptions, validation crashes, and other TX throws** to `lookup_error`, discarding the real `engineCode` / PG code from the client response (while sometimes logging it server-side).

**Not confirmed as root cause:** PostgreSQL outage, wrong database identity, or missing `website.publish` for the Sep 24 success church (62 successful `website.published` audits).

### Multi-item publish failure (earlier report)

| Classification | Notes |
|----------------|-------|
| **NOT REPRODUCED** on tip `550d5dc0c362` | Valid multi-key and cross-page batch publishes succeeded for BB + AC V8 QA tenants |
| Possible past contributors (evidence-based, not claimed live) | Bad draft rows failing apply; engine `website_instance_not_found` / draft-save failure; V7-incompatible draft shapes; empty-body constraint (historical); readiness blockers shown as `not_ready` rather than lookup |

### Authz / tenant isolation

No defect found that would allow cross-tenant publish. Failures that *are* authz use `forbidden` / 403, not the publish TX lookup remap (except RBAC pre-check 503 “Access check temporarily unavailable”).

---

## 6. Affected code (no fixes applied)

| File | Role |
|------|------|
| `src/blessboard/services/churchWebsitePublishService.js` | Catch-all → `LOOKUP_ERROR` |
| `src/blessboard/services/websiteDraftPublishService.js` | Batch orchestrator; catch → `LOOKUP_ERROR` |
| `src/platform/website-engine/blessboardBridge.js` | `publishFromLegacy`; returns real codes then thrown as `WEBSITE_ENGINE_PUBLISH` |
| `src/platform/website-engine/blessboardEngineBridgeLog.js` | Structured failure logs (ops-visible if logs exist) |
| `src/platform/website/publicationService.js` | Shared engine publish (AC + bridge) — **no** LOOKUP_ERROR |
| `src/blessboard/http/contentAdminRoutes.js` | Maps lookup/publish_failed → 500 / redirect UX |
| `src/activeclinic/http/activeClinicWebsiteRoutes.js` | Explicit codes |

**This task did not implement or deploy publishing changes.**

---

## 7. Recommended fixes (for a follow-up prompt)

1. **Stop remapping publish TX failures to `lookup_error`.** Propagate `engineCode` / apply error codes (`INVALID_FIELD`, `APPLY_FAILED`, `website_instance_not_found`, PG code) into API `code` + review issues.
2. **Keep** structured `blessboard.website.engine_bridge` logs; add matching `requestId` on the JSON error body (already present on many routes).
3. **UI:** replace generic “lookup” / readiness-unavailable copy when a specific code exists; reserve true lookup language for RBAC/tenant resolution 503 only.
4. **Regression tests:** assert that forced `publishFromLegacy` failure returns `code: "website_engine_publish_failed"` (or `engineCode`), **not** `lookup_error`.
5. **Optional:** Hostinger log retention query runbook for `engine_bridge` events during QA windows.

**Risks of fixing:** clients/tests that assert `lookup_error` on publish must be updated; error taxonomy must stay tenant-safe (no snapshot bodies).

---

## 8. Outstanding questions

1. Exact Sep 24 UI string / screenshot and endpoint (`draft-changes/publish` vs editor vs inline-field) — still unknown without QA artifact or Hostinger logs.
2. Whether any Sep 24 failure was `not_ready` misreported verbally as “lookup error”.
3. Concurrent-admin (PUB-06) conflict behavior under Phase 7 drafts — untested.
4. Whether remaining pending drafts on non-QA churches (`demo-church`, etc.) would fail apply if published as a batch today.

---

## 9. Explicit non-actions

| Action | Done? |
|--------|-------|
| Speculative publish code fix | **No** |
| Deploy publishing changes | **No** |
| Production / V7 env changes | **No** |
| Destructive DB operations | **No** |

---

## Verdict

**`V2_01_PUBLISH_ROOT_CAUSE_CONFIRMED`**

- Confirmed: BlessBoard publish **mislabels** many failures as **`lookup_error`** via catch-all remapping (shared BB path; not AC).
- Confirmed: current tip **successfully publishes multiple valid changes** (same page and across pages) on disposable V8 QA tenants for BB and AC.
- Incomplete only for Hostinger log correlation of the original Sep 24 incident string — called out above; does not overturn the remapping root cause.
