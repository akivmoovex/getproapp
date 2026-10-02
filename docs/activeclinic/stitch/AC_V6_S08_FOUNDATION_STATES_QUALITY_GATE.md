# AC-V6-S08 — Foundation States and Administration Quality Gate

**Verdict:** `ACTIVECLINIC_V6_S08_FOUNDATION_QUALITY_PARTIAL`  
**Date:** 2026-08-03  
**Branch:** `V6`  
**Deployment:** `activeclinic-org-v6` · `activeclinic.org`

## Exact Stitch screens

| Exact Stitch name | Stitch ID | Form factor | Category | Parity |
|---|---|---|---|---|
| Access Restricted | `8731b06bbfa747e98e05372c9aafb3e9` | Desktop | ACCESS_RESTRICTED | PARTIAL (functional; VISUAL_BLOCKED vs Stitch chrome) |
| Shared Error State | `72357dec37864a5a926a1d2b5c551b16` | Desktop | REQUEST_ERROR / SERVICE_UNAVAILABLE | PARTIAL |
| Shared Loading State | `8a3f15c0be9c47efb192f206df104d5c` | Desktop | LOADING | PARTIAL (form `aria-busy` / submit only; no artificial page skeletons) |
| Shared Offline State | `4d31c82537634b5f981c359662d224b3` | Desktop | OFFLINE | **DEFERRED** — no browser offline support; no fake workflow |
| P01 – Shared States – Desktop | `9b881d25874c41f9986246c61de32f41` | Desktop | state pack | PARTIAL (taxonomy + shared components; pack not pixel-matched) |

Module empty / no-results / incomplete states are **functional utilitarian** counterparts (STITCH_GAP for dedicated empty visuals). Mobile uses the same components and responsive shell (no separate mobile routes).

## State taxonomy

Implemented in `src/activeclinic/services/activeClinicStateTaxonomy.js`:

| Key | Meaning | Typical HTTP |
|---|---|---|
| `empty` | Authorized, no records | 200 inline |
| `no_results` | Authorized, filters hide matches | 200 inline |
| `loading` | Genuine pending submit | client `aria-busy` |
| `validation_error` | Form field/business validation | 200 form re-render |
| `request_error` | Recoverable op failure / unexpected | 500 full-page or flash |
| `access_restricted` | Authenticated, lacks permission | 403 |
| `context_unavailable` | Enrolment/HCO/staff/role ineligible | 403 + clear AC session |
| `session_expired` | Expired/revoked/invalid session | 401 |
| `not_found` | Unknown route / concealed resource | 404 |
| `service_unavailable` | Infrastructure failure | 503 |
| `offline` | Browser offline | **deferred** |
| `success_terminal` | Lifecycle terminal pages (existing) | 200 |

## Shared components

- `views/activeclinic/partials/ac-inline-state.ejs` — empty / no-results / soft restricted panels
- `views/activeclinic/app/access-state.ejs` + `renderActiveClinicAccessState.js` — full-page states
- `createActiveClinicErrorHandler.js` — HTML-aware mapping; JSON keeps V5 safe handler
- `public/activeclinic/ac-auth.js` — duplicate-submit prevention + `aria-busy` (auth + app shells)

## Trigger → response

| Condition | Behavior |
|---|---|
| Missing permission (same tenant) | 403 access-denied; no permission keys |
| Cross-tenant / missing facility key | 404 not-found; no existence leak |
| Staff suspended / enrolment inactive mid-session | Clear `activeclinic_org_sid` (+ CSRF); 403 context-unavailable |
| Unauthenticated | 303 `/login` (or 401 JSON) |
| Unknown route | 404 ActiveClinic state page |
| Unexpected error (HTML) | Safe error page; no stack in production |
| Filtered list empty | `no_results` + Clear filters (not create CTA) |
| True empty list | `empty` + permission-gated primary action |

## Module coverage

| Module | Empty | No-results | Restricted / unavailable | Notes |
|---|---|---|---|---|
| Authentication | — | — | session / validation | Existing lifecycle terminals |
| Dashboard | yes | — | — | `dashboard-empty` marker |
| Facilities | yes | yes | soft restricted list | |
| Staff | yes | yes | facility / restricted | |
| Staff lifecycle | — | — | suspended via eligibility | |
| Roles/access | yes | yes | staff detail empty assignments | |
| Organization settings | incomplete setup panel | — | settings-restricted | |

## Public vs authenticated layouts

- Auth routes: `layouts/auth-shell.ejs`
- App routes: `layouts/app-shell.ejs`
- Terminal denial / errors without valid shell context: `access-state.ejs`

## Offline

**Deferred.** Shared Offline Stitch screen is mapped but browser offline detection / SW caching is not supported. Marked deferred — do not invent decorative offline UX.

## Loading policy

- No artificial full-page delays on SSR pages
- Forms with `data-ac-loading` disable submit, set `aria-busy`, announce via `#ac-form-busy-live`
- No skeleton tables for synchronous list routes

## Placeholder / probe audit

| Item | Class |
|---|---|
| `/__ac/*` infra probes | **B** Retain non-production only (404 in production) |
| `/` foundation stub landing | **C** Honest deployment landing (not clinical) |
| Clinical “coming soon” nav | None in foundation nav |
| Fake clinical KPIs on dashboard | Omitted / notices only |

## Responsive / a11y / security (foundation gate)

- Responsive: shared states stack actions on mobile; shell drawer unchanged
- A11y: skip link on access-state; one H1; form busy live region; error summaries retained
- Security: CSRF unchanged; AC session clear isolated; BlessBoard cookies untouched; probes production-404; error sanitization

## Intentional differences / VISUAL_BLOCKED

- Dedicated Stitch empty illustrations not implemented (STITCH_GAP / utilitarian copy)
- Offline Stitch deferred
- Loading Stitch full-page not used for SSR lists
- Pixel parity vs Access Restricted / Shared Error chrome not claimed

## Remaining foundation gaps

- Pixel Stitch parity for shared state pack
- Offline behavior (if product later requires it)
- Clinical modules (explicitly out of scope)
- Tablet-specific fine-tuning beyond existing shell breakpoints

## Tests

`node --test tests/activeclinic-foundation-states-parity.test.js`  
plus regression: S01–S07 parity suites, shell, auth, session, product isolation, db bootstrap (as available).

## Gate for AC-V6-C01

**OPEN with conditions:** non-clinical administration foundation is coherent enough for patient identity backend (and **AC-V6-C01 is already COMPLETE** on this branch). Do **not** begin patient UI Stitch until ready for **AC-V6-C02**.

### AC-V6-S08R recovery verification (2026-08-04)

| Check | Result |
|---|---|
| S06 + S07 docs | present; non-blocking PARTIAL |
| `activeclinic-foundation-states-parity` | **12/12 pass** |
| DB bootstrap / foundation | **26/26 pass** |
| AC foundation regression (shell/RBAC/auth/session/isolation + S06) | **68/68 pass** |
| Offline | deferred (honest) |
| Clinical modules | none added |
| Production touched | no |

## Explicit non-goals completed as non-goals

No appointments/clinical UI in this gate; no production deploy/push/commit.
