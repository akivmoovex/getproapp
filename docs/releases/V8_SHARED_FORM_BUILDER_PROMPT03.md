# V8 Shared Form Builder (PROMPT 03)

**Verdict:** `V8_SHARED_FORM_BUILDER_CODE_PASS`  
**Branch:** `V8` only  
**Date:** 2026-09-21  
**Prerequisite:** [`V8_IMPLEMENTATION_BASELINE.md`](./V8_IMPLEMENTATION_BASELINE.md) — SH01–SH07/SH15 already **IMPLEMENTED** with SH03/SH04 mobile **PARTIAL**  
**Prior implementation:** `af850534` ([`V8_SHARED_FORM_BUILDER_PROMPT07.md`](./V8_SHARED_FORM_BUILDER_PROMPT07.md))  
**Stitch:** https://stitch.withgoogle.com/projects/5087412725796049014 · SH01–SH07 + SH15 (D/M)  
**Hosts:** Code + local tests only (no deploy / no migration apply)

## Approach

Did **not** rebuild the shared form builder. Tip already provides tenant CRUD, allowlisted schema, draft/publish/unpublish, QR/share with real access modes, BB/AC branding, and versioning via `platform.tenant_forms` + `039_shared_tenant_forms.sql` (still **not applied** overnight).

This prompt closed the baseline **PARTIAL** gaps for Stitch desktop/mobile markers and SH03-M / SH04-M studio density.

## Flow covered

Tenant Admin → Forms (SH01/SH02) → Create/Edit studio (SH03) + field settings (SH04) → Preview (SH05) → Save draft → Publication (SH06) → Share (SH07). Permission failures → SH15.

## Requirements checklist

| Requirement | Status |
|-------------|--------|
| Tenant-scoped form CRUD | Present (`tenantFormService`) |
| Approved field types + validators | Present (`formSchema` allowlist; no executable rules) |
| Field ordering + required | Present |
| Draft / publish / unpublish | Present |
| Public URLs + QR / link sharing | Present (`formShareService`) |
| Real access control (not link hiding) | Present (`open_public` vs `email_token` + discoverable) |
| Permission-aware admin | Present (AC website.* / BB requests.*) |
| Responsive Stitch UI D+M | Markers + mobile studio CSS strengthened |
| Shared BB/AC + separate branding | Present (violet / teal) |
| Server-side schema validation | Present |
| Form versioning | Present (`schemaVersion` + version rows) |
| No clinical intake / executable rules | Enforced in `formSchema` |

## Changes in this prompt

| Area | Change |
|------|--------|
| Views | Stitch D/M markers on SH01–SH07 + SH15; SH04 panel `data-screen` + stitch IDs on studio |
| CSS | Mobile studio stack, palette wrap, sticky save, field-settings order (`forms-builder.css`) |
| Cache | `forms-builder.css?v=3` |
| Tests | Expanded SH01–SH07/SH15 marker + mobile CSS assertions |
| Migration | None new — reuse `039` (not applied) |

## Tests

- `tests/v8-shared-form-builder.test.js` — **10/10 PASS**
- `tests/blessboard-forms-requests.test.js` — **11/11 PASS** (V7 path)

## Non-goals

- Applying migration `039` on hosted DB  
- SH08–SH14 submission review (later prompt)  
- Hosted verification (not claimed)
