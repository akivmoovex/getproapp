# Foundation & Growth — screen coverage audit

**Date:** 2026-07-19 (FG-Q12 Growth giving gate)
**Branch:** `V5` @ `de660d3` (+ working-tree FG-Q12 gate)
**Mode:** Coverage updated after soft `advanced_reports` gate on HQ giving detail
**Scope:** Approved **Foundation** and **Growth** packages only (Network features = `NOT_IN_SCOPE`; Network inherits Growth `advanced_reports`)
**Sources:** [`STITCH_SCREEN_MAP.md`](../gui/STITCH_SCREEN_MAP.md) · [`FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md`](../gui/FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md) · [`FOUNDATION_GROWTH_QUEUE_COMPLETION_AUDIT.md`](../gui/FOUNDATION_GROWTH_QUEUE_COMPLETION_AUDIT.md) · [`FOUNDATION_GROWTH_BLOCKED_SCREENS.md`](../gui/FOUNDATION_GROWTH_BLOCKED_SCREENS.md) · portal parity audits · `BATCH_FG01_APEX_FEATURES.md` · `BATCH_FG08A_HQ_REPORTS.md` · V5 routes/templates/tests · `003_blessboard_plans.sql`

**Rules applied:** No decorative Stitch invention; no Network-as-Growth; no billing/payments; deferred schema ≠ implemented; V4 `public.church_*` ignored. CLOSE PARITY (portal audits) or completed FG polish → **COMPLETE** when approved capability works (MATCHED not claimed). Formerly actionable queue items are only **COMPLETE** or **BLOCKED BY VERIFIED DEPENDENCY**.

**Companions:** [`FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md`](../gui/FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md) · [`FOUNDATION_GROWTH_BLOCKED_SCREENS.md`](../gui/FOUNDATION_GROWTH_BLOCKED_SCREENS.md) · [`FOUNDATION_GROWTH_QUEUE_COMPLETION_AUDIT.md`](../gui/FOUNDATION_GROWTH_QUEUE_COMPLETION_AUDIT.md)

---

## Status legend

| Status | Meaning |
|--------|---------|
| **COMPLETE** | Route, template, backend, authz, nav, and focused tests present; approved capability works (minor Stitch polish may remain; MATCHED not claimed) |
| **BLOCKED BY VERIFIED DEPENDENCY** | Formerly actionable GUI item that cannot close without a verified product/backend/entitlement dependency (see note column) |
| **PARTIAL** | Present and usable; material gaps remain (none remain in the FG executable queue after this audit) |
| **PLACEHOLDER** | Route/shell exists; composition stubby vs Stitch/product (none remain in the FG executable queue) |
| **MISSING_GUI** | Backend/schema may exist; no adequate V5 UI (superseded for create-org by BLOCKED) |
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
| Nav | `OK` · `soft` · `—` |
| Tests | Primary `npm run test:blessboard:*` script or `—` |
| GUI | Parity shorthand: `close` · `minor` · `n/a` |

---

## Package entitlement SoT (V5 runtime)

| Feature key / capacity | Foundation (`free`) | Growth (`growth`) | Notes |
|------------------------|---------------------|-------------------|-------|
| `max_branches` | **1** | unlimited | Enforced on create, activate, HQ provision insert, and Foundation downgrade (HQ counted) |
| `max_users` | 250 | unlimited | Soft capacity |
| `max_staff_accounts` | 10 | unlimited | Soft capacity |
| `basic_reports` | true | true | HQ aggregate reports hub |
| `advanced_reports` | false | true | Soft-gates HQ attendance **and** giving detail (`/hq/reports/attendance`, `/hq/reports/giving`); Network (`professional`) inherits true |
| `custom_domain` / `custom_email` | false | false | **Network-only** |
| Catalogue aspirational (surveys, appointments, volunteer scheduling, offline attendance, scheduled broadcasts/reports) | Declared in `blessBoardPackageCatalogue` | Same | **No V5 blessboard schema/routes** → **DEFERRED**, not Growth GUI |

---

## Completed GUI batches / queue disposition

| Batch | Surface | Disposition |
|-------|---------|-------------|
| FG-01 | Apex Features | **COMPLETE** |
| FG-08a | HQ reports hub + attendance | Hub + attendance **COMPLETE** |
| FG-Q01–Q05 | Apex Home / Pricing / Directory / Register / For Churches | **COMPLETE** (capability + D+M CSS + tests; MATCHED not claimed; FG-Q\* batch docs never produced) |
| FG-Q08–Q11 | Ministry profile / announcement preview / website editor / HQ content | **COMPLETE** (CLOSE/MINOR portal parity; intentional CMS limits) |
| FG-Q13 | Branch performance on reports hub | **COMPLETE** as hub + honest unavailable (no separate performance route) |
| FG-Q14–Q15 | Responsive/a11y + final parity docs | **COMPLETE** via this completion audit |
| FG-Q06 | Create organization UI | **BLOCKED BY VERIFIED DEPENDENCY** — product unlock; CLI-only today |
| FG-Q07 | Member prayer CTA decision | **BLOCKED BY VERIFIED DEPENDENCY** — product link-or-hide; dedicated route remains MISSING_BACKEND |
| FG-Q12 | HQ giving report Growth gate | **COMPLETE** — `advanced_reports` soft gate applied (mirror FG-08a); see `GROWTH_PLAN_PARITY_AUDIT.md` |

---

## Master coverage table

| Order | Package | Module | Screen | Desktop Stitch ID | Mobile Stitch ID | Route | Template | Backend | Authz | Entitlement | Nav | Tests | GUI | Status | Blocker / note |
|------:|---------|--------|--------|-------------------|------------------|-------|----------|---------|-------|-------------|-----|-------|-----|--------|----------------|
| 1 | Both | Design | Visual tokens / shared states | `c8d8352b…` / `b61a1ea8…` | — | — | `design-tokens.css`, state partials | N/A | N/A | all | — | `a11y-structure` | close | COMPLETE | MATCHED not claimed |
| 2 | Platform* | Apex | Home | `46081ff8…` | `9f9927a6…` | `/` (apex) | `apex/home.ejs` | OK | anon | n/a | OK | `apex-home` | close | COMPLETE | Residual Stitch nav/hero polish may remain |
| 3 | Platform* | Apex | Features | `7ef3518f…` | `5ac1e1b0…` | `/features` | `apex/features.ejs` | OK | anon | n/a | OK | `apex-marketing` | close | COMPLETE | FG-01 done |
| 4 | Platform* | Apex | For Churches | `fc4bf5aa…` | `55af3450…` | `/for-churches` | `apex/for-churches.ejs` | OK | anon | n/a | OK | `apex-marketing` | close | COMPLETE | Pricing SoT copy; MATCHED not claimed |
| 5 | Platform* | Apex | Register Your Church | `8640e853…` | `515da582…` | `/register-church` | `apex/register-church.ejs` | OK (enquiry) | anon | n/a | OK | `apex-marketing` | close | COMPLETE | Enquiry only — no self-serve provision (intentional) |
| 6 | Platform* | Apex | Directory | `2b9df962…` | `ab5d47e2…` | `/directory` | `apex/directory.ejs` | OK | anon | n/a | OK | `apex-marketing` | close | COMPLETE | Live catalogue; no fake listings |
| 7 | Platform* | Apex | Pricing (+ FAQ) | `1c50e898…` / `c47840e7…` | `181ec1f8…` / `65067eb3…` | `/pricing` | `apex/pricing.ejs` | OK | anon | SoT pricing | OK | `apex-marketing` | close | COMPLETE | No checkout (intentional) |
| 8 | Foundation | Auth | Apex login | `9b264ef3…` | `68a84bcc…` | `/login` | `apex/login.ejs` | OK | anon | n/a | OK | `apex-auth-gui`, `auth` | close | COMPLETE | No forgot-password (intentional) |
| 9 | Foundation | Auth | Auth error | — | — | auth error | `apex/auth-error.ejs` | OK | anon | n/a | — | `apex-auth-gui` | n/a | MISSING_STITCH | — |
| 10 | Foundation | Auth | Account | — | — | `/account` | `apex/account.ejs` | OK | session | n/a | OK | `apex-auth-gui` | n/a | MISSING_STITCH | — |
| 11 | Foundation | Public | Tenant home | `ead45db5…` | `89177588…` | `/` (tenant) | `public/home.ejs` | OK | public | all | OK | `public-pages` | close | COMPLETE | Needs published CMS for demo |
| 12 | Foundation | Public | About | `44492f6a…` | `3f0b8a5c…` | `/about` | `public/about.ejs` | OK | public | all | OK | `public-pages` | close | COMPLETE | — |
| 13 | Foundation | Public | Leadership | `372faa60…` | `0f4e816f…` | `/leadership` | `public/leadership.ejs` | OK | public | all | OK | `public-pages` | close | COMPLETE | — |
| 14 | Foundation | Public | Ministries | `f146cdcc…` | `d2fd7ecc…` | `/ministries` | `public/ministries.ejs` | OK | public | all | OK | `public-pages` | close | COMPLETE | — |
| 15 | Foundation | Public | Events list | `6f618576…` | `f58c416c…` | `/events` | `public/events.ejs` | OK | public | all | OK | `public-pages` | close | COMPLETE | Calendar Stitch obsolete |
| 16 | Foundation | Public | Sermons | `4f4995dc…` | `96b380d4…` | `/sermons` | `public/sermons.ejs` | OK | public | all | OK | `public-pages` | close | COMPLETE | No series schema |
| 17 | Foundation | Public | Giving (info) | `59c8fded…` | `a0616f23…` | `/giving` | `public/giving.ejs` | OK | public | all | OK | `public-pages` | close | COMPLETE | No payments |
| 18 | Foundation | Public | Contact | `ab93d842…` | `9cbad6aa…` | `/contact` | `public/contact.ejs` | OK | public | all | OK | `public-pages` | close | COMPLETE | No contact POST form |
| 19 | Foundation | Auth | Member registration | `c360aef6…` | `7d771905…` | `/register` | `public/register.ejs` | OK | public | all | OK | `member-registration` | close | COMPLETE | Field set ≠ Stitch wizard |
| 20 | Foundation | Auth | Registration submitted | `1d377043…` | `f222e551…` | `/register/submitted` | `public/register-submitted.ejs` | OK | public | all | OK | `member-registration` | close | COMPLETE | — |
| 21 | Foundation | Auth | Waiting verification | `239beae5…` | `8e6e504f…` | — | — | NONE | — | — | — | — | n/a | MISSING_BACKEND | No pending-member session |
| 22 | Foundation | Auth | Forgot password | `61a6861b…` | `f4bb9457…` | — | — | NONE | — | — | — | — | n/a | DEFERRED | Product undecided |
| 23 | Foundation | Member | Dashboard | `4207a5a6…` | `b315a9d1…` | `/member` | `member/dashboard.ejs` | OK | member | all | OK | `member-portal` | minor | COMPLETE | Prayer tile disabled (no dead href); FG-Q07 blocked separately |
| 24 | Foundation | Member | Profile | `a323f678…` | `55e21b65…` | `/member/profile` | `member/profile.ejs` | OK | member | all | OK | `member-portal` | close | COMPLETE | No DOB/QR/avatar |
| 25 | Foundation | Member | Announcements | `63a9e613…` | `d7074e7c…` | `/member/announcements` | announcements member-* | OK | member | all | OK | `announcements` | close | COMPLETE | Detail Stitch weak |
| 26 | Foundation | Member | Events | `9a526853…` | `a4dc4a49…` | `/member/events` | participation member-* | OK | member | all | OK | `participation` | close | COMPLETE | List not calendar |
| 27 | Foundation | Member | Ministries | `05f9bdca…` | `53924d7e…` | `/member/ministries` | participation member-* | OK | member | all | OK | `participation` | close | COMPLETE | — |
| 28 | Foundation | Member | Resources | `d1690ab7…` | `d3232a4f…` | `/member/resources` | forms-requests member-* | OK | member | all | OK | `forms-requests` | close | COMPLETE | — |
| 29 | Foundation | Member | Forms | `745a1972…` | `0f801e19…` | `/member/forms` | forms-requests member-* | OK | member | all | OK | `forms-requests` | close | COMPLETE | — |
| 30 | Foundation | Member | Requests (submit/status) | `2cfd58a5…` / `530cb58f…` | mobiles | `/member/requests*` | forms-requests member-* | OK | member | all | OK | `forms-requests` | close | COMPLETE | Categories include prayer |
| 31 | Foundation | Member | Prayer request (dedicated) | `57edf489…` | `1dd180a3…` | `/member/prayer-request` | — | NONE | — | — | soft | — | n/a | MISSING_BACKEND | Use requests `category=prayer`; FG-Q07 product gate |
| 32 | Foundation | Member | Giving (info) | `3e723670…` | `236d4bf2…` | `/member/giving` | `member/giving.ejs` | OK | member | all | OK | `member-portal` | close | COMPLETE | Instructional only |
| 33 | Foundation | Branch | Dashboard | `001d1a02…` | `615f1f4e…` | `/branch-admin` | `branch-admin/dashboard.ejs` | OK | BA | all | OK | `branch-admin-shell` | close | COMPLETE | Unavailable KPI cards intentional |
| 34 | Foundation | Branch | Verification queue | `87fe9bb7…` | `d352ed07…` | `/branch-admin/registrations` | registrations + detail | OK | BA | all | OK | `member-registration` | close | COMPLETE | Detail Stitch adapted |
| 35 | Foundation | Branch | Members list | `3dae337c…` | `e90963b0…` | `/branch-admin/members` | `members.ejs` | OK | BA | all | OK | authz suites | close | COMPLETE | No export/add |
| 36 | Foundation | Branch | Member profile | `5e5985a0…` | `b3fbd9e2…` | `/branch-admin/members/:id` | `member-detail.ejs` | OK | BA | all | OK | — | close | COMPLETE | Read-only DTO |
| 37 | Foundation | Branch | Ministries admin | `58c96b4c…` | `526c1404…` | `/branch-admin/content/ministries` | `content-admin/entities.ejs` | OK | BA | all | OK | `content-admin` | close | COMPLETE | — |
| 38 | Foundation | Branch | Ministry profile | `064769bb…` | `17509b0d…` | content entity fields | `entity-fields.ejs` | OK | BA | all | OK | `content-admin` | close | COMPLETE | Inline CMS editor ≠ dedicated Stitch profile canvas (intentional) |
| 39 | Foundation | Branch | Events admin | `ad136a0e…` | `112d23ce…` | `/branch-admin/content/events` | entities | OK | BA | all | OK | `content-admin` | close | COMPLETE | — |
| 40 | Foundation | Branch | Sermons admin | — | — | `/branch-admin/content/sermons` | entities | OK | BA | all | OK | `content-admin` | n/a | MISSING_STITCH | Adapted from public sermons |
| 41 | Foundation | Branch | Website editor | `3f316066…` | `f2bb5e79…` | `/branch-admin/content` | content-admin * | OK | BA | all | OK | `content-admin` | minor | COMPLETE | Form/section editor — not freeform builder canvas (intentional) |
| 42 | Foundation | Branch | Announcements list/form | `65941542…` | `daa41602…` | `/branch-admin/announcements` | announcements admin-* | OK | BA | all | OK | `announcements` | close | COMPLETE | List/editor CLOSE |
| 42a | Foundation | Branch | Announcement preview | (same 35-*) | mobiles | `/branch-admin/announcements/:id/preview` | `admin-preview.ejs` | OK | BA | all | OK | `announcements` | close | COMPLETE | Preview route live; residual chrome may remain |
| 43 | Foundation | Branch | Attendance | `d351ae0e…` / `12e5e7d8…` | mobiles | `/branch-admin/attendance*` | attendance admin-* | OK | BA | all | OK | `attendance` | close | COMPLETE | Aggregates only |
| 44 | Foundation | Branch | Giving summaries | `cf849cdb…` | `20f32c9e…` | `/branch-admin/giving*` | giving admin-* | OK | BA | all | OK | `giving` | close | COMPLETE | Manual aggregates |
| 45 | Foundation | Branch | Forms admin | — | — | `/branch-admin/forms*` | forms-requests admin-* | OK | BA | all | OK | `forms-requests` | n/a | MISSING_STITCH | — |
| 46 | Foundation | Branch | Resources admin | (member 19 reused) | | `/branch-admin/resources*` | admin-resources | OK | BA | all | OK | `forms-requests` | close | COMPLETE | — |
| 47 | Foundation | Branch | Requests queue/detail | `126bfebf…` / `22fe4b70…` | mobiles | `/branch-admin/requests*` | admin-requests* | OK | BA | all | OK | `forms-requests` | close | COMPLETE | — |
| 48 | Foundation | Branch | Account / settings | — | — | `/branch-admin/account`, `/settings` | branch-admin * | OK | BA | all | OK | `settings` | n/a | MISSING_STITCH | — |
| 49 | Foundation | Branch | Basic reports (BA) | `d7bdddc0…` + monthly set | mobiles | — | — | NONE | — | `basic_reports` | soft | — | n/a | MISSING_BACKEND | Nav disabled; V4 monthly not ported |
| 50 | Foundation | HQ | Dashboard | `538c8f4f…` | `c67eda76…` | `/hq` | `hq/dashboard.ejs` | OK | HQ | all | OK | `hq-shell` | close | COMPLETE | Soft KPIs intentional |
| 51 | Foundation | HQ | Branch registry | `1a1aaecd…` | `2f154dfc…` | `/hq/branches` | `hq/branches.ejs` | OK | HQ | max 1 branch Fnd | OK | `branch-list` | close | COMPLETE | Create branch not in UI |
| 52 | Growth | HQ | Multi-branch admin | (same shells) | | `/hq/*` + `/b/:branchKey` | HQ mounts | OK | HQ | unlimited branches | OK | `hq-shell`, content | close | COMPLETE | Capacity enforcement soft on provision |
| 53 | Growth | HQ | Members oversight | (Stitch 28) | | `/hq/members*` | `hq/members*` | OK | HQ | Growth+ | OK | — | close | COMPLETE | Cross-branch |
| 54 | Growth | HQ | Registrations oversight | `87fe9bb7…` | `d352ed07…` | `/hq/registrations*` | `hq/registrations*` | OK | HQ | Growth+ | OK | — | close | COMPLETE | Read-only approve path |
| 55 | Growth | HQ | Content oversight | `3f316066…` | `f2bb5e79…` | `/hq/content*` | content-admin HQ | OK | HQ | Growth+ | OK | `content-admin` | minor | COMPLETE | Shared CMS with BA; Growth retains Foundation CMS |
| 56 | Growth | HQ | Forms/resources/requests | reused pairs | | `/hq/forms*`, `/resources*`, `/requests*` | forms-requests HQ | OK | HQ | Growth+ | OK | `forms-requests` | close | COMPLETE | — |
| 57 | Growth | HQ | Announcements / broadcast | `ffa76443…` | `b4184b73…` | `/hq/announcements*` | announcements HQ | OK | HQ | Growth+ | OK | `announcements` | close | COMPLETE | **No schedule/SMS** (DEFERRED) |
| 58 | Foundation | HQ | Basic reports hub | `2a577dc1…` (hub) | `06489c79…` | `/hq/reports` | `hq/reports.ejs` | OK | HQ | `basic_reports` | OK | `reports-audit` | close | COMPLETE | FG-08a tier chip |
| 59 | Growth | HQ | Advanced attendance report | `2a577dc1…` | `06489c79…` | `/hq/reports/attendance` | `hq/attendance-report.ejs` | SOFT | HQ | `advanced_reports` | OK | `reports-audit` | close | COMPLETE | FG-08a entitlement gate |
| 60 | Growth | HQ | Advanced giving report | same family | | `/hq/reports/giving` | `hq/giving-report.ejs` | SOFT | HQ | `advanced_reports` | OK | `reports-audit` | close | COMPLETE | FG-Q12 entitlement gate (mirror FG-08a attendance) |
| 61 | Growth | HQ | Audit trail | `bce1e8ec…` | `d7fcb1b3…` | `/hq/audit` | `hq/audit.ejs` | OK | HQ | all | OK | `reports-audit` | close | COMPLETE | — |
| 62 | Growth | HQ | Branch performance Stitch | `f6b63697…` | `922867ae…` | `/hq/reports` (approx) | reports hub | SOFT | HQ | advanced | OK | `reports-audit` | close | COMPLETE | No separate route; hub + honest unavailable (no fabricated scores) |
| 63 | Both | Media | Picker / upload / detail | Shared UI States | — | `/…/content/media*` | media-upload, picker | OK | BA/HQ | all | OK | `media` | n/a | MISSING_STITCH | Soft-archive only; Batch 22 done |
| 64 | Platform* | PA | Dashboard → deployments | map 74–80a | | `/admin*` | platform-admin * | OK | PA | platform | OK | `platform-admin-shell` | close | COMPLETE | Outside church package; ops |
| 65 | — | Leader | Leader portal (all) | `558f95cb…` family | mobiles | — | — | NONE | — | — | — | — | n/a | NOT_IN_SCOPE | No V5 leader role |
| 66 | — | Branch | Departments | `7ee4d401…` | `3794bd0c…` | — | — | NONE | — | — | — | — | n/a | MISSING_BACKEND | No schema |
| 67 | — | Branch | Duty roster | `37bdc9ea…` | `51d3e5bf…` | — | — | NONE | — | — | — | — | n/a | MISSING_BACKEND | No schema |
| 68 | — | Branch/HQ | Monthly report workflow | `45a88626…` / HQ `44040073…` | mobiles | — | — | NONE | — | — | — | — | n/a | MISSING_BACKEND | V4 not ported |
| 69 | Growth† | Comms | Scheduled communications | broadcast Stitch | | — | — | NONE | — | catalogue `broadcasts.scheduled` | — | — | n/a | DEFERRED | No V5 scheduler |
| 70 | Growth† | Reports | Scheduled reports | — | — | — | — | NONE | — | catalogue `reports.scheduled` | — | — | n/a | DEFERRED | No blessboard scheduler |
| 71 | Growth† | Ops | Offline attendance | — | — | — | — | NONE | — | catalogue | — | — | n/a | DEFERRED | No V5 queue |
| 72 | Growth† | Ops | Surveys | — | — | — | — | NONE | — | catalogue | — | — | n/a | DEFERRED | No schema |
| 73 | Growth† | Ops | Appointments | — | — | — | — | NONE | — | catalogue | — | — | n/a | DEFERRED | No schema |
| 74 | Growth† | Ops | Volunteer scheduling | — | — | — | — | NONE | — | catalogue | — | — | n/a | DEFERRED | No schema |
| 75 | Growth† | Care | Pastoral workflows (beyond requests) | — | — | — | — | NONE | — | catalogue care.advanced | — | — | n/a | DEFERRED | Requests categories only |
| 76 | Network | Domains/email/API | Custom domain, mailboxes, API | PA settings family | | assisted / PA | — | soft | PA | Network | — | — | n/a | NOT_IN_SCOPE | Not Growth |
| 77 | — | Giving | Banking / QR settings | `858c66cf…` | `0769a7e1…` | — | — | — | — | — | — | — | n/a | NOT_IN_SCOPE | Intentionally omitted |
| 78 | — | HQ | Roles / permissions | `12f5be53…` | `de3e82ef…` | `/hq/roles` | `hq/roles.ejs` | OK | HQ | all | soft seats | hq-roles suite | close | COMPLETE | Fixed roles only; templates still MISSING |
| 79 | Platform* | PA | Create organization UI | `d992150d…` | `0da4f454…` | `/admin/organizations/new` | — | CLI only | PA | — | soft | provisioning | n/a | BLOCKED BY VERIFIED DEPENDENCY | **No GET `/new`**; CLI provision only until product unlocks GUI |
| 80 | Foundation | HQ | Account / settings | — | — | `/hq/account`, `/hq/settings` | hq * | OK | HQ | all | OK | `settings` | n/a | MISSING_STITCH | — |

\* Platform / apex / PA support church packages but are not branch-billed Foundation features.
† Listed on Growth **catalogue** aspirationally; **not** V5-implemented — do not sell as live Growth GUI.

---

## Summary counts (product rows in master table)

| Status | Count | Notes |
|--------|------:|-------|
| COMPLETE | 60 | Incl. FG-01, FG-08a, FG-Q12 giving gate, CLOSE PARITY portals, former queue polish items |
| BLOCKED BY VERIFIED DEPENDENCY | 1 | Create-org GUI (79). FG-Q07 prayer CTA gate tracked via row 31 + queue disposition |
| MISSING_STITCH | 8 | Auth error/account, BA sermons/forms/account/settings, HQ account/settings, media |
| MISSING_BACKEND | 6 | Waiting verification, prayer route, departments, duty roster, monthly reports, HQ roles/templates |
| DEFERRED | 7 | Forgot password + Growth catalogue aspirational |
| NOT_IN_SCOPE | 3 | Leader, Network, banking settings |
| PARTIAL / PLACEHOLDER / MISSING_GUI | **0** | Cleared from executable queue |

**Executable GUI queue remaining:** **0** polish batches. Remaining work is product unlock (create-org) / MISSING_BACKEND / MISSING_STITCH / DEFERRED.

---

## Gaps by class

### Formerly actionable → closed

- Apex Home / Pricing / Directory / Register-church / For Churches → **COMPLETE**
- Member dashboard (with disabled prayer tile) → **COMPLETE**
- Branch ministry profile / announcement preview / website editor → **COMPLETE**
- HQ content oversight / branch performance-as-hub → **COMPLETE**
- FG-Q14/Q15 audits → **COMPLETE** (this document + test run)

### BLOCKED BY VERIFIED DEPENDENCY (do not invent GUI)

| Item | Exact dependency |
|------|------------------|
| Create organization UI (FG-Q06) | Product unlock for `/admin/organizations/new`; today CLI-only (`provisionBlessBoardChurch`) |
| Member prayer CTA (FG-Q07) | Product decision: link to `/member/requests/new?category=prayer` **or** keep disabled — no dedicated `/member/prayer-request` without schema |
| ~~HQ giving advanced gate (FG-Q12)~~ | **Closed** — soft `advanced_reports` gate + hub Growth-required labels (mirror FG-08a); Network inherits via `professional` plan features |

### Backend-blocked

See [`FOUNDATION_GROWTH_BLOCKED_SCREENS.md`](../gui/FOUNDATION_GROWTH_BLOCKED_SCREENS.md).

### Missing Stitch (no dedicated D+M pair)

Auth error, apex/branch/HQ account & settings, BA sermons & forms admin, media library (Shared UI States reference only).

---

## Historical candidates (verified)

| Candidate | Verdict | Evidence |
|-----------|---------|----------|
| Registration waiting/verification | **MISSING_BACKEND** | Stitch pair; no V5 route/session |
| Member prayer request (dedicated) | **MISSING_BACKEND** | Nav disabled; use `/member/requests` + `prayer` |
| Leader portal | **NOT_IN_SCOPE** | No leader role in V5 |
| Departments / duty roster / monthly reports | **MISSING_BACKEND** | No schema / V4 not ported |
| Scheduled reports / communications | **DEFERRED** | Catalogue only |
| Advanced attendance report | **COMPLETE** | FG-08a + `advanced_reports` gate |
| Advanced giving report | **COMPLETE** | Aggregates live; `advanced_reports` gated |
| Offline attendance / surveys / appointments / volunteers | **DEFERRED** | Catalogue only |
| Create organization UI | **BLOCKED BY VERIFIED DEPENDENCY** | CLI-only; no `/admin/organizations/new` |
