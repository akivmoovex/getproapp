# Foundation & Growth — final Stitch parity audit

**Date:** 2026-07-19  
**Branch:** `V5`  
**Prompt:** 34 — Final Stitch parity audit for retained Foundation/Growth screens  
**Stitch project:** `projects/17124191473876947591` — GetPro Church Platform  
**Mode:** Audit retained screens only · fix clear visual defects · no deferred/removed screens  

**Companions:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) · [`FOUNDATION_GROWTH_SCREEN_COVERAGE.md`](../product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md) · [`GROWTH_PLAN_PARITY_AUDIT.md`](./GROWTH_PLAN_PARITY_AUDIT.md) · portal audits (tenant / member / BA / HQ / PA) · [`FOUNDATION_GROWTH_NEW_FEATURES_A11Y_RESPONSIVE_AUDIT.md`](./FOUNDATION_GROWTH_NEW_FEATURES_A11Y_RESPONSIVE_AUDIT.md) · [`COMMERCIAL_FEATURE_MATRIX_RECONCILIATION.md`](../product/COMMERCIAL_FEATURE_MATRIX_RECONCILIATION.md)

---

## Classification legend

| Class | Meaning |
|-------|---------|
| **CLOSE PARITY** | Layout/chrome aligned with canonical Stitch within intentional product limits |
| **MINOR GAPS** | Usable Stitch composition; small spacing/copy/chrome differences remain |
| **MATERIAL GAPS** | Major Stitch surfaces missing or structurally different beyond intentional omissions |
| **BLOCKED BY DATA** | Stitch requires fields/metrics/workflows V5 schema does not provide |
| **MISSING CANONICAL STITCH** | V5 route/view exists; no dedicated desktop+mobile Stitch pair |

**MATCHED** (pixel-perfect browser↔Stitch) is **not** claimed without screenshot side-by-side sign-off.

---

## Verdict

| Package | Visual implementation complete for retained scope? | Notes |
|---------|----------------------------------------------------|-------|
| **Foundation** | **Yes — with residual MINOR / MISSING STITCH / BLOCKED BY DATA** | All retained COMPLETE coverage rows ship Stitch-wired chrome. No MATERIAL gaps on backend-ready screens. |
| **Growth** | **Yes — with residual MINOR / MISSING STITCH / BLOCKED BY DATA** | Multi-branch HQ + `advanced_reports` detail + Permissions UI complete. Catalogue-aspirational Growth remains **DEFERRED** (not audited as retained). |

**Not in this verdict:** Network-only surfaces, leader portal, deferred catalogue features, create-org GUI (product-blocked), waiting verification / forgot-password.

---

## Method

1. Reconciled retained rows from `FOUNDATION_GROWTH_SCREEN_COVERAGE.md` (COMPLETE only) against `STITCH_SCREEN_MAP.md` canonical IDs.
2. Reused portal + Growth parity classifications; spot-checked Stitch MCP (`list_screens`, `get_screen`) for HQ roles (`12f5be53…`), Features (`7ef3518f…`), consolidated analytics (`2a577dc1…`).
3. Verified checklist dimensions: desktop/mobile structure, text honesty, imagery (no fabricated metrics), shells/nav, forms, cards, tables, reports, empty/loading/error/success + package-gated states.
4. Fixed **one clear visual defect** (Features page grid class collision).
5. Updated this doc + `STITCH_SCREEN_MAP.md`; ran focused GUI / a11y / CSS lint / `git diff --check`.

---

## Checklist (retained surfaces)

| Check | Verdict |
|-------|---------|
| Desktop + mobile structure (table≥900 / cards&lt;900 where applicable) | Pass |
| Text / commercial honesty (post matrix reconciliation) | Pass |
| Imagery (CMS/media only; no fake dashboards) | Pass |
| Page shells (apex / tenant / member / BA / HQ) | Pass |
| Navigation (incl. HQ Permissions) | Pass |
| Forms + CSRF patterns | Pass (unchanged) |
| Cards / tables | Pass |
| Reports hub + Growth-gated detail | Pass |
| Empty / entitlement-denied / error / success partials | Pass |
| Package-gated states (`advanced_reports`, Foundation hub non-links) | Pass |

---

## Clear visual defect fixed this pass

| # | Screen | Defect | Fix |
|---|--------|--------|-----|
| D1 | Apex `/features` | Page wrapper reused `bb-apex-features`, inheriting home/for-churches **grid** (`display: grid`; 2–4 columns ≥700px) — sections laid out as grid cells on desktop | Wrapper → `bb-apex-features-page`; grid scoped to `ul.bb-apex-features`; `apex.css?v=8` |

No MATERIAL layout defects found on HQ roles / reports relative to prior a11y pass (`hq-admin.css?v=50`).

---

## Retained screen classifications

### A. Apex marketing & auth (Foundation platform)

| Screen | Stitch D / M | Class | Notes |
|--------|--------------|-------|-------|
| Home | `46081ff8…` / `9f9927a6…` | **CLOSE PARITY** | Intentional CTA/nav vs Stitch mock |
| Features | `7ef3518f…` / `5ac1e1b0…` | **CLOSE PARITY** / **MINOR GAPS** | D1 layout fix; honest capability copy |
| For Churches | `fc4bf5aa…` / `55af3450…` | **CLOSE PARITY** | — |
| Register Church | `8640e853…` / `515da582…` | **CLOSE PARITY** | Enquiry only |
| Directory | `2b9df962…` / `ab5d47e2…` | **CLOSE PARITY** | Live catalogue |
| Pricing + FAQ | `1c50e898…` / `181ec1f8…` (+ FAQ pair) | **CLOSE PARITY** | Active-branch SoT; no checkout |
| Login | `9b264ef3…` / `68a84bcc…` | **CLOSE PARITY** | No forgot-password |
| Auth error / Account | — | **MISSING CANONICAL STITCH** | Functional chrome |

### B. Tenant public + registration

| Area | Class summary | Source |
|------|---------------|--------|
| Public pages (home→contact) | **CLOSE PARITY** (+ **BLOCKED BY DATA** omissions) | `TENANT_PUBLIC_PARITY_AUDIT.md` |
| Register / submitted | **MINOR GAPS** / **BLOCKED BY DATA** | Field set ≠ Stitch wizard |
| Tenant password login Stitch | Product transfer chrome (not password card) | Intentional |

### C. Member portal

| Area | Class summary | Source |
|------|---------------|--------|
| Shell + most modules | **CLOSE PARITY** | `MEMBER_PORTAL_PARITY_AUDIT.md` |
| Dashboard / events | **MINOR GAPS** | Prayer disabled; list≠calendar |
| Prayer dedicated route | Not retained (MISSING_BACKEND) | Out of audit implement scope |
| Announcement detail | **MISSING CANONICAL STITCH** | Adapted list chrome |

### D. Branch admin

| Area | Class summary | Source |
|------|---------------|--------|
| Dashboard, members, CMS entities, attendance, giving, requests, announcements | **CLOSE PARITY** / **MINOR GAPS** | `BRANCH_ADMIN_PARITY_AUDIT.md` |
| Website editor / ministry profile | **MINOR GAPS** / **BLOCKED BY DATA** | Form editor ≠ freeform builder |
| Account / settings / sermons / forms admin | **MISSING CANONICAL STITCH** | Adapted Shared UI States |
| Monthly reports | Not retained (MISSING_BACKEND) | Nav honest-disabled |

### E. HQ admin (Foundation retained + Growth)

| Screen | Class | Notes |
|--------|-------|-------|
| Shell / dashboard | **CLOSE PARITY** / **BLOCKED BY DATA** | Soft KPIs intentional |
| Branch registry + selector | **CLOSE PARITY** | — |
| Members / registrations / content / forms / resources / requests / announcements | **CLOSE PARITY** / **MINOR GAPS** | Cross-branch on Growth |
| Reports hub | **CLOSE PARITY** / **BLOCKED BY DATA** | Foundation snapshot; Growth detail cards entitled |
| Attendance / giving detail | **CLOSE PARITY** / **BLOCKED BY DATA** | `advanced_reports` gated |
| Audit | **CLOSE PARITY** / **BLOCKED BY DATA** | — |
| Staff permissions `/hq/roles` | **CLOSE PARITY** / **BLOCKED BY DATA** | Fixed roles only; Stitch matrix/Leader/export omitted intentionally |
| Account / settings | **MISSING CANONICAL STITCH** | — |
| Branch performance dedicated frame | **BLOCKED BY DATA** | Covered via hub + unavailable |

### F. Explicitly not audited as retained

| Item | Disposition |
|------|-------------|
| Waiting verification, forgot password | DEFERRED / MISSING_BACKEND |
| Departments, duty roster, monthly report workflow | MISSING_BACKEND |
| Surveys, appointments, volunteers, offline attendance, scheduled broadcasts/reports | DEFERRED |
| Network domain/email/API | NOT_IN_SCOPE |
| Leader portal | NOT_IN_SCOPE |
| Create organization GUI | BLOCKED BY VERIFIED DEPENDENCY |
| Platform admin (ops) | Outside church package visual completeness claim (separately PARTIAL in map) |

---

## Summary counts (retained Foundation/Growth product surfaces)

Approximate unique logical screens with COMPLETE coverage + Stitch classification:

| Class | Count (approx.) |
|-------|----------------:|
| CLOSE PARITY | ~55 |
| MINOR GAPS | ~10 |
| MATERIAL GAPS | **0** |
| BLOCKED BY DATA (often shared with CLOSE) | ~20 |
| MISSING CANONICAL STITCH | ~10 |

**MATERIAL GAPS on retained, backend-ready screens: none.**

---

## Intentional Stitch omissions (do not “fix”)

- Fabricated KPIs, charts, forecasts, YoY / trend %
- Permission matrix / Leader role / Export on HQ roles
- Donor PII, payments, QR checkout
- Freeform website builder / org templates canvas
- Announcement scheduling / SMS
- Calendar events UI; sermon series schema widgets
- Contact POST form; forgot-password
- Catalogue-aspirational Growth modules listed as DEFERRED

---

## Screen map updates (this pass)

`STITCH_SCREEN_MAP.md` refreshed so apex Features / For Churches / Register / Directory / Pricing are **PARTIAL** (were stale **MISSING**), ministry profile + branch-performance hub notes aligned to COMPLETE coverage, HQ shell notes include Permissions nav, gap lists no longer claim those apex routes absent.

---

## Verification

| Command | Result |
|---------|--------|
| `npm run test:blessboard:apex-marketing` | **7/7 pass** |
| `npm run test:blessboard:a11y-structure` | **88/88 pass** |
| `npm run test:blessboard:responsive-structure` | pass |
| `npm run test:blessboard:frontend-assets` | pass (`apex` v=8) |
| `npm run test:blessboard:structure` | pass |
| `npx stylelint "public/blessboard/v5/apex.css" "public/blessboard/v5/hq-admin.css"` | **0 errors** (hex token warnings pre-existing) |
| `git diff --check` | **clean** |

---

## Stop

Final Stitch parity audit for retained Foundation/Growth screens complete. No deferred screens implemented.
