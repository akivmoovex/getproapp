# V2.01 Release Notes Center QA

**Task:** `V2_01_RELEASE_NOTES_AUTHENTICATED_ACCESS`  
**Date:** 2026-09-25  
**Branch:** `V8`  
**Deployment:** `moovex-platform-v8-testing`  
**Production:** untouched  

---

## Verdict

**`V2_01_RELEASE_NOTES_AUTH_QA_PASS`**

Internal Release Notes can be unlocked via the existing **`platform_admin`** session (BlessBoard apex) without requiring the Hostinger shared token for ordinary QA. Shared **token header/query auth is preserved**. Public sanitized notes remain the default for visitors and ordinary tenant roles.

---

## 1. Access-control design

| Audience | Access |
|----------|--------|
| Public visitors | Sanitized Release Notes only |
| Ordinary tenant users (`church_hq_admin`, clinic staff, etc.) | Public sanitized only (no internal evidence) |
| `platform_admin` (active platform role) | Internal evidence, bug QA sources, documentation gaps |
| Shared token (`X-Release-Notes-Internal-Token` / query) | Internal (preserved; Hostinger-compatible) |
| Unauthorized / production env | Hub refused when `DEPLOYMENT_ENV=production` |

**Role chosen:** existing `platform_admin` (same gate as `/admin` platform shell).  
**New roles / permissions / migrations:** **None** — avoided least-privilege expansion and DDL.

**Surfaces**

| Host | Behavior |
|------|----------|
| `neuniversity.org` (QA hub) | Public + token (no product session cookies on hub) |
| `blessboard.neuniversity.org` apex | Public + upgrades to internal when V5 session has `platform_admin` |
| Tenant / non-apex hosts | Middleware skipped (no RNC mount) |
| ActiveClinic | No platform-admin shell; AC tenant roles do not unlock internal QA |

---

## 2. Files changed

| File | Change |
|------|--------|
| `src/platform/release-notes/releaseNotesService.js` | `resolveReleaseNotesInternalAccess`, `userHasPlatformAdminRole`, token helper preserved |
| `src/platform/release-notes/attachReleaseNotesRoutes.js` | Async handler; `createReleaseNotesMiddleware` for BB apex |
| `src/platform/http/v5FoundationServer.js` | Mount RNC after V5 session (apex only) |
| `src/platform/http/moovexPlatformRuntimeServer.js` | Await async hub handler; hub copy points to platform_admin path |
| `views/platform/release-notes/partials/footer.ejs` | Shows access via (`token` / `platform_admin_session`) without secrets |
| `tests/v2-01-release-notes-center.test.js` | Session/token/tenant denial + Evidence gate tests |
| `docs/qa/V2_01_RELEASE_NOTES_CENTER_QA.md` | This report |

---

## 3. Automated test results

`node --test tests/v2-01-release-notes-center.test.js` → **22/22 PASS**

Includes: public sanitization, token header, `platformAdminAuthorized` Evidence unlock, tenant-role denial, apex middleware skip, share forced public, hub routes.

---

## 4. Hosted verification

| Check | Result |
|-------|--------|
| Deploy tip | Record after push (see Final SHA) |
| Hub `/release-notes` public | Expected **200** (prior PASS; re-check post-deploy) |
| BB apex `/release-notes` public | Expected **200** after deploy (was 503 pre-change) |
| Hosted live `platform_admin` browser login | **NOT TESTED** — V8 QA tenant fixtures lack a `platform_admin` persona (HQ/branch only). Gate verified in automated tests. |
| Token auth regression | Preserved in code + unit tests |
| Production | Untouched |

---

## 5. Remaining gaps

1. Hosted interactive login as `platform_admin` not smoked (no QA persona in `.env.v8-qa-tenants`).  
2. Prefer header token over query when using shared secret.  
3. Optional later: dedicated `release_notes.internal` catalogue permission (would need migration + role grants — not done here).  
4. Stitch RNC UI still DOCUMENTATION PENDING.

---

## 6. Final SHA

Recorded at commit time after push (application commit for this auth change).

---

## Verdict (restated)

**`V2_01_RELEASE_NOTES_AUTH_QA_PASS`** — session-based `platform_admin` access implemented and verified in automated tests; token path preserved; tenant roles denied; no new migrations; production untouched. Hosted live platform_admin login remains an optional follow-up persona gap, not an implementation blocker for this auth task.
