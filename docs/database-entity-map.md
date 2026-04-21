# Database entity map (implementation-grounded)

PostgreSQL is the **only** runtime data store. Migrations live in `db/postgres/*.sql`; the app also runs **`ensure*`** DDL helpers on boot (`server.js`). Canonical tenant IDs and slugs are documented in [DATA_MODEL.md](./DATA_MODEL.md).

This file focuses on **business meaning**, **who mutates**, and **which flows read** each group. Table names match `public.*` in migrations.

---

## Tenants & regional configuration

| Entity | Tables | Primary identifier | Important fields / states |
|--------|--------|-------------------|---------------------------|
| **Tenant (region)** | `tenants` | `id`, `slug` | `name`, `stage` (`PartnerCollection` / `Enabled` / `Disabled`), default locale, theme |
| **Tenant phone rules** | `tenant_phone_rules` (via `ensureTenantPhoneRulesSchema`) | `tenant_id` | Regex, normalization mode, strict validation — drives `phoneRulesService` |
| **Tenant commerce** | `tenant_commerce_settings` | `tenant_id` | Currency display, field-agent commission %, SP rating thresholds, etc. |
| **Tenant cities (directory/join)** | `tenant_cities` | `id`, scoped by `tenant_id` | `enabled`, `big_city` — join UX + intake city allowlists |
| **Directory option lists** | tables from `012_tenant_directory_option_lists.sql` | tenant-scoped | Whitelists for services landing / search |

| Creates / updates | Flows reading |
|-------------------|---------------|
| Super admin (`/admin/super`); boot migrations | All tenant-scoped queries; public host routing |

| Relationships | Lifecycle |
|---------------|-----------|
| Parent of all `tenant_id` FKs | Disabling stage hides public routes (except sign-in hub / field-agent per `server.js` order) |

| Governance | |
|------------|--|
| Non-canonical tenants may be deleted by one-time migrations; super admin manages additional regions. | |

---

## Admin identity & RBAC

| Entity | Tables | Identifier | Notes |
|--------|--------|------------|-------|
| **Admin user** | `admin_users` | `id`, `username` | `role`, `tenant_id` (null for super_admin), `enabled`, password hash |
| **Membership** | `admin_user_tenant_roles` | `(admin_user_id, tenant_id)` | Per-region role for multi-region managers |

| Creates / updates | Flows |
|-------------------|-------|
| Super admin global user forms; tenant managers (`/admin/users`) for regional users | Every `requireAdmin` route |

| Governance | |
|------------|--|
| Disabled users fail authentication (`adminRowDisabled`). | |

---

## Field agents & submissions

| Entity | Tables | Identifier | Status / fields |
|--------|--------|------------|-----------------|
| **Field agent account** | `field_agents` | `id` | `username` per tenant, display name |
| **Provider submission** | `field_agent_provider_submissions` | `id` | Moderation status (`pending`, `approved`, `rejected`, `info_needed`, `appealed`, …), commission fields, address snapshot, photos JSON |
| **Callback lead** | `field_agent_callback_leads` | `id` | Separate from provider pipeline |
| **Submission audit** | `field_agent_submission_audit` | append-only | Analytics / corrections |
| **Website listing draft** | columns / tables per `044_*` migration | linked to submission | Draft website content for review |

| Creates / updates | Flows |
|-------------------|-------|
| Agents: signup, add-contact, resubmit APIs | Field agent UI; CRM + analytics; pay-run builders |

| Relationships | |
|---------------|--|
| Submission → `field_agent_id`; may link to `crm_tasks` via `source_type` / `source_ref_id` | |

---

## Field-agent pay & finance (migrations 020+)

| Entity group | Representative tables | Meaning |
|--------------|----------------------|---------|
| Pay runs | `field_agent_pay_runs`, `field_agent_pay_run_items` | Locked/approved/paid lifecycle; amounts per agent |
| Payments ledger | `field_agent_pay_run_payments` (+ metadata / uniqueness migrations) | Recorded payouts, reversals, corrections |
| Disputes / adjustments | `field_agent_pay_run_disputes`, `field_agent_pay_run_adjustments` | Agent disputes; admin adjustments |
| Snapshots / history | `field_agent_pay_run_snapshots`, `field_agent_pay_run_status_history` | Statements / audit |
| Payout batches | `field_agent_payout_batches` + links | Group pay runs for banking |
| Accounting periods | `accounting_periods` | Soft-close / lock interactions |
| Finance audit | `field_agent_payout_finance_audit`, `finance_override_events` | CFO/finance tooling |

| Creates / updates | Flows |
|-------------------|-------|
| Tenant manager / super / finance roles via admin pay-run modules | Admin pay UI; field agent statements PDF/HTML |

---

## Directory & marketplace content

| Entity | Tables | Notes |
|--------|--------|-------|
| **Category** | `categories` | Per-tenant slug uniqueness |
| **Company listing** | `companies` | Profile, subdomain, flags (`listing_disabled`, featured/premium migrations), optional `account_manager_field_agent_id` linkage |
| **Public lead** | `leads` + `lead_comments` | Company contact requests from `/api/leads` |
| **Join signup** | `professional_signups` | Join flow API |
| **Callback interest** | `callback_interests` | Marketing callbacks / waitlist |
| **Review** | `reviews` | Public company ratings; tied to `company_id` |

---

## CRM

| Entity | Tables | Notes |
|--------|--------|-------|
| **Task** | `crm_tasks` | `status`, `owner_id`, `source_type`, `source_ref_id` |
| **CSR FIFO** | `crm_csr_fifo_state` | Round-robin assignment helper |
| **Comments / audit** | `crm_task_comments`, `crm_audit_logs` | Activity history |

---

## Intake, assignment, portal

| Entity | Tables | Notes |
|--------|--------|-------|
| **Client** | `intake_clients` | Phone normalization, client codes |
| **Project** | `intake_client_projects` | Status lifecycle (`draft` → `ready_to_publish` / `needs_review` → published, etc. — verify in repo enums) |
| **Project images** | `intake_project_images` | Stored files referenced by path |
| **Assignments** | `intake_project_assignments` | Links project to `company_id`, status for portal |
| **OTP** | `intake_phone_otp` | Admin intake verification |
| **Deal reviews** | `intake_deal_reviews` | End-client star/text reviews post-completion |
| **Portal credits** | `company_portal_credit_accounts`, `company_portal_credit_ledger_entries` | Balance + ledger for lead acceptance |

| Creates / updates | Flows |
|-------------------|-------|
| Admin intake; anonymous client portal; company actions | Company portal; CRM optional |

---

## Provider portal identity

| Entity | Table | Notes |
|--------|-------|-------|
| **Company personnel** | `company_personnel_users` | Login for `/company` and `/provider` |

---

## Content CMS

| Entity | Table | Notes |
|--------|-------|-------|
| **Content page** | `content_pages` | Kind (`article` / `guide` / `faq` / `eula`), locale, publish state |

---

## Sessions

| Entity | Table | Notes |
|--------|-------|-------|
| **Express session** | `session` | `connect-pg-simple`; cookie `getpro_sid` |

---

## Cross-flow read map (summary)

| Flow | Primary tables |
|------|----------------|
| Public directory | `tenants`, `categories`, `companies`, `reviews`, `tenant_cities` |
| Public API | `leads`, `professional_signups`, `callback_interests`, `companies` |
| Admin directory | same + `crm_tasks` (on convert) |
| CRM | `crm_tasks`, comments, audit, linked submissions |
| Intake | `intake_*`, `company_personnel_users`, assignments |
| Field agent | `field_agents`, `field_agent_*`, `companies` (linkage), commerce |
| Pay / finance | `field_agent_pay_*`, accounting periods, finance audit |

---

## Data quality & governance concerns (observed)

1. **Multi-tenant isolation:** Every query must filter `tenant_id`; cross-tenant bugs are security issues.
2. **Phone normalization:** Inconsistent normalization breaks duplicate detection — rules are per-tenant.
3. **Session table growth:** PostgreSQL session store requires periodic maintenance on high traffic.
4. **Pay-run immutability:** Soft-close and accounting period locks are enforcement layers — test finance roles carefully.
5. **Client portal anonymity:** Reviews are gated by **phone + project code** logic, not auth — social engineering risk is a product decision.

For historical naming and migration commentary, see [DATA_MODEL.md](./DATA_MODEL.md).
