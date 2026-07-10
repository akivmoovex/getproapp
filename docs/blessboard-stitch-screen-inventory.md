# BlessBoard Stitch Screen Inventory

**Last updated:** 2026-07-10  
**CSS freeze baseline:** v36; Batch A complete at v37; Batch B Auth complete at v38; Batch C starts v39  
**Design reference root:** `design-reference/stitch-screens/church-flow/`  
**Unique PNGs in this inventory:** 110 (excludes Finder-style duplicate folders named `* 2` / `* 3`)

**Goal:** Every PNG-backed screen must match via EJS + CSS. Do **not** display Stitch PNGs as UI.

**Batch plan:**

| Batch | Scope |
|-------|--------|
| A | Public remaining (Giving) |
| B | Auth |
| C | Member |
| D | Branch admin |
| E | Platform / HQ admin |

**Status legend:** Close · Partial · Missing PNG · Missing PNG pair · Misfiled

---

## 1. Public Website

Folder: `01-public-website/`

| File | Module | Screen | Device | Expected route | Current view | Status |
|------|--------|--------|--------|----------------|--------------|--------|
| `01-public-home-desktop.png` | Public | Home | Desktop | `/` | `church/public/home.ejs` | Close (v34/v36) |
| `01-public-home-mobile.png` | Public | Home | Mobile | `/` | `church/public/home.ejs` | Close (v34/v36) |
| `02-public-about-desktop.png` | Public | About | Desktop | `/about` | `church/public/about.ejs` | Close |
| `02-public-about-mobile.png` | Public | About | Mobile | `/about` | `church/public/about.ejs` | Close |
| `03-public-leadership-desktop.png` | Public | Leadership | Desktop | `/leadership` | `church/public/leadership.ejs` | Close |
| `03-public-leadership-mobile.png` | Public | Leadership | Mobile | `/leadership` | `church/public/leadership.ejs` | Close |
| `04-public-ministries-desktop.png` | Public | Ministries | Desktop | `/ministries` | `church/public/ministries.ejs` | Close |
| *(no mobile PNG)* | Public | Ministries | Mobile | `/ministries` | `church/public/ministries.ejs` | Close; Missing PNG pair for mobile |
| `05-public-events-calendar-desktop.png` | Public | Events calendar | Desktop | `/events` | `church/public/events.ejs` | Close |
| `05-public-events-calendar-mobile.png` | Public | Events calendar | Mobile | `/events` | `church/public/events.ejs` | Close |
| `06-public-sermons-resources-desktop.png` | Public | Sermons / resources | Desktop | `/sermons` | `church/public/sermons.ejs` | Close |
| `06-public-sermons-resources-mobile.png` | Public | Sermons / resources | Mobile | `/sermons` | `church/public/sermons.ejs` | Close |
| `07-public-giving-information-desktop.png` | Public | Giving | Desktop | `/giving` | `church/public/giving.ejs` | Close (v37 Batch A) |
| `07-public-giving-information-mobile.png` | Public | Giving | Mobile | `/giving` | `church/public/giving.ejs` | Close (v37 Batch A) |
| `08-public-contact-desktop.png` | Public | Contact | Desktop | `/contact` | `church/public/contact.ejs` | Close |
| `08-public-contact-mobile.png` | Public | Contact | Mobile | `/contact` | `church/public/contact.ejs` | Close |
| `04-branch-admin-dashboard-desktop.png` | Branch admin | Dashboard (misfiled) | Desktop | `/branch/dashboard` | `church/branch-admin/dashboard.ejs` | Partial; **MISFILED** under `01-public-website` |
| `04-branch-admin-dashboard-mobile.png` | Branch admin | Dashboard (misfiled) | Mobile | `/branch/dashboard` | `church/branch-admin/dashboard.ejs` | Partial; **MISFILED** under `01-public-website` |

**Notes**

- Ministries has desktop PNG only; mobile uses stacked desktop layout (Missing PNG pair).
- `04-branch-admin-dashboard-*` live under `01-public-website/` but belong to Branch Admin (also covered by `25-branch-admin-dashboard-*` in `04-branch-admin/`).
- Public not-found (`church/public/not_found.ejs`) has no Stitch PNG in this export.

**Excluded duplicates (not counted):** `01-public-home-desktop 2/`, `01-public-home-mobile 2/`, `01-public-home-mobile 3/`.

---

## 2. Authentication

Folder: `02-authentication/`

| PNG | Screen | Device | Route | View | Status |
|-----|--------|--------|-------|------|--------|
| `09-auth-member-login-desktop.png` | Member login | Desktop | `/login` | `church/auth/login.ejs` | Aligned (Batch B) |
| `09-auth-member-login-mobile.png` | Member login | Mobile | `/login` | `church/auth/login.ejs` | Aligned (Batch B) |
| `10-auth-member-registration-desktop.png` | Registration | Desktop | `/register` | `church/auth/register.ejs` | Aligned (Batch B) |
| `10-auth-member-registration-mobile.png` | Registration | Mobile | `/register` | `church/auth/register.ejs` | Aligned (Batch B) |
| `11-auth-registration-submitted-desktop.png` | Registration submitted | Desktop | `/registration-submitted` | `church/auth/registration_submitted.ejs` | Aligned (Batch B) |
| `11-auth-registration-submitted-mobile.png` | Registration submitted | Mobile | `/registration-submitted` | `church/auth/registration_submitted.ejs` | Aligned (Batch B) |
| `12-auth-waiting-verification-desktop.png` | Waiting verification | Desktop | `/waiting-verification` | `church/auth/waiting_verification.ejs` | Aligned (Batch B) |
| `12-auth-waiting-verification-mobile.png` | Waiting verification | Mobile | `/waiting-verification` | `church/auth/waiting_verification.ejs` | Aligned (Batch B) |
| `13-auth-forgot-password-desktop.png` | Forgot password | Desktop | `/forgot-password` | `church/auth/forgot_password.ejs` | Aligned (Batch B) |
| `13-auth-forgot-password-mobile.png` | Forgot password | Mobile | `/forgot-password` | `church/auth/forgot_password.ejs` | Aligned (Batch B) |
| *(no dedicated Stitch PNG)* | Branch admin login | — | `/branch/login` | `church/branch-admin/login.ejs` | Missing PNG — keep functional; not in Batch B scope |
| *(no dedicated Stitch PNG)* | BlessBoard apex admin login | — | `/admin/login` (apex) | admin login views | Out of Batch B PNG set — must remain working |

**Exact filenames confirmed** under `design-reference/stitch-screens/church-flow/02-authentication/` (prefix `09-auth-…` / `10-auth-…`, not shortened `09-member-…`).

**Batch:** B (Auth) — CSS **v38** (complete).

**Related routes (no Stitch PNG, keep working):** `/forgot-password-submitted`, `/register` → `register_closed.ejs` when `member_registration_enabled=false`.

---

## 3. Member Portal

Folder: `03-member-portal/`

| File | Module | Screen | Device | Expected route | Current view | Status |
|------|--------|--------|--------|----------------|--------------|--------|
| `14-member-dashboard-desktop.png` | Member | Dashboard | Desktop | `/member/dashboard` | `church/member/dashboard.ejs` | Partial |
| `14-member-dashboard-mobile.png` | Member | Dashboard | Mobile | `/member/dashboard` | `church/member/dashboard.ejs` | Partial |
| `15-member-profile-desktop.png` | Member | Profile | Desktop | `/member/profile` | `church/member/profile.ejs` | Partial |
| `15-member-profile-mobile.png` | Member | Profile | Mobile | `/member/profile` | `church/member/profile.ejs` | Partial |
| `16-member-announcements-desktop.png` | Member | Announcements | Desktop | `/member/announcements` | `church/member/announcements.ejs` | Partial |
| `16-member-announcements-mobile.png` | Member | Announcements | Mobile | `/member/announcements` | `church/member/announcements.ejs` | Partial |
| `17-member-events-calendar-desktop.png` | Member | Events | Desktop | `/member/events` | `church/member/events.ejs` | Partial |
| `17-member-events-calendar-mobile.png` | Member | Events | Mobile | `/member/events` | `church/member/events.ejs` | Partial |
| `18-member-my-ministries-desktop.png` | Member | My ministries | Desktop | `/member/my-ministries` | `church/member/my_ministries.ejs` | Partial |
| `18-member-my-ministries-mobile.png` | Member | My ministries | Mobile | `/member/my-ministries` | `church/member/my_ministries.ejs` | Partial |
| `19-member-resources-study-desktop.png` | Member | Resources | Desktop | `/member/resources` | `church/member/resources.ejs` | Partial |
| `19-member-resources-study-mobile.png` | Member | Resources | Mobile | `/member/resources` | `church/member/resources.ejs` | Partial |
| `20-member-forms-documents-mobile.png` | Member | Forms | Mobile | `/member/forms` | `church/member/forms.ejs` | Partial; Missing PNG pair (desktop) |
| *(no desktop PNG)* | Member | Forms | Desktop | `/member/forms` | `church/member/forms.ejs` | Partial; Missing PNG pair |

### Member routes without PNG in this set

| Route | Current view | Status |
|-------|--------------|--------|
| `/member/requests` | `church/member/requests.ejs` | Missing PNG / Partial |
| `/member/requests/new` | `church/member/request_new.ejs` | Missing PNG / Partial |
| `/member/prayer-request` | `church/member/prayer_request.ejs` | Missing PNG / Partial |
| `/member/giving` | `church/member/giving.ejs` | Missing PNG / Partial |
| `/member/ministries` | `church/member/ministries.ejs` | Missing PNG / Partial |

**Batch:** C (Member) — CSS v39.

---

## 4. Branch Admin

Folder: `04-branch-admin/` (screens 25–45). Also see misfiled `04-branch-admin-dashboard-*` under Public Website.

| File | Module | Screen | Device | Expected route | Current view | Status |
|------|--------|--------|--------|----------------|--------------|--------|
| `25-branch-admin-dashboard-desktop.png` | Branch admin | Dashboard | Desktop | `/branch/dashboard` | `church/branch-admin/dashboard.ejs` | Partial |
| `25-branch-admin-dashboard-mobile.png` | Branch admin | Dashboard | Mobile | `/branch/dashboard` | `church/branch-admin/dashboard.ejs` | Partial |
| `26-branch-member-verification-queue-desktop.png` | Branch admin | Member verification | Desktop | `/branch/member-verification` | `church/branch-admin/verification_queue.ejs` | Partial |
| `26-branch-member-verification-queue-mobile.png` | Branch admin | Member verification | Mobile | `/branch/member-verification` | `church/branch-admin/verification_queue.ejs` | Partial |
| `27-branch-member-profile-desktop.png` | Branch admin | Member profile | Desktop | `/branch/members/:id` | `church/branch-admin/member_profile.ejs` | Partial |
| `27-branch-member-profile-mobile.png` | Branch admin | Member profile | Mobile | `/branch/members/:id` | `church/branch-admin/member_profile.ejs` | Partial |
| `28-branch-member-directory-desktop.png` | Branch admin | Members directory | Desktop | `/branch/members` | `church/branch-admin/members_directory.ejs` | Partial |
| `28-branch-member-directory-mobile.png` | Branch admin | Members directory | Mobile | `/branch/members` | `church/branch-admin/members_directory.ejs` | Partial |
| `29-branch-ministries-directory-desktop.png` | Branch admin | Ministries | Desktop | `/branch/ministries` | `church/branch-admin/ministries_directory.ejs` | Partial |
| `29-branch-ministries-directory-mobile.png` | Branch admin | Ministries | Mobile | `/branch/ministries` | `church/branch-admin/ministries_directory.ejs` | Partial |
| `30-branch-ministry-profile-desktop.png` | Branch admin | Ministry profile | Desktop | `/branch/ministries/:id` | `church/branch-admin/ministry_profile.ejs` | Partial |
| `30-branch-ministry-profile-mobile.png` | Branch admin | Ministry profile | Mobile | `/branch/ministries/:id` | `church/branch-admin/ministry_profile.ejs` | Partial |
| `31-branch-departments-directory-desktop.png` | Branch admin | Departments | Desktop | `/branch/departments` | `church/branch-admin/departments_directory.ejs` | Partial |
| `31-branch-departments-directory-mobile.png` | Branch admin | Departments | Mobile | `/branch/departments` | `church/branch-admin/departments_directory.ejs` | Partial |
| `32-branch-events-management-desktop.png` | Branch admin | Events | Desktop | `/branch/events` | `church/branch-admin/events_management.ejs` | Partial |
| `32-branch-events-management-mobile.png` | Branch admin | Events | Mobile | `/branch/events` | `church/branch-admin/events_management.ejs` | Partial |
| `33-branch-duty-roster-desktop.png` | Branch admin | Duty roster | Desktop | `/branch/duty-roster` | `church/branch-admin/duty_roster.ejs` | Partial |
| `33-branch-duty-roster-mobile.png` | Branch admin | Duty roster | Mobile | `/branch/duty-roster` | `church/branch-admin/duty_roster.ejs` | Partial |
| `34-branch-website-editor-desktop.png` | Branch admin | Website editor | Desktop | `/branch/website-editor` | `church/branch-admin/website_editor.ejs` | Partial |
| `34-branch-website-editor-mobile.png` | Branch admin | Website editor | Mobile | `/branch/website-editor` | `church/branch-admin/website_editor.ejs` | Partial |
| `35-branch-announcements-management-desktop.png` | Branch admin | Announcements | Desktop | `/branch/announcements` | `church/branch-admin/announcements_management.ejs` | Partial |
| `35-branch-announcements-management-mobile.png` | Branch admin | Announcements | Mobile | `/branch/announcements` | `church/branch-admin/announcements_management.ejs` | Partial |
| `36-branch-attendance-tracker-desktop.png` | Branch admin | Attendance | Desktop | `/branch/attendance` | `church/branch-admin/attendance_tracker.ejs` | Partial |
| `36-branch-attendance-tracker-mobile.png` | Branch admin | Attendance | Mobile | `/branch/attendance` | `church/branch-admin/attendance_tracker.ejs` | Partial |
| `37-branch-attendance-record-detail-desktop.png` | Branch admin | Attendance detail | Desktop | `/branch/attendance/:id` | `church/branch-admin/attendance_record_detail.ejs` | Partial |
| `37-branch-attendance-record-detail-mobile.png` | Branch admin | Attendance detail | Mobile | `/branch/attendance/:id` | `church/branch-admin/attendance_record_detail.ejs` | Partial |
| `38-branch-giving-settings-desktop.png` | Branch admin | Giving settings | Desktop | `/branch/giving-settings` | `church/branch-admin/giving_settings.ejs` | Partial |
| `38-branch-giving-settings-mobile.png` | Branch admin | Giving settings | Mobile | `/branch/giving-settings` | `church/branch-admin/giving_settings.ejs` | Partial |
| `39-branch-giving-summary-desktop.png` | Branch admin | Giving summary | Desktop | `/branch/giving-summary` | `church/branch-admin/giving_summary.ejs` | Partial |
| `39-branch-giving-summary-mobile.png` | Branch admin | Giving summary | Mobile | `/branch/giving-summary` | `church/branch-admin/giving_summary.ejs` | Partial |
| `40-branch-reports-dashboard-desktop.png` | Branch admin | Reports | Desktop | `/branch/reports` | `church/branch-admin/reports_dashboard.ejs` | Partial |
| `40-branch-reports-dashboard-mobile.png` | Branch admin | Reports | Mobile | `/branch/reports` | `church/branch-admin/reports_dashboard.ejs` | Partial |
| `41-branch-submit-monthly-report-desktop.png` | Branch admin | Submit monthly report | Desktop | `/branch/reports/new` | `church/branch-admin/submit_monthly_report.ejs` | Partial |
| `41-branch-submit-monthly-report-mobile.png` | Branch admin | Submit monthly report | Mobile | `/branch/reports/new` | `church/branch-admin/submit_monthly_report.ejs` | Partial |
| `42-branch-report-history-desktop.png` | Branch admin | Report history | Desktop | `/branch/reports` (history) | `church/branch-admin/reports_dashboard.ejs` | Partial |
| `42-branch-report-history-mobile.png` | Branch admin | Report history | Mobile | `/branch/reports` (history) | `church/branch-admin/reports_dashboard.ejs` | Partial |
| `43-branch-report-details-desktop.png` | Branch admin | Report details | Desktop | `/branch/reports/:id` | `church/branch-admin/report_details.ejs` | Partial |
| `43-branch-report-details-mobile.png` | Branch admin | Report details | Mobile | `/branch/reports/:id` | `church/branch-admin/report_details.ejs` | Partial |
| `44-branch-request-workflow-queue-desktop.png` | Branch admin | Requests queue | Desktop | `/branch/requests` | `church/branch-admin/requests_queue.ejs` | Partial |
| `44-branch-request-workflow-queue-mobile.png` | Branch admin | Requests queue | Mobile | `/branch/requests` | `church/branch-admin/requests_queue.ejs` | Partial |
| `45-branch-request-details-desktop.png` | Branch admin | Request details | Desktop | `/branch/requests/:id` | `church/branch-admin/request_detail.ejs` | Partial |
| `45-branch-request-details-mobile.png` | Branch admin | Request details | Mobile | `/branch/requests/:id` | `church/branch-admin/request_detail.ejs` | Partial |

### Branch admin routes without dedicated Stitch PNG in this export

| Route | Current view | Status |
|-------|--------------|--------|
| `/branch/sermons` | `church/branch-admin/sermons_management.ejs` | Missing PNG |
| `/branch/resources` | `church/branch-admin/resources_management.ejs` | Missing PNG |
| `/branch/contact-submissions` | `church/branch-admin/contact_submissions.ejs` | Missing PNG |

**Batch:** D (Branch admin) — CSS v40.

---

## 5. Leader Portal

Folder: `05-leader/`

| File | Module | Screen | Device | Expected route | Current view | Status |
|------|--------|--------|--------|----------------|--------------|--------|
| `46-leader-dashboard-desktop.png` | Leader | Dashboard | Desktop | `/leader/dashboard` | `church/leader/dashboard.ejs` | Partial |
| `46-leader-dashboard-mobile.png` | Leader | Dashboard | Mobile | `/leader/dashboard` | `church/leader/dashboard.ejs` | Partial |
| `47-leader-ministry-roster-desktop.png` | Leader | Roster | Desktop | `/leader/roster` | `church/leader/roster.ejs` | Partial |
| `47-leader-ministry-roster-mobile.png` | Leader | Roster | Mobile | `/leader/roster` | `church/leader/roster.ejs` | Partial |
| `48-leader-record-attendance-desktop.png` | Leader | Attendance | Desktop | `/leader/attendance` | `church/leader/attendance.ejs` | Partial |
| `48-leader-record-attendance-mobile.png` | Leader | Attendance | Mobile | `/leader/attendance` | `church/leader/attendance.ejs` | Partial |
| `49-leader-submit-ministry-report-desktop.png` | Leader | Reports | Desktop | `/leader/activity-notes` | `church/leader/activity_notes.ejs` | Partial |
| `49-leader-submit-ministry-report-mobile.png` | Leader | Reports | Mobile | `/leader/activity-notes` | `church/leader/activity_notes.ejs` | Partial |
| `50-leader-ministry-requests-desktop.png` | Leader | Requests | Desktop | `/leader/*` (requests) | *(nearest: ministry join / activity flows)* | Partial |
| `50-leader-ministry-requests-mobile.png` | Leader | Requests | Mobile | `/leader/*` (requests) | *(nearest: ministry join / activity flows)* | Partial |

---

## 6. HQ

Folder: `06-hq/` — **mobile PNGs only** (58–61). Missing PNG pair for desktop.

| File | Module | Screen | Device | Expected route | Current view | Status |
|------|--------|--------|--------|----------------|--------------|--------|
| `58-hq-global-audit-trail-mobile.png` | HQ | Global audit trail | Mobile | `/hq/audit` | `church/hq/audit_trail.ejs` | Partial; Missing PNG pair (desktop) |
| `59-hq-permission-role-management-mobile.png` | HQ | Permission / role management | Mobile | `/hq/*` | *(HQ account / org controls)* | Partial; Missing PNG pair (desktop) |
| `60-hq-organization-templates-standards-mobile.png` | HQ | Organization templates / standards | Mobile | `/hq/*` | *(HQ templates / standards)* | Partial; Missing PNG pair (desktop) |
| `61-hq-broadcast-center-mobile.png` | HQ | Broadcast center | Mobile | `/hq/broadcasts` | `church/hq/broadcasts.ejs` | Partial; Missing PNG pair (desktop) |

Related HQ routes also include `/hq/dashboard`, `/hq/reports`, `/hq/branches`, `/hq/analytics` (implemented; not all have PNGs in this export).

**Batch:** E (Platform / HQ) — CSS v41.

---

## 7. Platform / BlessBoard Admin

Folder: `07-platform-admin/` — maps to **blessboard.com** apex admin (not branch hosts).

| File | Module | Screen | Device | Expected route | Current view | Status |
|------|--------|--------|--------|----------------|--------------|--------|
| `62-platform-admin-dashboard-desktop.png` | Platform | Admin dashboard | Desktop | `/admin/dashboard` | `admin/church/dashboard.ejs` (via rewrite) | Partial |
| `62-platform-admin-dashboard-mobile.png` | Platform | Admin dashboard | Mobile | `/admin/dashboard` | `admin/church/dashboard.ejs` | Partial |
| `63-platform-church-organizations-desktop.png` | Platform | Churches list | Desktop | `/admin/churches` | `admin/church/organizations.ejs` | Partial |
| `63-platform-church-organizations-mobile.png` | Platform | Churches list | Mobile | `/admin/churches` | `admin/church/organizations.ejs` | Partial |
| `64-platform-create-church-organization-desktop.png` | Platform | Create church | Desktop | `/admin/churches/new` | `admin/church/organization_form.ejs` | Partial |
| `64-platform-create-church-organization-mobile.png` | Platform | Create church | Mobile | `/admin/churches/new` | `admin/church/organization_form.ejs` | Partial |
| `65-platform-branch-tenants-desktop.png` | Platform | Branch tenants | Desktop | `/admin/churches/:id` / branches | `admin/church/branches.ejs` (+ org detail) | Partial |
| `65-platform-branch-tenants-mobile.png` | Platform | Branch tenants | Mobile | `/admin/churches/:id` / branches | `admin/church/branches.ejs` | Partial |
| `66-platform-plans-limits-desktop.png` | Platform | Plans / limits | Desktop | `/admin/churches/:id/plan` | `admin/church/organization_plan.ejs` | Partial |
| `66-platform-plans-limits-mobile.png` | Platform | Plans / limits | Mobile | `/admin/churches/:id/plan` | `admin/church/organization_plan.ejs` | Partial |
| `67-platform-settings-desktop.png` | Platform | Settings | Desktop | `/admin/*` settings | `admin/church/security.ejs` / related | Partial |
| `67-platform-settings-mobile.png` | Platform | Settings | Mobile | `/admin/*` settings | `admin/church/security.ejs` / related | Partial |
| `68-platform-support-monitoring-desktop.png` | Platform | Support / diagnostics | Desktop | `/admin/diagnostics` | `admin/church/diagnostics.ejs` | Partial |
| `68-platform-support-monitoring-mobile.png` | Platform | Support / diagnostics | Mobile | `/admin/diagnostics` | `admin/church/diagnostics.ejs` | Partial |

Canonical apex paths: see `src/church/blessboardAdminPaths.js` (`/admin/dashboard`, `/admin/churches`, `/admin/churches/new`, `/admin/diagnostics`).

**Batch:** E (Platform / HQ) — CSS v41.

---

## Route verification

Confirmed working routes from the codebase (representative set):

### Public (branch host)

| Route | View |
|-------|------|
| `/` | `church/public/home.ejs` |
| `/about` | `church/public/about.ejs` |
| `/leadership` | `church/public/leadership.ejs` |
| `/ministries` | `church/public/ministries.ejs` |
| `/events` | `church/public/events.ejs` |
| `/sermons` | `church/public/sermons.ejs` |
| `/giving` | `church/public/giving.ejs` |
| `/contact` | `church/public/contact.ejs` |

### Auth

| Route | View |
|-------|------|
| `/login` | `church/auth/login.ejs` |
| `/register` | `church/auth/register.ejs` |
| `/registration-submitted` | `church/auth/registration_submitted.ejs` |
| `/waiting-verification` | `church/auth/waiting_verification.ejs` |
| `/forgot-password` | `church/auth/forgot_password.ejs` |
| `/branch/login` | `church/branch-admin/login.ejs` |

### Member

| Route | View |
|-------|------|
| `/member/dashboard` | `church/member/dashboard.ejs` |
| `/member/profile` | `church/member/profile.ejs` |
| `/member/announcements` | `church/member/announcements.ejs` |
| `/member/events` | `church/member/events.ejs` |
| `/member/my-ministries` | `church/member/my_ministries.ejs` |
| `/member/resources` | `church/member/resources.ejs` |
| `/member/forms` | `church/member/forms.ejs` |
| `/member/requests`, `/member/requests/new`, `/member/prayer-request`, `/member/giving`, `/member/ministries` | corresponding `church/member/*.ejs` |

### Branch admin

| Route | View |
|-------|------|
| `/branch/dashboard` | `church/branch-admin/dashboard.ejs` |
| `/branch/member-verification` | `church/branch-admin/verification_queue.ejs` |
| `/branch/members`, `/branch/members/:id` | directory / profile |
| `/branch/ministries`, ministry profile | directory / profile |
| `/branch/departments` | `departments_directory.ejs` |
| `/branch/events` | `events_management.ejs` |
| `/branch/duty-roster` | `duty_roster.ejs` |
| `/branch/website-editor` | `website_editor.ejs` |
| `/branch/announcements` | `announcements_management.ejs` |
| `/branch/attendance` | `attendance_tracker.ejs` |
| `/branch/giving-settings`, `/branch/giving-summary` | giving views |
| `/branch/reports`, `/branch/reports/new`, report details | reports views |
| `/branch/requests` | `requests_queue.ejs` |

### Apex admin (blessboard.com)

| Route | Notes |
|-------|--------|
| `/admin/dashboard` | Churches dashboard (rewrites to internal `/admin/church`) |
| `/admin/churches` | Organizations list |
| `/admin/churches/new` | Create church organization |
| `/admin/diagnostics` | Support / monitoring |

### Host checks

| Host / URL | Expected |
|------------|----------|
| `blessboard.com` (apex) | BlessBoard platform landing + apex admin |
| `demo.blessboard.com` (branch) | Demo church public site + branch/member portals |
| `getproapp.org` | Unchanged GetPro platform (not BlessBoard church UI) |
| `unknownslug.blessboard.com` | Friendly church not-found |
| `demo.blessboard.com/admin/churches/new` | 404 (apex-only) |
| `blessboard.com/admin/churches/new` | Works after admin login |

---

## Batch status

| Batch | Scope | CSS | Status |
|-------|--------|-----|--------|
| A | Giving + public remaining | v37 | Complete |
| B | Auth | v38 | Pending |
| C | Member | v39 | Pending |
| D | Branch admin | v40 | Pending |
| E | Platform/HQ | v41 | Pending |
| B | Auth | v38 | Pending |
| C | Member | v39 | Pending |
| D | Branch admin | v40 | Pending |
| E | Platform / HQ | v41 | Pending |

---

## Count summary

| Group | Unique PNGs |
|-------|-------------|
| 01 Public website (incl. 2 misfiled branch dashboards) | 17 |
| 02 Authentication | 10 |
| 03 Member portal | 13 |
| 04 Branch admin | 42 |
| 05 Leader | 10 |
| 06 HQ (mobile only) | 4 |
| 07 Platform admin | 14 |
| **Total (excl. `* 2` / `* 3` duplicates)** | **110** |

See also: [`docs/blessboard-stitch-asset-map.md`](blessboard-stitch-asset-map.md), [`docs/blessboard-screen-implementation-status.md`](blessboard-screen-implementation-status.md).
