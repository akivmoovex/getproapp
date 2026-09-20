# V8 Shared Public Form Submission (PROMPT 04)

**Verdict:** `V8_PUBLIC_FORMS_CODE_PASS`  
**Branch:** `V8` only  
**Date:** 2026-09-21  
**Prerequisite:** Prompt 03 `V8_SHARED_FORM_BUILDER_CODE_PASS` (`8eb82df0`)  
**Prior E2E ancestry:** `d76b2975` ([`V8_SHARED_FORMS_E2E_PROMPT08.md`](./V8_SHARED_FORMS_E2E_PROMPT08.md)) — SH08–SH10 backend already present  
**Stitch:** SH08–SH10 desktop + mobile (`projects/5087412725796049014`)  
**Hosts:** Code + local tests only (no deploy / no migration apply)

## Approach

Did **not** rebuild public submit. Tip already provided published-form GET/POST, server-side schema validation, durable `tenant_form_submissions`, idempotency keys, consent, rate limiting, and product isolation via `tenantFormService.submitPublicForm` + migration `040` (still **not applied** overnight).

This prompt closed baseline **PARTIAL** SH09 UI gaps: dedicated validation surface markers, error summary, submit loading state, and SH10 confirmation/reference polish.

## Flow

Published Form (SH08) → Public visitor → Validation errors (SH09) → Submit → Persist → Confirmation (SH10).

## Requirements checklist

| Requirement | Status |
|-------------|--------|
| Public form rendering | Present + Stitch SH08 D/M markers |
| Server-side validation | Present (`formSchema` / submit service) |
| Durable submission records | Present (`platform.tenant_form_submissions`) |
| Idempotent retry | Present (`idempotency_key`) |
| Inline errors + error summary | **Strengthened** (summary list + field hints) |
| Submission loading state | **Added** (disable button + aria-busy + hint) |
| Success confirmation + reference | Present + `data-mx-forms-reference` |
| Safe server-error recovery | Present (`safePublicError` copy; CSRF reload message) |
| Tenant/product/branch/facility isolation | Present |
| Rate limiting / spam protection | Present (express limiter + hashed IP bucket) |
| Privacy / consent | Present (required consent; non-clinical copy) |
| No unrestricted clinical collection | Enforced (forbidden categories / schema) |

## Changes in this prompt

| Area | Change |
|------|--------|
| `public-form.ejs` | SH08/SH09 stitch D/M; error summary; loading script; keep BB category screens only on ready state |
| `public-thanks.ejs` | SH10 stitch D/M + reference marker |
| `forms-builder.css` | Error summary + submitting styles; cache `?v=4` |
| Tests | Stronger SH09/SH10 HTTP + template assertions |

## Tests

- `tests/v8-shared-forms-e2e.test.js` + `tests/v8-shared-form-builder.test.js` — **19/19 PASS**

## Non-goals

- Applying migrations `039`/`040` on hosted DB  
- SH11–SH14 admin review (later)  
- Hosted verification (not claimed)
