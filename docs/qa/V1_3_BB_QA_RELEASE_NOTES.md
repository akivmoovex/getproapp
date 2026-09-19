# BlessBoard V1.3 QA Release Summary

**Hosted closure verdict:** `V1_3_BB_HOSTED_CLOSURE_FAIL`  
**Freeze gate verdict:** `V1_3_QA_FREEZE_BLOCKED`  
**Date:** 2026-09-20  
**Freeze / hosted QA SHA:** `c5910e075aac`  
**Prior hosted closure SHA:** `1640591df9bf`  
**QA host:** `https://blessboard.pronline.org`  
**Deployment:** `moovex-platform-testing` / `testing`  
**Production:** `https://blessboard.com` · untouched (`d4f5b190074d`)

## SHA alignment (freeze)

| Surface | SHA | Aligned? |
|---------|-----|----------|
| Local `HEAD` | `c5910e075aac` | Yes |
| `origin/V7` | `c5910e075aac` | Yes |
| BB hosted QA | `c5910e075aac` | Yes |
| AC hosted QA | `c5910e075aac` | Yes |
| Production BB | `d4f5b190074d` | Untouched (≠ QA) |

## Per-workflow hosted results

| # | Workflow | Result | Evidence |
|---|----------|--------|----------|
| 1 | Shared CDN structured-draft image | **PASS** | `bb-v1-2-final-gate-hosted.js` P1: upload → draft CDN → refresh → publish → public → replace. Final recheck: logo `2f00d4d6-…png` draft=live after publish 200. |
| 2 | Website section lifecycle | **PARTIAL** | About page: add `plain_text` + confirm-remove persist in manifest. Edit POSTs `saved_to_draft` 200 but **does not hydrate** after reload (`data-draft="0"` on about/home editor). Reorder sortIndex often unchanged. Default add used empty `body_text ""` which violates `page_sections_body_text_len` and surfaces publish as `lookup_error` / PG `23514`. |
| 3 | Branding / About image | **PASS** | BB About has **no** `about.story.image` field. Branding via `home.logo` CDN lifecycle PASS (gate + final). |
| 4 | Phone identity + country | **PASS** | `/register-church`: 245 countries, ZM default, KE/NG present; admin step split `phone_country`/`phone_national`; short phone rejected. |
| 5 | Website governance | **PASS** | Gate P0: finance cannot publish (UI + 403); cross-tenant 403; branch publish 403; HQ publish 200 `published`. Automated `v7-shared-website-governance` 14/14. |
| 6 | CSS versioning + public routing | **PASS** (hosted) | Live `tenant-public.css?v=60` (matches `blessboard-v5-frontend-assets` contract); asset 200; `/c/demo-church` → 301 `/c/demo-church/hq`. |

## Automated counts (freeze gate)

| Suite | Result | Counts |
|-------|--------|--------|
| `npm run test:blessboard:v5:regression` (full) | **PASS** | **726 / 726** (`/tmp/v13-freeze/bb-v5-regression.log`) |
| Shared V7 bundle (19 files) | **PASS** | **212 / 212** (`/tmp/v13-freeze/shared-v7-final.log`) |
| `blessboard-website-mode-public-routing` | **PASS** | **13 / 13** — assertions aligned to primary-branch `/hq` + flat legacy paths |

## Freeze gate — shared failure classification

| Failure | Classification | Action |
|---------|----------------|--------|
| `platform-identity-foundation` email duplicate → phone code | **Product defect** | Fixed: channel-accurate `duplicate_verified_email` / `duplicate_verified_phone`. |
| `v7-image-editor-coverage` catalogue vs `/library` | **Test-contract drift** | Doctors = catalogue + Content Library; services = `/library`. |
| Routing suite pre-`/hq` expectations | **Test-contract drift** | Updated to church-wide primary-branch contract (matches hosted 301). |
| Empty `body_text ""` on `add_section` → publish `23514` | **Product defect (shared)** | Fixed: add/apply use `NULL` instead of `""` for empty body (`websiteAddSectionService`, `websiteDraftApplyService`). Hosted re-verify required after deploy. |

## Hosted critical (freeze recheck on `c5910e075aac`)

| Check | Result | Evidence |
|-------|--------|----------|
| BB CDN structured-draft image (P1) | **PASS** | `bb-v1-2-final-gate-hosted.js` EXIT 0; upload→draft→refresh→publish→public→replace (`/tmp/v13-freeze/bb-cdn-gate.log`) |
| BB HQ publish endpoint | **PASS** | `POST /c/demo-church/website/publish` → `{"ok":true,"code":"published"}` |
| About editor `data-draft` hydration | **FAIL** | Still `data-draft="0"` on about with `website_mode=draft` after UI add / reload (`/tmp/v13-freeze/bb-section-publish-probe.json`) |
| CSS `tenant-public.css?v=60` | **PASS** | Live link present |
| Production BB SHA ≠ QA | **PASS** | `d4f5b190074d` |

## Remaining defects

1. **Major — draft hydration on editor (blocker):** About chrome stays `data-draft="0"` under `website_mode=draft`; saved drafts do not rehydrate after refresh. Confirmed again on `c5910e075aac`. **Blocks freeze PASS.**
2. **Minor — empty-body publish (mitigated):** Shared add/apply now persist `NULL` instead of `""` for empty body (`c5910e075aac`). Baseline HQ publish returns `published` without `lookup_error` on this probe; full add→edit→public marker proof still incomplete while hydration fails.
3. **Medium — section reorder / edit→public:** Incomplete while hydration remains.
4. **Low — (closed)** Routing test drift corrected.

## Bug counts (freeze delta)

| Bucket | Count |
|--------|-------|
| Fixed this freeze | 3 (identity duplicate-code product; empty body_text product; image-editor + routing test-contract drift) |
| Open Critical | 0 |
| Open Major | 1 (BB draft hydration) |
| Open Medium | 1 (section reorder/public marker proof) |
| Open Minor | 1 (empty-body residual certification) |
| Reopened | 0 |

## Production untouched

No production deploy, migrate, or media write. QA writes limited to testing `demo-church` + disposable registration form probes.

## Verdicts

- Hosted closure: `V1_3_BB_HOSTED_CLOSURE_FAIL`
- Freeze: `V1_3_QA_FREEZE_BLOCKED`
