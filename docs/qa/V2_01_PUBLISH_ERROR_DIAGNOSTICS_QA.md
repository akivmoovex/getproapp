# V2.01 Publish Error Diagnostics QA

**Task:** `V2_01_PUBLISH_ERROR_DIAGNOSTICS_FIX`  
**Date:** 2026-09-25  
**Branch:** `V8`  
**Deployment:** `moovex-platform-v8-testing` (neuniversity.org)  
**Database:** `moovex-platform-v7` / `environment_code=testing`  
**Priority:** P0  

**Verdict:** `V2_01_PUBLISH_DIAGNOSTICS_QA_PASS`

---

## 1. Objective and scope

Fix BlessBoard **error reporting** for website publish so catch-alls no longer mask engine-bridge, apply, constraint, and other TX failures as `lookup_error`. Successful publishing behavior is unchanged. ActiveClinic already returns explicit `publicationService` codes — preserved.

**Not claimed fixed:** any intermittent underlying engine/DB failure from Sep 24 without reproduction. This task only corrects classification, diagnostics, and UI messaging.

---

## 2. Changed files

| File | Change |
|------|--------|
| `src/blessboard/services/websitePublishFailureDiagnostics.js` | **New** — classify / log / build failure result; public codes; friendly messages |
| `src/blessboard/services/churchWebsitePublishService.js` | Catch-alls → `buildPublishFailureResult`; readiness → `readiness_unavailable`; remove duplicate catch-all engine_bridge log on publish |
| `src/blessboard/services/websiteDraftPublishService.js` | Org/authz/TX catches use diagnostics; pass `requestId`; namespace require for testable apply/publish |
| `src/blessboard/services/websitePublishReviewService.js` | Friendly codes + ISSUE_META; `prepareWebsitePublishError` request ID + draft-preserved subtitle |
| `src/blessboard/http/contentAdminRoutes.js` | Inline publish JSON: `publicCode` / `engineCode` / `requestId`; draft-changes redirect + review UI copy |
| `src/blessboard/http/blessboardWebsiteEditorRoutes.js` | Editor publish JSON + HTML redirect carry codes / request ID |
| `src/blessboard/http/churchWebsiteAdminRoutes.js` | HQ publish error page + failure redirects use public codes / request ID (no opaque 503) |
| `views/blessboard/v5/content-admin/website-publish-review.ejs` | Alert shows actionable message + request ID attrs |
| `views/blessboard/v5/hq/phase4-publish-website-error.ejs` | Request ID display; BB layout preserved |
| `tests/v2-01-publish-error-diagnostics.test.js` | **New** — classification, secrets, inject failures, AC regression |

Related prior docs (unchanged by this fix): `docs/qa/V2_01_PUBLISH_LOOKUP_ROOT_CAUSE.md`.

---

## 3. Catch-all audit → mappings

| Former behavior | Original signal | Public code | Stage | Notes |
|-----------------|-----------------|-------------|-------|-------|
| Any publish TX throw → `lookup_error` | `WEBSITE_ENGINE_PUBLISH` + `engineCode` | Mapped via `ENGINE_CODE_TO_PUBLIC` or `website_engine_publish_failed` | `engine_bridge` | Preserves AC-aligned engine codes |
| Same | `INVALID_FIELD` / `APPLY_FAILED` / page/section/scope | `invalid_field` / `apply_failed` / … | `apply_drafts` | |
| Same | PG `23505` | `conflict` | `database` | Version / uniqueness |
| Same | PG `23514` / `23503` / `23502` | `constraint_violation` | `database` | Historical empty-body case |
| Same | `PARTIAL_PAGE_PUBLISH` | `partial_page_publish` | `page_update` | |
| Same | `CROSS_ORG` / `INVALID_SCOPE` | `forbidden` | `authorization` | |
| Same | Unknown | `publish_failed` | `unknown` / hint | **Never** `lookup_error` |
| Org lookup throw | DB/tenant read failure | `lookup_error` | `tenant_lookup` | Genuine lookup |
| Authz throw | RBAC check failure | `authz_unavailable` | `authorization` | Not lookup |
| Readiness catch | Evaluate readiness throw | `readiness_unavailable` | `readiness` | Gap list updated |
| Nested `PUBLISH_FAILED` | Inner `publishChurchWebsite` result | Inner `publicCode` / `engineCode` | Inner stage | No remask |

**Compatibility / security:** public responses expose only allowlisted codes, safe IDs, request ID, and friendly copy. No SQL, tokens, DB URLs, passwords, or private member/patient payloads.

---

## 4. Diagnostic log fields

Event: `blessboard.website.publish_failed` (single JSON `console.error` per failure; `skipLog` supported).

| Field | Present |
|-------|---------|
| `timestamp` | ISO |
| `requestId` / `correlationId` | Safe truncated IDs |
| `deploymentSha` | Short Git SHA |
| `product` | `BlessBoard` |
| `operation` | e.g. `publishChurchWebsite` |
| `organizationId` / `churchId` / `branchId` / `instanceId` | Safe IDs only |
| `httpStatus` | Hint |
| `publicCode` | Public-safe |
| `engineCode` | When known |
| `failureStage` | e.g. `engine_bridge` |
| `classification` | e.g. `engine` / `apply` / `lookup` |
| `databaseCode` | PG five-char when applicable |
| `errorClass` | Safe code/name |
| `stack` | Only when explicitly requested **and** non-production |

Bridge source continues to emit `blessboard.website.engine_bridge` at the bridge; publish catch no longer double-logs a second engine_bridge line for every failure.

---

## 5. UI contract

- Actionable failure message (code-specific when known).
- Request ID shown on publish-review and Phase 4 error pages / JSON.
- Drafts preserved messaging; live unchanged; **never** success flash on failure.
- BlessBoard HQ / branch / editor layouts retained; ActiveClinic publish route untouched.

---

## 6. Automated tests (local)

```text
node --test tests/v2-01-publish-error-diagnostics.test.js
→ 19 pass / 0 fail

node --test tests/v7-blessboard-publish-engine-bridge.test.js tests/blessboard-p0-publish-auth.test.js
→ 12 pass / 0 fail
```

Coverage includes: original codes not masked; genuine lookup; authz forbidden; cross-org isolation; apply/engine inject; no secret exposure; AC `publicationService` still has explicit codes and no `lookup_error` status literals.

Injected failures only — no QA customer data corruption.

---

## 7. Hosted deploy verification

| Check | Result |
|-------|--------|
| Target | `moovex-platform-v8-testing` only |
| Production | Untouched — `blessboard.com` `/healthz` still `03a89106e2fe` / `moovex-platform-production` |
| Pre-deploy hosted SHA | `550d5dc0c362` |
| Deployed tip | `45cf76480b63` (`45cf76480b63708bb1daae3014269a194cb7d03f`) |
| Post-deploy hosted SHA | **Matched** on `neuniversity.org`, `blessboard.neuniversity.org`, `activeclinic.neuniversity.org` |
| Hostinger application logs | **Incomplete** — SSH/hPanel log API inaccessible from this agent. Cannot confirm live `blessboard.website.publish_failed` lines on Hostinger. |
| Safe failure path | Local inject + classification tests PASS (19/19) |
| Safe success path | Engine-bridge dual-write + auth publish tests PASS (12/12); public BB home HTTP 200 on tip; prior multi-item publish PASS on `550d5dc0c362` (behavior unchanged on success) |

---

## 8. Unresolved underlying failures

None newly reproduced in this task. Sep 24 intermittent “lookup error” reports remain **unattributable** to a specific `engineCode` without Hostinger logs. After this deploy, any future failure should surface the real `publicCode` / `engineCode` / request ID instead of opaque lookup remapping.

---

## 9. Verdict

**`V2_01_PUBLISH_DIAGNOSTICS_QA_PASS`** — hosted `/healthz` `gitSha` matches `45cf76480b63`; local automated suite green. Hostinger **log** verification incomplete (operators can correlate by request ID once logs are available).
