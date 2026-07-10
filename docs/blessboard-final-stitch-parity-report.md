# BlessBoard Final Stitch Parity Report

**Last updated:** 2026-07-10  
**CSS final version:** v42  
**Design reference:** `design-reference/stitch-screens/church-flow/`  
**Inventory source:** [`docs/blessboard-stitch-screen-inventory.md`](blessboard-stitch-screen-inventory.md)  
**Implementation status:** [`docs/blessboard-screen-implementation-status.md`](blessboard-screen-implementation-status.md)  
**Asset map:** [`docs/blessboard-stitch-asset-map.md`](blessboard-stitch-asset-map.md)  
**Screenshot root:** `test-results/blessboard-stitch-visual/`  
**npm test:** 434 pass, 0 fail (311 skipped)

**Goal reminder:** Every PNG-backed screen is implemented via EJS + CSS. Stitch PNGs are never displayed as UI.

---

## A. Overall summary

| Metric | Count |
|--------|------:|
| Unique PNGs inventoried | **110** |
| Matched | 0 |
| Close match | **68** |
| Shell-aligned | **30** |
| Deferred | **10** |
| Missing route | **2** |
| Missing PNG pair gaps (documented) | **6** |

**PNG inventory by module**

| Group | Unique PNGs |
|-------|------------:|
| Public website (incl. 2 misfiled branch dashboards) | 17 |
| Authentication | 10 |
| Member portal | 13 |
| Branch admin | 42 |
| Leader | 10 |
| HQ (mobile only) | 4 |
| Platform admin | 14 |
| **Total** | **110** |

**Status mapping**

| Inventory wording | Report status |
|-------------------|---------------|
| Close / Aligned / Close (v…) | Close match |
| Aligned (Batch D shell) / Shell-aligned | Shell-aligned |
| Leader 46–50 Partial | Deferred |
| HQ 59–60 Partial / route gap | Missing route |
| Misfiled `04-branch-admin-dashboard-*` | Close match (duplicate of `25-*`) |

---

## B. CSS version summary

| Area | CSS |
|------|-----|
| Public baseline | v36 (Giving Batch A v37) |
| Auth | v38 |
| Member | v40 (shells later on v42) |
| Branch admin | v41 |
| Platform / HQ shells | v42 |
| **Current final** | **v42** |

---

## C. Known intentional differences

- BlessBoard branding instead of GetPro Church
- Powered by GetPro secondary branding
- Drawer + FAB instead of mobile bottom tabs (public / some portals)
- DB/demo content differs from Stitch sample data
- Some filters/searches visual-only
- No payment processing
- No direct file uploads
- No live map integration
- No fake charts where real data should exist

---

## D. Pilot blockers

No Stitch-parity blockers for Kafue Baptist pilot.

---

## E. Deferred Phase 2 screens

- **Leader Portal 46–50** (10 PNGs) — Deferred
- **HQ permissions / templates 59–60** — Missing route (not invented)
- Optional deeper pixel pass on branch secondary screens and platform secondary screens (already Shell-aligned / Close match)

---

## F. Recommended next development phase

1. Deploy V4  
2. Run production smoke test  
3. Provision Kafue Baptist  
4. Train branch admin  
5. Collect pilot feedback  
6. Then prioritize Phase 2 gaps  

Do **not** prioritize further pixel polish unless it blocks pilot.

---

## 1. Public Website

Folder: `01-public-website/` · CSS v36 / Giving v37

| PNG | Module | Screen | Device | Route | Status | Screenshot | Remaining Difference |
|-----|--------|--------|--------|-------|--------|------------|----------------------|
| `01-public-home-desktop.png` | Public | Home | Desktop | `/` | Close match | — | no batch screenshot; brand / dual-header intentional |
| `01-public-home-mobile.png` | Public | Home | Mobile | `/` | Close match | — | no batch screenshot; drawer+FAB vs bottom tabs |
| `02-public-about-desktop.png` | Public | About | Desktop | `/about` | Close match | — | no batch screenshot |
| `02-public-about-mobile.png` | Public | About | Mobile | `/about` | Close match | — | no batch screenshot |
| `03-public-leadership-desktop.png` | Public | Leadership | Desktop | `/leadership` | Close match | — | no batch screenshot |
| `03-public-leadership-mobile.png` | Public | Leadership | Mobile | `/leadership` | Close match | — | no batch screenshot |
| `04-public-ministries-desktop.png` | Public | Ministries | Desktop | `/ministries` | Close match | — | no batch screenshot; Missing PNG pair (mobile) |
| *(no mobile PNG)* | Public | Ministries | Mobile | `/ministries` | Missing PNG pair | — | Missing PNG pair; stacked desktop layout on mobile |
| `05-public-events-calendar-desktop.png` | Public | Events calendar | Desktop | `/events` | Close match | — | no batch screenshot; calendar toggle visual-only |
| `05-public-events-calendar-mobile.png` | Public | Events calendar | Mobile | `/events` | Close match | — | no batch screenshot |
| `06-public-sermons-resources-desktop.png` | Public | Sermons / resources | Desktop | `/sermons` | Close match | — | no batch screenshot; no live media players |
| `06-public-sermons-resources-mobile.png` | Public | Sermons / resources | Mobile | `/sermons` | Close match | — | no batch screenshot |
| `07-public-giving-information-desktop.png` | Public | Giving | Desktop | `/giving` | Close match | `public-giving/giving-desktop.png` | brand / DB content vs Stitch sample; no payment processing |
| `07-public-giving-information-mobile.png` | Public | Giving | Mobile | `/giving` | Close match | `public-giving/giving-mobile.png` | brand / DB content vs Stitch sample; no payment processing |
| `08-public-contact-desktop.png` | Public | Contact | Desktop | `/contact` | Close match | — | no batch screenshot; no live map integration |
| `08-public-contact-mobile.png` | Public | Contact | Mobile | `/contact` | Close match | — | no batch screenshot; no live map integration |
| `04-branch-admin-dashboard-desktop.png` | Branch admin | Dashboard (misfiled) | Desktop | `/branch/dashboard` | Close match | `branch-admin/dashboard-desktop.png` | Misfiled under public; duplicate of `25-*` |
| `04-branch-admin-dashboard-mobile.png` | Branch admin | Dashboard (misfiled) | Mobile | `/branch/dashboard` | Close match | `branch-admin/dashboard-mobile.png` | Misfiled under public; duplicate of `25-*` |

---

## 2. Authentication

Folder: `02-authentication/` · CSS v38 · Batch B

| PNG | Module | Screen | Device | Route | Status | Screenshot | Remaining Difference |
|-----|--------|--------|--------|-------|--------|------------|----------------------|
| `09-auth-member-login-desktop.png` | Auth | Member login | Desktop | `/login` | Close match | `auth/login-desktop.png` | BlessBoard / Powered by GetPro (not GetPro Church) |
| `09-auth-member-login-mobile.png` | Auth | Member login | Mobile | `/login` | Close match | `auth/login-mobile.png` | same brand rule |
| `10-auth-member-registration-desktop.png` | Auth | Registration | Desktop | `/register` | Close match | `auth/register-desktop.png` | product enums; single-page form |
| `10-auth-member-registration-mobile.png` | Auth | Registration | Mobile | `/register` | Close match | `auth/register-mobile.png` | same |
| `11-auth-registration-submitted-desktop.png` | Auth | Registration submitted | Desktop | `/registration-submitted` | Close match | `auth/registration-submitted-desktop.png` | no fake Submission ID |
| `11-auth-registration-submitted-mobile.png` | Auth | Registration submitted | Mobile | `/registration-submitted` | Close match | `auth/registration-submitted-mobile.png` | same |
| `12-auth-waiting-verification-desktop.png` | Auth | Waiting verification | Desktop | `/waiting-verification` | Close match | `auth/waiting-verification-desktop.png` | needs pending session |
| `12-auth-waiting-verification-mobile.png` | Auth | Waiting verification | Mobile | `/waiting-verification` | Close match | `auth/waiting-verification-mobile.png` | same |
| `13-auth-forgot-password-desktop.png` | Auth | Forgot password | Desktop | `/forgot-password` | Close match | `auth/forgot-password-desktop.png` | optional fields for branch review |
| `13-auth-forgot-password-mobile.png` | Auth | Forgot password | Mobile | `/forgot-password` | Close match | `auth/forgot-password-mobile.png` | same |

---

## 3. Member Portal

Folder: `03-member-portal/` · CSS v40 · Batch C

| PNG | Module | Screen | Device | Route | Status | Screenshot | Remaining Difference |
|-----|--------|--------|--------|-------|--------|------------|----------------------|
| `14-member-dashboard-desktop.png` | Member | Dashboard | Desktop | `/member/dashboard` | Close match | `member/dashboard-desktop.png` | brand / demo content; no payment processing |
| `14-member-dashboard-mobile.png` | Member | Dashboard | Mobile | `/member/dashboard` | Close match | `member/dashboard-mobile.png` | bottom nav Stitch-aligned |
| `15-member-profile-desktop.png` | Member | Profile | Desktop | `/member/profile` | Close match | `member/profile-desktop.png` | shared demo avatar; no upload |
| `15-member-profile-mobile.png` | Member | Profile | Mobile | `/member/profile` | Close match | `member/profile-mobile.png` | same |
| `16-member-announcements-desktop.png` | Member | Announcements | Desktop | `/member/announcements` | Close match | `member/announcements-desktop.png` | filters client-side only |
| `16-member-announcements-mobile.png` | Member | Announcements | Mobile | `/member/announcements` | Close match | `member/announcements-mobile.png` | DB copy differs |
| `17-member-events-calendar-desktop.png` | Member | Events | Desktop | `/member/events` | Close match | `member/events-desktop.png` | lightweight calendar |
| `17-member-events-calendar-mobile.png` | Member | Events | Mobile | `/member/events` | Close match | `member/events-mobile.png` | same |
| `18-member-my-ministries-desktop.png` | Member | My ministries | Desktop | `/member/my-ministries` | Close match | `member/ministries-desktop.png` | placeholder covers |
| `18-member-my-ministries-mobile.png` | Member | My ministries | Mobile | `/member/my-ministries` | Close match | `member/ministries-mobile.png` | same |
| `19-member-resources-study-desktop.png` | Member | Resources | Desktop | `/member/resources` | Close match | `member/resources-desktop.png` | filter pills visual-only |
| `19-member-resources-study-mobile.png` | Member | Resources | Mobile | `/member/resources` | Close match | `member/resources-mobile.png` | same |
| `20-member-forms-documents-mobile.png` | Member | Forms | Mobile | `/member/forms` | Close match | `member/forms-mobile.png` | Missing PNG pair (desktop); search disabled |
| *(no desktop PNG)* | Member | Forms | Desktop | `/member/forms` | Missing PNG pair | `member/forms-desktop.png` | Missing PNG pair; implemented without Stitch desktop PNG |

---

## 4. Branch Admin

Folder: `04-branch-admin/` · CSS v41 · Batch D

| PNG | Module | Screen | Device | Route | Status | Screenshot | Remaining Difference |
|-----|--------|--------|--------|-------|--------|------------|----------------------|
| `25-branch-admin-dashboard-desktop.png` | Branch admin | Dashboard | Desktop | `/branch/dashboard` | Close match | `branch-admin/dashboard-desktop.png` | brand (not Ecclesia); real counts; no live charts |
| `25-branch-admin-dashboard-mobile.png` | Branch admin | Dashboard | Mobile | `/branch/dashboard` | Close match | `branch-admin/dashboard-mobile.png` | same |
| `26-branch-member-verification-queue-desktop.png` | Branch admin | Member verification | Desktop | `/branch/member-verification` | Close match | `branch-admin/member-verification-desktop.png` | Export/Filter not invented |
| `26-branch-member-verification-queue-mobile.png` | Branch admin | Member verification | Mobile | `/branch/member-verification` | Close match | `branch-admin/member-verification-mobile.png` | same |
| `27-branch-member-profile-desktop.png` | Branch admin | Member profile | Desktop | `/branch/members/:id` | Shell-aligned | — | no batch screenshot; Batch D shell |
| `27-branch-member-profile-mobile.png` | Branch admin | Member profile | Mobile | `/branch/members/:id` | Shell-aligned | — | no batch screenshot; Batch D shell |
| `28-branch-member-directory-desktop.png` | Branch admin | Members directory | Desktop | `/branch/members` | Close match | `branch-admin/members-desktop.png` | DB content differs |
| `28-branch-member-directory-mobile.png` | Branch admin | Members directory | Mobile | `/branch/members` | Close match | `branch-admin/members-mobile.png` | same |
| `29-branch-ministries-directory-desktop.png` | Branch admin | Ministries | Desktop | `/branch/ministries` | Shell-aligned | — | no batch screenshot; Batch D shell |
| `29-branch-ministries-directory-mobile.png` | Branch admin | Ministries | Mobile | `/branch/ministries` | Shell-aligned | — | no batch screenshot; Batch D shell |
| `30-branch-ministry-profile-desktop.png` | Branch admin | Ministry profile | Desktop | `/branch/ministries/:id` | Shell-aligned | — | no batch screenshot; Batch D shell |
| `30-branch-ministry-profile-mobile.png` | Branch admin | Ministry profile | Mobile | `/branch/ministries/:id` | Shell-aligned | — | no batch screenshot; Batch D shell |
| `31-branch-departments-directory-desktop.png` | Branch admin | Departments | Desktop | `/branch/departments` | Shell-aligned | — | no batch screenshot; Batch D shell |
| `31-branch-departments-directory-mobile.png` | Branch admin | Departments | Mobile | `/branch/departments` | Shell-aligned | — | no batch screenshot; Batch D shell |
| `32-branch-events-management-desktop.png` | Branch admin | Events | Desktop | `/branch/events` | Close match | `branch-admin/events-desktop.png` | shared cover assets |
| `32-branch-events-management-mobile.png` | Branch admin | Events | Mobile | `/branch/events` | Close match | `branch-admin/events-mobile.png` | same |
| `33-branch-duty-roster-desktop.png` | Branch admin | Duty roster | Desktop | `/branch/duty-roster` | Shell-aligned | — | no batch screenshot; Batch D shell |
| `33-branch-duty-roster-mobile.png` | Branch admin | Duty roster | Mobile | `/branch/duty-roster` | Shell-aligned | — | no batch screenshot; Batch D shell |
| `34-branch-website-editor-desktop.png` | Branch admin | Website editor | Desktop | `/branch/website-editor` | Close match | `branch-admin/website-editor-desktop.png` | photo uploads not fully wired |
| `34-branch-website-editor-mobile.png` | Branch admin | Website editor | Mobile | `/branch/website-editor` | Close match | `branch-admin/website-editor-mobile.png` | same |
| `35-branch-announcements-management-desktop.png` | Branch admin | Announcements | Desktop | `/branch/announcements` | Shell-aligned | — | no batch screenshot; Batch D shell |
| `35-branch-announcements-management-mobile.png` | Branch admin | Announcements | Mobile | `/branch/announcements` | Shell-aligned | — | no batch screenshot; Batch D shell |
| `36-branch-attendance-tracker-desktop.png` | Branch admin | Attendance | Desktop | `/branch/attendance` | Shell-aligned | — | no batch screenshot; Batch D shell |
| `36-branch-attendance-tracker-mobile.png` | Branch admin | Attendance | Mobile | `/branch/attendance` | Shell-aligned | — | no batch screenshot; Batch D shell |
| `37-branch-attendance-record-detail-desktop.png` | Branch admin | Attendance detail | Desktop | `/branch/attendance/:id` | Shell-aligned | — | no batch screenshot; Batch D shell |
| `37-branch-attendance-record-detail-mobile.png` | Branch admin | Attendance detail | Mobile | `/branch/attendance/:id` | Shell-aligned | — | no batch screenshot; Batch D shell |
| `38-branch-giving-settings-desktop.png` | Branch admin | Giving settings | Desktop | `/branch/giving-settings` | Shell-aligned | — | no batch screenshot; no payment processing |
| `38-branch-giving-settings-mobile.png` | Branch admin | Giving settings | Mobile | `/branch/giving-settings` | Shell-aligned | — | no batch screenshot; no payment processing |
| `39-branch-giving-summary-desktop.png` | Branch admin | Giving summary | Desktop | `/branch/giving-summary` | Shell-aligned | — | no batch screenshot; no fake charts |
| `39-branch-giving-summary-mobile.png` | Branch admin | Giving summary | Mobile | `/branch/giving-summary` | Shell-aligned | — | no batch screenshot; no fake charts |
| `40-branch-reports-dashboard-desktop.png` | Branch admin | Reports | Desktop | `/branch/reports` | Close match | `branch-admin/reports-desktop.png` | real attendance preview / empty states |
| `40-branch-reports-dashboard-mobile.png` | Branch admin | Reports | Mobile | `/branch/reports` | Close match | `branch-admin/reports-mobile.png` | same |
| `41-branch-submit-monthly-report-desktop.png` | Branch admin | Submit monthly report | Desktop | `/branch/reports/new` | Shell-aligned | — | no batch screenshot; Batch D shell |
| `41-branch-submit-monthly-report-mobile.png` | Branch admin | Submit monthly report | Mobile | `/branch/reports/new` | Shell-aligned | — | no batch screenshot; Batch D shell |
| `42-branch-report-history-desktop.png` | Branch admin | Report history | Desktop | `/branch/reports` (history) | Close match | `branch-admin/reports-desktop.png` | shares reports dashboard screenshot |
| `42-branch-report-history-mobile.png` | Branch admin | Report history | Mobile | `/branch/reports` (history) | Close match | `branch-admin/reports-mobile.png` | shares reports dashboard screenshot |
| `43-branch-report-details-desktop.png` | Branch admin | Report details | Desktop | `/branch/reports/:id` | Shell-aligned | — | no batch screenshot; Batch D shell |
| `43-branch-report-details-mobile.png` | Branch admin | Report details | Mobile | `/branch/reports/:id` | Shell-aligned | — | no batch screenshot; Batch D shell |
| `44-branch-request-workflow-queue-desktop.png` | Branch admin | Requests queue | Desktop | `/branch/requests` | Shell-aligned | — | no batch screenshot; Batch D shell |
| `44-branch-request-workflow-queue-mobile.png` | Branch admin | Requests queue | Mobile | `/branch/requests` | Shell-aligned | — | no batch screenshot; Batch D shell |
| `45-branch-request-details-desktop.png` | Branch admin | Request details | Desktop | `/branch/requests/:id` | Shell-aligned | — | no batch screenshot; Batch D shell |
| `45-branch-request-details-mobile.png` | Branch admin | Request details | Mobile | `/branch/requests/:id` | Shell-aligned | — | no batch screenshot; Batch D shell |

**Branch routes without dedicated Stitch PNG (not in 110):** `/branch/sermons`, `/branch/resources`, `/branch/contact-submissions` — shell-aligned; screenshots at `branch-admin/sermons-*`, `resources-*`, `contact-submissions-*`.

---

## 5. Leader Portal

Folder: `05-leader/` · Deferred to Phase 2

| PNG | Module | Screen | Device | Route | Status | Screenshot | Remaining Difference |
|-----|--------|--------|--------|-------|--------|------------|----------------------|
| `46-leader-dashboard-desktop.png` | Leader | Dashboard | Desktop | `/leader/dashboard` | Deferred | — | Phase 2; functional route exists |
| `46-leader-dashboard-mobile.png` | Leader | Dashboard | Mobile | `/leader/dashboard` | Deferred | — | Phase 2 |
| `47-leader-ministry-roster-desktop.png` | Leader | Roster | Desktop | `/leader/roster` | Deferred | — | Phase 2 |
| `47-leader-ministry-roster-mobile.png` | Leader | Roster | Mobile | `/leader/roster` | Deferred | — | Phase 2 |
| `48-leader-record-attendance-desktop.png` | Leader | Attendance | Desktop | `/leader/attendance` | Deferred | — | Phase 2 |
| `48-leader-record-attendance-mobile.png` | Leader | Attendance | Mobile | `/leader/attendance` | Deferred | — | Phase 2 |
| `49-leader-submit-ministry-report-desktop.png` | Leader | Reports | Desktop | `/leader/activity-notes` | Deferred | — | Phase 2 |
| `49-leader-submit-ministry-report-mobile.png` | Leader | Reports | Mobile | `/leader/activity-notes` | Deferred | — | Phase 2 |
| `50-leader-ministry-requests-desktop.png` | Leader | Requests | Desktop | `/leader/*` (requests) | Deferred | — | Phase 2; nearest join/activity flows |
| `50-leader-ministry-requests-mobile.png` | Leader | Requests | Mobile | `/leader/*` (requests) | Deferred | — | Phase 2 |

---

## 6. HQ

Folder: `06-hq/` · mobile PNGs only · CSS v42

| PNG | Module | Screen | Device | Route | Status | Screenshot | Remaining Difference |
|-----|--------|--------|--------|-------|--------|------------|----------------------|
| `58-hq-global-audit-trail-mobile.png` | HQ | Global audit trail | Mobile | `/hq/audit` | Shell-aligned | — | Missing PNG pair (desktop); no batch screenshot |
| `59-hq-permission-role-management-mobile.png` | HQ | Permission / role management | Mobile | `/hq/*` | Missing route | — | Missing PNG pair (desktop); route gap — Phase 2 |
| `60-hq-organization-templates-standards-mobile.png` | HQ | Organization templates / standards | Mobile | `/hq/*` | Missing route | — | Missing PNG pair (desktop); route gap — Phase 2 |
| `61-hq-broadcast-center-mobile.png` | HQ | Broadcast center | Mobile | `/hq/broadcasts` | Shell-aligned | — | Missing PNG pair (desktop); no batch screenshot |

---

## 7. Platform Admin

Folder: `07-platform-admin/` · CSS v42 · Batch E · blessboard.com apex

| PNG | Module | Screen | Device | Route | Status | Screenshot | Remaining Difference |
|-----|--------|--------|--------|-------|--------|------------|----------------------|
| `62-platform-admin-dashboard-desktop.png` | Platform | Admin dashboard | Desktop | `/admin/dashboard` | Close match | `platform-admin/dashboard-desktop.png` | BlessBoard brand; real counts; no fake MRR chart |
| `62-platform-admin-dashboard-mobile.png` | Platform | Admin dashboard | Mobile | `/admin/dashboard` | Close match | `platform-admin/dashboard-mobile.png` | same |
| `63-platform-church-organizations-desktop.png` | Platform | Churches list | Desktop | `/admin/churches` | Close match | `platform-admin/churches-list-desktop.png` | real filters; no fake chart strip |
| `63-platform-church-organizations-mobile.png` | Platform | Churches list | Mobile | `/admin/churches` | Close match | `platform-admin/churches-list-mobile.png` | same |
| `64-platform-create-church-organization-desktop.png` | Platform | Create church | Desktop | `/admin/churches/new` | Close match | `platform-admin/church-new-desktop.png` | product provisioning fields exceed Stitch sample |
| `64-platform-create-church-organization-mobile.png` | Platform | Create church | Mobile | `/admin/churches/new` | Close match | `platform-admin/church-new-mobile.png` | same |
| `65-platform-branch-tenants-desktop.png` | Platform | Branch tenants | Desktop | `/admin/churches/:id` / branches | Close match | `platform-admin/church-detail-desktop.png` | deeper pixel optional |
| `65-platform-branch-tenants-mobile.png` | Platform | Branch tenants | Mobile | `/admin/churches/:id` / branches | Close match | `platform-admin/church-detail-mobile.png` | same |
| `66-platform-plans-limits-desktop.png` | Platform | Plans / limits | Desktop | `/admin/churches/:id/plan` | Close match | — | no batch screenshot; real plan limits |
| `66-platform-plans-limits-mobile.png` | Platform | Plans / limits | Mobile | `/admin/churches/:id/plan` | Close match | — | no batch screenshot; real plan limits |
| `67-platform-settings-desktop.png` | Platform | Settings | Desktop | `/admin/church/security` | Close match | — | no batch screenshot; product security vs Stitch mock |
| `67-platform-settings-mobile.png` | Platform | Settings | Mobile | `/admin/church/security` | Close match | — | no batch screenshot |
| `68-platform-support-monitoring-desktop.png` | Platform | Support / diagnostics | Desktop | `/admin/diagnostics` | Close match | `platform-admin/diagnostics-desktop.png` | real fields; secrets never shown |
| `68-platform-support-monitoring-mobile.png` | Platform | Support / diagnostics | Mobile | `/admin/diagnostics` | Close match | `platform-admin/diagnostics-mobile.png` | same |

**Related (not in 110):** apex `/admin/login` and `/admin/churches/:id/edit` — screenshots at `platform-admin/admin-login-*`, `church-edit-*`.

---

## 8. Shared shells / components

| Shell / component | Modules | CSS | Status | Screenshot | Remaining Difference |
|-------------------|---------|-----|--------|------------|----------------------|
| Public branch header / footer | Public | v36–v37 | Close match | — | church nav (not apex SaaS) |
| Public apex marketing header | Public (apex) | v36 | Close match | — | Features / Pricing / About Us on apex only |
| Auth dual layout shell | Auth | v38 | Close match | `auth/login-*.png` | BlessBoard branding |
| Member portal shell | Member | v40→v42 | Close match | `member/dashboard-*.png` | drawer + FAB / bottom nav |
| Branch admin shell | Branch admin | v41→v42 | Shell-aligned | `branch-admin/dashboard-*.png` | secondary screens share shell |
| Platform admin dark shell | Platform | v42 | Close match | `platform-admin/dashboard-*.png` | apex-only; dual-mode with GetPro legacy |
| HQ shell | HQ | v42 | Shell-aligned | — | mobile-only Stitch set |
| Powered by GetPro mark | Shared | all | Not applicable | — | intentional secondary branding |

---

## Missing PNG pair detail

| Gap | Device missing | Related screen | Notes |
|-----|----------------|----------------|-------|
| Public ministries | Mobile | `04-public-ministries-desktop.png` | Missing PNG pair row |
| Member forms | Desktop | `20-member-forms-documents-mobile.png` | Missing PNG pair row |
| HQ audit trail | Desktop | `58-…-mobile.png` | noted on mobile row |
| HQ permissions / roles | Desktop | `59-…-mobile.png` | also Missing route |
| HQ org templates | Desktop | `60-…-mobile.png` | also Missing route |
| HQ broadcast center | Desktop | `61-…-mobile.png` | noted on mobile row |

**Missing PNG pair gaps total: 6**

---

## Go / no-go

**Go for Kafue Baptist pilot** — no Stitch-parity blockers.  
Proceed: Deploy V4 → production smoke → provision Kafue Baptist → train branch admin → collect feedback → then Phase 2 (Leader 46–50, HQ 59–60).
