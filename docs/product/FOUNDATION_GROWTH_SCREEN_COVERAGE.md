# Foundation & Growth — screen coverage audit

**Date:** 2026-07-19  
**Branch:** `V5` @ `e778961`  
**Mode:** Documentation only — no application code changed  
**Scope:** Approved **Foundation** and **Growth** packages only (Network features = `NOT_IN_SCOPE`)  
**Sources:** [`STITCH_SCREEN_MAP.md`](../gui/STITCH_SCREEN_MAP.md) · [`STITCH_IMPLEMENTATION_BACKLOG.md`](../gui/STITCH_IMPLEMENTATION_BACKLOG.md) · [`VISUAL_SYSTEM.md`](../gui/VISUAL_SYSTEM.md) · [`BLESSBOARD_PRICING_DECISION.md`](./BLESSBOARD_PRICING_DECISION.md) · parity / regression audits · `v5FoundationServer` routers · `003_blessboard_plans.sql` · `blessBoardPackageCatalogue.js`

**Rules applied:** No decorative Stitch invention; no Network-as-Growth; no billing/payments; deferred schema ≠ implemented; V4 `public.church_*` ignored.

---

## Status legend

| Status | Meaning |
|--------|---------|
| **COMPLETE** | Route, template, backend, authz, nav, and focused tests present; approved capability works (minor Stitch polish may remain) |
| **PARTIAL** | Present and usable; material Stitch chrome, field, or soft-entitlement gaps |
| **PLACEHOLDER** | Route/shell exists; composition or data surface is stubby vs Stitch/product |
| **MISSING_GUI** | Backend/schema may exist; no adequate V5 UI |
| **MISSING_BACKEND** | Stitch and/or product intent exist; V5 schema/service/route incomplete |
| **MISSING_STITCH** | V5 product surface exists; no dedicated D+M Stitch pair |
| **DEFERRED** | Catalogue/marketing aspirational; not V5 product until backend decision |
| **NOT_IN_SCOPE** | Outside Foundation/Growth (Network, leader portal, payments, obsolete Stitch) |

### Column shorthand

| Col | Values |
|-----|--------|
| Backend | `OK` · `SOFT` (entitlement soft / partial fields) · `NONE` · `N/A` |
| Authorization | `OK` · `N/A` · `NONE` |
| Entitlement | Plan feature / capacity note |
| Tests | Primary `npm run test:blessboard:*` script or `—` |

---

## Package entitlement SoT (V5 runtime)

| Feature key / capacity | Foundation (`free`) | Growth (`growth`) | Notes |
|------------------------|---------------------|-------------------|-------|
| `max_branches` | **1** | unlimited | `assertCanCreateBranch` exists; **not wired** into provision CLIs |
| `max_users` | 250 | unlimited | Soft capacity |
| `max_staff_accounts` | 10 | unlimited | Soft capacity |
| `basic_reports` | true | true | HQ aggregate reports |
| `advanced_reports` | false | true | Gated in `hqReportsService` |
| `custom_domain` / `custom_email` | false | false | **Network-only** |
| Catalogue aspirational (surveys, appointments, volunteer scheduling, offline attendance, scheduled broadcasts/reports) | Declared in `blessBoardPackageCatalogue` | Same | **No V5 blessboard schema/routes** → treat as **DEFERRED**, not Growth GUI |

---

## Master coverage table

| Order | Package | Module | Screen | Desktop Stitch ID | Mobile Stitch ID | Route | Template | Backend | Authorization | Entitlement | Tests | Status | Blocker |
|------:|---------|--------|--------|-------------------|------------------|-------|----------|---------|---------------|-------------|-------|--------|---------|
| 1 | Both | Design | Visual tokens / shared states | `c8d8352b…` / `b61a1ea8…` | — | — | `design-tokens.css`, state partials | N/A | N/A | all | `design-system`, `a11y-structure` | COMPLETE | Visual MATCHED not claimed |
| 2 | Platform* | Apex | Home | `46081ff8…` | `9f9927a6…` | `/` (apex) | `apex` via render home | OK | anon | n/a | `apex-home`, `apex-marketing` | PARTIAL | Stitch chrome residual |
| 3 | Platform* | Apex | Features | `7ef3518f…` | `5ac1e1b0…` | `/features` | apex marketing | OK | anon | n/a | `apex-marketing` | PARTIAL | FG-01 polished; visual MATCHED not claimed |
| 4 | Platform* | Apex | For Churches | `fc4bf5aa…` | `55af3450…` | `/for-churches` | apex marketing | OK | anon | n/a | `apex-marketing` | PARTIAL | Same |
| 5 | Platform* | Apex | Register Your Church | `8640e853…` | `515da582…` | `/register-church` | apex marketing | OK (enquiry UI) | anon | n/a | `apex-marketing` | PARTIAL | No self-serve provision POST |
| 6 | Platform* | Apex | Directory | `2b9df962…` | `ab5d47e2…` | `/directory` | apex marketing | OK | anon | n/a | `apex-marketing` | PARTIAL | Catalogue-backed list |
| 7 | Platform* | Apex | Pricing (+ FAQ) | `1c50e898…` / `c47840e7…` | `181ec1f8…` / `65067eb3…` | `/pricing` | apex marketing | OK | anon | SoT pricing | `apex-marketing` | PARTIAL | No checkout (intentional) |
| 8 | Foundation | Auth | Apex login | `9b264ef3…` | `68a84bcc…` | `/login` | `apex/login.ejs` | OK | anon | n/a | `apex-auth-gui`, `auth` | COMPLETE | No forgot-password (intentional) |
| 9 | Foundation | Auth | Auth error | — | — | auth error | `apex/auth-error.ejs` | OK | anon | n/a | `apex-auth-gui` | MISSING_STITCH | — |
| 10 | Foundation | Auth | Account | — | — | `/account` | `apex/account.ejs` | OK | session | n/a | `apex-auth-gui` | MISSING_STITCH | — |
| 11 | Foundation | Public | Tenant home | `ead45db5…` | `89177588…` | `/` (tenant) | `public/home.ejs` | OK | public | all | `public-pages` | PARTIAL | Needs published CMS for demo |
| 12 | Foundation | Public | About | `44492f6a…` | `3f0b8a5c…` | `/about` | `public/about.ejs` | OK | public | all | `public-pages` | PARTIAL | Same |
| 13 | Foundation | Public | Leadership | `372faa60…` | `0f4e816f…` | `/leadership` | `public/leadership.ejs` | OK | public | all | `public-pages` | PARTIAL | — |
| 14 | Foundation | Public | Ministries | `f146cdcc…` | `d2fd7ecc…` | `/ministries` | `public/ministries.ejs` | OK | public | all | `public-pages` | PARTIAL | — |
| 15 | Foundation | Public | Events list | `6f618576…` | `f58c416c…` | `/events` | `public/events.ejs` | OK | public | all | `public-pages` | PARTIAL | Calendar Stitch obsolete |
| 16 | Foundation | Public | Sermons | `4f4995dc…` | `96b380d4…` | `/sermons` | `public/sermons.ejs` | OK | public | all | `public-pages` | PARTIAL | No series schema |
| 17 | Foundation | Public | Giving (info) | `59c8fded…` | `a0616f23…` | `/giving` | `public/giving.ejs` | OK | public | all | `public-pages` | PARTIAL | No payments |
| 18 | Foundation | Public | Contact | `ab93d842…` | `9cbad6aa…` | `/contact` | `public/contact.ejs` | OK | public | all | `public-pages` | PARTIAL | No contact POST form |
| 19 | Foundation | Auth | Member registration | `c360aef6…` | `7d771905…` | `/register` | `public/register.ejs` | OK | public | all | `member-registration` | COMPLETE | Field set ≠ Stitch wizard |
| 20 | Foundation | Auth | Registration submitted | `1d377043…` | `f222e551…` | `/register/submitted` | `public/register-submitted.ejs` | OK | public | all | `member-registration` | COMPLETE | — |
| 21 | Foundation | Auth | Waiting / verification (member) | `239beae5…` | `8e6e504f…` | — | — | NONE | — | — | — | MISSING_BACKEND | No pending-member session route |
| 22 | Foundation | Auth | Forgot password | `61a6861b…` | `f4bb9457…` | — | — | NONE | — | — | — | DEFERRED | Product undecided |
| 23 | Foundation | Member | Dashboard | `4207a5a6…` | `b315a9d1…` | `/member` | `member/dashboard.ejs` | OK | member | all | `member-portal` | PARTIAL | Prayer CTA disabled |
| 24 | Foundation | Member | Profile | `a323f678…` | `55e21b65…` | `/member/profile` | `member/profile.ejs` | OK | member | all | `member-portal` | PARTIAL | No DOB/QR/avatar |
| 25 | Foundation | Member | Announcements | `63a9e613…` | `d7074e7c…` | `/member/announcements` | announcements member-* | OK | member | all | `announcements` | PARTIAL | Detail Stitch weak |
| 26 | Foundation | Member | Events | `9a526853…` | `a4dc4a49…` | `/member/events` | participation member-* | OK | member | all | `participation` | PARTIAL | List not calendar |
| 27 | Foundation | Member | Ministries | `05f9bdca…` | `53924d7e…` | `/member/ministries` | participation member-* | OK | member | all | `participation` | PARTIAL | — |
| 28 | Foundation | Member | Resources | `d1690ab7…` | `d3232a4f…` | `/member/resources` | forms-requests member-* | OK | member | all | `forms-requests` | PARTIAL | — |
| 29 | Foundation | Member | Forms | `745a1972…` | `0f801e19…` | `/member/forms` | forms-requests member-* | OK | member | all | `forms-requests` | PARTIAL | — |
| 30 | Foundation | Member | Requests (submit/status) | `2cfd58a5…` / `530cb58f…` | mobiles | `/member/requests*` | forms-requests member-* | OK | member | all | `forms-requests` | PARTIAL | Categories include prayer |
| 31 | Foundation | Member | Prayer request (dedicated) | `57edf489…` | `1dd180a3…` | `/member/prayer-request` | — | NONE | — | — | — | MISSING_BACKEND | Use requests `category=prayer` or product decision |
| 32 | Foundation | Member | Giving (info) | `3e723670…` | `236d4bf2…` | `/member/giving` | `member/giving.ejs` | OK | member | all | `member-portal` | PARTIAL | Instructional only |
| 33 | Foundation | Branch | Dashboard | `001d1a02…` | `615f1f4e…` | `/branch-admin` | `branch-admin/dashboard.ejs` | OK | BA | all | `branch-admin-shell` | PARTIAL | Unavailable KPI cards |
| 34 | Foundation | Branch | Verification queue | `87fe9bb7…` | `d352ed07…` | `/branch-admin/registrations` | registrations + detail | OK | BA | all | `member-registration` | COMPLETE | Detail Stitch adapted |
| 35 | Foundation | Branch | Members list | `3dae337c…` | `e90963b0…` | `/branch-admin/members` | `members.ejs` | OK | BA | all | authz suites | PARTIAL | No export/add |
| 36 | Foundation | Branch | Member profile | `5e5985a0…` | `b3fbd9e2…` | `/branch-admin/members/:id` | `member-detail.ejs` | OK | BA | all | — | PARTIAL | Read-only; no notes/giving tabs |
| 37 | Foundation | Branch | Ministries admin | `58c96b4c…` | `526c1404…` | `/branch-admin/content/ministries` | `content-admin/entities.ejs` | OK | BA | all | `content-admin` | PARTIAL | — |
| 38 | Foundation | Branch | Ministry profile | `064769bb…` | `17509b0d…` | content entity | `entity-fields.ejs` | OK | BA | all | `content-admin` | PLACEHOLDER | Stitch profile chrome thin |
| 39 | Foundation | Branch | Events admin | `ad136a0e…` | `112d23ce…` | `/branch-admin/content/events` | entities | OK | BA | all | `content-admin` | PARTIAL | — |
| 40 | Foundation | Branch | Sermons admin | — | — | `/branch-admin/content/sermons` | entities | OK | BA | all | `content-admin` | MISSING_STITCH | Adapted from public sermons |
| 41 | Foundation | Branch | Website editor | `3f316066…` | `f2bb5e79…` | `/branch-admin/content` | content-admin * | OK | BA | all | `content-admin` | PARTIAL | — |
| 42 | Foundation | Branch | Announcements | `65941542…` | `daa41602…` | `/branch-admin/announcements` | announcements admin-* | OK | BA | all | `announcements` | PARTIAL | No scheduling |
| 43 | Foundation | Branch | Attendance | `d351ae0e…` / `12e5e7d8…` | mobiles | `/branch-admin/attendance*` | attendance admin-* | OK | BA | all | `attendance` | PARTIAL | Aggregates only |
| 44 | Foundation | Branch | Giving summaries | `cf849cdb…` | `20f32c9e…` | `/branch-admin/giving*` | giving admin-* | OK | BA | all | `giving` | PARTIAL | Manual aggregates; no banking UI |
| 45 | Foundation | Branch | Forms admin | — | — | `/branch-admin/forms*` | forms-requests admin-* | OK | BA | all | `forms-requests` | MISSING_STITCH | — |
| 46 | Foundation | Branch | Resources admin | (member 19 pair reused) | | `/branch-admin/resources*` | admin-resources | OK | BA | all | `forms-requests` | PARTIAL | — |
| 47 | Foundation | Branch | Requests queue/detail | `126bfebf…` / `22fe4b70…` | mobiles | `/branch-admin/requests*` | admin-requests* | OK | BA | all | `forms-requests` | PARTIAL | — |
| 48 | Foundation | Branch | Account / settings | — | — | `/branch-admin/account`, `/settings` | branch-admin * | OK | BA | all | `settings` | MISSING_STITCH | — |
| 49 | Foundation | Branch | Basic reports (BA) | `d7bdddc0…` + monthly set | mobiles | — | — | NONE | — | `basic_reports` | — | MISSING_BACKEND | Nav disabled; V4 monthly not ported |
| 50 | Foundation | HQ | Dashboard | `538c8f4f…` | `c67eda76…` | `/hq` | `hq/dashboard.ejs` | OK | HQ | all | `hq-shell` | PARTIAL | Soft KPIs |
| 51 | Foundation | HQ | Branch registry | `1a1aaecd…` | `2f154dfc…` | `/hq/branches` | `hq/branches.ejs` | OK | HQ | max 1 branch Fnd | `branch-list` | PARTIAL | Create branch not in UI |
| 52 | Growth | HQ | Multi-branch admin | (same shells) | | `/hq/*` + `/b/:branchKey` | HQ mounts | OK | HQ | unlimited branches | `hq-shell`, content | PARTIAL | Capacity enforcement soft on provision |
| 53 | Growth | HQ | Members oversight | (Stitch 28) | | `/hq/members*` | `hq/members*` | OK | HQ | Growth+ | — | PARTIAL | Cross-branch |
| 54 | Growth | HQ | Registrations oversight | `87fe9bb7…` | `d352ed07…` | `/hq/registrations*` | `hq/registrations*` | OK | HQ | Growth+ | — | PARTIAL | Read-only approve path |
| 55 | Growth | HQ | Content oversight | `3f316066…` | `f2bb5e79…` | `/hq/content*` | content-admin HQ | OK | HQ | Growth+ | `content-admin` | PARTIAL | Centralized branch content |
| 56 | Growth | HQ | Forms/resources/requests oversight | reused pairs | | `/hq/forms*`, `/resources*`, `/requests*` | forms-requests HQ | OK | HQ | Growth+ | `forms-requests` | PARTIAL | — |
| 57 | Growth | HQ | Announcements / broadcast | `ffa76443…` | `b4184b73…` | `/hq/announcements*` | announcements HQ | OK | HQ | Growth+ | `announcements` | PARTIAL | **No schedule/SMS** |
| 58 | Foundation | HQ | Basic reports hub | — | — | `/hq/reports` | `hq/reports.ejs` | OK | HQ | `basic_reports` | `reports-audit` | PARTIAL | Link hub |
| 59 | Growth | HQ | Advanced attendance report | `2a577dc1…` (approx) | `06489c79…` | `/hq/reports/attendance` | `hq/attendance-report.ejs` | SOFT | HQ | `advanced_reports` | `reports-audit` | PARTIAL | Entitlement gated |
| 60 | Growth | HQ | Advanced giving report | same family | | `/hq/reports/giving` | `hq/giving-report.ejs` | SOFT | HQ | `advanced_reports` | `reports-audit` | PARTIAL | No donor PII |
| 61 | Growth | HQ | Audit trail | `bce1e8ec…` | `d7fcb1b3…` | `/hq/audit` | `hq/audit.ejs` | OK | HQ | all | `reports-audit` | PARTIAL | — |
| 62 | Growth | HQ | Branch performance Stitch | `f6b63697…` | `922867ae…` | `/hq/reports` | reports hub | SOFT | HQ | advanced | — | PLACEHOLDER | Not full Stitch performance UI |
| 63 | Both | Media | Picker / upload / detail | Shared UI States | — | `/…/content/media*` | media-upload, picker | OK | BA/HQ | all | `media` | MISSING_STITCH | Soft-archive only |
| 64 | Platform* | PA | Dashboard → deployments | see map 74–80a | | `/admin*` | platform-admin * | OK | PA | platform | `platform-admin-shell` | PARTIAL | Outside church package; ops |
| 65 | — | Leader | Leader portal (all) | `558f95cb…` family | mobiles | — | — | NONE | — | — | — | NOT_IN_SCOPE | No V5 leader role |
| 66 | — | Branch | Departments | `7ee4d401…` | `3794bd0c…` | — | — | NONE | — | — | — | MISSING_BACKEND | No schema |
| 67 | — | Branch | Duty roster | `37bdc9ea…` | `51d3e5bf…` | — | — | NONE | — | — | — | MISSING_BACKEND | No schema |
| 68 | — | Branch/HQ | Monthly report workflow | `45a88626…` family / HQ `44040073…` | mobiles | — | — | NONE | — | — | — | MISSING_BACKEND | V4 not ported |
| 69 | Growth† | Comms | Scheduled communications | broadcast Stitch | | — | — | NONE | — | catalogue `broadcasts.scheduled` | — | DEFERRED | No V5 scheduler |
| 70 | Growth† | Reports | Scheduled reports | — | — | — | — | NONE | — | catalogue `reports.scheduled` | — | DEFERRED | V4-only elsewhere |
| 71 | Growth† | Ops | Offline attendance | — | — | — | — | NONE | — | catalogue | — | DEFERRED | No V5 queue |
| 72 | Growth† | Ops | Surveys | — | — | — | — | NONE | — | catalogue | — | DEFERRED | No schema |
| 73 | Growth† | Ops | Appointments | — | — | — | — | NONE | — | catalogue | — | DEFERRED | No schema |
| 74 | Growth† | Ops | Volunteer scheduling | — | — | — | — | NONE | — | catalogue | — | DEFERRED | No schema |
| 75 | Growth† | Care | Pastoral workflows (beyond requests) | — | — | — | — | NONE | — | catalogue care.advanced | — | DEFERRED | Requests categories only |
| 76 | Network | Domains/email/API | Custom domain, mailboxes, API | PA settings family | | assisted / PA | — | soft | PA | Network features | — | NOT_IN_SCOPE | Not Growth |
| 77 | — | Giving | Banking / QR settings | `858c66cf…` | `0769a7e1…` | — | — | — | — | — | — | NOT_IN_SCOPE | Intentionally omitted |
| 78 | — | HQ | Roles / templates Stitch | `12f5be53…` / `df111bee…` | mobiles | — | — | NONE | — | — | — | MISSING_BACKEND | No HQ role UI |
| 79 | Platform* | PA | Create organization UI | `d992150d…` | `0da4f454…` | `/admin/organizations/new` | — | CLI only | PA | — | provisioning | MISSING_GUI | CLI exists |

\* Platform / apex / PA support church packages but are not branch-billed Foundation features.  
† Listed on Growth **catalogue** aspirationally; **not** V5-implemented — do not sell as live Growth GUI.

---

## Historical candidates (verified)

| Candidate | Verdict | Evidence |
|-----------|---------|----------|
| Registration waiting/verification | **MISSING_BACKEND** | Stitch pair; no V5 route/session |
| Member prayer request (dedicated) | **MISSING_BACKEND** | Nav disabled; use `/member/requests` + `prayer` |
| Leader portal | **NOT_IN_SCOPE** | No leader role in V5 |
| Departments | **MISSING_BACKEND** | No schema |
| Duty roster | **MISSING_BACKEND** | No schema |
| Monthly reports | **MISSING_BACKEND** | No V5 tables/routes |
| Pastoral-care workflows | **DEFERRED** / PARTIAL via requests | Categories only |
| Scheduled reports | **DEFERRED** | Catalogue only; no blessboard scheduler |
| Scheduled communications | **DEFERRED** | Announcements publish-now only |
| Advanced cross-branch reports | **PARTIAL** | HQ attendance/giving + `advanced_reports` |
| Offline attendance | **DEFERRED** | Catalogue only |
| Surveys | **DEFERRED** | No schema |
| Appointments | **DEFERRED** | No schema |
| Volunteer scheduling | **DEFERRED** | No schema |

---

## Summary counts (Foundation + Growth product rows)

| Status | Approx. count (orders 1–64 church/platform product) |
|--------|------------------------------------------------------|
| COMPLETE | ~5 (tokens, login, register, submitted, verification queue) |
| PARTIAL | Majority of implemented portals |
| PLACEHOLDER | Ministry profile; HQ performance Stitch |
| MISSING_STITCH | Auth error, account, BA forms, sermons admin, media, BA settings |
| MISSING_BACKEND / DEFERRED | Waiting verification, prayer dedicated, BA monthly reports, Growth aspirational modules |
| NOT_IN_SCOPE | Leader, Network, banking settings, payments |

---

## Gaps by class

### GUI-ready (Stitch + route/backend mostly exist — polish batches)

- Apex Features / For Churches / Pricing / Directory / Register-church chrome  
- Branch ministry profile PLACEHOLDER → PARTIAL  
- Announcement admin preview polish  
- HQ reports / performance visual alignment (no new generators)  
- Member dashboard prayer CTA decision (link to requests vs hide)

### Backend-blocked

- Waiting verification session  
- Dedicated prayer route (unless product accepts requests)  
- Departments, duty roster, monthly reports  
- Scheduled comms/reports, offline attendance, surveys, appointments, volunteer scheduling  
- Wire `max_branches` into provision (entitlement already coded)

### Entitlement / capacity gaps

- Foundation branch cap not enforced on create path  
- Growth advanced reports soft-gated (OK) but aspirational catalogue features over-promise vs V5

---

## Companion

Implementation batches: [`docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_BATCHES.md`](../gui/FOUNDATION_GROWTH_IMPLEMENTATION_BATCHES.md)
