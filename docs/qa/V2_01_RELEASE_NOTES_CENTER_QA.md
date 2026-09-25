# V2.01 Release Notes Center QA

**Task:** `V2_01_RELEASE_NOTES_CENTER`  
**Date:** 2026-09-25  
**Branch:** `V8`  
**Deployment target:** `moovex-platform-v8-testing` (neuniversity.org)  
**Products:** BlessBoard, ActiveClinic, Shared GetPro Platform  
**Priority:** P1  

**Production:** untouched  

---

## Verdict

**`V2_01_RELEASE_NOTES_CENTER_QA_BLOCKED`**

Local implementation and automated tests **PASS**. Hosted `/release-notes` on `https://neuniversity.org/release-notes` still returns **404** (hub-only JSON) because this tip is **not deployed**. Per task rules, a live shareable URL is **not claimed**, and final hosted acceptance is **blocked** until deploy + hosted SHA verification.

---

## 1. Implemented functionality

| Area | Status |
|------|--------|
| Canonical `docs/releases/RELEASE_NOTES.md` | Done (evidence-backed; gaps marked) |
| Runtime catalog `releaseNotesCatalog.js` | Done — versions 1.0–2.01 |
| Routes on platform QA hub | `/release-notes`, `/release-notes/:version`, `/bugs`, `/qa`, `/share`, `/print` |
| Filters | Version, product, feature type, implementation status, QA status, bug severity |
| Status taxonomy | PLANNED … RELEASED (+ UNVERIFIED / DOCUMENTATION PENDING) |
| Public vs internal | Sanitized share; internal evidence requires `RELEASE_NOTES_INTERNAL_TOKEN` |
| Print / PDF | Print-friendly CSS + `window.print` / `/print` (no new Node PDF service) |
| Stitch UI | DOCUMENTATION PENDING (no Stitch project found) |
| Hub launcher link | “Release Notes Center” on QA hub home |
| Production isolation | Refused when `DEPLOYMENT_ENV=production` |
| No new workers / migrations | Confirmed |

---

## 2. Files changed

| Path | Change |
|------|--------|
| `docs/releases/RELEASE_NOTES.md` | **New** canonical notes |
| `docs/qa/V2_01_RELEASE_NOTES_CENTER_QA.md` | **New** this report |
| `src/platform/release-notes/releaseNotesCatalog.js` | **New** catalog |
| `src/platform/release-notes/releaseNotesService.js` | **New** filter/sanitize/auth |
| `src/platform/release-notes/renderReleaseNotes.js` | **New** EJS render |
| `src/platform/release-notes/attachReleaseNotesRoutes.js` | **New** hub handler |
| `views/platform/release-notes/*` | **New** overview / version / not-found + partials |
| `public/platform/release-notes-center.css` | **New** |
| `public/platform/release-notes-center.js` | **New** share/print helpers |
| `src/platform/http/moovexPlatformRuntimeServer.js` | Hub routes + `/platform` static + hub link |
| `tests/v2-01-release-notes-center.test.js` | **New** |
| `scripts/v8/suite-manifest.js` | Wire test into shared-platform (+ compatibility) suites |

Existing release/QA docs under `docs/releases/` and `docs/qa/` were **not** deleted or overwritten.

---

## 3. Source documents used

### Releases

- `docs/releases/V2_01_RELEASE_BASELINE.md`
- `docs/releases/V7_QA_RELEASE_NOTES_2026-09-05.md`
- `docs/releases/V8_QA_HOMEPAGE_VERSION_2_ONLY.md`
- `docs/releases/V8_IMPLEMENTATION_BASELINE.md`
- `docs/releases/V8_HOSTED_END_TO_END_QA_REPORT.md`
- `docs/releases/V8_BUG_002_SHARED_DEPLOYMENT_503.md`
- `docs/releases/V8_P0_503_ROOT_CAUSE_AND_FIX.md`
- Additional `docs/releases/V8_*` referenced in Version 2.0 summary

### QA / ActiveClinic V1

- `docs/qa/V1_3_BB_QA_RELEASE_NOTES.md`
- `docs/qa/V1_3_AC_QA_RELEASE_NOTES.md`
- `docs/qa/V2_01_PUBLISH_ERROR_DIAGNOSTICS_QA.md`
- `docs/qa/V2_01_PUBLISH_LOOKUP_ROOT_CAUSE.md`
- `docs/qa/V2_01_CHANGE_MANAGER_FOUNDATION_QA.md`
- `docs/qa/V2_01_TOOLBAR_REMINDERS_QA.md`
- `docs/qa/V2_01_UNPUBLISHED_CHANGES_QA.md`
- `docs/qa/V2_01_FIELD_HISTORY_RESTORE_QA.md`
- `docs/qa/V2_01_HOSTINGER_PROCESS_AUDIT.md`
- `docs/qa/V2_01_HOSTINGER_WORKER_CONSOLIDATION_PLAN.md`
- `docs/qa/V2_01_HOSTINGER_PACKAGE_A_QA.md`
- `docs/activeclinic/release/ACTIVECLINIC_V1_RELEASE_CANDIDATE_CLOSURE.md`
- `docs/release/V5_RELEASE_VERSIONING.md`
- `docs/platform/V1_WEBSITE_MORNING_QA_PACK.md` (related only; not a 1.2 release note)

---

## 4. Historical documentation gaps

| Gap | Handling |
|-----|----------|
| Unified BB+AC Version 1.0 | DOCUMENTATION PENDING / UNVERIFIED for BB |
| Version 1.1 packet | DOCUMENTATION PENDING |
| Version 1.2 certified packet | DOCUMENTATION PENDING |
| Stitch Release Notes screens | DOCUMENTATION PENDING |
| Dedicated V2.01 robots.txt ticket | Listed separately; UNVERIFIED hosted recheck |
| Production RELEASED cert for 2.0/2.01 | Not claimed |

---

## 5. Local test results

| Gate | Result |
|------|--------|
| `node --test tests/v2-01-release-notes-center.test.js` | **16/16 PASS** |
| `node --test tests/v8-qa-homepage-v2-only.test.js` | **9/9 PASS** (no regression) |

Covered: six versions, filters, public sanitize, internal token gate, production refuse, CSS asset, hub link, panels, unknown version 404.

---

## 6. Hosted QA results

| Check | Result |
|-------|--------|
| `GET https://neuniversity.org/release-notes` | **404** `platform_qa_hub_only` — **NOT DEPLOYED** |
| Hosted `/healthz` (pre-existing tip) | **200** `deploymentCode=moovex-platform-v8-testing` `gitSha` starts `e5bd58ad…` at probe time |
| Local tip SHA | `e5bd58adc7cf81725ce34b463d81b8a25850f224` (+ uncommitted RNC work) |
| Shareable live URL | **Not claimed** |

After deploy, required hosted checks:

1. Hub `/release-notes` → 200 HTML  
2. `/release-notes/1.0` … `/2.01` → 200  
3. Filters + share page sanitized  
4. `/healthz` `gitSha` matches intended deploy SHA  
5. Production hosts still do not expose the center (or refuse)

---

## 7. Final commit SHA

**Pending commit** — working tree contains Release Notes Center changes on top of `e5bd58ad`. Record the commit SHA here after the operator commits, then re-verify hosted SHA.

---

## 8. Actual verified Release Notes URL

**None yet (hosted 404).**  

Intended after deploy:

- `https://neuniversity.org/release-notes`

---

## 9. Actual verified version-specific URLs

**None yet.** Intended:

- `https://neuniversity.org/release-notes/1.0`
- `https://neuniversity.org/release-notes/1.1`
- `https://neuniversity.org/release-notes/1.2`
- `https://neuniversity.org/release-notes/1.3`
- `https://neuniversity.org/release-notes/2.0`
- `https://neuniversity.org/release-notes/2.01`
- Plus `/bugs`, `/qa`, `/share`, `/print` suffixes

---

## 10. Outstanding limitations

1. Hosted deploy required for PASS / shareable URL.  
2. Stitch visual parity pending approved screens.  
3. Internal QA detail requires configuring `RELEASE_NOTES_INTERNAL_TOKEN` on the testing deployment.  
4. No DB-backed editable QA dashboard (approval required before migrations).  
5. PDF = browser print only.  
6. V2.01 Change Manager items remain LOCAL QA PASS until hosted deploy of those features.  
7. Do not promote to production automatically.

---

## Verdict (restated)

**`V2_01_RELEASE_NOTES_CENTER_QA_BLOCKED`** — blocked on hosted deployment verification of `/release-notes`. Local suite green; evidence-only catalog in place; production unmodified.
