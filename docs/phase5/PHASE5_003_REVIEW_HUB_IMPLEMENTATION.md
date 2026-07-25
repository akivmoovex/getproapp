# PHASE5_003 — Decision-Focused Registration Review Hub

**Date:** 2026-07-25  
**Batch:** Phase 5 Prompt 3 of 7 (review hub + duplicate warning + mobile)  
**Stitch:** Review Church Registration · Duplicate Warning · Mobile · Duplicate Warning Mobile  
**Canonical route:** `GET /admin/registration-applications/:id` (unchanged)

---

## Verdict

Phase 5 decision hub is implemented on the **existing** registration-detail route, service, and repository. Primary presentation is simplified; secondary evidence stays in one collapsed disclosure on the same page. No migration, no second detail route, no approval POST / provisioning / request-information / rejection workflow rewrites.

---

## Canonical route reused

| Item | Value |
|------|--------|
| Route | `GET /admin/registration-applications/:id` |
| File | `src/platform/http/platformAdminRoutes.js` |
| Service | `getRegistrationApplicationDetail` (+ existing loaders) |
| Repository | `platformChurchRegistrationRepository` (via service) |
| Template | `views/blessboard/v5/platform-admin/registration-application-detail.ejs` |
| Auth | Apex host + `platform_admin` + CSRF on POSTs (unchanged) |
| Cache | `Cache-Control: no-store` |

Duplicate summary uses existing `loadRegistrationDuplicateMatchesForAdmin` and presentation helper `presentPhase5DuplicateWarning` (no frontend-only matching).

---

## Template simplification approach

1. **One canonical page** — the former ~2,600-line detail template was replaced (not duplicated) by a Phase 5 hub shell.
2. **Extracted secondary partial** — `views/blessboard/v5/partials/pa-registration-detail-secondary.ejs` holds prior actions, rejection, details, verification, checklist, phone/email, communications, activity, support, and link-org markup.
3. **Collapsed disclosure** — hub wraps that partial in `<details data-bb-pa-reg-secondary>` titled **Additional review details** (auto-opens for `?intent=approve|reject|request-information`).
4. **Presentation helpers** — Phase 5 status/date/location/duplicate summary reuse `registrationQueuePresentation.js` (shared with the queue).
5. **No competing mega-page** — operators land on one review experience; deep controls remain reachable but out of the primary reading flow.

---

## Information retained in primary view

- Back to Church Registrations
- Church name, Phase 5 visible status, registration date, selected plan
- Church information (name, location/city/country, expected branches, plan) — omit empty optionals
- Main contact (name, role, phone, email) + Call / Email / Copy phone
- Applicant message (escaped) when present
- Internal review note when `reviewNotes` already exists (display only; no new save action)
- Decision panel: Approve and create church · Request information · Reject registration
- Mobile sticky decision bar
- Duplicate warning banner when real match evidence exists (advisory)

---

## Information moved to secondary disclosure

- UUIDs / application id / organization keys
- Raw status enums and provisioning / deployment / domain diagnostics
- Dense verification tables, approval checklist, recommendation panel
- Full communications / activity / support / link-org / approve & reject forms
- Entitlement and technical diagnostics

Essential blocking warnings from the backend still render inside secondary (and decision links jump to those anchors). Primary view does not invent verification claims.

---

## Duplicate-data source

| Source | Role |
|--------|------|
| `loadRegistrationDuplicateMatchesForAdmin` | Canonical match evidence (existing) |
| `presentPhase5DuplicateWarning` | Ranks real matches; builds advisory banner payload |
| Route locals | `duplicateWarning`, `duplicateMatchesLoaded` |

Rules:

- Banner only when loader returns non-empty matches with risk ≠ `none`
- `existingHref` only for organization key, application UUID, compare href, or duplicates list fallback
- Continue Approval → `#reg-actions` (does not mutate duplicate state)
- Reject as Duplicate → `?intent=reject&rejection_category=duplicate_registration#reg-rejection`

---

## Decision links (deferred workflows)

| Decision | Href pattern | Notes |
|----------|--------------|--------|
| Approve and create church | `…/:id#reg-actions` | Opens existing approve form in secondary |
| Request information | `…/:id?intent=request-information#reg-communications` | Opens secondary; full Phase 5 request UI later |
| Reject registration | `…/:id?intent=reject#reg-rejection` | Opens existing rejection workspace |
| Reject as duplicate | `…/:id?intent=reject&rejection_category=duplicate_registration#reg-rejection` | Context only; reject POST unchanged |

No approval POST, provisioning, request-information POST, or rejection POST behavior changed in this batch.

---

## Mobile behavior

Same route and data as desktop:

- Single-column layout (`bb-pa-reg-hub__layout` stacks)
- Duplicate banner near top when present
- `tel:` / `mailto:` tappable contact links
- Sticky bottom decision controls (`data-bb-pa-reg-hub-mobile-decision`)
- Secondary evidence collapsed by default
- Long titles wrap; emails use overflow-safe classes
- No horizontal-scroll requirement for hub chrome

CSS: `public/blessboard/v5/platform-admin.css` (shell `?v=52`).

---

## Tests

| Area | File / coverage |
|------|-----------------|
| Hub primary + dup + escape + mobile + secondary | `tests/blessboard-registration-detail-overview.test.js` |
| Duplicate presentation helper | `tests/blessboard-registration-queue-presentation.test.js` |
| Checklist / recommendation / rejection / info-request / email UI | Existing detail UI tests (secondary still renders; CSS bump to v=52) |
| Auth / apex / detail HTTP | Existing `blessboard-admin-registration-applications.test.js` (unchanged route) |
| Verification / recommendation loaders | Existing detail-*-load tests |

Intentional updates: overview rewritten for Phase 5 markers; shell CSS version assertions `v=50` → `v=52`; secondary section-nav restored with prior `data-bb-pa-reg-*-nav` markers.

---

## Stitch differences

| Stitch | Implementation |
|--------|----------------|
| Denomination / estimated members rows | Omitted — not on current application schema; do not invent fields |
| Standalone duplicate screen | Inline advisory banner on same detail route |
| Full approve / request-info / reject Stitch flows | Link into existing controls; dedicated confirmation screens deferred (Prompts 4–7) |
| Sticky desktop decision | Side panel sticky where viewport allows; mobile uses bottom bar |
| Separate mobile templates | Responsive CSS on one template |

---

## Files changed (this prompt)

| File | Change |
|------|--------|
| `views/blessboard/v5/platform-admin/registration-application-detail.ejs` | Phase 5 hub primary UI |
| `views/blessboard/v5/partials/pa-registration-detail-secondary.ejs` | **New** extracted secondary evidence |
| `src/blessboard/services/registrationQueuePresentation.js` | `presentPhase5DuplicateWarning` |
| `src/platform/http/platformAdminRoutes.js` | Load duplicate summary + `intent` local |
| `public/blessboard/v5/platform-admin.css` | Hub / dup / sticky mobile styles |
| `views/blessboard/v5/partials/platform-admin-shell-start.ejs` | CSS `?v=52` |
| `tests/blessboard-registration-detail-overview.test.js` | Phase 5 hub assertions |
| `tests/blessboard-registration-queue-presentation.test.js` | Duplicate helper tests |
| Related UI tests | CSS version + nav marker compatibility |
| `docs/phase5/PHASE5_003_REVIEW_HUB_IMPLEMENTATION.md` | This document |

**Not changed:** approve/reject/request-information POST handlers, provisioning, migrations, duplicate matching service logic, status enums.

---

## Deferred action workflows

- Phase 5 Approve confirmation / processing / approved screens
- Phase 5 Request Information dedicated flow UI
- Phase 5 Reject / Rejected screens
- Independent save for internal review notes (if not already part of an action POST)
- Any policy that would make duplicates block approval (remains advisory unless backend already blocks)
