# Route-to-screen audit (implementation)

Paths are **Express routes** as registered in code. On production, the **Host** header selects `req.tenant` (`createAttachTenantByHost`). Regional URLs typically omit a path prefix (e.g. `zm.example.com/directory`); legacy **`/{region}/...`** path prefixes **redirect** to subdomains (`server.js`).

**Legend:** Auth = what the route checks first. “Side effects” are primary writes; not every validation branch is listed.

---

## `src/routes/public.js` (mount: `/`)

Mounted **after** field-agent, client, and provider routers on the same app; still subject to tenant `Enabled` gate **after** field-agent (`server.js` order).

| Method | Route | Purpose | View / response | Auth | Role | Side effects | Success | Key failures |
|--------|-------|---------|-----------------|------|------|--------------|---------|--------------|
| GET | `/` | Regional home | `index` | Tenant from host | — | Cache read | 200 HTML | 503 if tenant disabled (outer middleware) |
| GET | `/data/tenant-search-lists.json` | JSON option lists for search UI | JSON | Tenant | — | — | 200 JSON | — |
| GET | `/data/search-suggestions.json` | Autocomplete suggestions | JSON | Tenant | — | — | 200 | — |
| GET | `/directory` | Directory browse | `directory` | Tenant | — | DB read | 200 | — |
| GET | `/services/:categorySlug/:citySlug` | Services landing (category + city) | `directory` (specialized locals) | Tenant | — | DB read | 200/404 | Invalid slug handling |
| GET | `/category/:categorySlug` | Category page | `category` | Tenant | — | DB read | 200 | — |
| GET | `/company/:id` | Company profile | `company` | Tenant | — | DB read | 200/404 | Missing company |
| GET | `/join` | Partner join flow page | `join` | Tenant | — | — | 200 | IL coming soon may short-circuit |
| GET | `/ui-demo`, `/ui` | Design / UI demos | demo templates | Tenant | — | — | 200 | — |
| GET | `/sitemap.xml` | SEO sitemap | XML | Tenant | — | — | 200 | — |
| GET | `/robots.txt` | Crawlers | text | Tenant | — | — | 200 | — |
| GET | `/about` | About content page | content render | Tenant | — | `content_pages` | 200 | — |
| GET | `/terms` | Terms / EULA | content render | Tenant | — | `content_pages` | 200 | — |
| GET | `/articles`, `/guides`, `/answers` | Content indexes | listing templates | Tenant | — | DB read | 200 | — |
| GET | `/articles/:slug`, `/guides/:slug`, `/answers/:slug` | Content detail | article-like templates | Tenant | — | DB read | 200/404 | — |
| GET | `/:miniSiteSlug` | Company mini-site by slug | company/public mini-site | Tenant | — | DB read | 200/404 | Reserved segments excluded |

**Join / lead submissions** from the public site use **`POST /api/*`** (see API section), not `public.js` POST routes.

---

## `src/routes/api.js` (mount: `/api`)

| Method | Route | Purpose | View | Auth | Role | Side effects | Success | Key failures |
|--------|-------|---------|------|------|------|--------------|---------|--------------|
| POST | `/api/leads` | Company contact form API | JSON | Implicit tenant from `company_id` | — | Insert `leads`, CRM task | `{ ok: true }` | 400 missing company_id; 404 company; 403 IL gate |
| POST | `/api/professional-signups` | Join signup API | JSON | `resolveTenantIdStrict` body | — | Insert signup, CRM task | `{ ok: true }` | 400 validation; 403 IL |
| POST | `/api/callback-interest` | Callback / waitlist capture | JSON | Tenant strict resolver | — | Insert `callback_interests`, CRM task | `{ ok: true }` | 400/403 |
| GET | `/api/debug/host` | Debug host routing | JSON | — | — | — | 200 | Only if `DEBUG_HOST=1` |
| GET | `/api/debug/pg-ping` | DB ping | JSON | — | — | — | 200/503 | Only if `GETPRO_PG_HEALTH_ROUTE=1` |

---

## `src/routes/fieldAgent.js` (mount: `/` — no prefix)

All routes require `req.tenant` or **404** “Region not found.”

| Method | Route | Purpose | View / response | Auth | Role | Side effects | Success | Key failures |
|--------|-------|---------|-----------------|------|------|--------------|---------|--------------|
| GET | `/field-agent/signup` | Registration form | `field_agent/signup` | — | — | — | 200/302 if session | — |
| POST | `/field-agent/signup` | Create agent | render or redirect | Rate limit | — | Insert `field_agents`, set session | 302 dashboard | 400 validation |
| GET/POST | `/field-agent/login` | Login | `field_agent/login` | POST rate limit | — | Session | 302 | 400 bad creds |
| POST | `/field-agent/logout` | Logout | redirect `/` | — | — | Clear FA session | 302 | — |
| GET | `/field-agent/dashboard` | Metrics dashboard | `field_agent/dashboard` | `requireFieldAgent` | — | DB aggregates | 200 | 302 login |
| GET | `/field-agent/submissions/:id/edit` | Edit submission | `field_agent/edit_submission` | FA | — | DB read | 200 | 404 |
| GET | `/field-agent/submissions/:id/website-content` | Website listing editor shell | EJS | FA | — | DB read | 200 | — |
| GET | `/field-agent/statements*` | Statements list/detail/download | `field_agent/statements*` | FA | — | Pay-run reads | 200/PDF | 404 |
| GET | `/field-agent/adjustments`, `/field-agent/disputes` | Pay adjustments/disputes | EJS | FA | — | DB read | 200 | — |
| POST | `/field-agent/statements/:payRunId/disputes` | Open dispute | redirect/flash | FA + POST limit | — | Insert dispute | 302 | Validation |
| GET | `/field-agent/api/*` | JSON for dashboard modals | JSON | FA | — | Read | 200 | — |
| POST/PATCH | `/field-agent/api/submissions/*` | Draft/reply/resubmit | JSON | FA + POST limit | — | Update submissions, files | 200 JSON | 400 |
| GET | `/field-agent/add-contact` | Provider lead form | `field_agent/add_contact` | FA | — | — | 200 | — |
| POST | `/field-agent/api/check-phone` | Duplicate check | JSON | FA + POST limit | — | Read | 200 | 400 invalid phone |
| POST | `/field-agent/add-contact/submit` | Submit provider lead | redirect/JSON | FA + multipart + limit | — | Insert submission, uploads, CRM | 302/JSON | 400 dup / files |
| GET/POST | `/field-agent/call-me-back` | Callback request | `field_agent/callback` | FA; POST limited | — | Insert callback lead | 200/302 | Validation |
| GET | `/field-agent/faq`, `/support`, `/about` | Static consoles | `field_agent/static_*` | FA | — | — | 200 | — |

---

## `src/routes/companyPortal.js` (mount: `/company` and `/provider`)

`req.baseUrl` distinguishes UI copy; same router. **404** if no tenant.

| Method | Route | Purpose | View | Auth | Side effects | Success | Key failures |
|--------|-------|---------|------|------|--------------|---------|--------------|
| GET | `.../login` | Login form | `company_login` | — | — | 200 | — |
| POST | `.../login` | Authenticate | redirect | Rate limit | Session set | 302 `/leads` | 302 + error query |
| POST | `.../logout` | Logout | redirect login | — | Clear session | 302 | — |
| GET | `.../` | Root | redirect `/leads` | Company session | — | 302 | — |
| GET | `.../leads` | Lead inbox | `company_leads` | `requireCompanyPersonnelAuth` | Read assignments | 200 | — |
| GET | `.../leads/:id` | Lead detail | detail template | Auth | May trigger allocation side effects | 200 | 404 |
| POST | `.../leads/:id/review` | Client review action | redirect | Auth | Updates review/assignment | 302 | — |
| POST | `.../leads/:id/action` | Accept/decline/etc. | redirect | Auth | Status + credits | 302 | 400/redirect error |
| GET | `.../project-files/:id` | Download image | file stream | Auth | — | 200 file | 404 |
| GET | `.../minisite` | Preview listing | render | Auth | — | 200 | — |

---

## `src/routes/clientPortal.js` (mount: `/client`)

| Method | Route | Purpose | View | Auth | Side effects | Success | Key failures |
|--------|-------|---------|------|------|--------------|---------|--------------|
| GET | `/client/login` | Hub / notice | `client_login` | — | — | 200 | — |
| GET | `/client/` | Redirect | — | — | — | 302 `/login` | — |
| GET | `/client/deals/new` | New deal form | `client_deal_new` | — | — | 200 | — |
| POST | `/client/deals` | Submit deal + images | `client_deal_success` or redirect err | — | Client/project/images | 200 render | redirect error query |
| GET | `/client/review` | Review form | `client_deal_review` | — | — | 200 | — |
| POST | `/client/review` | Submit review | redirect | — | Insert review | 302 | redirect error |

---

## `src/routes/admin.js` aggregate (mount: `/admin`)

Shared behavior: `requireAdmin` except `/admin/login`; `adminAuth` registers `/admin` root redirect and login. See sub-modules below.

---

### `adminAuth.js`

| Method | Route | Purpose | View | Auth |
|--------|-------|---------|------|------|
| GET | `/admin` | Redirect | — | — |
| GET/POST | `/admin/login` | Admin login | `admin/login` | POST `adminLoginLimiter` |
| POST | `/admin/logout` | Logout | redirect | Session |

---

### `adminDashboardContent.js`

| Method | Route | Purpose | View | Guards |
|--------|-------|---------|------|--------|
| GET | `/admin/dashboard` | Metrics | `admin/dashboard` | Logged in |
| GET | `/admin/settings` | Settings hub | `admin/settings_hub` | `canAccessSettingsHub` |
| GET/POST | `/admin/content*` | CMS | `admin/content`, `admin/content_form` | List: admin; writes: `requireContentManager` |
| GET/POST | `/admin/settings/tenants` | Tenant list (super) or redirect | `admin/tenant_settings_list` | `canAccessTenantSettings` + super check |
| GET/POST | `/admin/settings/tenant/:id` | Tenant detail save | `admin/tenant_settings_detail` | Tenant settings + scope |

---

### `adminDirectory.js`

| Method | Route | Purpose | View | Guards |
|--------|-------|---------|------|--------|
| * | `/admin/categories*` | Category CRUD | admin category views | `requireServiceProviderCategoryAdmin` |
| * | `/admin/cities*` | Cities CRUD | admin city views | `requireDirectoryEditor` |
| * | `/admin/companies*` | Companies workspace | admin company views | `requireDirectoryEditor`; featured POST `requireManageDirectoryFeaturedFlags` |
| GET | `/admin/leads` | Leads list | admin leads | Any logged-in (viewers ok) |
| * | `/admin/leads/:id*` | Lead edit/update | admin | `requireDirectoryEditor` + `requireNotViewer` on POST |
| * | `/admin/partner-signups*` | Partner signup conversion | admin | `requireDirectoryEditor` |

---

### `adminCrm.js`

| Method | Route | Purpose | View | Guards |
|--------|-------|---------|------|--------|
| GET | `/admin/crm` | Board | `admin/crm` | `requireCrmAccess` |
| GET | `/admin/crm/tasks/:id` | Detail | task detail | `requireCrmAccess` + CSR scope |
| POST | `/admin/crm/tasks*` | Create/claim/status/move/reassign | redirect/JSON | `requireCrmAccess` + mutate rules in handler |
| POST | `/admin/crm/tasks/:id/field-agent-submission/*` | Moderation | redirect | Owner/super + mutate |
| POST | `/admin/crm/tasks/:id/comments` | Comment | redirect | mutate + owner/super |

---

### `adminIntake.js` (selected)

| Method | Route | Purpose | Guards |
|--------|-------|---------|--------|
| GET | `/admin/project-intake` | Intake home | `requireClientProjectIntakeAccess` |
| POST | `/admin/project-intake/search` | Client search | Access |
| GET/POST | `/admin/project-intake/clients*` | Create client | Access; POST + `requireClientProjectIntakeMutate` |
| GET/POST | `/admin/project-intake/project*` | Create project, uploads | Access + mutate for POSTs |
| GET | `/admin/project-intake/success` | Success | Access |
| GET/POST | `/admin/project-intake/otp/*` | Phone OTP | Access; mutate for POST |
| GET | `/admin/projects` | Pipeline | Access |
| GET/POST | `/admin/projects/:id` | Project detail + actions | Access; POST mutate rules |
| GET/POST | `/admin/companies/:id/portal-users` | Provider portal users | `requireDirectoryEditor` |

---

### `adminFieldAgentAnalytics.js`

| Method | Route | Purpose | Guards |
|--------|-------|---------|--------|
| GET | `/admin/field-agent-analytics` | Dashboard | `requireCrmAccess` |
| GET | `/admin/field-agent-analytics/drilldown/*` | Drill + exports | `requireCrmAccess`; correction POST `requireSubmissionCorrection` |
| POST | `/admin/field-agent-analytics/presets*` | Saved filters | `requireCrmAccess` |

---

### `adminFieldAgentPayRuns.js` (pattern)

| Method | Route | Purpose | Guards (typical) |
|--------|-------|---------|------------------|
| GET | `/admin/field-agent-pay-runs` | List | `requirePayRunBeyondFinanceViewer` |
| GET | `/admin/field-agent-pay-runs/finance-dashboard` | Finance summary | `requirePayRunAccess` |
| GET | `/admin/field-agent-pay-runs/:id/finance-detail` | Ledger | `requirePayRunAccess` |
| POST | `/admin/field-agent-pay-runs*` | Create/lock/approve/pay | `requirePayRunWorkflowWrite` or finer |
| POST | `.../payments/:id/reverse` | Reversal | `requirePayRunReverseCorrect` |
| POST | `.../mark-closed` | Soft close | `requirePayRunClose` |

*(Full route list in source; all use combinations of `requirePayRunAccess`, `requirePayRunBeyondFinanceViewer`, `requirePayRunWorkflowWrite`, etc.)*

---

### `adminFieldAgentPayoutBatches.js`

Batch lifecycle for payouts: GET list/detail; POST create, attach pay runs, complete, close — **`requirePayRunBeyondFinanceViewer`** / **`requirePayRunPayoutBatchWrite`** (see file).

---

### `adminFieldAgentBankReconciliation.js`

GET list; POST flags — `requirePayRunBeyondFinanceViewer` + write helper in file.

---

### `adminFieldAgentDisputes.js` & `adminFieldAgentAdjustments.js`

List/detail/status/update: **`requirePayRunAdmin`** (`canManageTenantUsers` only).

---

### `adminFieldAgentWebsiteListingReview.js`

GET/POST website listing moderation: **`requireDirectoryEditor`**.

---

### `adminTenantUsers.js`

`/admin/users*`: **`requireManageUsers`**, POST also **`requireNotViewer`**.

---

### `adminSuper.js`

`/admin/super*`: **`requireSuperAdmin`** on all routes.

---

### `adminFinanceCfo.js`

`/admin/finance/*`: **`requireSuperAdmin`** — global CFO dashboards and CSV exports.

---

### `adminDbTools.js`

`/admin/db*`: **`requireSuperAdmin`**; POST actions additionally **`blockWhenDbFixturesDisabled`**.

---

## Other app-level routes (`server.js`)

| Method | Route | Purpose | View | Auth |
|--------|-------|---------|------|------|
| GET | `/healthz` | Health | JSON | — |
| GET | `/getpro-admin` | Marketing entry to admin login | `getpro_admin` | Tenant resolved |
| GET | `/login` | Portal hub (admin / field agent entry) | `portal_login_hub` | Tenant |
| POST | `/admin/tenant-scope` | Switch region | redirect | Admin session |

---

## Quick failure-state index

| HTTP | Typical cause |
|------|----------------|
| 302 → `/admin/login` | Missing `req.session.adminUser` |
| 403 text | Role middleware (`requireSuperAdmin`, `requireDirectoryEditor`, pay-run finance gate, CRM gate) |
| 404 | Missing entity, wrong company on portal, bad id |
| 503 | Tenant not `Enabled` (public gate); DB health route |

For **exact** middleware on a single path, open the corresponding `src/routes/**` file — this audit summarizes recurring patterns.
