# BlessBoard V5 implementation and Stitch reconciliation audit

**Audit date:** 2026-07-18  
**Branch:** `V5` @ `0acdeb0` (clean working tree; tracks `origin/V5`)  
**Stitch project:** `projects/17124191473876947591` — **GetPro Church Platform** (196 screens via MCP `list_screens`; 217 screenInstances on project metadata)  
**Constraint:** Code + docs + live HTTP probe only. **No hosted Supabase connection. No deploy.**

---

## 1. Overall verdict

**Locally: feature-complete V5 backend + functional shells with strong automated coverage (37/37 named suites, 453/453 tests). Visually: far from Stitch. Hosted: apex foundation Home/Login only; full product surface not safely live.**

Classification summary:

| Layer | State |
|-------|--------|
| Platform + BlessBoard schema (through `013` / `025`) | Locally complete; hosted apply **unverified** (likely incomplete beyond auth/foundation) |
| HTTP services / authorization / CSRF / host-only sessions | Locally complete; tests green |
| Functional EJS shells (`views/blessboard/v5`) | Locally complete for core modules; **not** Stitch-parity |
| Stitch desktop/mobile GUI | Mostly **missing / placeholder / obsolete mapping** vs V5 views |
| Live `https://blessboard.org` | V5 foundation mode; nav Home + Login; `/healthz` → `v5-foundation` |
| Safe full cutover | **Blocked** on hosted migrate verify, tenant provision, routing shadow, Stitch public phase, media buckets |

---

## 2. Current live-state interpretation

Probed 2026-07-18 (HTTP only):

| Probe | Result | Meaning |
|-------|--------|---------|
| `GET /healthz` | `{"ok":true,"mode":"v5-foundation"}` | Hostinger runs V5 foundation path |
| `GET /` | 200, minimal inline “Home · BlessBoard” shell | Apex foundation home — **not** Stitch marketing |
| `GET /login` | 200 + CSRF cookie `blessboard_org_v5_csrf` | Apex auth live |
| `GET /account` | 303 | Unauthenticated redirect (expected) |
| `GET /admin`, `/admin/organizations` | 401 | Routes present; require `platform_admin` |
| `GET /features`, `/pricing`, `/about`, … | 503 | Apex marketing + tenant CMS **not** served on apex |
| `GET /logout` | 503 | Logout is **POST** only (correct) |

**Interpretation:** Live is a **conservative foundation deploy**: deployment-scoped apex auth + health. Tenant public CMS, member/HQ/branch modules, and Stitch marketing pages are **not** what anonymous apex users see. Whether Hostinger’s git tip equals `0acdeb0` was not proven; behavior is consistent with foundation mode + `BLESSBOARD_TENANT_ROUTING_MODE=off` (or equivalent unavailable fallback).

---

## 3. Git status and commit inventory

| Item | Value |
|------|--------|
| Current branch | `V5` |
| Uncommitted files | **None** (clean) |
| Ahead/behind `origin/V5` | Up to date |
| Commits on `V5` not in `V4` | **20** |

### Commit groups (V4..V5)

| Dates | Messages | Role |
|-------|----------|------|
| 2026-07-16 | `Update Blessboard.org implementation` ×5, `blessboard.org` ×3 | Apex/.org isolation, early V5 boot |
| 2026-07-16–17 | `demo for test env only` ×4 | Demo tenant visibility / testing env |
| 2026-07-17 | `admin console` ×2 | Platform-admin shell start |
| 2026-07-17–18 | `New DB` ×6 | Overnight: schema → auth → portals → ops modules → migration tooling |

Overnight / “New DB” tips: `bef25c0` … `0acdeb0` (2026-07-17 evening through 2026-07-18 midday).

### Implementation inventory (V5 tree)

| Kind | Count / notes |
|------|----------------|
| Platform migrations | `001`–`013` (latest **`013_create_plans_subscriptions_entitlements.sql`**) |
| BlessBoard migrations | `001`–`025` (latest **`025_create_resources_forms_requests.sql`**) |
| GetPro / NGO | Empty schema shells only |
| Repositories | 18 (`src/blessboard/repositories` + `src/platform/repositories`) |
| Services | 31 |
| HTTP modules | 37 |
| V5 EJS views | 62 under `views/blessboard/v5` |
| V5 CSS | 5 under `public/blessboard/v5` |
| Migration tooling | `src/migration/v4ToV5/*` + `db/scripts/migrate-v4-to-v5*.js` |
| Named npm test scripts | 37 V5/platform/blessboard/migration suites |
| Docs (`docs/database/*`) | Architecture, runbooks, overnight readiness, cutover, mapping, rehearsal, this audit |

### Duplicate / conflicting / abandoned / placeholder / unreachable

| Finding | Severity |
|---------|----------|
| **V4 church Stitch inventory** (`docs/blessboard-stitch-screen-inventory.md`) maps to `views/church/*` routes (`/branch/…`, `/member/dashboard`, …) — **not** V5 paths (`/branch-admin/…`, `/member`, …) | High (doc/route drift) |
| **ARCHITECTURE.md** still says member/CMS portals are controlled 503 — **obsolete** vs `v5FoundationServer.js` mounts | Medium |
| **Branch-admin dashboard** still labels Attendance / Announcements “Not enabled” while routes exist | Medium (stale UI) |
| Member prayer still disabled on dashboard; waiting-verification / forgot-password gaps | Medium |
| **Apex Stitch marketing** (Features, Pricing, Directory, Register Church) — **no V5 routes**; live 503 | High for marketing parity |
| Multiple Stitch **duplicate / v2 / empty / populated** variants of public pages | Normal Stitch churn; pick approved titles |
| Leader portal screens (46–50) | **No V5 routes** (schema/product gap) |
| `connect-pg-simple` remains in `package.json` for **legacy** path only; unused by V5 foundation | Low |
| `server.legacy.js` exists only on V5 (extracted from monolith); V4 branch still uses monolithic `server.js` | Isolation OK if foundation gate holds |

---

## 4. Migration inventory

### Latest numbers

| Track | Latest file | Implied version |
|-------|-------------|-----------------|
| Platform | `013_create_plans_subscriptions_entitlements.sql` | **013** |
| BlessBoard | `025_create_resources_forms_requests.sql` | **025** |

### Platform tables (14)

`schema_migrations`, `database_identity`, `deployments`, `products`, `organizations`, `organization_products`, `domains`, `deployment_sessions`, `auth_transfers`, `audit_events`, `plans`, `plan_features`, `organization_subscriptions`, `organization_entitlements`

### BlessBoard tables (33)

Catalogue/auth: `churches`, `branches`, `users`, `user_roles`, `church_settings`, `branch_settings`  
Public CMS: `public_pages`, `page_sections`, `leaders`, `ministries`, `events`, `sermons`, `contact_channels`, `giving_methods`, `media_assets`  
Members: `members`, `member_branch_memberships`, `member_registrations`  
Ops: `announcements` (+ audiences/reads/attachments), `ministry_memberships`, `event_registrations`, `attendance_events`, `attendance_entries`, `giving_categories`, `giving_entries`, `resources`, `forms`, `form_submissions`, `member_requests`, `member_request_status_history`

### Hosted apply status (inferred — **not** verified against Supabase)

| Band | Likelihood on hosted |
|------|----------------------|
| Platform `001`–`010` + BlessBoard `001`–`005` (enough for login/sessions) | **Likely applied** (live login/CSRF works) |
| BlessBoard `008`–`025`, platform `011`–`013` | **Likely not fully applied** (docs: hosted rehearsal/cutover not started; operator migrate required) |
| Exact `db:status` on hosted | **Unknown** — do not guess checksums |

---

## 5. Route inventory

Legend — **Implemented:** code mounted in `v5FoundationServer.js`. **Deployed:** visible/reachable on live apex without tenant host (Y/N/Partial). **Stitch:** closest Stitch family. **Ready:** production-ready for functional (not visual) use after hosted migrate + provision + routing.

### Apex (`blessboard.org`)

| Route | Method | Auth | Roles | Implemented | View | Expect | Stitch | Deploy ready | Blocker |
|-------|--------|------|-------|-------------|------|--------|--------|--------------|---------|
| `/` | GET | anon | — | Yes (foundation HTML) | inline `renderFoundationHome` | 200 | Apex marketing home **or** none | Partial (live) | Not Stitch; marketing pages missing |
| `/login` | GET/POST | anon | — | Yes | inline login | 200 / 429 | `09-auth-member-login-*` (close intent) | Partial | Visual placeholder |
| `/logout` | POST | session | — | Yes | redirect | 303 | — | Partial | GET → 503 |
| `/account` | GET | session | any authed | Yes | inline account | 200/303 | — | Partial | Minimal UI |
| `/admin` | GET | session | `platform_admin` | Yes | `platform-admin/dashboard.ejs` | 200/401/403 | `62-platform-admin-dashboard-*` | Yes (apex) | Live org counts; Stitch command shell |
| `/admin/account` | GET | session | `platform_admin` | Yes | `platform-admin/account.ejs` | 200/401/403 | shell | Yes (apex) | In-shell account |
| `/admin/logout` | POST | session + CSRF | `platform_admin` gate on shell; CSRF on post | Yes | — | 303/403 | shell | Yes (apex) | Revokes V5 session |
| `/admin/organizations` | GET | session | `platform_admin` | Yes | `organizations.ejs` | 200/401 | `63-platform-church-organizations-*` | Yes (apex) | Bounded pagination; safe fields; read-only |
| `/admin/organizations/:organizationKey` | GET | session | `platform_admin` | Yes | `organization-detail.ejs` | 200/404 | `65-*` + entitlements/domains | Yes (apex) | Org summary, branches, domains, entitlements; no org create |
| `/admin/organizations/:organizationKey/plan` | POST | CSRF + confirm | `platform_admin` | Yes | — | 303 | `66-*` (assign) | Yes (apex) | `assignOrganizationPlan`; never deletes branches/users |
| `/admin/organizations/:organizationKey/entitlement-override` | POST | CSRF + confirm + reason | `platform_admin` | Yes | — | 303 | `66-*` (override) | Yes (apex) | `setOrganizationEntitlementOverride` |
| `/admin/plans` | GET | session | `platform_admin` | Yes | `plans.ejs` | 200/401 | `66-platform-plans-limits-*` | Yes (apex) | Catalogue + features; no prices/billing UI |
| `/admin/deployments` | GET | session | `platform_admin` | Yes | `deployments.ejs` | 200/401 | `68-*` (registry subset) | Yes (apex) | Safe deployment fields; no fake health/tickets |
| `/admin/settings` | GET | session | `platform_admin` | Yes | `settings.ejs` | 200/401 | `67-platform-settings-*` | Yes (apex) | Read-only DNS pattern + reserved labels; no save/failover |
| `/features`, `/pricing`, `/for-churches`, `/register-church`, `/directory` | — | — | — | **Missing** | — | 503 | BlessBoard apex Stitch set | No | Not implemented on V5 |
| `/healthz` | GET | anon | — | Yes | JSON | 200 | — | Yes | — |

### Tenant public (requires `BLESSBOARD_TENANT_ROUTING_MODE=authoritative` + provisioned hostname)

| Route | Method | Auth | Roles | Implemented | View | Expect | Stitch | Deploy ready | Blocker |
|-------|--------|------|-------|-------------|------|--------|--------|--------------|---------|
| `/` | GET | anon | — | Yes | `public/page.ejs` or `tenant-landing.ejs` | 200/404/503 | `01-public-home-*` | No | Routing off; content; Stitch |
| `/about` | GET | anon | — | Yes | `public/page.ejs` | 200 | `02-public-about-*` | No | Same |
| `/leadership` | GET | anon | — | Yes | `public/page.ejs` | 200 | `03-public-leadership-*` | No | Same |
| `/ministries` | GET | anon | — | Yes | `public/page.ejs` | 200 | `04-public-ministries-*` | No | Same |
| `/events` | GET | anon | — | Yes | `public/page.ejs` | 200 | `05-public-events-*` | No | Same |
| `/sermons` | GET | anon | — | Yes | `public/page.ejs` | 200 | `06-public-sermons-*` | No | Same |
| `/contact` | GET | anon | — | Yes | `public/page.ejs` | 200 | `08-public-contact-*` | No | Same |
| `/giving` | GET | anon | — | Yes | `public/page.ejs` | 200 | `07-public-giving-*` | No | Same |
| `/register` | GET/POST | anon | — | Yes | `public/register.ejs` | 200/429 | `10-auth-member-registration-*` | No | Authoritative + CSRF |
| `/register/submitted` | GET | anon | — | Yes | `register-submitted.ejs` | 200 | `11-auth-registration-submitted-*` | No | — |
| `/login` | GET | anon | — | Yes | transfer redirect | 302→apex | `09-auth-*` | No | Needs resolved tenant |
| `/auth/callback` | GET | transfer | role on tenant | Yes | set cookie | 302/400/403 | — | No | Transfer tables |
| `/_bb/media/:assetId` | GET | anon | — | Yes | bytes | 200/404 | — | No | Storage buckets |
| `/waiting-verification`, `/forgot-password` | — | — | — | **Missing** | — | 503 | `12`/`13` auth | No | Not in V5 |
| `/tenant-access-check` | GET | session | tenant role | Yes | diagnostic HTML | 200/401/403 | — | No | Diagnostic only |

### Member (tenant host; active membership)

| Route | Method | Auth | Roles | Implemented | View | Stitch | Status |
|-------|--------|------|-------|-------------|------|--------|--------|
| `/member` | GET | member | membership | Yes | `member/dashboard.ejs` | `14-member-dashboard-*` | Shell + module cards; no fabricated counts; Giving/Prayer disabled |
| `/member/profile` | GET/POST | member | membership | Yes | `member/profile.ejs` | `15-member-profile-*` | GUI batch1; approved fields only |
| `/member/announcements` (+ `/:id`, POST read) | GET/POST | member | membership | Yes | announcements/* | `16-*` | GUI batch1; read/pinned/featured states |
| `/member/events` (+ register/cancel) | GET/POST | member | membership | Yes | participation/* | `17-*` | GUI batch2; list + register/cancel |
| `/member/ministries` (+ join/leave) | GET/POST | member | membership | Yes | participation/* | `18-*` | GUI batch2; join/request/leave |
| `/member/resources` (+ file) | GET | member | membership | Yes | forms-requests/* | `19-*` | GUI batch3a; private download headers |
| `/member/forms` (+ submit) | GET/POST | member | membership | Yes | forms-requests/* | `20-*` | GUI batch3a; schema allowlist + submitted state |
| `/member/requests` | GET/POST | member | membership | Yes | forms-requests/* | `21`/`22-*` | GUI batch3b; own requests + CSRF |
| `/member/requests/new` | GET | member | membership | Yes | forms-requests/member-request-new.ejs | `21-*` | GUI batch3b submit |
| `/member/giving` | GET | member | membership | Yes | member/giving.ejs | `24-*` | GUI batch3b info-only; no payment |
| `/member/prayer-request` | — | — | — | **Missing** | — | `23-*` | Missing |
| `POST /member/logout` | POST | session | — | Yes | — | — | Functional |

### Branch admin (tenant; `branch_admin` / HQ / platform)

| Route | Method | Implemented | View | Stitch | Status |
|-------|--------|-------------|------|--------|--------|
| `/branch-admin` | GET | Yes | `branch-admin/dashboard.ejs` | `25-*` | Shell ★batch; live/disabled module cards; no fake metrics |
| `/branch-admin/account` | GET | Yes | `account.ejs` | — | Shell |
| `/branch-admin/settings` | GET/POST | Yes | `settings.ejs` | — | Functional |
| `/branch-admin/registrations` (+ detail/approve/reject) | GET/POST | Yes | registrations/* | `26-*` | GUI batch1; CSRF + confirm dialogs |
| `/branch-admin/members` (+ detail) | GET | Yes | members.ejs / member-detail.ejs | `27`/`28-*` | GUI batch1; privacy-limited read |
| `/branch-admin/content` (+ pages/sections/media/entities) | GET/POST | Yes | content-admin/* | `34-*` | Functional backend; visual gap |
| `/branch-admin/announcements` (+ detail/edit/preview/publish/archive) | CRUD | Yes | announcements/* | `35-*` | GUI batch1; CSRF publish/archive; no hard delete; no fake Stitch metrics |
| `/branch-admin/attendance` (+ create/edit/entries/submit) | CRUD workflow | Yes | attendance/* | `36`/`37-*` | GUI batch1; aggregate only; amendment→draft |
| `/branch-admin/giving` (+ create/edit/submit/void) | CRUD workflow | Yes | giving/* | `38`/`39-*` | GUI batch1; NUMERIC money; no donor PII/gateway |
| `/branch-admin/participation` | GET + review | Yes | participation/* | — | Functional |
| `/branch-admin/forms|resources|requests` | GET/POST | Yes | forms-requests/* | `44`/`45-*` | GUI batch1; submission review + request workflow |
| `/branch-admin/members`, ministries directory, duty roster, reports submit | ministries/duty/reports | **Missing / not V5** | — | `29`–`33`, `40`–`43` | Schema or deferred |
| `POST /branch-admin/logout` | POST | Yes | — | — | Functional |

### HQ (tenant; `church_hq_admin` / platform)

| Route | Method | Implemented | View | Stitch | Status |
|-------|--------|-------------|------|--------|--------|
| `/hq` | GET | Yes | `hq/dashboard.ejs` | `51-*` | GUI shell batch1; real active-branch count only |
| `/hq/branches` (+ `/:branchKey`) | GET | Yes | `branches.ejs` | `52-*` | GUI shell batch1; active list + auth deep-link |
| `/hq/account` (+ logout) | GET/POST | Yes | `account.ejs` | — | GUI shell batch1 |
| `/hq/settings` | GET/POST | Yes | `settings.ejs` | — | Functional |
| `/hq/reports` | GET | Yes | `reports.ejs` | `57-*` (partial) | Live aggregates; month + branch filters; no charts |
| `/hq/reports/attendance` | GET | Yes | `hq/attendance-report.ejs` | `36`/`37` + HQ rollup | Real monthly aggregates; branch key filter; no fake charts |
| `/hq/reports/giving` | GET | Yes | `hq/giving-report.ejs` | `38`/`39` + HQ rollup | NUMERIC string totals; no donor PII; branch filter |
| `/hq/audit` | GET | Yes | `audit.ejs` | `58-*` (+ `56` trail intent) | Filters (action/entity/outcome); cursor pagination; privacy-safe rows; no export/metadata |
| `/hq/registrations` (+ detail) | GET | Yes | `hq/registrations.ejs`, `registration-detail.ejs` | `26-*` (HQ oversight) | Church-wide read/review; branch labels; no approve/reject |
| `/hq/members` (+ detail) | GET | Yes | `hq/members.ejs`, `member-detail.ejs` | `27`/`28-*` (HQ oversight) | Church-wide directory; privacy-limited; optional branch key filter |
| `/hq/content` (+ `/b/:branchKey`, pages/entities/media/preview) | GET/POST | Yes | `content-admin/*` | `34-*` (HQ shell) | Church-wide + branch scope; publish confirm; optimistic concurrency; media upload |
| `/hq/announcements` (+ `/b/:branchKey`, CRUD/preview/publish/archive) | GET/POST | Yes | `announcements/admin-*` | `35-*` (HQ shell; not `61` broadcast) | Church-wide + branch scope; soft archive; media attach; concurrency |
| `/hq/forms|resources|requests` (+ `/b/:branchKey`) | GET/POST | Yes | forms-requests/* | `44`/`45-*` (HQ shell) | Church-wide + branch scope; private attachment download; memberRef privacy; status workflow |
| `/hq/content` siblings: attendance, giving, participation | Yes | admin modules | various | Functional CRUD; reports at `/hq/reports/*` |
| HQ performance, monthly report review queue, permissions, templates, broadcast center | — | **Missing** | — | `53`–`56`, `59`–`61` | Not V5 |

---

## 6. Stitch screen matrix

**Source:** live MCP `list_screens` on `17124191473876947591` (2026-07-18).  
**Do not treat** repo PNGs under `design-reference/stitch-screens/` as newer than MCP.

Status values: **exact** | **close** | **placeholder** | **missing** | **obsolete**

### A. Apex BlessBoard marketing (approved set + extensions)

| Stitch title | Screen ID | D/M | Route | Role | EJS | Status | Gaps / phase |
|--------------|-----------|-----|-------|------|-----|--------|--------------|
| BlessBoard - One digital home… | `46081ff8…` / `9f9927a6…` | D/M | `/` apex | anon | foundation inline | **placeholder** | Not Stitch; Phase 5 |
| BlessBoard - Features | `7ef3518f…` / `5ac1e1b0…` | D/M | `/features` | anon | — | **missing** | Phase 5 |
| BlessBoard - For Churches | `fc4bf5aa…` / `55af3450…` | D/M | TBD | anon | — | **missing** | Phase 5 |
| BlessBoard - Register Your Church | `8640e853…` / `515da582…` | D/M | TBD | anon | — | **missing** | Phase 5 |
| BlessBoard - Church Directory | `2b9df962…` / `ab5d47e2…` | D/M | TBD | anon | — | **missing** | Phase 5 |
| BlessBoard - Pricing (+ FAQ) | `1c50e898…` / `181ec1f8…` (+ FAQ ids) | D/M | `/pricing` | anon | — | **missing** | Phase 5 |
| Visual / UI boards | `c8d8352b…`, `b61a1ea8…`, … | D | — | design | — | reference | Spec only |

### B. Tenant public website (numbered 01–08; prefer populated v2/v3/v4 where present)

| Family | Example IDs | Route | EJS | Status | Phase |
|--------|-------------|-------|-----|--------|-------|
| Public home | `ff5da3e5…`, `a52e64c6…`, refined v2 | `/` tenant | `public/page.ejs` | **placeholder** | 5 |
| About | `4537dc72…`, populated v3 | `/about` | same | **placeholder** | 5 |
| Leadership | `a779e04c…`, populated | `/leadership` | same | **placeholder** | 5 |
| Ministries | `67fdba76…` v3/v4 | `/ministries` | same | **placeholder** | 5 |
| Events | `84b91938…` / v2 | `/events` | same | **placeholder** | 5 |
| Sermons | `ebe20757…` / v2 | `/sermons` | same | **placeholder** | 5 |
| Giving | `14115440…` / v2 | `/giving` | same | **placeholder** | 5 |
| Contact | `6d4d6ae2…` / v2 | `/contact` | same | **placeholder** | 5 |

Major gaps: Sacred Modernity layout, imagery, nav, typography density; V5 uses thin CMS renderer + `tenant-public.css`. Backend: published CMS rows + media.

### C. Authentication (09–13)

| Family | IDs | Route | EJS | Status | Phase |
|--------|-----|-------|-----|--------|-------|
| Member login | `9b264ef3…` / `68a84bcc…` | `/login` | inline / transfer | **placeholder** | 6 |
| Registration | `c360aef6…` / `7d771905…` | `/register` | `public/register.ejs` | **close** (functional) / visual placeholder | 6 |
| Submitted | `1d377043…` / `f222e551…` | `/register/submitted` | register-submitted | **close** | 6 |
| Waiting verification | `239beae5…` / `8e6e504f…` | — | — | **missing** | 6 deferred |
| Forgot password | `61a6861b…` / `f4bb9457…` | — | — | **missing** | 6 deferred |

### D. Member portal (14–24)

| Family | Route | EJS | Status | Phase |
|--------|-------|-----|--------|-------|
| 14 Dashboard | `/member` | `member/dashboard.ejs` | **placeholder** | 7 |
| 15 Profile | `/member/profile` | `member/profile.ejs` | **close ★batch1** | 7 |
| 16 Announcements | `/member/announcements` | announcements/* | **close ★batch1** | 7 |
| 17 Events | `/member/events` | participation/* | **close ★batch2** | 7 |
| 18 Ministries | `/member/ministries` | participation/* | **close ★batch2** | 7 |
| 19 Resources | `/member/resources` | forms-requests/* | **close ★batch3a** | 7 |
| 20 Forms | `/member/forms` | forms-requests/* | **close ★batch3a** | 7 |
| 21–22 Requests | `/member/requests` | forms-requests/* | **close ★batch3b** | 7 |
| 24 Giving info | `/member/giving` | member/giving.ejs | **close ★batch3b** | 7 |
| 23 Prayer | — | — | **missing** | deferred |
| 24 Giving info | — | disabled card | **placeholder** | deferred |

### E. Branch admin (25–45) + misfiled 04

| Family | V5 route | Status | Phase |
|--------|----------|--------|-------|
| 25 Dashboard | `/branch-admin` | **close ★shell** (no fake metrics) | 8 |
| 26 Verification | `/branch-admin/registrations` | **close ★batch1** | 8 |
| 27–28 Members | `/branch-admin/members` | **close ★batch1** | 8 |
| 27–31 Members/ministries/departments | mostly missing | **missing** | deferred |
| 32 Events mgmt | via `/branch-admin/content` events | **close** backend / visual gap | 8 |
| 33 Duty roster | — | **missing** | deferred |
| 34 Website editor | `/branch-admin/content` | **placeholder** | 8 |
| 35 Announcements | `/branch-admin/announcements` | **close ★batch1** | 8 |
| 36–37 Attendance | `/branch-admin/attendance` | **close ★batch1** | 8 |
| 38–39 Giving | `/branch-admin/giving` | **close ★batch1** (no payment gateway — by design) | 8 |
| 40–43 Branch reports submit/history | — | **missing** | deferred |
| 44–45 Request queue | `/branch-admin/requests` (+ forms review) | **close ★batch1** | 8 |

### F. Leader (46–50)

| Family | Status | Phase |
|--------|--------|-------|
| 46–50 Leader portal | **missing** (no V5 leader role/routes) | Out of current V5 scope |

### G. HQ (51–61)

| Family | V5 route | Status | Phase |
|--------|----------|--------|-------|
| 51 Dashboard | `/hq` | **close ★batch1** (real cards only) | 9 |
| 52 Branch registry | `/hq/branches` | **close ★batch1** | 9 |
| Members / registrations oversight | `/hq/members`, `/hq/registrations` | **close** (reuse 26–28 language; church-wide read/review) | 9 |
| Website + announcements (HQ) | `/hq/content`, `/hq/announcements` (+ `/b/:branchKey`) | **close** (reuse 34–35; church-wide + branch scope) | 9 |
| Attendance / giving reports (HQ) | `/hq/reports/attendance`, `/hq/reports/giving` (+ consolidated `/hq/reports`) | **close** (real aggregates; no charts; no donor PII) | 9 |
| Forms / resources / requests (HQ) | `/hq/forms`, `/hq/resources`, `/hq/requests` (+ `/b/:branchKey`) | **close** (reuse 44–45; church-wide + branch scope; private attachments) | 9 |
| 53–56 Performance / monthly review / audit queue / analytics | partial via `/hq/reports` only | **missing** / obsolete vs Stitch | deferred |
| 57 Consolidated analytics | `/hq/reports` | **close** (branch filter + by-branch tables; visual gap vs Stitch charts omitted) | 9 |
| 58 Global audit | `/hq/audit` | **close** (filters + cursor pagination; no export; no raw metadata/PII) | 9 |
| 59–61 Permissions / templates / broadcast | — | **missing** (`61` broadcast deferred; not `/hq/announcements`) | deferred |

### H. Platform admin (62–68) + platform 01

| Family | V5 route | Status | Phase |
|--------|----------|--------|-------|
| 01 Platform home / finder / branch selector | apex foundation / transfer | **obsolete** vs V5 | — |
| 62 Dashboard | `/admin` | **close** (live org counts; Stitch command shell; no fake metrics) | 10 |
| 63 Organizations | `/admin/organizations` | **close** (bounded pagination; safe fields; status chips; no create/fake KPIs) | 10 |
| 64 Create org | — | **missing** (CLI provision only) | 10 |
| 65 Branch tenants (org detail) | `/admin/organizations/:key` | **close** (org + branches + domains + entitlements; confirmed plan/override writes) | 10 |
| 66 Plans / limits | `/admin/plans` + org entitlements | **close** (catalogue + assign/override; no prices, create-tier, or fake KPIs) | 10 |
| 67 Platform settings | `/admin/settings` | **close** (read-only hostname pattern + reserved labels; no branding save/MFA/failover) | 10 |
| 68 Support / monitoring | `/admin/deployments` | **partial** (deployment registry only; no tickets/errors/fake health) | 10 |

---

## 7. Feature readiness classification

| Feature | Class |
|---------|-------|
| V5 foundation boot + `/healthz` | **1 production-ready** (live) |
| Apex login / logout / account (functional) | **2 locally complete; partially deployed** |
| Host-only sessions + CSRF + auth transfer | **2** (code+tests; needs hosted transfer tables verified) |
| Platform hostname resolution + tenant routing modes | **2** |
| Tenant authorization (UUID roles) | **2** |
| Platform-admin org directory (read-only) | **2** backend; **4** Stitch UI |
| HQ/branch shells + settings | **2** |
| Public CMS schema + read/admin + media metadata | **2** / media blobs need buckets |
| Member registration + portal core modules | **2** |
| Announcements / participation / attendance / giving summaries / forms-requests / HQ reports+audit | **2** |
| Plans + entitlements service | **2** (no billing UI) |
| V4→V5 migration tooling + local rehearsal | **2** locally; hosted **6 blocked** |
| Apex Stitch marketing site | **4 UI missing** |
| Member giving / prayer / waiting-verification / forgot-password | **4** or **5**/missing |
| Leader portal; duty roster; branch report workflow; HQ broadcast/permissions | **5 schema only / missing** |
| Branch-admin dashboard “Not enabled” cards for live modules | **4 stale placeholder** |
| Authoritative tenant public on production DNS | **6 blocked** (routing + provision + content) |
| Full Stitch visual parity cutover | **6 blocked** |
| Pointing V5 at legacy DB / shared Domain cookie / runtime migrate | **7 unsafe — must not deploy** |

---

## 8. Security findings

| Check | Result |
|-------|--------|
| V5 does not use `public.tenants` | **Pass** (foundation path) |
| V5 does not use `public.session` | **Pass** |
| V5 does not use `GETPRO_DATABASE_URL` | **Pass** (org isolation + diagnostics) |
| V5 does not use `connect-pg-simple` | **Pass** (dependency retained for legacy only) |
| V4 isolated via `server.legacy.js` when not foundation | **Pass with note** — file extracted/maintained on V5; V4 branch still monolithic |
| Session tokens hashed (`session_token_hash`) | **Pass** |
| Password hashes not in EJS | **Pass** |
| CSRF on mutating auth/admin posts | **Pass** (tested) |
| Cookies host-only (no `Domain=.blessboard.org`) | **Pass** |
| Tenant authz uses UUIDs | **Pass** |
| No runtime DDL in `src/blessboard` / `src/platform` | **Pass** |
| No automatic hosted migration at startup | **Pass** |
| No hardcoded credentials in V5 src | **Pass** |
| No Stitch-generated HTML/scripts shipped as runtime UI | **Pass** (design-reference only) |
| Cross-tenant access blocked | **Pass** (named suites) |

### Residual risks (not automatic fails)

1. **`npm audit --omit=dev`:** 6 vulnerabilities (multer, path-to-regexp high; qs, postcss, vite). Do **not** blind major-upgrade.  
2. **Authoritative routing** mis-set before provision → wrong tenant HTML.  
3. **ARCHITECTURE.md drift** may mislead operators about 503 vs live modules.  
4. Hosted migration status **unknown** — operating features against missing tables → 503s (fail soft) but blocks readiness claims.

---

## 9. Test results

Executed 2026-07-18 locally — **all named V5 suites**.

| Metric | Value |
|--------|--------|
| Suites | **37 passed, 0 failed** |
| Node tests (aggregated `# tests` / `# pass`) | **453 passed, 0 failed, 0 skipped** |
| `git diff --check` | **clean** |
| `npm audit --omit=dev` | **6 vulns** (see §8); no auto-upgrade |

### Suite list (all PASS)

`test:db:foundation`, `test:db:bootstrap-foundation`, `test:platform:resolution`, `test:platform:http-context`, `test:platform:host-comparison`, `test:platform:provisioning`, `test:platform:entitlements`, `test:platform:diagnostic-integration`, `test:platform:sessions`, `test:v5:foundation-startup`, `test:migration:mapping`, `test:migration:tooling`, `test:blessboard:catalogue`, `test:blessboard:http-context`, `test:blessboard:provisioning`, `test:blessboard:auth-schema`, `test:blessboard:auth`, `test:blessboard:tenant-routing`, `test:blessboard:authorization`, `test:blessboard:branch-admin-shell`, `test:blessboard:hq-shell`, `test:blessboard:platform-admin-shell`, `test:blessboard:tenant-host-login`, `test:blessboard:settings`, `test:blessboard:public-content-schema`, `test:blessboard:public-pages`, `test:blessboard:content-admin`, `test:blessboard:media`, `test:blessboard:members-schema`, `test:blessboard:member-registration`, `test:blessboard:member-portal`, `test:blessboard:announcements`, `test:blessboard:participation`, `test:blessboard:attendance`, `test:blessboard:giving`, `test:blessboard:forms-requests`, `test:blessboard:reports-audit`

| Category | Notes |
|----------|--------|
| Requires local test DB | Most blessboard/platform HTTP suites (ephemeral DB via helpers) |
| Requires storage fixture | `test:blessboard:media` (local adapter forced in test) |
| Requires manual browser | Stitch visual parity; Hostinger shadow logs; real tenant DNS |
| Full `npm test` tree | **Not** a readiness gate (parallel DB create races historically) |

Raw log: `tmp/v5-audit-test-results.txt`

---

## 10. Hosted requirements

### Migrations

- Operator: `DATABASE_URL=<V5 Supabase>` + `DATABASE_IDENTITY_EXPECTED=blessboard-platform-v5`
- `npm run db:migrate` → `db:status` → `db:identity:check` → `db:verify:foundation`
- Or first-run: `npm run db:bootstrap:foundation`
- **Never** at app startup; **never** against V4 DB

### Required hosted tables

All platform required tables in `foundationVerify.js` + full BlessBoard approved list through migration `025` (see §4). Forbidden in `public`: `tenants`, `session`.

### Storage buckets

| Bucket | Purpose |
|--------|---------|
| `blessboard-public` | Public media (app still prefers `/_bb/media/:assetId`) |
| `blessboard-private` | Private attachments |

Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BLESSBOARD_MEDIA_PUBLIC_BUCKET`, `BLESSBOARD_MEDIA_PRIVATE_BUCKET`

### Environment variables (Hostinger V5 app)

```bash
NODE_ENV=production
DEPLOYMENT_ENV=testing
PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5
DATABASE_URL=<new V5 only>
DATABASE_IDENTITY_EXPECTED=blessboard-platform-v5
PLATFORM_HOST_CONTEXT_MODE=diagnostic
BLESSBOARD_TENANT_ROUTING_MODE=off   # then shadow → authoritative
SESSION_SECRET=<≥32 chars>
SESSION_COOKIE_NAME=blessboard_org_v5_sid
BASE_DOMAIN=blessboard.org
PUBLIC_SCHEME=https
BLESSBOARD_JOBS_ENABLED=0
# optional: BLESSBOARD_APEX_ORIGIN=https://blessboard.org
```

**Must unset:** `GETPRO_DATABASE_URL`

### DNS

| Record | Purpose |
|--------|---------|
| `blessboard.org` / `www` | Apex → V5 Hostinger |
| `*.blessboard.org` (or specific demo hosts) | Tenant hosts → same app |
| TTL plan + reverse owners | Before authoritative |

### Hostinger restart / redeploy

1. Confirm env (above).  
2. Deploy/pull `V5` tip intended for release.  
3. Restart Node workers so every worker sees env.  
4. Verify `/healthz` → `v5-foundation`.  
5. Change routing mode only via env + restart (no migrate needed for mode).

### Provisioning commands

```bash
npm run platform:tenant:provision -- ...
npm run blessboard:church:provision -- ...
printf '%s' 'TEMP' | npm run blessboard:user:create -- --password-stdin ...
npm run blessboard:user:role:assign -- ...
```

### Operator-run only

- All `db:migrate` / identity init  
- Bucket creation  
- DNS  
- V4→V5 `migrate:v4-to-v5:*` with explicit source/target URLs + `--confirm`  
- Hosted rehearsal sign-off (`V5_HOSTED_MIGRATION_AND_CUTOVER.md`)

---

## 11. Critical blockers

1. **Hosted migration completeness unverified** — cannot claim tables through `025`/`013` without `db:status` on intended project.  
2. **Tenant routing still `off` (or equivalent)** — public CMS and portals not on real hostnames.  
3. **No Stitch apex marketing implementation** on V5.  
4. **Stitch visual debt** across all portal shells (functional ≠ approved GUI).  
5. **Stale dashboard placeholders** misrepresent enabled modules.  
6. **Open cutover product decisions** (M4–M14 in `V5_FINAL_MIGRATION_READINESS.md`) before V4 data apply.  
7. **Media blob path** incomplete for historical V4 files.  
8. **Dependency advisories** (multer / path-to-regexp) before upload-heavy production traffic.  
9. **Doc drift** (ARCHITECTURE + old church Stitch inventory) risks wrong operator actions.

---

## 12. Exact recommended execution order

### Phase 1 — Repository cleanup and commits

1. Keep working tree clean (already).  
2. Fix doc drift: ARCHITECTURE portal 503 claim; note V5 route map vs church inventory.  
3. Fix stale branch-admin / member dashboard cards to link live modules.  
4. Optional: commit this audit doc only when requested.  
5. Do **not** merge visual Stitch work into the same commit as migrate tooling.

### Phase 2 — Hosted database migrations

1. Confirm V5 Supabase project ≠ V4.  
2. `db:bootstrap:foundation` or `db:migrate` + identity.  
3. `db:status` must show platform **013**, blessboard **025**.  
4. `db:verify:foundation` green.

### Phase 3 — Tenant provisioning

1. Provision platform org + domain + BlessBoard church/branches.  
2. Create platform_admin + HQ/branch users via CLI.  
3. Optional demo tenants only if `DEPLOYMENT_ENV=testing`.

### Phase 4 — Routing shadow verification

1. Keep `BLESSBOARD_TENANT_ROUTING_MODE=off`; redeploy if needed.  
2. Switch to `shadow`; hit tenant host; confirm logs; HTML still foundation.  
3. Only then `authoritative` for **one** demo host.

### Phase 5 — Stitch public website

1. Implement tenant public pages to approved Stitch desktop+mobile.  
2. Separately implement apex marketing screens (approved BlessBoard titles).  
3. Publish real content via content admin; verify noindex for testing.

### Phase 6 — Stitch authentication screens

1. Restyle apex + tenant login/register to Stitch.  
2. Defer forgot-password / waiting-verification unless product prioritizes.

### Phase 7 — Stitch member portal

1. Restyle `/member*` shells and modules already backed by services.  
2. Decide member giving / prayer (implement or remove cards).

### Phase 8 — Stitch branch admin

1. Restyle shells; wire dashboard to real module links.  
2. Defer missing directories (duty roster, member directory) explicitly.

### Phase 9 — Stitch HQ

1. Restyle `/hq*` and reports/audit.  
2. Defer Stitch-only analytics/broadcast/permissions.

### Phase 10 — Platform administration

1. Restyle `/admin*`.  
2. Keep org create as CLI unless product adds UI (screen 64).

### Phase 11 — Legacy data migration rehearsal

1. Hosted dry-run with `V4_SOURCE_*` / `V5_TARGET_*`.  
2. Close mapping decisions M4–M14.  
3. Media blob strategy.  
4. Apply only in maintenance window with `--confirm`.

### Phase 12 — Supervised cutover

1. Backups + sign-off table.  
2. Authoritative production tenants.  
3. Monitor 5xx; rollback = `BLESSBOARD_TENANT_ROUTING_MODE=off` + V4 DNS if needed.  
4. No V5→V4 reverse write.

---

## 13. Exact next Cursor prompt

```text
Phase 1 only — BlessBoard V5 repository cleanup after reconciliation audit.

Do not deploy. Do not connect to hosted Supabase. Do not implement Stitch visuals yet.

1. Update docs/database/ARCHITECTURE.md so it no longer claims member/CMS/HQ/branch
   portals are controlled 503 under V5 foundation; document actual v5FoundationServer
   mounts and BLESSBOARD_TENANT_ROUTING_MODE gates.
2. Add a short V5 route map note to docs/blessboard-stitch-screen-inventory.md (or a
   new docs/blessboard-v5-stitch-route-map.md) clarifying V4 church paths vs V5 paths
   (/branch-admin, /member, /hq, apex marketing).
3. Fix stale UI: branch-admin dashboard and member dashboard must link modules that
   already have routes (announcements, attendance, giving admin, forms, etc.) and
   only mark truly missing modules as Not enabled.
4. Keep changes minimal; no new features; bump public CSS ?v= only if CSS changes.
5. Stop and summarize files changed; do not commit unless asked.
```

---

## 14. Suggested commit sequence

Only when the user asks to commit:

1. `docs: V5 implementation and Stitch reconciliation audit` — this file (+ ARCHITECTURE/route-map doc fixes).  
2. `fix: align V5 admin/member dashboard module links with live routes` — UI honesty only.  
3. *(Later, separate PRs)* Stitch public → auth → member → branch → HQ → platform.  
4. *(Operator)* Hosted migrate/provision — no app commit required.  
5. *(Later)* V4→V5 migration apply reports — docs only unless tooling bugs found.

Do **not** combine schema, Stitch CSS, and cutover runbook edits in one commit.

---

## Appendix A — Package scripts added for V5

Migrate/provision: `db:*`, `platform:tenant:provision`, `blessboard:church:provision`, `blessboard:user:create`, `blessboard:user:role:assign`, `migrate:v4-to-v5:*`  
Tests: all `test:platform:*`, `test:blessboard:*`, `test:v5:*`, `test:migration:*`, `test:db:foundation`, `test:db:bootstrap-foundation`

## Appendix B — Stitch project facts

| Field | Value |
|-------|--------|
| Title | GetPro Church Platform |
| ID | `17124191473876947591` |
| MCP screens returned | 196 |
| Project screenInstances | 217 |
| Last project updateTime | 2026-07-12T17:51:28Z |
| Other Stitch projects present | EcclesiaHub, Moovex, GetProShops, etc. — **out of scope** |

---

*End of audit.*
