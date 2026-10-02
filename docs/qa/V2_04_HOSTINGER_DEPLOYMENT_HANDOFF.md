# V2.04 Hostinger Deployment Handoff — Candidate `33e5c296`

**Mode:** READ-ONLY handoff (no Cursor deploy · no production touch)  
**Date:** 2026-10-02  
**Environment:** TESTING only — `neuniversity.org` / `blessboard.neuniversity.org` / `activeclinic.neuniversity.org`  
**Deployment code:** `moovex-platform-v8-testing`

---

## Verified local identity

| Field | Value |
|-------|--------|
| BRANCH | `V4` |
| FULL_CANDIDATE_SHA | `33e5c29612942e1484086432214b733f353f8601` |
| SHORT_CANDIDATE_SHA | `33e5c2961294` |
| ORIGIN_V4_SHA | `4a7cf4beb6c234a78524b157099f27f9056e6738` |
| WORKTREE_STATUS | `V4...origin/V4` — dirty only: `docs/qa/V2_04_FINAL_HOSTED_MANUAL_QA_PACK.md` (unrelated to deploy payload) |
| SHA_MATCH (candidate == origin tip) | **FAIL** — origin tip is **ahead** of candidate |
| Candidate ancestor of `origin/V4` | **YES** |

### Inclusion flags (tree at `33e5c296`)

| Flag | Value | Notes |
|------|-------|-------|
| CANDIDATE_CONTAINS_C01 | **YES** | Catalogue services Stitch structure + CSS |
| CANDIDATE_CONTAINS_C02 | **YES** | Catalogue doctors Stitch structure + CSS |
| CANDIDATE_CONTAINS_E03 | **YES** | Doctor form `data-ac-stitch-editor="E03"` + `framingEnabled: true` |
| BUILD_IDENTITY_FILE_FIX_INCLUDED | **NO** | Shared `.getpro/build-identity.json` fallback landed later in `4a7cf4be…`, **not** in `33e5c296` |

**Parent of candidate:** `554d37406ef5f9e362f8accbb888dd9ebdb87ed2` (previous hosted tip at freeze).  
**Commit message:** `Ver 2.04 AC C01/C02/E03 catalogue Stitch parity.`

---

## Commits that matter

| SHA | Role |
|-----|------|
| `33e5c29612942e1484086432214b733f353f8601` | **Application candidate** — C01 / C02 / E03 catalogue Stitch parity |
| `dfb6057d6a5012bdaae3645dfd570b4aa8c1987a` | Docs-only handoff recording candidate SHA (no app runtime change) |
| `4a7cf4beb6c234a78524b157099f27f9056e6738` | **Later tip on `origin/V4`** — includes shared build-identity fix + public-site management pack + audit artifacts. **Not** the frozen C01 candidate SHA. |

---

## Files in candidate `33e5c296` (deployable delta vs parent)

### C01 Services

| Path | Why |
|------|-----|
| `views/activeclinic/app/website-cms-catalogue.ejs` | `data-ac-stitch-screen="C01"` when `tab=services`; desktop table, mobile cards, sticky bar, stats/banner, empty state, price presentation |
| `views/activeclinic/app/website-cms-catalogue-service-form.ejs` | C01 form surface markers; service image field framing enabled |
| `public/activeclinic/website-cms.css` | `AC-MW-C01 / C02` catalogue block (tokens, table, cards, sticky, chips) |
| `src/activeclinic/http/activeClinicWebsiteCmsRoutes.js` | Catalogue titles, `clinicKey` / `previewHref` / `returnTo`; `/catalogue/services` alias |
| `tests/v2-04-ac-catalogue-c01-c02-stitch-parity.test.js` | Focused **11/11** structure contracts |
| `docs/design/stitch-exports/AC_MW_C01_C02_E03_SCREEN_MAP.md` | Stitch IDs (required by focused test) |
| `docs/design/stitch-exports/ac-mw-c01-desktop.png` | Visual reference |
| `docs/design/stitch-exports/ac-mw-c01-mobile.png` | Visual reference |

### C02 Doctors

| Path | Why |
|------|-----|
| `views/activeclinic/app/website-cms-catalogue.ejs` | `data-ac-stitch-screen="C02"` when `tab=doctors`; rows/cards/sticky/status chips |
| `views/activeclinic/app/website-cms-catalogue-doctor-form.ejs` | C02 form markers; staff lookup retained; E03 photo editor wiring |
| `public/activeclinic/website-cms.css` | Shared C01/C02 catalogue chrome |
| `src/activeclinic/http/activeClinicWebsiteCmsRoutes.js` | `/catalogue/doctors` alias; preview/returnTo |
| `docs/design/stitch-exports/ac-mw-c02-desktop.png` | Visual reference |
| `docs/design/stitch-exports/ac-mw-c02-mobile.png` | Visual reference |

### E03 image editor integration

| Path | Why |
|------|-----|
| `views/activeclinic/app/website-cms-catalogue-doctor-form.ejs` | `data-ac-stitch-editor="E03"`; media-field `framingEnabled: true`, `contentKey: catalogue.doctor.photo`, `allowSeparateFraming: true` |
| `views/activeclinic/app/website-cms-catalogue-service-form.ejs` | Service image framing enabled (same shared media-field / Adjust Picture path) |
| `views/platform/website/partials/media-field.ejs` | **Unchanged in candidate** — existing Upload / Library / Adjust / Remove surface reused |

### Shared build identity file fallback

| Status on `33e5c296` | **NOT INCLUDED** |
|----------------------|-------------------|
| Required later files (on `4a7cf4be`, not this candidate) | `src/platform/runtime/sharedBuildIdentityMetadata.js` · updates to `src/platform/runtime/buildIdentity.js` · `src/startup/bootstrap.js` · `tests/v2-04-build-identity-git-branch.test.js` |
| Resolution order (after that tip is live) | env → `.getpro/build-identity.json` → git → UNKNOWN |

---

## Required Hostinger action (TESTING only)

**Do not touch production. Do not deploy from Cursor.**

### A. Deploy the frozen C01/C02/E03 candidate

1. **Deploy V4 at candidate SHA** `33e5c29612942e1484086432214b733f353f8601` to the Hostinger testing app that serves:
   - `neuniversity.org`
   - `activeclinic.neuniversity.org`
   - `blessboard.neuniversity.org`
2. **Restart testing app workers** (all hostname lsnode workers against the same hbuild tree).
3. **Confirm all three hosts report the same candidate SHA** via `/healthz` `gitSha` (and About where available):
   - Expect short match: `33e5c296…` / `33e5c2961294`
4. Re-run authenticated AC catalogue verify:
   - `/app/settings/website/catalogue?tab=services` (C01)
   - `/app/settings/website/catalogue?tab=doctors` (C02 + E03 on doctor edit)

### B. Shared build identity (RB-ID-01) — separate from this candidate

Candidate `33e5c296` **does not** include the shared build-identity file fix.

To get apex → `.getpro/build-identity.json` → BB/AC `V4 testing`:

1. Deploy a tip that **includes** `4a7cf4beb6c234a78524b157099f27f9056e6738` (or cherry-pick/rebuild that includes `sharedBuildIdentityMetadata.js` **plus** this candidate), **or** deploy `origin/V4` tip if operator accepts the extra public-site management delta bundled there.
2. Restart testing workers.
3. Verify **apex** seeds `.getpro/build-identity.json` (filesystem under the deployed hbuild; not necessarily a public HTTP route).
4. Verify **AC/BB** `/healthz`:
   - `branch=V4`
   - `displayLabel=V4 testing`
   - Prefer `branchSource=shared.build-identity` (or apex `GETPRO_GIT_BRANCH` on hub only)
5. Confirm hub remains `branchSource=GETPRO_GIT_BRANCH` with `GETPRO_GIT_BRANCH=V4` (apex-only env — do **not** require per-subdomain env).

### Operator note

| Goal | Deploy |
|------|--------|
| C01/C02/E03 catalogue Stitch only (frozen candidate) | Exact `33e5c29612942e1484086432214b733f353f8601` |
| C01/C02/E03 **and** RB-ID-01 shared identity | Tip ≥ `4a7cf4beb6c234a78524b157099f27f9056e6738` (contains candidate as ancestor) — review extra files in that tip before production-adjacent testing |

---

## Post-deploy verify checklist (after Hostinger action)

| Check | Expect |
|-------|--------|
| HUB_SHA / AC_SHA / BB_SHA | Same candidate (or agreed later tip) |
| HUB_BRANCH | `V4` |
| AC_BRANCH / BB_BRANCH | `V4` only after identity tip is live; else may remain `UNKNOWN` on `33e5c296` alone |
| Catalogue services | C01 desktop table + mobile cards + sticky |
| Catalogue doctors | C02 desktop/mobile + E03 on doctor photo edit |
| Production hosts | **Untouched** |

Evidence sinks: `docs/qa/V2_04_FINAL_HOSTED_MANUAL_QA_PACK.md` (RB-QA-03 / RB-QA-05), `docs/qa/V2_04_BUILD_IDENTITY_UNKNOWN_FIX.md` (RB-ID-01), remaining blockers.

---

```
BRANCH=V4
FULL_CANDIDATE_SHA=33e5c29612942e1484086432214b733f353f8601
SHORT_CANDIDATE_SHA=33e5c2961294
ORIGIN_V4_SHA=4a7cf4beb6c234a78524b157099f27f9056e6738
WORKTREE_STATUS=DIRTY_DOCS_ONLY
CANDIDATE_CONTAINS_C01=YES
CANDIDATE_CONTAINS_C02=YES
CANDIDATE_CONTAINS_E03=YES
BUILD_IDENTITY_FILE_FIX_INCLUDED=NO
PRODUCTION_UNTOUCHED=YES
FINAL=V2_04_HOSTINGER_DEPLOYMENT_HANDOFF_READY
```
