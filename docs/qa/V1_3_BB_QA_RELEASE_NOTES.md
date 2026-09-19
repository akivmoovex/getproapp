# BlessBoard V1.3 QA Release Summary

**Hosted closure verdict:** `V1_3_BB_HOSTED_CLOSURE_FAIL`  
**Freeze gate verdict:** `V1_3_QA_FREEZE_BLOCKED`  
**Date:** 2026-09-20  
**Candidate / Hosted QA SHA (closure):** `1640591df9bf`  
**QA host:** `https://blessboard.pronline.org`  
**Deployment:** `moovex-platform-testing` / `testing`  
**Production:** `https://blessboard.com` · untouched (`d4f5b190074d`)

## SHA alignment

| Surface | SHA | Aligned? |
|---------|-----|----------|
| Local `HEAD` (closure) | `1640591df9bf` | Yes |
| BB hosted QA (closure) | `1640591df9bf` | Yes |
| AC hosted QA (closure) | `1640591df9bf` | Yes |
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

## Remaining defects

1. **Major — draft hydration on editor:** About (and after some publishes, home) chrome shows `data-draft="0"` even with `website_mode=draft`, so inline drafts do not reappear after refresh (`/tmp/v13-bb-closure/bb-draft-hydrate-publish.log`, `bb-final-workflows.json`). **Blocks freeze PASS.**
2. **Major — section add → publish (residual):** Root cause fixed in shared code (empty body → NULL); **not yet certified on hosted** until freeze candidate is deployed and section publish re-probed. Until then treat as open Major.
3. **Medium — section reorder / edit→public:** Full add→edit→reorder→remove→publish→public marker proof incomplete while hydration remains.
4. **Low — (closed)** Routing test drift corrected; no longer open.

## Production untouched

No production deploy, migrate, or media write. QA writes limited to testing `demo-church` + disposable registration form probes.

## Verdicts

- Hosted closure: `V1_3_BB_HOSTED_CLOSURE_FAIL`
- Freeze: `V1_3_QA_FREEZE_BLOCKED`
