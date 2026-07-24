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
| **Structured phone → verification facts** | **COMPLETE** (Prompt 032) — contacted / identity / authority from summary; loader now phone → email → facts → recommendation → checklist (email ownership 042) |
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
| **Scope** | Email ownership verification: storage → message/delivery → routes/mailer → UI |
| **Files** | Migration; repository; `registrationEmailVerificationService.js`; `registrationEmailVerificationMessage.js`; `registrationEmailVerificationDelivery.js`; later EJS/routes |
| **Migration** | **COMPLETE** (Prompt 034) — `037_registration_email_verification_tokens.sql` (hash-only; one active `sent` token per application) |
| **Repository** | **COMPLETE** (034) — create / find-by-hash / latest / invalidate / mark-verified |
| **Services** | **COMPLETE** (034) for pure token create/consume/status; **COMPLETE** (037) message builder; **COMPLETE** (038) `sendRegistrationVerificationEmail` safe unavailable stub; **COMPLETE** (039) `resendRegistrationVerificationEmail` admin orchestration; change/manual/real mailer still deferred |
| **Message builder** | **COMPLETE** (037) — public URL `/register/email-verification/:token`; HTML escaped; no passwords/sensitive details; no send/log/persist |
| **Delivery** | **SAFE STUB** (038) — no third-party provider added; default adapter returns `accepted_for_processing: false` and does not claim delivery or log plaintext tokens |
| **Admin resend route** | **COMPLETE** (039) — `POST /admin/registration-applications/:id/email-verification/resend` (apex + platform admin + CSRF); cooldown; safe redirects; no approval-state changes |
| **Resend UI** | **COMPLETE** (040) — detail `#reg-email-verification` form (CSRF, visible recipient, 60s guidance, omit if email missing; no token/admin/app hidden fields; no change-email/manual-verify) |
| **Public verify route** | **COMPLETE** (041) — `GET /register/email-verification/:token` + tokenless result page; apex only; no auth; rate limit; one-time consume; generic invalid; no approval changes |
| **Ownership → facts / checklist** | **COMPLETE** (042) — `applicant_email_verified` from canonical status; email uniqueness unchanged; recommendation/checklist consume corrected fact only; loader phone → email → facts → recommendation → checklist; status not reloaded; **no** approval-gate change |
| **Production limitation** | BlessBoard V5 has **no** outbound SMTP/ESP adapter. Production resend records a token then surfaces `email_sending_unavailable`; do not invent Delivered/Bounced/Opened without ESP events. |
| **Routes** | Admin resend **COMPLETE (039)**; public verify **COMPLETE (041)**; change/manual — **not implemented** |
| **Tests** | Service stub (034); storage Postgres-gated (034); message builder (037); delivery stub (038); resend route stubs (039); resend UI render (040); public verify route + render (041); ownership facts wiring (042) |
| **Stitch** | 13 |
| **Exclusions** | Change-email; manual verify; real email sending; approval-gate changes |
| **Done when** | Admin can issue/consume hash tokens in tests; messages build safely; send path honestly reports unavailable; admin resend route + UI; public verify route; ownership fact wired; mailer later |
| **Token-storage status** | **COMPLETE** (034) |
| **Message + delivery-stub status** | **COMPLETE** (037–038) |
| **Admin resend status** | **COMPLETE** (039–040) |
| **Public verify status** | **COMPLETE** (041) |
| **Ownership facts status** | **COMPLETE** (042) |

---

## Batch 12 — Duplicate matching

| Item | Detail |
|------|--------|
| **Scope** | List potential matches for an application |
| **Files** | `registrationDuplicateNormalization.js`; later EJS + list matcher + routes |
| **Migration** | Optional JSONB snapshot — start **derive-only** |
| **Normalization helpers** | **COMPLETE** (Prompt 044) — church name, phone (E.164 reuse), email, website domain, registration number, address; originals preserved; null for unusable; no DB/scoring |
| **Duplicate scoring** | **COMPLETE** (Prompt 046) — `registrationDuplicateScoring.js` + `PHASE2_046_DUPLICATE_SCORING_RULES.md`; `none`/`possible`/`strong`/`confirmed`; high weight for registration number, verified phone, church-owned email; limited name; weak town; confirmed only with manual evidence; no auto merge/reject/gate changes |
| **Duplicate match storage** | **COMPLETE** (Prompt 047) — migration `038_registration_duplicate_matches.sql`; repo `replaceRegistrationDuplicateMatches` / `listRegistrationDuplicateMatches` / `getRegistrationDuplicateMatchById` / `recordRegistrationDuplicateMatchDecision`; JSONB evidence only; decisions allowlisted; no routes/UI |
| **Duplicate match query service** | **COMPLETE** (Prompt 048) — `registrationDuplicateMatchQueryService.js`; batched candidates (apps/orgs/churches/branches/domains/user-by-email); score + store; `runDuplicateCheck` / `listDuplicateMatches` / `getDuplicateComparison`; no routes/UI |
| **Duplicate matches route + loader** | **COMPLETE** (Prompt 049) — `GET …/:id/duplicates` + `GET …/:id/duplicates/:matchId`; `registrationDuplicateMatchesAdminLoader.js`; PA shell EJS; empty/unavailable; no decision POST; no auto merge/reject |
| **Duplicate Matches screen** | **COMPLETE** (Prompt 050) — desktop/mobile cards (not table); subject + count summary; risk/score/reasons/location/contact overlap/org status/review status/Compare; empty-state + error-state; CSS `?v=43`; rendering tests |
| **Duplicate decision POST** | **COMPLETE** (Prompt 052) — `POST …/:id/duplicates/:matchId/decision`; CSRF; allowlisted decisions; conditional reason; session reviewer; ledger write + review_events; no merge/reject/approve/provision |
| **Duplicate decision UI** | **COMPLETE** (Prompt 053) — decision form on compare screen; seven options; reason guidance; CSRF; review state; flash notices; CSS `?v=45` |
| **Duplicate evidence → verification** | **COMPLETE** (Prompt 054) — facts/recommendation/checklist consume canonical matches + decisions; name alone → warning; strong identifiers → failed/warning; `different_church` completes review while preserving evidence; `confirmed_duplicate` / `impersonation_concern` → high-risk; **no** auto approve/reject |
| **Routes** | **COMPLETE** (049) read-only list + compare; decision POST **COMPLETE** (052); decision UI **COMPLETE** (053) |
| **Services** | Normalization + scoring + storage + query + admin loader + verification wiring (054) ready |
| **Repos** | Existing duplicate helpers + org queries + match ledger (047) + candidate loaders (048) |
| **Tests** | Normalization (044); scoring (046); storage Postgres-gated (047); query stubbed + Postgres-gated (048); route stubbed (049); screen rendering (050); decision UI (053); duplicate evidence facts (054) |
| **Stitch** | 14 |
| **Exclusions** | ML confidence theater; fuzzy scores; auto merge/reject; decision POST; Mark Different / Create New / AI panels from Stitch |
| **Done when** | Matches listed with reasons from real signals |
| **Normalization status** | **COMPLETE** (044) |
| **Scoring status** | **COMPLETE** (046) |
| **Storage status** | **COMPLETE** (047) |
| **Query service status** | **COMPLETE** (048) |
| **Route + loader status** | **COMPLETE** (049) |
| **Screen status** | **COMPLETE** (050) |

---

## Batch 13 — Duplicate comparison

| Item | Detail |
|------|--------|
| **Scope** | Side-by-side compare + decisions |
| **Files** | Compare EJS (049 route + **051 screen** + **053 decision UI COMPLETE**); decision service + POST **COMPLETE** (052) |
| **Migration** | Match ledger decisions (047) |
| **Routes** | GET compare **COMPLETE** (049); POST decision **COMPLETE** (052); **REUSE** link-organization / reject on detail (unchanged; not auto-invoked) |
| **Services** | `registrationDuplicateReviewDecisionService.recordDuplicateMatchReviewDecision` — allowlisted decisions; conditional reason; review_events + optional org audit; `DECISION_OPTIONS` for UI |
| **Tests** | Compare route (049); comparison screen + decision UI (051/053); decision service + route (052) |
| **Stitch** | 15 |
| **Exclusions** | Fraud vendor; auto merge/reject/approve/provision from decision POST |
| **Done when** | Different / Link / Reject-or-note paths work with redirects + audit |
| **GET compare status** | **COMPLETE** (049) |
| **Compare screen status** | **COMPLETE** (051) — desktop side-by-side; mobile attribute cards; authorized fields only; text+icon highlights |
| **Decision POST status** | **COMPLETE** (052) |
| **Decision UI status** | **COMPLETE** (053) — form on compare; seven allowlisted options; reason guidance; CSRF; current review state + reviewer/time; success/error notices; CSS `?v=45`; no auto merge/approve/reject |
| **Verification wiring status** | **COMPLETE** (054) — detail verification facts + recommendation + checklist from canonical matches/decisions |

---

## Batch 15 — Communication / rejection storage (Prompt 062)

| Item | Detail |
|------|--------|
| **Status** | **COMPLETE** (2026-07-24) |
| **Scope** | Append-only communications ledger + nullable rejection metadata columns; repository methods only |
| **Migration** | `039_registration_application_communications.sql` |
| **Routes** | None |
| **Services** | None |
| **Views / CSS** | None |
| **Repository** | `createRegistrationApplicationCommunication`, `listRegistrationApplicationCommunications`, `findLatestRegistrationApplicationCommunication`, `updateRegistrationRejectionMetadata` |
| **Tests** | `blessboard-registration-application-communications-storage.test.js` |
| **Stitch** | 16 / 17 storage foundation (UI later) |
| **Exclusions** | Routes, EJS, email sending, application-status / follow-up changes, reject route changes, reopen, review_events writes from this batch |
| **Done when** | Migration + repo + Postgres-gated tests — **met** |

---

## Batch 16 — Communication service (Prompt 063)

| Item | Detail |
|------|--------|
| **Status** | **COMPLETE** (2026-07-24) |
| **Scope** | Business rules for internal notes, information requests, applicant messages, history + honest delivery statuses |
| **Files** | `src/blessboard/services/registrationApplicationCommunicationService.js` |
| **Migration** | None |
| **Routes / views** | None |
| **Tests** | `blessboard-registration-application-communication-service.test.js` (+ 062 storage regression) |
| **Stitch** | 16 / 17 service foundation |
| **Exclusions** | Routes, EJS, CSS, rejection/status/follow-up changes, real ESP, reopen, approval |
| **Done when** | Stubbed unit tests cover validation + delivery honesty — **met** |

---

## Batch 17 — Information-request POST route (Prompt 064)

| Item | Detail |
|------|--------|
| **Status** | **COMPLETE** (2026-07-24) |
| **Scope** | `POST /admin/registration-applications/:id/request-information` |
| **Files** | `platformAdminRoutes.js`; route tests |
| **Migration** | None |
| **Service** | `recordInformationRequest` (once) + `updateApplicationSupportFollowUp` (`awaiting_customer`, review event `information_requested`) |
| **Views / CSS** | None |
| **Tests** | `blessboard-registration-information-request-route.test.js` |
| **Exclusions** | EJS/CSS; application_status changes; claim email sent; reopen |
| **Done when** | Auth/CSRF/validation/service/follow-up/review-event/redirect covered — **met** |

---

## Batch 18 — Request-information form UI (Prompt 065)

| Item | Detail |
|------|--------|
| **Status** | **COMPLETE** (2026-07-24) |
| **Scope** | Request Additional Information form on registration detail (`#reg-communications`) |
| **Files** | `registration-application-detail.ejs`; `platform-admin.css`; shell `?v=47`; form rendering tests |
| **Migration** | None |
| **Service / routes** | Unchanged (uses 064 POST) |
| **Views / CSS** | Section nav **Communication**; single-column `bb-pa-form`; allowlisted notices; no JS |
| **Tests** | `blessboard-registration-information-request-form.test.js` |
| **Exclusions** | History list UI; route/service changes; delivery claims |
| **Done when** | Fields, CSRF, prefill, categories, notices, rendering tests — **met** |

---

## Batch 19 — Communication history loader (Prompt 066)

| Item | Detail |
|------|--------|
| **Status** | **COMPLETE** (2026-07-24) |
| **Scope** | Load communication history once on registration detail |
| **Files** | `registrationApplicationsAdminService.js`; loader tests |
| **Migration** | None |
| **Service** | `loadRegistrationCommunicationsForDetail` via `getCommunicationHistory` (once) |
| **View-model** | `communications = { items, summary, unavailable }` — summary: total, internalNotes, informationRequests, applicantMessages, rejectionNotices, sendingUnavailable, failed, latestCommunicationAt |
| **Views / CSS / routes** | Unchanged |
| **Tests** | `blessboard-registration-detail-communications-load.test.js` |
| **Exclusions** | EJS history UI; writes; application_status; admin email/display on items |
| **Done when** | Newest-first, empty, unavailable, no-dupe-call, property preservation — **met** |

---

## Batch 20 — Communication history UI (Prompt 067)

| Item | Detail |
|------|--------|
| **Status** | **COMPLETE** (2026-07-24) |
| **Scope** | Phase2 Communication Log desktop/mobile UI in `#reg-communications` |
| **Files** | `registration-application-detail.ejs`; `platform-admin.css`; shell `?v=48`; route locals; rendering tests |
| **Migration** | None |
| **View-model** | `communications = { items, summary, unavailable }` |
| **UI** | Summary counts; card list (not table); empty/unavailable; applicant vs internal blocks; honest delivery (Sent only when status is `sent`) |
| **Tests** | `blessboard-registration-communications-history-ui.test.js` |
| **Exclusions** | Edit/delete; rejection workspace; fake delivery KPIs |
| **Done when** | Summary, cards, empty/unavailable, escape, no Sent claim — **met** |

---

## Batch 21 — Rejection service upgrade (Prompt 068)

| Item | Detail |
|------|--------|
| **Status** | **COMPLETE** (2026-07-24) |
| **Scope** | Extend `rejectRegistrationApplication` + `recordRejectionNotice` |
| **Files** | `registrationApplicationsAdminService.js`; `registrationApplicationCommunicationService.js`; unit + PG tests |
| **Migration** | Uses 039 metadata columns (no new migration) |
| **Behavior** | `application_status=rejected`; `rejection_reason` compat; category / reapplication / notification status; optional `rejection_notice`; safe adapter only when `notifyApplicant`; one transaction; review event `reject` |
| **Views / routes** | Unchanged |
| **Tests** | `blessboard-registration-rejection-service.test.js`; `blessboard-registration-rejection-service-pg.test.js` |
| **Exclusions** | EJS; route body fields; reopen; automatic deletion; documents |
| **Done when** | Unit + PG coverage for category, notice, honest notify, legacy reason — **met** |

---

## Batch 22 — Rejection route upgrade (Prompt 069)

| Item | Detail |
|------|--------|
| **Status** | **COMPLETE** (2026-07-24) |
| **Scope** | `POST /admin/registration-applications/:id/reject` |
| **Files** | `platformAdminRoutes.js`; route tests; risk-review redirect assert; allowlisted notice mapping |
| **Migration** | None |
| **Behavior** | CSRF + platform_admin; parse category / internal note / applicant explanation / reapplication / notify; session admin + route app id; legacy `rejection_reason` compat; redirect `?notice=application_rejected#reg-rejection` |
| **Views** | Notice text for `application_rejected` only (form UI deferred) |
| **Tests** | `blessboard-registration-reject-route.test.js` |
| **Exclusions** | Rejection Workspace EJS form redesign; reopen |
| **Done when** | Auth/CSRF/categories/message separation/notify validation/safe errors — **met** |

---

## Batch 23 — Rejection Workspace UI (Prompt 070)

| Item | Detail |
|------|--------|
| **Status** | **COMPLETE** (2026-07-24) |
| **Scope** | Phase2 Rejection Workspace desktop/mobile UI at `#reg-rejection` |
| **Files** | `registration-application-detail.ejs`; `platform-admin.css`; shell `?v=49`; detail model metadata fields; rendering tests |
| **Form** | Category, internal notes, applicant explanation, reapplication, notify, confirmation checkbox; button **Reject and record decision**; CSRF; email limitation |
| **Completed state** | Rejected by/date, category, reapplication, notification status, applicant explanation, internal notes; reopen deferred to 071 |
| **Tests** | `blessboard-registration-rejection-workspace-ui.test.js` |
| **Exclusions** | Route/service behavior changes (beyond model fields for display); reopen deferred to 071 |
| **Done when** | Form + completed state + notices + escape + mobile isolation — **met** |

---

## Batch 24 — Reopen rejected application (Prompt 071)

| Item | Detail |
|------|--------|
| **Status** | **COMPLETE** (2026-07-24) |
| **Scope** | Controlled reopen: rejected → submitted |
| **Files** | `reopenRegistrationApplication`; `POST …/reopen`; completed-state reopen form; CSS `?v=50`; service + route + UI tests |
| **Behavior** | requireApex + platform_admin + CSRF; reason required; only currently rejected; preserve `rejection_reason` / metadata / communications; append `review_events` `reopen`; no email; redirect `?notice=application_reopened` |
| **Tests** | `blessboard-registration-reopen-service.test.js`; `blessboard-registration-reopen-route.test.js`; workspace UI reopen asserts |
| **Exclusions** | Auto email; deleting rejection history; soft “draft reopen” status |
| **Done when** | Auth/CSRF/status/reason/history/redirect — **met** |

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
