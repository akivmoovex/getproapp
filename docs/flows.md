# GetPro — flows (implementation-grounded)

Each section ties to **routes, views, and code behavior** in this repository. “Partial” means the UI or data model exists but product scope is intentionally narrow.

---

## A. Public / marketplace

| Item | Detail |
|------|--------|
| **Purpose** | Let visitors discover services, open company profiles, read content, and start join/lead journeys. |
| **Users** | Unauthenticated visitors on regional hosts (`server.js` tenant attach + `Enabled` stage gate for most public routes). |
| **Main screens** | `views/` templates: home, `directory`, `join`, `company`, `category`, services landing, `articles` / `guides` / `answers`, `about`, `terms`, `coming_soon_il` (conditional). |
| **Main actions** | Browse; submit forms that POST to `/api/*` (join signup, callback, company lead). |
| **Rules visible in code** | Tenant stage must be `Enabled` for public router after field-agent mount (`server.js`). Israel may be short-circuited to coming soon (`public.js`). Phone validation uses per-tenant phone rules where applicable (`phoneRulesService`). |
| **Outputs** | HTML pages; JSON OK responses from API routes; CRM tasks created from API events (`createCrmTaskFromEvent`). |
| **Dependencies** | `tenants`, `categories`, `companies`, `content_pages`, `reviews`, `tenant_cities`, etc. |
| **Gaps** | Company **marketing subdomain** only serves `GET /` (mini-site); deeper paths 404. |

---

## B. Field agent

| Item | Detail |
|------|--------|
| **Purpose** | Recruit service providers: submit structured applications with photos; track status; request callbacks; view earnings statements. |
| **Users** | Field agents (`field_agents` table), session `requireFieldAgent` (`src/auth/fieldAgentAuth.js`). |
| **Main screens** | `views/field_agent/*`: signup, login, dashboard, add_contact, edit_submission, statements, disputes, adjustments, callback, FAQ/support/about. |
| **Main actions** | Signup/login/logout; add contact with duplicate phone check (`/field-agent/api/check-phone`, submit); resubmit/edit; website listing draft APIs; disputes; callback form. |
| **Rules visible in code** | Required identity/address fields (`fieldAgentProviderCoreFieldsMissing` in `fieldAgent.js`); duplicate detection vs submissions + companies/signups; file count/size limits (`multer`, `MAX_IMAGE_BYTES`); rate limits on login and authed POSTs (`authRateLimit.js`). |
| **Outputs** | Rows in `field_agent_provider_submissions`, `field_agent_callback_leads`; CRM tasks via moderation pipeline; pay run line items when approved (downstream). |
| **Dependencies** | Tenant phone rules; categories; commerce settings for dashboard metrics. |
| **Gaps** | None flagged as “stub” in routes — scope is large; operational complexity is in pay/finance modules. |

---

## C. Service provider / company portal

| Item | Detail |
|------|--------|
| **Purpose** | Let verified company users see **assigned intake leads**, act on them (accept/decline/complete per implementation), download project images, preview mini-site. |
| **Users** | `company_personnel_users` authenticated via `companyPortal.js`. |
| **Main screens** | `views/company_login.ejs`, `company_leads.ejs`, lead detail template, mini-site view. |
| **Main actions** | Login/logout; list leads by scope; open detail; POST review/action endpoints; download file. |
| **Rules visible in code** | Lead **credit** balance may block acceptance (`companyPortalLeadCredits.js`); login rate limit + lockout message. |
| **Outputs** | Assignment status updates; deal review rows; ledger entries when acceptance debits credits (see intake deal modules). |
| **Dependencies** | `intake_project_assignments`, companies, intake projects/images. |
| **Gaps** | Full contract/workflow documentation lives in code paths (`nextAssignmentStatusFromCompanyAction`); treat edge cases as **verify in QA**. |

---

## D. End-client portal

| Item | Detail |
|------|--------|
| **Purpose** | **Foundation:** allow clients to submit a new “deal” (intake project) with photos, and optionally submit a **star review** after closure. |
| **Users** | Unauthenticated visitors (`clientPortal.js` — no `requireClientAuth`). |
| **Main screens** | `client_login.ejs` (informational redirect hub), `client_deal_new.ejs`, `client_deal_success.ejs`, `client_deal_review.ejs`. |
| **Main actions** | `GET /client/deals/new` → `POST /client/deals` (multipart); `GET/POST /client/review`. |
| **Rules visible in code** | City must be in tenant city list; category must belong to tenant; phone validated; publish readiness sets status `ready_to_publish` vs `needs_review` (`validateIntakeProjectForPublishAsync`). |
| **Outputs** | `intake_clients`, `intake_client_projects`, `intake_project_images`; reviews in `intake_deal_reviews` (or related per repo). |
| **Dependencies** | Intake schema, categories, phone rules. |
| **Gaps** | **No client login or account management**; `/client/login` is not a credential gate in the route module. |

---

## E. Admin core

| Item | Detail |
|------|--------|
| **Purpose** | Staff dashboard, navigation, login, multi-region scope for super admins and multi-membership users. |
| **Users** | `admin_users` + optional `admin_user_tenant_roles`. |
| **Main screens** | `admin/dashboard`, `admin/login`, `getpro_admin` entry, `settings_hub`, `content_*`, `tenant_settings_*`. |
| **Main actions** | Login/logout; `POST /admin/tenant-scope` switches tenant for multi-region users (`admin.js`). |
| **Rules visible in code** | `requireAdmin` for all non-login routes; viewers redirected from `/admin/categories`, `/admin/companies`, `/admin/cities` to `/admin/leads`. |
| **Outputs** | Session updates; scoped queries via `getAdminTenantId`. |
| **Dependencies** | All tenant-scoped tables. |
| **Gaps** | — |

---

## F. Directory management

| Item | Detail |
|------|--------|
| **Purpose** | Maintain categories, cities, companies, legacy **leads** list, **partner signups** conversion. |
| **Users** | Roles with `canEditDirectoryData`; categories restricted to `canManageServiceProviderCategories` (`adminDirectory.js`, `auth/index.js`). |
| **Main screens** | Admin directory views under `views/admin/` (categories, cities, companies, leads, partner signups). |
| **Main actions** | CRUD categories/cities/companies; publish company; convert signup; edit lead. |
| **Rules visible in code** | Featured/premium flags require `requireManageDirectoryFeaturedFlags` (tenant manager / super admin). Viewers cannot POST (`requireNotViewer`). |
| **Outputs** | Mutations on `categories`, `tenant_cities`, `companies`, `leads`, `professional_signups`. |
| **Dependencies** | Tenant scope; optional field-agent linkage fields on companies (manager-only mutation — `canMutateCompanyFieldAgentLinkage`). |
| **Gaps** | — |

---

## G. CRM

| Item | Detail |
|------|--------|
| **Purpose** | Task board for operational follow-up (claims, status, comments, reassign); moderation hooks for field-agent submissions. |
| **Users** | Roles with `canAccessCrm` (excludes `end_user`, finance roles). CSR sees **scoped** tasks only (`adminCrm.js`). |
| **Main screens** | `admin/crm` list, task detail, slide panel. |
| **Main actions** | Create task (internal), claim, status transitions, comments, reassign (super), field-agent approve/reject/info-needed/appeal/commission posts when task linked. |
| **Rules visible in code** | Mutations require `canMutateCrm` + ownership (or super); claim requires `canClaimCrmTasks` + pool rules. |
| **Outputs** | `crm_tasks`, `crm_task_comments`, `crm_audit_logs`; submission status changes. |
| **Dependencies** | FIFO CSR state (`crm_csr_fifo_state`) per migrations. |
| **Gaps** | — |

---

## H. Content management

| Item | Detail |
|------|--------|
| **Purpose** | Manage localized articles, guides, FAQs, EULA content shown on public routes. |
| **Users** | `canManageArticles` → **super_admin** and **tenant_manager** only (`roles.js`). |
| **Main screens** | `admin/content`, `admin/content_form`, list with kind filter. |
| **Main actions** | Create/edit/publish/delete content pages. |
| **Rules visible in code** | `requireContentManager` on writes; viewers can read list/detail per route registration but not mutate. |
| **Outputs** | `content_pages` rows. |
| **Dependencies** | Locale/kind schema (`ensureContentLocaleSchema`, `ensureEulaKindSchema`). |
| **Gaps** | — |

---

## I. Tenant settings

| Item | Detail |
|------|--------|
| **Purpose** | Regional contact info, phone validation/normalization rules, commerce fields used by intake/field agent. |
| **Users** | `canAccessTenantSettings` → super admin + tenant manager (`adminDashboardContent.js`). |
| **Main screens** | `admin/settings` hub, `admin/tenant_settings_list` (super), `admin/tenant_settings_detail`. |
| **Main actions** | Update phones/email; optional phone regex / normalization mode; commerce numeric fields (see form POST handler). |
| **Rules visible in code** | Non-super users may only edit **their** `tenant_id` row. |
| **Outputs** | `tenants` contact columns; `tenant_phone_rules` / commerce tables per repos. |
| **Dependencies** | `phoneRulesRepo`, `tenantCommerceSettingsRepo`. |
| **Gaps** | — |

---

## J. Field agent analytics

| Item | Detail |
|------|--------|
| **Purpose** | Reporting drill-downs on submissions and callback leads; exports; saved presets; selective bulk actions. |
| **Users** | Same gate as CRM read: `canAccessCrm` (`adminFieldAgentAnalytics.js`). Corrections require `canCorrectFieldAgentSubmissions` (manager/super). |
| **Main screens** | `field-agent-analytics` EJS templates under `views/admin/`. |
| **Main actions** | Filters, CSV export (limits via env), bulk mutate (CRM mutate role), per-row correction POST. |
| **Rules visible in code** | Observability middleware `faAnalyticsObs.endpointMiddleware()`; export row caps `FA_ANALYTICS_EXPORT_MAX_ROWS`. |
| **Outputs** | Reads analytics tables/repos; corrections update submissions + audit (`fieldAgentSubmissionAuditRepo`). |
| **Dependencies** | Submissions + callback lead repos. |
| **Gaps** | Operational tuning per `docs/field-agent-analytics-runbook.md`. |

---

## K. Intake / lead distribution

| Item | Detail |
|------|--------|
| **Purpose** | Create clients/projects in admin or client portal; validate; publish; allocate to companies; track assignments and deal fees. |
| **Users** | Admin: roles with intake **access** (`canAccessClientProjectIntake`); mutations require `canMutateClientProjectIntake` (excludes viewers). End client: anonymous. |
| **Main screens** | Admin: `project-intake/*`, `projects`, `projects/:id`. Client: `client_deal_*`. |
| **Main actions** | Search/create client; create project; upload images; OTP send/verify (admin); publish; assign companies; company portal actions. |
| **Rules visible in code** | Price estimation visibility `canViewIntakePriceEstimation`; tenant-wide progress `canViewTenantWideLeadProgress`; validation before publish. |
| **Outputs** | Intake tables; assignments; CRM tasks optional; portal credit ledger. |
| **Dependencies** | Categories, cities, companies, commerce settings. |
| **Gaps** | Full allocation algorithm details in `intakeProjectAllocation` — treat as **read code for edge cases**. |

---

## L. Tenant user management

| Item | Detail |
|------|--------|
| **Purpose** | CRUD admin users for a tenant (non-super). |
| **Users** | `canManageTenantUsers` (super admin + tenant manager). |
| **Main screens** | `/admin/users`, new, edit. |
| **Main actions** | Create/update/disable users; memberships via `admin_user_tenant_roles` when applicable. |
| **Rules visible in code** | `requireManageUsers` + `requireNotViewer` on mutating routes. |
| **Outputs** | `admin_users`, `admin_user_tenant_roles`. |
| **Gaps** | — |

---

## M. Super admin

| Item | Detail |
|------|--------|
| **Purpose** | Manage tenants (except `global` deletion rules in code), global admin users, session **scope** to act as a region, raw DB fixture tools. |
| **Users** | `super_admin` role only for `/admin/super`, `/admin/db`, `/admin/finance/*`. |
| **Main screens** | `super` console, `db_tools`, finance summary/CFO views. |
| **Main actions** | Tenant CRUD; stage changes; create/edit super or regional admins; `POST /admin/super/scope`; seed/clear demo data (when enabled). |
| **Rules visible in code** | `requireSuperAdmin` middleware; JSON CSRF-ish guards on destructive DB tools (`adminDbTools.js`). |
| **Outputs** | `tenants`, `admin_users`, membership rows; demo reset scripts affect listed tables only (see `db_tools.ejs` text). |
| **Gaps** | Fixture endpoints must stay **disabled in production** per env (see `blockWhenDbFixturesDisabled` in `adminDbTools.js`). |
