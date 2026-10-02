# V2.01 BB-THEME-503 Fix QA

**Task:** `V2_01_BB_THEME_503_FIX`  
**Date:** 2026-09-26  
**Branch:** `V8` (tip) + promotion branch `v2-01-rc-bb-theme-503`  
**Testing:** `moovex-platform-v8-testing`  
**Production:** **DO NOT TOUCH** — remained `03a89106e2fe` / `moovex-platform-production`

**Refs:**  
- `docs/qa/V2_01_P1_RELEASE_GATE_SUMMARY.md`  
- `docs/qa/V2_01_SHARED_THEME_GALLERY_QA.md`  
- `docs/qa/V2_01_FIRST_ADDITIONAL_THEMES_QA.md`  
- `docs/qa/V2_01_SHARED_HQ_BRANCH_WEBSITE_QA.md`  
- `docs/qa/V2_01_BB_PROD_FUNCTIONAL_QA.md` (BB-THEME-503 / BB-WEBSITES-503)

**Personas (disposable):**  
- BB HQ · org `bb-v8qa-mub23a6v6a6b`  
- BB branch_admin · companion restricted role  
- AC admin · org `ac-v8-qa-mub23a6v6a6b`

---

## Verdict

### **`BB_THEME_503_FIXED`**

Root cause is **stale RC code** for path theme routes, plus a secondary **missing HQ apex alias** on tip. Path gallery already existed on V8 tip (`86e8f26c`+). Tip fix `c446f469` aliases `/hq/website/themes|websites` → canonical WE01 paths. Hosted BB+AC verification **24/0 PASS**. Production untouched (still 503 until RC promotes).

**Safe for RC promotion:** **YES** — promote branch `v2-01-rc-bb-theme-503` (`e3a2faeb`, stacked on `v2-01-rc-media-placement`). Do **not** promote full V8 tip if the goal is theme/websites-only.

---

## 1. Reproduction (exact evidence)

### Production RC `03a89106e2fe` (still broken — expected)

| URL | Status | Body | Request ID |
| --- | --- | --- | --- |
| `GET https://blessboard.com/c/bb-v8qa-mub23a6v6a6b/hq/website/themes` | **503** | `This page is not yet available in BlessBoard V5.` | `8af88eb3954e333441e4bd25` |
| `GET https://blessboard.com/c/…/website/themes` | **503** | same | (same class) |
| `GET https://blessboard.com/hq/website/themes` | **503** | same | (same class) |

- **Stack / DB error:** none. Controlled unavailable fallback from `v5FoundationServer` (`UNAVAILABLE_MESSAGE` / `v5_foundation_unavailable`).  
- **Database error:** none (`schemaCompatible=true` on `/healthz`).

### Testing tip before HQ alias (pre-`c446f469`)

| URL | Status | Meaning |
| --- | --- | --- |
| `GET …/c/{org}/hq/website/themes` (authed) | **200** | Path routes present on tip |
| `GET …/c/{org}/website/websites` (authed) | **200** | Websites chooser present on tip |
| `GET /hq/website/themes` (authed) | **503** | Apex never wired → unavailable catch-all |

---

## 2. Root cause

| Hypothesis | Result |
| --- | --- |
| Missing route wiring (path) | **YES on prod RC** — `blessboardWebsiteEditorRoutes` had no `/website/themes` or `/website/websites` in `03a89106e2fe` |
| Missing route wiring (HQ apex) | **YES on tip** — `/hq/website/themes|websites` fell through `app.use` unavailable handler |
| Missing view/asset | No — tip renders gallery HTML + CSS |
| Unsupported DB column/migration | No |
| Tenant/scope lookup | No (401 unauth / 200 authed on path) |
| Theme registry mismatch | No |
| **Stale RC code** | **Primary for prod path 503** — gallery commits `240a22ea` → `86e8f26c` → `6b2bf882` and websites `92604f25` are after RC |
| Another concrete cause | HQ apex alias gap (secondary; addressed in tip fix) |

---

## 3. Fix (smallest)

### Tip (`V8` / hosted testing)

**Commit:** `c446f469` — *Fix BB-THEME-503 by aliasing HQ theme and websites paths.*

- `src/blessboard/http/churchWebsiteAdminRoutes.js`  
  - `GET /hq/website/themes` → **303** `buildPublicWebsiteThemesPath`  
  - `GET /hq/website/websites` → **303** `buildPublicWebsiteWebsitesPath`  
- Contract asserts in theme gallery + HQ/branch website tests  

No theme redesign. No new theme packs. AC untouched except shared route presence already on tip.

### Promotion package (`v2-01-rc-bb-theme-503`)

**Base:** `v2-01-rc-media-placement` (`b0df05cd`) — required because tip `themeRegistry` imports `imagePlacement`.  
**Tip SHA:** `e3a2faeb` — theme registry/gallery/additional packs + websites chooser + HQ aliases (file checkout from `c446f469`).

Upstream originals already on full V8 tip: `240a22ea`, `86e8f26c`, `6b2bf882`, `92604f25`, `c446f469`.

**Migrations:** none.

---

## 4. Local tests

```text
node --test \
  tests/v2-01-shared-theme-gallery.test.js \
  tests/v2-01-shared-theme-infra.test.js \
  tests/v2-01-first-additional-themes.test.js \
  tests/v2-01-shared-hq-branch-website.test.js
```

**Result:** **26/26 PASS** (on `V8` tip and on promotion branch `e3a2faeb`)

---

## 5. Hosted QA (V8 testing tip `c446f469`)

| Surface | Value |
| --- | --- |
| Hosted SHA | `c446f4695017` · `moovex-platform-v8-testing` |
| BB | `bb-v8qa-mub23a6v6a6b` |
| AC | `ac-v8-qa-mub23a6v6a6b` |
| Production `/healthz` | `03a89106e2fe` · **unchanged** |
| Evidence | `/tmp/v2_01_bb_theme_503_fix_qa.json` |

| Check | Result |
| --- | --- |
| BB `/website/themes` (path) | **PASS** 200 Choose Website Theme |
| BB `/website/websites` (path) | **PASS** 200 scope list |
| BB `/hq/website/themes` alias | **PASS** 303 → `/c/…/website/themes` (rid `e630e34aabff22969117222a`) |
| BB `/hq/website/websites` alias | **PASS** 303 → `/c/…/website/websites` |
| Current theme card (`bb.default`) | **PASS** |
| Alternate theme card (`bb.contemporary-fellowship`) | **PASS** |
| Draft select alternate | **PASS** `published:false` |
| Preview draft | **PASS** contemporary-fellowship signal |
| Publish | **PASS** |
| Public theme | **PASS** |
| Rollback (select default + publish) | **PASS** |
| Authorized scope cards | **PASS** |
| Unauthorized denial (anon) | **PASS** 401 |
| Branch HQ denial | **PASS** 403 |
| Desktop + 390 CSS (`max-width:430px`) | **PASS** |
| AC theme gallery regression | **PASS** |
| AC single-clinic website card | **PASS** |

**Hosted summary:** **24/0 PASS**

---

## 6. Explicit non-actions

| Action | Status |
| --- | --- |
| Production deploy / RC cutover | Not performed |
| New theme packs / redesign | Not performed |
| AC behavior changes beyond shared tip code already present | Not performed |

---

## Return token

```
V2_01_BB_THEME_503_FIX = BB_THEME_503_FIXED
root_cause=stale_RC_missing_theme_routes + missing_HQ_apex_aliases
tip_commit=c446f469
hosted_sha=c446f4695017
promotion_branch=v2-01-rc-bb-theme-503
promotion_sha=e3a2faeb
tests=26/26
hosted=24/0
production=untouched(03a89106e2fe)
```
