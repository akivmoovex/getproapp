# Release notes

## GetPro — version placeholder: 1.0.0+docs (update per ship)

**Repository:** `getpro` (Node ≥ 20, PostgreSQL mandatory).  
**Documentation refresh:** Product, flow, RBAC, route audit, entity map, QA script, and recommendations were aligned to **current code** in the same repository revision as this file.

---

### Release summary

This release documentation describes a multi-tenant marketplace and operations platform: **public site**, **admin console** (directory, CRM, intake, content, tenant settings, super-admin, field-agent operations, pay/finance), **field agent portal**, **company/provider portal**, and a **foundation-level end-client intake/review** path without authenticated client accounts.

---

### Major improvements by flow

| Flow | What is documented / verified in code |
|------|---------------------------------------|
| Public | Tenant `Enabled` gating, directory/join/content routes, `/api` lead pipelines into CRM |
| Field agent | Full route surface: signup, dashboard, add-contact with duplicate detection, statements, disputes, callbacks |
| Company portal | Login, scoped leads, actions, credit checks, file download |
| End-client | `/client/deals` and `/client/review` behaviors and validation |
| Admin | RBAC matrix from `src/auth/roles.js`; pay-run finance tiers; CRM CSR scoping |
| Super / finance | Super-only CFO/finance summary; DB tools guarded by env |

---

### New features (documentation)

- Central **product overview** (`docs/product-overview.md`).
- **Flow-based** guide (`docs/flows.md`).
- **Role matrix** (`docs/roles-and-permissions.md`).
- **Route-to-screen audit** (`docs/route-to-screen-audit.md`).
- **Entity map** (`docs/database-entity-map.md`).
- **QA script for non-technical testers** (`docs/qa-standard-test-script.md`).
- **Recommendations backlog** (`docs/recommendations.md`).

---

### Behavior changes

*No code behavior changes are introduced by documentation commits alone.* When this file ships alongside application changes, list them here from the actual diff (for example: “field agent POST rate limit tightened”).

---

### Role / permission changes

*Document only if the code release changes `src/auth/roles.js` or route guards.* Current implementation highlights:

- **Pay-run section** is limited to **super_admin**, **tenant_manager**, and **finance_*** roles (`canAccessPayRunSection`).
- **CRM and field-agent analytics read** require **`canAccessCrm`** — excludes `end_user` and finance-only roles.
- **Tenant viewers** are redirected from **companies/categories/cities** admin lists to **leads**.

---

### Admin changes

- Dashboard, directory, CRM, intake, content, settings, users, super console, DB tools, field-agent analytics, pay runs, payout batches, bank reconciliation, disputes, adjustments, website listing review — see `docs/route-to-screen-audit.md`.

---

### Field agent changes

- Refer to `src/routes/fieldAgent.js` and `docs/flows.md` section B; stabilization smoke notes may exist in `docs/FIELD_AGENT_POST_FIX_SMOKE.md`.

---

### Provider / company portal changes

- Router shared by `/company` and `/provider` (`server.js`); see `docs/flows.md` section C.

---

### Public-site changes

- `src/routes/public.js` covers home, directory, services landing, company/category pages, join page, content indexes, about/terms, sitemap/robots.

---

### Analytics / reporting

- **Field-agent analytics** under `/admin/field-agent-analytics` (CRM access gate; manager-only corrections).
- **Finance dashboards** split between tenant-scoped pay-run finance views and **super-only** `/admin/finance/*`.

---

### Bug fixes (traceable)

List here **only** when this release includes code fixes; cite issue/ticket or commit subject. Documentation-only releases: *N/A*.

---

### Known limitations / deferred items

- **End-client portal** has **no login or account dashboard** — forms only (`clientPortal.js`).
- **Company marketing subdomain** supports **only GET /** — other paths 404.
- **Israel** may be in “coming soon” mode via environment-driven checks.
- **Finance roles** do not receive CRM or directory access from `roles.js` alone.

---

### QA focus areas

1. **RBAC matrix** — especially finance_viewer vs pay-run list, and CSR vs pay runs (should not access).
2. **Field agent duplicate phone** — submissions vs companies/signups.
3. **Company portal credit block** when balance insufficient.
4. **Intake publish** — `ready_to_publish` vs `needs_review` when images missing.
5. **Multi-region admin** — `POST /admin/tenant-scope` updates visible data.

Use `docs/qa-standard-test-script.md` as the master checklist.

---

### Deployment / migration notes

- **PostgreSQL required** — workers exit if `DATABASE_URL` and `GETPRO_DATABASE_URL` are both missing (`server.js`).
- **Boot-time DDL** — `ensureFieldAgentSchema`, intake, CRM FIFO, pay-run schema, etc. (see `server.js` `ensure*` calls).
- **Sessions** — stored in `public.session` via `connect-pg-simple`.
- **Assets** — run `npm run build` so `/build/*` Vite assets exist in production if templates depend on them.
- **Environment** — see `docs/CONFIG_AND_DEPLOYMENT.md` and `src/startup/bootstrap.js` for production `.env` behavior.

---

## Operational expected results after release

After deployment, a healthy environment should exhibit the following **user-visible** behaviors:

| Flow | Expected |
|------|----------|
| Public visitor | Can browse enabled regional home, directory, and company pages; join and API forms reject invalid phones per regional rules. |
| Field agent | Can sign up, log in, log out; submit a provider lead with required photos and fields; duplicate phones are blocked with a clear message; callback form submits when authenticated. |
| Admin | Can log in; dashboard reflects scoped tenant; roles only open permitted screens (super admin can open `/admin/super`; viewers cannot mutate or open category admin). |
| CRM | Staff with CRM access see tasks; CSR users only see allowed tasks; mutations respect ownership rules. |
| Intake | Authorized staff can create clients/projects and publish per validation; viewers cannot create. |
| Company portal | Company users log in and see **only** their assignments; actions update status; file download works for authorized files. |
| End client | Can submit `/client/deals/new` with valid city/category/phone; can complete `/client/review` when business rules in code are satisfied. |
| Pay / finance | Tenant managers run pay workflows; finance_viewer sees finance dashboard/detail only; super admin can open global finance summary. |
| Super admin | Can manage tenants and global admin users; DB tools remain disabled when fixtures flag blocks them. |

---

### Release readiness checklist (operations)

| Item | Verify |
|------|--------|
| Migrations / boot DDL | App starts without schema errors; logs show healthy DB URL. |
| Assets / build | `/build/*` assets load; no mass 404 on JS/CSS. |
| Role testing | Sample accounts for manager, CSR, viewer, finance_viewer exercised. |
| Smoke tests | `/healthz` 200; regional home 200 for enabled tenant. |
| Route access | `/admin/login`, `/field-agent/login`, `/company/login`, `/client/deals/new` reachable on correct hosts. |
| Upload / file checks | Field agent images; client deal images; size limits enforced gracefully. |
| SEO / public | `/robots.txt`, `/sitemap.xml` respond; company page canonical links look correct. |
| Portal login | Lockout messaging after repeated failures (company portal). |
| Intake / assignment | Published project appears in company portal after assignment. |
