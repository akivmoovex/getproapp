# V8 BlessBoard Public Registration (PROMPT 06)

**Verdict:** `V8_BB_PUBLIC_REGISTRATION_CODE_PASS`  
**Branch:** `V8` only  
**Date:** 2026-09-21  
**Prerequisites:** Prompt 03–05 shared forms CODE_PASS  
**Prior ancestry:** membership `938813bd` · activity `41030f85`  
**Stitch:** BB01–BB10 desktop + mobile  
**Hosts:** Code + local tests only (no deploy / no migration apply)

## Approach

Did **not** rebuild registration. Tip already provided church admin membership forms (BB01–BB02), four-step public apply (BB03–BB06), confirmation (BB07), and visitor/event/ministry registration via the shared form engine (BB08–BB10) with capacity and no auto roles.

This prompt closed baseline mobile/Stitch PARTIAL gaps: D/M markers, draft-safe mobile step navigation, and submission reference on confirmation.

## Flows

| Flow | Screens |
|------|---------|
| Church admin create/publish membership form | BB01 → BB02 |
| Visitor four-step membership application | BB03 → BB04 → BB05 → BB06 → BB07 |
| Visitor / event / ministry registration | BB08 / BB09 / BB10 (shared forms) |

## Requirements checklist

| Requirement | Status |
|-------------|--------|
| Church + branch scope | Present (host-scoped; client IDs ignored) |
| Draft-safe step navigation | **Added** mobile step Continue/Back (values stay in DOM) |
| Optional spiritual / household-style interests | Present (BB04/BB05 toggles from intake form) |
| Server-side validation | Present |
| Submission reference + confirmation | **Reference** on BB07 via `?ref=` UUID |
| Separate from platform login | Present (explicit copy + no account create) |
| No automatic privileged accounts | Present |
| Consent-aware visitor follow-up | Present (BB08 + shared consent) |
| Event capacity | Present (BB09 / activity service) |
| No automatic ministry-role assignment | Present |
| Reuses shared form engine | Present for BB08–BB10 |

## Changes in this prompt

| Area | Change |
|------|--------|
| Routes | Redirect `/register/submitted?ref=<id>`; sanitize UUID on GET |
| Views | BB01–BB07 / activity admin D/M markers; mobile step nav; confirmation reference |
| CSS | Step nav + reference styles; `tenant-auth.css?v=16` on register pages |
| Tests | Marker / step-nav / reference assertions |

## Tests

- `v8-bb-membership` + `v8-bb-activity-registration` + form builder + forms e2e — **31/31 PASS**

## Non-goals

- Applying migrations `110` / `041` on hosted DB  
- Hosted verification (not claimed)  
- BB11+ review admin (later prompt)
