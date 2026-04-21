# GetPro — product overview (implementation-grounded)

This document describes the **currently implemented** GetPro web application as of the repository state it lives in. It is derived from server routing (`server.js`), route modules under `src/routes/`, auth helpers (`src/auth/`), and PostgreSQL usage. It is **not** a roadmap.

**Related docs:** [flows.md](./flows.md), [roles-and-permissions.md](./roles-and-permissions.md), [route-to-screen-audit.md](./route-to-screen-audit.md), [database-entity-map.md](./database-entity-map.md), [qa-standard-test-script.md](./qa-standard-test-script.md), [DATA_MODEL.md](./DATA_MODEL.md), [CONFIG_AND_DEPLOYMENT.md](./CONFIG_AND_DEPLOYMENT.md).

---

## Product summary

GetPro is a **multi-tenant, region-aware** platform that combines:

- A **public marketplace website** (categories, directory, company profiles, content, join flow) per enabled region (tenant).
- **Operational consoles** for staff (admin), **field agents** (recruitment / provider submissions), **service providers** (company portal for assigned intake leads), and a **foundation-level end-client portal** (self-serve project intake and post-job reviews without password login).
- **CRM tasks**, **project intake**, **lead assignment** to companies, and **field-agent pay runs / finance** tooling for eligible roles.

Traffic is routed by **host** (regional subdomains such as `zm.{BASE_DOMAIN}`, apex/global home, and legacy path prefixes that redirect). PostgreSQL is **mandatory**; sessions are stored in `public.session`.

---

## Current system scope

| Area | In scope (implemented) |
|------|-------------------------|
| Public browsing & SEO helpers | Home, directory, category/company pages, services landing, articles/guides/answers, about/terms, sitemap/robots, join UI |
| Public API (unauthenticated JSON) | `POST /api/leads`, `POST /api/professional-signups`, `POST /api/callback-interest` |
| Field agent | Signup/login, dashboard, add-contact (provider lead) with uploads, duplicate phone checks, statements/disputes/adjustments views, callback request, static FAQ/support/about, website listing draft flow |
| Admin | Dashboard, directory (categories/cities/companies/leads/partner signups), CRM, project intake & projects pipeline, content CMS, tenant settings (contact + phone rules + commerce), tenant users, super-admin tenant/user console, DB tools (super), field-agent analytics, pay runs / payout batches / bank reconciliation / disputes / adjustments, finance CFO views (super), website listing review |
| Company / provider portal | Login, leads list/detail, actions/reviews, project file download, marketing mini-site preview |
| End-client portal | New deal form with image upload, success page, review submission (project code + phone) — **no session-based “account”** |
| Role-based access | See [roles-and-permissions.md](./roles-and-permissions.md) |

---

## User types / personas

| Persona | How they authenticate | Primary surfaces |
|---------|----------------------|------------------|
| **Public visitor** | None | Regional public site, join flow, company pages |
| **Admin user** | Session via `/admin/login` | `/admin/*` |
| **Super admin** | Same admin session, role `super_admin` | `/admin/super`, `/admin/db`, `/admin/finance/*`, all tenants |
| **Field agent** | Session via `/field-agent/login` (same browser session store as admin; separate session keys) | `/field-agent/*` on regional host |
| **Company personnel** | Session via `/company/login` or `/provider/login` | `/company/*`, `/provider/*` (same router) |
| **End client** | **No login** in current code for `/client/*` | Forms only |

---

## Module list and maturity

| Module | Maturity | Notes |
|--------|----------|--------|
| Public marketplace | **Production-ready (core)** | Tenant stage `Enabled` gates general public routes; sign-in hub and field agent bypass gate for disabled regions (`server.js`). |
| Join + directory APIs | **Production-ready** | Creates `professional_signups`, `callback_interests`, `leads`; CRM auto-tasks. |
| Admin directory & leads | **Production-ready** | Strong RBAC; viewers redirected away from category/city/company list routes. |
| CRM | **Production-ready** | CSR-scoped board; claim/reassign/status; field-agent moderation actions on linked tasks. |
| Project intake (admin) | **Production-ready** | Clients, projects, publish/assign, OTP helpers, company portal users. |
| Company portal | **Production-ready** | Lead credits, assignment actions, reviews linkage. |
| End-client portal | **Foundation** | Deal creation + review form; **no authenticated client dashboard**. |
| Content CMS | **Production-ready** | Articles, guides, FAQs, EULA; super admin + tenant manager write. |
| Tenant settings | **Production-ready** | Contact fields, phone rules, commerce settings (per tenant). |
| Field agent | **Production-ready (broad)** | Pay statements, disputes, analytics alignment with CRM access. |
| Field agent pay / finance | **Production-ready** | Tiered finance roles; super-only global CFO summary. |
| Super admin | **Production-ready** | Tenants CRUD (except global), users, scope switching. |

---

## High-level flow summaries

1. **Discovery:** Visitor lands on regional host → browses directory / company → may submit company contact lead (`/api/leads`) or join interest (`/api/professional-signups` / callback).
2. **Operations:** Admin users triage **CRM tasks** (from leads, signups, field-agent events), manage **directory**, and run **intake** (client + project → publish → assign companies).
3. **Provider fulfillment:** Assigned companies use **company portal** to accept/decline, view files, complete flow; clients may leave **reviews** via `/client/review`.
4. **Field recruitment:** Field agents submit **provider applications**; staff moderate via CRM / analytics; **pay runs** settle commissions with disputes/adjustments paths.

---

## Intentionally incomplete / foundation areas

- **End-client portal:** No login, no “my projects” dashboard — only public forms under `/client/*`.
- **`end_user` admin role:** Treated like read-only viewer for directory mutations; **no CRM access** (not included in `canAccessCrm` in `src/auth/roles.js`).
- **Finance roles:** Access **pay-run finance** surfaces; **not** granted CRM or directory write by default.
- **Israel tenant:** Optional “coming soon” gate for public/API (`israelComingSoonEnabled()`).
- **Company marketing subdomain:** Only `GET /` supported; other paths 404 (`server.js`).

---

## Release readiness checklist (documentation)

Use this as an operational smoke list after deploy (complement CI and `docs/FIELD_AGENT_POST_FIX_SMOKE.md` if used).

| Check | What to verify |
|-------|----------------|
| Migrations / boot DDL | App boot calls `ensure*` schema helpers in `server.js`; DB URL present or worker exits. |
| Assets / build | `npm run build` (Vite + search lists) before production if templates reference `/build/*`. |
| Role testing | Super admin, tenant manager, CSR, tenant editor, tenant viewer, finance viewer/operator/manager each log in and hit one allowed and one forbidden URL. |
| Smoke tests | Health: `GET /healthz`. Regional home loads for an `Enabled` tenant. |
| Route access | `/admin/login`, `/field-agent/login`, `/company/login`, `/client/deals/new` on a regional host. |
| Uploads | Field agent add-contact (profile + work photos); client deal images; size limits per `multer` config. |
| SEO / public | `/sitemap.xml`, `/robots.txt` for a tenant; company page renders. |
| Portal login | Company portal lockout message after repeated failures (`companyPortalLoginLimiter`). |
| Intake / assignment | Admin publishes project; company sees assignment in portal; credit block if configured. |
