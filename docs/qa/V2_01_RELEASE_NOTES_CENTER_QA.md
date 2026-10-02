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
| Hosted SHA (hub + BB + AC V8) | `32a94e56db0d` · `moovex-platform-v8-testing` · `testing` |
| Hub `/release-notes` public | **200** · `data-audience=public` · no Evidence column |
| Hub `/release-notes/2.01/qa` public | **200** · sanitized |
| BB apex `/release-notes` public | **200** · public (was 503 before this change) |
| BB apex `/release-notes/2.01/qa` public | **200** · no Evidence |
| BB/AC `/login` | **200** |
| V8 hosted smoke | **PASS** |
| Production BB | `03a89106e2fe` · `moovex-platform-production` · **untouched** |
| Hosted live `platform_admin` browser login | **NOT TESTED** — V8 QA tenant fixtures lack a `platform_admin` persona. Authorized unlock verified in automated tests (`platformAdminAuthorized` / Evidence gate). |
| Token auth regression | Preserved in code + unit tests |

---

## 5. Remaining gaps

1. Hosted interactive login as `platform_admin` not smoked (no QA persona in `.env.v8-qa-tenants`).  
2. Prefer header token over query when using shared secret.  
3. Optional later: dedicated `release_notes.internal` catalogue permission (would need migration + role grants — not done here).  
4. Stitch RNC UI still DOCUMENTATION PENDING.

---

## 6. Final SHA

| Ref | SHA |
|-----|-----|
| Application commit | `32a94e56db0d127f13eb6a5eba24c13d84ff112b` |
| Hosted `/healthz` | `32a94e56db0d` |

---

## Verdict (restated)

**`V2_01_RELEASE_NOTES_AUTH_QA_PASS`** — session-based `platform_admin` access implemented and verified in automated tests; token path preserved; tenant roles denied; hub + BB apex public hosted **200** on `32a94e56db0d`; no new migrations; production untouched. Hosted live platform_admin login remains an optional follow-up persona gap.
