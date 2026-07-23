# PHASE2_008 — Small-Batch Implementation Plan

**Date:** 2026-07-23  
**Mode:** Planning only — **no implementation**  
**Sources:** PHASE2_001–007  
**Rule:** One batch at a time; prefer existing routes; V5 only; no V4 edits.

---

## Batch 1 — Navigation — **COMPLETE** (2026-07-23)

| Item | Detail |
|------|--------|
| **Status** | **COMPLETE** |
| **Scope** | Align PA shell/nav with Phase2-01 (Registration prominence; mobile) |
| **Outcome** | Link already existed in `PLATFORM_ADMIN_NAV` (after Organizations). No duplicate added. Shell EJS fallback updated to include Registration Applications. `PLATFORM_ADMIN_MOBILE_TABS` includes `registration-applications`. Desktop sidebar + mobile drawer both use existing shell; active state via `shellLocals(..., "registration-applications")` on list and detail. Bottom tabs remain disabled (product pattern). |
| **Files changed** | `src/platform/http/platformAdminNav.js`, `views/blessboard/v5/partials/platform-admin-shell-start.ejs`, `tests/blessboard-platform-admin-registration-nav.test.js` |
| **Migration** | None |
| **Routes** | None new |
| **Services / repos** | None |
| **Views** | Shell fallback only |
| **CSS/JS** | None |
| **Tests** | `tests/blessboard-platform-admin-registration-nav.test.js` |
| **Stitch** | 01 Desktop + Mobile |
| **Exclusions** | Dashboard metric inventing; Moovex labels; Tenants nav item; no bottom-tab reintroduction |
| **Done when** | Registration Applications visible on desktop nav + mobile drawer; BlessBoard branding preserved — **met** |

---

## Batch 2 — Shared status components — **COMPLETE** (2026-07-23)

| Item | Detail |
|------|--------|
| **Status** | **COMPLETE** (shared status-component portion only) |
| **Scope** | Application / provisioning / verification / duplicate-risk presentation chips |
| **Outcome** | Shared helper `registrationStatusPresentation.js` + partial `pa-registration-status-chip.ejs` using existing `bb-pa-chip*` styles. Wired into list (table + cards) and detail technical fields for application + provisioning. Verification and duplicate-risk are display-only mappings (not persisted, not claimed without backend evidence). Operator presenter / queues unchanged. |
| **Files** | `src/blessboard/services/registrationStatusPresentation.js`, `views/blessboard/v5/partials/pa-registration-status-chip.ejs`, list/detail EJS, `platformAdminShellLocals.js`, `tests/blessboard-registration-status-presentation.test.js` |
| **Migration** | None |
| **Routes** | None new |
| **CSS/JS** | No new CSS |
| **Tests** | `tests/blessboard-registration-status-presentation.test.js` (no Postgres) |
| **Stitch** | 02, 03 |
| **Exclusions** | AI recommendation copy; inventing stored statuses; admin note component; verification/duplicate workflows |
| **Done when** | Chips reusable on list + detail; tones documented — **met** |

---

## Batch 3 — Registration queue view parity — **COMPLETE** (2026-07-23)

| Item | Detail |
|------|--------|
| **Status** | **COMPLETE** (Prompt 012 — filters, empty/no-results, in-shell error, desktop/mobile, open-only row action) |
| **Scope** | Visual/UX parity for list + empty + no-results + error |
| **Files** | `registration-applications.ejs`, `platformAdminRoutes.js` (list error → shell + `error-state`), `platform-admin.css` (compact filter layout), `platform-admin-shell-start.ejs` (`?v=34`) |
| **Migration** | None |
| **Routes** | Existing GET list only |
| **Services** | Existing list admin (no query changes) |
| **Repos** | Existing |
| **Views** | EXTEND list; wire `empty-state` / `error-state`; expose backend filters |
| **Tests** | `blessboard-registration-queue-view-parity.test.js` (no Postgres); HTTP suite when DB available |
| **Stitch** | 04, 05, 06 |
| **Exclusions** | Export; Manual Invite; fake counters; verification/duplicate columns; assignee/country; queue Approve/Reject |
| **Done when** | Populated/empty/no-results/error states render; mobile cards usable — **met** |

---

## Batch 4 — Review overview — **COMPLETE** (2026-07-23)

| Item | Detail |
|------|--------|
| **Status** | **COMPLETE** (Prompt 014 — view-only with Batch 5 + documents empty-state) |
| **Scope** | Detail hub: header, anchor nav, review actions region |
| **Files** | `registration-application-detail.ejs`, `platform-admin.css` (`?v=35`) |
| **Migration** | None |
| **Routes** | Existing detail GET only |
| **Services** | Unchanged |
| **Views** | EXTEND detail overview |
| **Tests** | `blessboard-registration-detail-overview.test.js` |
| **Stitch** | 07 |
| **Exclusions** | Verification/Duplicates/Website product tabs; Communication Log |
| **Done when** | Overview uses real fields only — **met** |

---

## Batch 5 — Registration details — **COMPLETE** (2026-07-23)

| Item | Detail |
|------|--------|
| **Status** | **COMPLETE** (Prompt 014) |
| **Scope** | Structured details cards from available columns |
| **Files** | `registration-application-detail.ejs`, CSS |
| **Migration** | None |
| **Routes** | Detail anchors |
| **Services** | Unchanged |
| **Views** | EXTEND structured cards + origin labels |
| **Tests** | Detail overview markup tests |
| **Stitch** | 08 |
| **Exclusions** | Legal name/denomination/street/website URL not in DB — omitted |
| **Done when** | Clear sections for identity, applicant, location, plan, consent — **met** |

---

## Batch 6 — Documents

| Item | Detail |
|------|--------|
| **Scope** | Honest empty-state shipped; real document storage still blocked |
| **Empty-state status** | **COMPLETE** (2026-07-23, Prompt 014) on detail `#reg-documents` |
| **Files** | Detail EJS + `empty-state` partial |
| **Migration** | **Required** before real implementation (child table / media FK) — **not done** |
| **Routes** | None until storage |
| **Classification** | **BACKEND_BLOCKED** for uploads; UI empty-state only |
| **Stitch** | 09 |
| **Exclusions** | Fake documents; AI validation %; upload/preview/download |
| **Done when** | Honest empty state present — **met** for empty-state; storage still deferred |

---

## Batch 7 — Verification facts + read-only UI — **COMPLETE** (2026-07-23)

| Item | Detail |
|------|--------|
| **Status** | **COMPLETE** — service (016) + detail loader (017) + read-only Verification UI (018) + structured phone evidence (032) |
| **Scope** | Read-only verification facts on canonical detail page (`#reg-verification`) |
| **Files** | `registrationVerificationFacts.js`; detail loader; `registration-application-detail.ejs`; `platform-admin.css`; tests |
| **Migration** | None |
| **Routes** | Existing detail GET only |
| **Services** | `buildRegistrationVerificationFacts` (+ `phoneVerification` input from Prompt 032) + detail wiring |
| **Repos** | Reuses phone/name/user lookups; phone-verification summary (no second history load) |
| **Tests** | facts + loader + phone-evidence facts + UI |
| **Stitch** | 10 |
| **Exclusions** | Dedicated verification route; working Run again/Override/Verify; approval-gate changes; writes |
| **Done when** | Detail page renders every fact with shared status chips and summary — **met** |
| **Phone evidence** | **COMPLETE** (032) — contacted / identity / authority from structured attempts |

---

## Batch 8 — Recommendation rules

| Item | Detail |
|------|--------|
| **Scope** | Deterministic advisory recommendation from verification facts (019) + detail loader (020) + read-only UI panel (021) |
| **Files** | `registrationReviewRecommendation.js`; `loadRegistrationReviewRecommendationForDetail`; `registration-application-detail.ejs` `#reg-recommendation`; `platform-admin.css`; `PHASE2_019_RECOMMENDATION_RULES.md` |
| **Migration** | None |
| **Routes** | Detail GET locals only (`reviewRecommendation`); no new routes |
| **Services** | **COMPLETE** (019–020); UI does not recalculate |
| **Tests** | recommendation service + loader + `blessboard-registration-recommendation-ui.test.js` |
| **Stitch** | 03, 10 |
| **Exclusions** | Accept/override/recalculate actions; persistence; approval-gate changes; checklist |
| **Done when** | Detail page shows advisory recommendation from server-side facts — **met** |
| **Status** | **COMPLETE** for recommendation service (019), loader (020), and UI (021); approval behavior unchanged |

---

## Batch 9 — Approval checklist

| Item | Detail |
|------|--------|
| **Scope** | Deterministic advisory checklist from verification facts (022) + detail loader (023) + read-only UI (024); approve gating still deferred |
| **Files** | `registrationApprovalChecklist.js`; `loadRegistrationApprovalChecklistForDetail`; `registration-application-detail.ejs` `#reg-approval-checklist`; `platform-admin.css`; `PHASE2_022_APPROVAL_CHECKLIST_RULES.md` |
| **Migration** | None |
| **Routes** | Detail GET locals only (`approvalChecklist`); no new routes |
| **Services** | **COMPLETE** (022–023); UI does not recalculate or gate Approve |
| **Tests** | checklist service + loader + `blessboard-registration-approval-checklist-ui.test.js` |
| **Stitch** | 11 |
| **Exclusions** | Mark-complete/override; persistence; approval-gate changes; email/phone workflows |
| **Done when** | Detail page shows advisory checklist from server-side facts — **met for UI**; approve gating later |
| **Status** | **COMPLETE** for checklist derivation (022), loader (023), and UI (024); approval behavior unchanged |

---

## Batch 10 — Phone verification

| Item | Detail |
|------|--------|
| **Scope** | Phone workspace: facts + call log + record attempt |
| **Files** | New EJS; routes; CSS |
| **Migration** | **COMPLETE** (Prompt 026) — `036_registration_phone_verification_attempts.sql` (attempt ledger only; no application rollup columns yet) |
| **Repository** | **COMPLETE** (Prompt 026) — `createPhoneVerificationAttempt`, `listPhoneVerificationAttempts` |
| **Services** | **COMPLETE** (Prompt 027) — `registrationPhoneVerificationService` (`recordPhoneVerificationAttempt`, `getPhoneVerificationHistory`, `derivePhoneVerificationSummary`); no fact/checklist/approval wiring yet |
| **Detail loader** | **COMPLETE** (Prompt 028) — `getRegistrationApplicationDetail` attaches `phoneVerification`; history load failure keeps detail usable |
| **Read-only UI** | **COMPLETE** (Prompt 029) — `#reg-phone-verification` on registration detail (summary + history; empty/unavailable states) |
| **Record attempt POST** | **COMPLETE** (Prompt 030) — `POST /admin/registration-applications/:id/phone-verification/attempts`; CSRF; `platform_admin`; service once; flash notice; audit event deferred |
| **Record call attempt form** | **COMPLETE** (Prompt 031) — expandable “Record call attempt” form on registration detail → existing POST; conservative defaults; allowlisted flash notices |
| **Structured phone → verification facts** | **COMPLETE** (Prompt 032) — detail loader order phone → facts → recommendation → checklist; contacted / identity / authority from summary |
| **Routes** | Detail GET locals + record-attempt POST; dedicated phone-verification workspace GET still deferred; CRM `POST …/contact` remains separate |
| **Repos** | Attempt table + service + detail load + read-only UI + record POST + form + facts wiring ready; dedicated workspace + discrete verify/fail still deferred |
| **Tests** | Storage (026, Postgres-gated); service unit (027); detail loader (028); phone UI (029); attempt route (030); record form (031); facts/phone-evidence (032) |
| **Stitch** | 12 |
| **Exclusions** | Auto-dialer; WhatsApp; discrete verify/fail POSTs; audit/support-contact writes; approval-gate changes in 026–032 |
| **Done when** | Admin can log calls and see history; verify action only if column shipped |
| **Storage status** | **COMPLETE** for migration + repository (026) |
| **Service status** | **COMPLETE** for business rules + summary (027) |
| **Detail-loader status** | **COMPLETE** for history + summary on registration detail (028) |
| **Read-only UI status** | **COMPLETE** for detail phone section (029) |
| **Record-attempt route status** | **COMPLETE** (030) |
| **Record-attempt form status** | **COMPLETE** (031) |
| **Phone-evidence facts status** | **COMPLETE** (032) |

---

## Batch 11 — Email verification

| Item | Detail |
|------|--------|
| **Scope** | Email workspace UI; manual verify / change email if columns exist |
| **Files** | New EJS; routes; service stubs |
| **Migration** | Needed for verified_at / status; mailer for resend |
| **Routes** | **New** GET + POSTs (resend/change/manual) |
| **Services** | New; resend **BACKEND_BLOCKED** until mailer |
| **Tests** | Manual verify path; CSRF |
| **Stitch** | 13 |
| **Exclusions** | Fake SMTP event timelines |
| **Done when** | Honest UI for unverified email; manual verify audited **or** explicit defer note |

---

## Batch 12 — Duplicate matching

| Item | Detail |
|------|--------|
| **Scope** | List potential matches for an application |
| **Files** | New EJS; service to assemble matches; routes |
| **Migration** | Optional JSONB snapshot — start **derive-only** |
| **Routes** | **New** `GET …/:id/duplicates` |
| **Services** | New list matcher using repo finders + org search |
| **Repos** | Existing duplicate helpers + org queries |
| **Tests** | Risk duplicate fixtures |
| **Stitch** | 14 |
| **Exclusions** | ML confidence theater |
| **Done when** | Matches listed with reasons from real signals |

---

## Batch 13 — Duplicate comparison

| Item | Detail |
|------|--------|
| **Scope** | Side-by-side compare + decisions |
| **Files** | New EJS; POST decision handler |
| **Migration** | Optional decision JSONB |
| **Routes** | **New** GET compare; POST decision; **REUSE** link-organization / reject |
| **Services** | Comparison assembler + decision recorder |
| **Tests** | Link + decision audit |
| **Stitch** | 15 |
| **Exclusions** | Fraud vendor |
| **Done when** | Different / Link / Reject-or-note paths work with redirects + audit |

---

## Batch 14 — Tests and closure

| Item | Detail |
|------|--------|
| **Scope** | Cross-cutting tests, CSRF audit, nav, docs update, CSS `?v=` bump |
| **Files** | Tests under `tests/blessboard-admin-registration*`, shell/nav, `PHASE2_*` status note |
| **Migration** | None |
| **Routes** | Regression across new GETs/POSTs |
| **Services** | None new |
| **Views** | — |
| **CSS/JS** | Bump `platform-admin.css?v=` |
| **Tests** | Full registration admin suite + new cases |
| **Stitch** | Re-check 01–15 in browser vs Stitch |
| **Exclusions** | Phase2-16…19; public form redesign; V4 |
| **Done when** | All batches 1–13 criteria met or explicitly deferred in writing; no runtime drive-bys |

---

## Cross-cutting exclusions (all batches)

- No React/Tailwind  
- No V4 `server.legacy.js` / `src/routes/blessboardAdmin.js` edits  
- No inventing email/SMS telemetry  
- No Stitch Moovex branding in product UI  
- No migrations unless a batch explicitly requires them (and then in its own PR)

---

## Suggested order rationale

Nav → chips → queue → overview → details → (documents defer) → verification → recommendation → checklist → phone → email → duplicates → compare → harden tests.

---

## Runtime change confirmation

This plan does not implement code. Implementation starts only when a batch is explicitly commissioned.
