# V8 Shared Forms P0 Closure — Prompt 39

**Verdict:** `V8_SHARED_FORMS_P0_PASS`  
**Date:** 2026-09-21  
**Branch:** `V8` only  
**Implementation SHA:** `3946db34e639be005901ae739217ce2a1758c72d`  
**Hosted application SHA:** `3946db34e639` (confirmed via `/healthz` on `blessboard.neuniversity.org`)  
**Baseline (pre-fix):** `bd2916bd3141`  
**QA tenant:** `bb-v8qa-mub23a6v6a6b`  
**Stitch SH15:** `63988d9e71c4488e8f213d76d09b164e` (D) / `df0a248d1a824278aea48dd8db1260cc` (M)

## Goal

Complete one working hosted journey:

**Create Form → Edit → Publish → Share → Public Submit → Confirmation → Admin Review**

Plus SH15 browser access-denied UI (preserve HTTP **403** + non-HTML API text contract). Preserve SH10 PASS.

## Pre-fix hosted reproduction (`bd2916bd3141`)

| Check | Result |
|-------|--------|
| Create → Publish → Share → `/f/…` | **PASS** (Prompt 35 harness) |
| Anonymous GET `/f/…` | **200** with fields |
| Public submit + SH10 thanks | **PASS** |
| Admin list / detail / status → `in_review` | **PASS** |
| Branch isolation on HQ submissions | **403** |
| SH15 branch → `/hq/form-studio` | **FAIL** — plain HTML *“You do not have access to this site.”* (no `data-screen="SH15"`) |

Root cause for SH15: `createRequireBlessBoardPermission` HTML deny used generic `sendControlled` markup **before** Form Studio soft-deny/`access-denied.ejs` could render.

## Code changes (V8)

| Area | Change |
|------|--------|
| `requireBlessBoardPermission.js` | Optional `onHtmlForbidden` hook for HTML **403** only |
| `registerBlessBoardSharedFormRoutes.js` | Wire hook → `access-denied.ejs` @ **403**; `renderAdmin` access-denied → **403** |
| `registerActiveClinicSharedFormRoutes.js` | Same access-denied **403** status |
| `views/platform/forms/access-denied.ejs` | Stitch-aligned SH15 copy (HTTP 403 badge, isolation notice, return CTA) |
| `forms-builder.css` + layout `?v=6` | SH15 deny panel styles |
| Tests | Branch→HQ SH15 HTML + API contract; invalid form id **403** + SH15; CSS pin `v=6` |
| `scripts/local/v8-shared-forms-p39-hosted.js` | Full P0 journey + SH15 probe |

No migrations. No V7/production edits.

## Local tests

| Suite | Result |
|-------|--------|
| `v8-shared-form-studio-authz` | **PASS** |
| `v8-shared-form-builder` | **PASS** |
| `v8-shared-forms-e2e` | **PASS** |
| `scripts/v8/run-suite.js shared-platform` | **PASS** (361/361) |
| `scripts/v8/run-suite.js compatibility` | **PASS** (276/276) |
| `scripts/v8/run-suite.js activeclinic` | **PASS** (106/106) |
| `scripts/v8/run-suite.js blessboard` | **1 pre-existing FAIL** — `tenant auth templates preserve CSRF…` expects `action="/register"` on membership register (BB03); **not** in this prompt’s diff |

## Hosted evidence (`3946db34e639`)

Harness: `scripts/local/v8-shared-forms-p39-hosted.js` → `/tmp/v8-p39-hosted-final.json`

| Step | Result | Evidence |
|------|--------|----------|
| Create | PASS | Form `studio` path after POST `/hq/form-studio/new` |
| Edit | PASS | Title + Notes field persisted on studio save |
| Publish | PASS | Publication publish POST |
| Share | PASS | Public path `/f/cQPxi2tF8KNP0ju4bxmRlXoM` |
| Anonymous GET | PASS | **200**, form fields present |
| Public submit / SH10 | PASS | Thanks + reference `6d33f7ed-d312-46f3-8c88-8967c5f0d22f`, `data-screen=SH10` |
| Admin review | PASS | Status → `in_review`, notes + answers persist on reload |
| SH15 HTML | PASS | Branch→`/hq/form-studio` **403**, `data-screen=SH15`, Stitch title, HTTP 403 badge |
| SH15 API | PASS | Accept JSON → **403** plain *“You do not have access to this site.”* (no SH15 markup) |
| Branch Form Studio | PASS | `/branch-admin/form-studio` **200** |

Public URL: `https://blessboard.neuniversity.org/f/cQPxi2tF8KNP0ju4bxmRlXoM`

## Remaining visual PARTIAL (out of P0 journey scope)

From Prompt 37 SH themes — **not** claimed closed by this prompt:

- Form Studio chrome density vs Moovex Stitch (SH01, SH03–SH08, SH11–SH13)
- SH04 inspector / SH13 workflow state targeting
- SH07-M sharing control overlap
- SH11-M tab truncation
- SH02 empty-state / SH14 platform-admin fixtures (BLOCKED)

SH10 intentionally preserved.

## Final verdict

**`V8_SHARED_FORMS_P0_PASS`**
