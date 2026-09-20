# V8 Implementation Baseline (PROMPT 01)

**Verdict:** `V8_IMPLEMENTATION_BASELINE_COMPLETE`  
**Branch:** `V8` only @ `61226f50` (synced with `origin/V8` before audit)  
**Date:** 2026-09-21  
**Audit only:** no runtime / migration / deploy changes  
**Stitch:** https://stitch.withgoogle.com/projects/5087412725796049014 (`projects/5087412725796049014`)  
**Sources:** tip code, prior overnight reports (`V8_OVERNIGHT_IMPLEMENTATION_REPORT.md`, per-prompt docs), MCP `list_screens` (83 titled screens; **BB18-M** absent)

## Status legend

| Status | Meaning |
|--------|---------|
| **IMPLEMENTED** | Backend + routes + UI present; desktop and mobile responsive shells exist; prior local tests recorded PASS |
| **PARTIAL** | Functional path exists, but Stitch D/M parity, dedicated markers, or mobile CSS is incomplete |
| **MISSING** | No usable implementation found |
| **BLOCKED** | Cannot finish overnight (missing Stitch variant, unapplied migrations for hosted, scheduler, or policy gate) |

Desktop / Mobile columns rate **UI parity against Stitch -D / -M**, not backend completeness.

**Do not re-implement** workflows already **IMPLEMENTED** unless a later prompt targets a documented PARTIAL gap.

---

## A. Shared Forms (SH01–SH15)

**Reusable services:** `src/platform/forms/*`, `sharedFormBuilderRoutes.js`, BB/AC mounts  
**Migrations (created, not applied):** `039_shared_tenant_forms.sql`, `040_shared_form_submission_review.sql`  
**CSS:** `public/platform/forms-builder.css` (desktop table / mobile cards via `@media`)

| Code | Workflow | Desktop | Mobile | Overall | Primary surface |
|------|----------|---------|--------|---------|-----------------|
| SH01 | Forms dashboard | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | `views/platform/forms/dashboard.ejs` |
| SH02 | Empty dashboard | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | `dashboard-empty.ejs` |
| SH03 | Form studio build | IMPLEMENTED | PARTIAL | **PARTIAL** | `studio.ejs` (`data-screen=SH03`) — mobile CSS thin vs Stitch -M |
| SH04 | Field settings | IMPLEMENTED | PARTIAL | **PARTIAL** | Same studio canvas panel (no separate route; SH04 tab marker) |
| SH05 | Preview | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | `preview.ejs` |
| SH06 | Publication | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | `publication.ejs` |
| SH07 | Sharing / access / QR | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | `sharing.ejs` |
| SH08 | Public ready form | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | `public-form.ejs` |
| SH09 | Public validation errors | PARTIAL | PARTIAL | **PARTIAL** | Error state of `public-form.ejs` (no dedicated `data-screen=SH09`) |
| SH10 | Submission confirmation | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | `public-thanks.ejs` |
| SH11 | Submissions list | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | `submissions.ejs` (desktop table / mobile cards) |
| SH12 | Submission detail | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | `submission-detail.ejs` |
| SH13 | Review / status change | PARTIAL | PARTIAL | **PARTIAL** | Manage panel on `submission-detail.ejs` (defaults `SH12`; SH13 via `stitchScreen`) |
| SH14 | Platform cross-tenant overview | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | `platform-overview.ejs` |
| SH15 | Access denied | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | `access-denied.ejs` |

**Backend routes:** Present via `sharedFormBuilderRoutes` + public `/f/:token`.  
**Gaps (do not rebuild core):** explicit SH09/SH13 stitch markers; deeper SH03/SH04 mobile Stitch parity.

---

## B. BlessBoard Membership (BB01–BB18)

**Reusable services:** `membershipWorkflowService.js`, `memberRegistrationService.js`, shared forms submit/review  
**Migration (created, not applied):** `110_membership_workflow_v8.sql`  
**Activity overlap:** BB08–BB10 also covered by activity registration (`041_activity_registration_v8.sql`)

| Code | Workflow | Desktop | Mobile | Overall | Primary surface |
|------|----------|---------|--------|---------|-----------------|
| BB01 | Membership forms dashboard | IMPLEMENTED | PARTIAL | **PARTIAL** | `bb-membership-forms.ejs` |
| BB02 | Form create/edit/publish | IMPLEMENTED | PARTIAL | **PARTIAL** | `bb-membership-form-edit.ejs` |
| BB03 | Apply step 1 personal | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | `public/register.ejs` step |
| BB04 | Apply step 2 spiritual | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | same |
| BB05 | Apply step 3 interests | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | same |
| BB06 | Apply step 4 review | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | same |
| BB07 | Submitted confirmation | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | `register-submitted.ejs` |
| BB08 | Visitor registration | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | `bb-activity-visitor.ejs` + `/visit` (+ markers BB08-D/M) |
| BB09 | Event registration | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | `bb-activity-event.ejs` |
| BB10 | Ministry registration | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | `bb-activity-ministry.ejs` |
| BB11 | Review queue | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | `branch-admin/registrations.ejs` |
| BB12 | Application detail | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | `registration-detail.ejs` |
| BB13 | Review decision | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | same (approve / follow-up / decline) |
| BB14 | Member profile | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | HQ/branch `member-detail.ejs` |
| BB15 | Member edit | IMPLEMENTED | PARTIAL | **PARTIAL** | Inline edit panel on member detail |
| BB16 | Branch transfer | IMPLEMENTED | PARTIAL | **PARTIAL** | Inline + `bb-membership-transfer.ejs` |
| BB17 | HQ members overview | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | `hq/members.ejs` |
| BB18 | Branch members overview | IMPLEMENTED | **BLOCKED*** | **PARTIAL** | `branch-admin/members.ejs` |

\* **BB18-M** missing from Stitch MCP inventory (83/84). Branch list has responsive CSS; do **not** invent a mobile layout without an approved Stitch -M screen.

---

## C. Shared Announcements (AN01–AN05)

**Reusable services:** `tenantAnnouncementService.js` / repository, `sharedAnnouncementRoutes.js`, BB + AC mounts  
**Migrations (created, not applied):** `042_shared_tenant_announcements.sql`, `111_announcement_schedule_v8.sql`  
**Scheduler:** `SCHEDULER_DEPENDENCY.available=false` → lazy read-time visibility only (**not** a missing UI; background promotion BLOCKED by design)

| Code | Workflow | Desktop | Mobile | Overall | Primary surface |
|------|----------|---------|--------|---------|-----------------|
| AN01 | Dashboard | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | `views/platform/announcements/dashboard.ejs` |
| AN02 | Create/edit | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | `editor.ejs` — mobile form density + sticky actions |
| AN03 | Schedule window | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | `schedule.ejs` + dependency banner |
| AN04 | Preview | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | `preview.ejs` |
| AN05 | Confirm publish | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | `confirm-publish.ejs` |

---

## D. BlessBoard Announcements (BB19–BB22)

**Reusable services:** `announcementsService.js`, `announcementAdminRoutes.js`, `announcementPublicRoutes.js`  
**Migration (created, not applied):** `112_announcement_public_audience_v8.sql`

| Code | Workflow | Desktop | Mobile | Overall | Primary surface |
|------|----------|---------|--------|---------|-----------------|
| BB19 | Admin list | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | `announcements/admin-list.ejs` (+ D/M stitch IDs) |
| BB20 | Admin create/edit/publish | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | `admin-form.ejs` / `admin-publish.ejs` |
| BB21 | Public list | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | `public/announcements.ejs` |
| BB22 | Public detail | IMPLEMENTED | IMPLEMENTED | **IMPLEMENTED** | `public/announcement-detail.ejs` |

---

## E. Adjacent platform / AC status (verify only — do not redo)

| Area | Prior verdict | Code tip (impl) | Local automated | Hosted |
|------|---------------|-----------------|-----------------|--------|
| Shared media delivery | `V8_MEDIA_CODE_PASS` | `d587615d` | PASS | Read-only image 200 noted earlier; full hosted write **not** claimed |
| AC booking / inquiry | `V8_AC_BOOKING_CODE_PASS` | `9a0c3045` | PASS | Hosted write verification still required |
| AC duplicate-phone registration | `V8_SHARED_PHONE_IDENTITY_CODE_PASS` | `f5515341` | PASS | Unique-all-phones migration deferred; hosted POST retest required |
| AC services + doctor profiles | `V8_AC_SERVICES_PROFILES_CODE_PASS` | `f297e531` | PASS | Hosted CRUD verification still required |
| AC directory navigation | `V8_AC_DIRECTORY_CODE_PASS` | `bb1ab5e9` | PASS | Hosted spot-check noted in prior report; re-verify after deploy |

Regression gate at prior close (`946fd8cc` series): shared-platform + compatibility + BlessBoard + ActiveClinic **984/984 PASS**.

---

## F. Required DB migrations (additive files exist — **not applied**)

| Order | File | Unlocks |
|------:|------|---------|
| 1 | `platform/039_shared_tenant_forms.sql` | SH01–SH07 persistence |
| 2 | `platform/040_shared_form_submission_review.sql` | SH08–SH15 review/idempotency |
| 3 | `platform/041_activity_registration_v8.sql` | BB08–BB10 categories/capacity |
| 4 | `blessboard/110_membership_workflow_v8.sql` | BB01–BB18 intake/review/transfer |
| 5 | `platform/042_shared_tenant_announcements.sql` | AN01–AN05 shared studio |
| 6 | `blessboard/111_announcement_schedule_v8.sql` | Timed windows on BB product path |
| 7 | `blessboard/112_announcement_public_audience_v8.sql` | Public website audience for BB21–BB22 |

Operator-only (outside overnight): apply in order on shared testing DB, then deploy/restart V8.

---

## G. Reusable services & routes (inventory)

| Layer | Paths |
|-------|-------|
| Shared forms | `src/platform/forms/*`, `src/platform/http/sharedFormBuilderRoutes.js`, `registerBlessBoardSharedFormRoutes.js`, `registerActiveClinicSharedFormRoutes.js` |
| Membership | `src/blessboard/services/membershipWorkflowService.js`, `membershipWorkflowAdminRoutes.js`, `tenantRegistrationRoutes.js` |
| Activity registration | `activityRegistrationService.js` + HQ/branch activity-forms + public `/visit`, event/ministry register |
| Shared announcements | `src/platform/announcements/*`, `sharedAnnouncementRoutes.js` |
| BB announcements | `announcementsService.js`, admin + `announcementPublicRoutes.js`, tenant public nav |
| Media | Existing shared CDN/media presentation (Prompt 02) — reuse |
| Phone identity | `platformIdentityService.js` — reuse |

**Missing backend routes:** None identified for the audited workflows on tip. Gaps are Stitch visual parity, markers, unapplied migrations, and hosted verification — not greenfield APIs.

**Incomplete UI (PARTIAL backlog only):**

1. SH09 / SH13 dedicated `data-screen` + visual states vs Stitch  
2. SH03 / SH04 / AN02 / AN03 / BB01 / BB02 / BB15 / BB16 mobile Stitch density  
3. BB18-M Stitch screen missing → **BLOCKED** for inventing mobile-only chrome  

---

## H. Dependency-ordered implementation matrix

Work **down** this list. Skip rows already **IMPLEMENTED** unless fixing a listed PARTIAL.

| Priority | Item | Depends on | Status | Overnight action |
|---------:|------|------------|--------|------------------|
| 0 | Shared media + phone + AC booking/catalogue/directory | — | IMPLEMENTED (code) | **Reuse only**; hosted verify later |
| 1 | Operator apply migrations 039→112 | Shared testing DB window | BLOCKED overnight (rule 12) | Do not apply overnight |
| 2 | SH01–SH07 form builder | 039 | IMPLEMENTED / PARTIAL (studio mobile) | Polish PARTIAL only if prompted |
| 3 | SH08–SH15 public + review | 2 + 040 | IMPLEMENTED / PARTIAL (SH09/SH13 markers) | Marker/state polish if prompted |
| 4 | BB01–BB07, BB11–BB18 membership | 3 + 110 | Mostly IMPLEMENTED; BB18-M BLOCKED in Stitch | Wait for BB18-M or reuse responsive list |
| 5 | BB08–BB10 activity registration | 3 + 041 | IMPLEMENTED | Reuse |
| 6 | AN01–AN05 shared announcements | 042 (+111 for BB schedule cols) | IMPLEMENTED / PARTIAL mobile | Polish if prompted; no scheduler worker |
| 7 | BB19–BB22 public/admin announcements | 6 + 112 | IMPLEMENTED | Reuse |
| 8 | Background announcement scheduler | Product decision | **BLOCKED** (`available=false`) | Keep lazy evaluation |
| 9 | Hosted deploy + write + write verification | 1 + tip SHA | BLOCKED overnight | Never claim hosted PASS from local tests |
| 10 | Stitch visual parity pass (D+M) | Approved screens; BB18-M | PARTIAL | Compare browser vs Stitch; no invent |

---

## I. Summary counts (workflow overall)

| Series | IMPLEMENTED | PARTIAL | MISSING | BLOCKED (overall)* |
|--------|------------:|--------:|--------:|-------------------:|
| SH01–SH15 | 11 | 4 | 0 | 0 |
| BB01–BB18 | 13 | 5 | 0 | 0 |
| AN01–AN05 | 3 | 2 | 0 | 0 |
| BB19–BB22 | 4 | 0 | 0 | 0 |

\* No workflow is overall BLOCKED for **code**; BB18 **mobile Stitch** and **hosted/migrations/scheduler** are the open blockers.

---

## J. Audit constraints observed

- No application code, migrations applied, deploy, restart, notifications, or hosted tenant mutations in this prompt.  
- Prior overnight CODE_PASS work was inspected and **not** repeated.  
- Hosted PASS is **not** claimed.
