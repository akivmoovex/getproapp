# V8 Shared Forms P0 Closure — Prompt 39

**Verdict:** see end of report (hosted SHA gate)  
**Date:** 2026-09-21  
**Branch:** `V8` only  
**Baseline hosted SHA:** `bd2916bd3141`  
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

Evidence: `/tmp/v8-auth-qa/prompt35-flows-02-03.json` · public URL example `/f/PGeuH82U0Ek5fXFE3isziCBT`.

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
| `v8-shared-form-studio-authz` | PASS |
| `v8-shared-form-builder` | PASS |
| `v8-shared-forms-e2e` | PASS |
| `npm` / `scripts/v8/run-regression.js` | recorded below |

## Remaining visual PARTIAL (out of P0 journey scope)

From Prompt 37 SH themes — **not** claimed closed by this prompt:

- Form Studio chrome density vs Moovex Stitch (SH01, SH03–SH08, SH11–SH13)
- SH04 inspector / SH13 workflow state targeting
- SH07-M sharing control overlap
- SH11-M tab truncation
- SH02 empty-state / SH14 platform-admin fixtures (BLOCKED)

SH10 intentionally preserved.

## Hosted verification

Filled after commit/push + live `/healthz` check.
