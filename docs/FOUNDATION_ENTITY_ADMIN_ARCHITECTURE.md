# Foundation Entity & Admin Architecture (Prompt 2A)

**Status:** Architecture decision — analysis only  
**Date:** 2026-07-19  
**Input:** [`docs/ADMIN_CONSOLE_REGISTRATION_FLOW_AUDIT.md`](./ADMIN_CONSOLE_REGISTRATION_FLOW_AUDIT.md)  
**Scope:** Canonical entity relationships and platform-admin information architecture for BlessBoard V5 Foundation self-service onboarding.

**Constraints for this document:** No application code, routes, migrations, database records, dashboards, or V4 changes.

---

## 1. Executive recommendation

1. **`platform.organizations` is the canonical platform tenant.**
2. **`blessboard.churches` is the BlessBoard product profile** for that organization (1:1 via `organization_id`).
3. **`/admin/organizations` remains the only canonical list of provisioned tenants.**
4. **Registration applications are a separate related queue** at `/admin/registration-applications` (not a second “All Churches” list).
5. After successful provisioning, **each application must retain a foreign key to `platform.organizations`**.
6. Public/marketing UI may say **“Church”**; platform-admin and schema keep **Organization / Church / Application** as distinct technical terms.
7. Reject any design that creates a parallel tenant model, duplicate church directory, V4 inquiries queue, or second provisioning identity.

---

## 2. Canonical entity model

### 2.1 Entity roles

| Entity (actual table) | Represents | Layer | Ownership | Lifecycle | Authoritative for | Created with | May exist alone? | Connecting ID |
|-----------------------|------------|-------|-----------|-----------|-------------------|--------------|------------------|---------------|
| `platform.organizations` | Platform tenant / customer account | Platform | Platform ops / provisioner | `active` → `inactive` / `suspended` / etc. per org status | Tenant identity, `organization_key`, data environment | Enrolment + (usually) plan subscription | Yes (before BlessBoard church) | `organizations.id` (UUID), `organization_key` (immutable public key) |
| `platform.organization_products` | Product enrolment (e.g. BlessBoard) | Platform | Platform | Enrolment status | Whether org may use BlessBoard | Org provision | No meaningful BlessBoard without it | `organization_id` → org |
| `platform.organization_subscriptions` *(audit shorthand: “subscriptions”)* | Plan subscription for an org | Platform | Platform | Active / changed via plan assign | Commercial plan attachment | Org provision or PA plan assign | Org may briefly lack one if mis-provisioned — avoid | `organization_id`, `plan_id` |
| `platform.organization_entitlements` *(audit shorthand: “entitlements”)* | Feature/limit overrides + resolved usage caps | Platform | Platform | Override lifecycle | Overrides vs plan defaults | Plan features + optional overrides | Overrides optional | `organization_id`, `feature_key` |
| `platform.domains` | Hostname bindings for host-based tenancy | Platform | Platform | Domain status + `verified_at` | Hostname → org resolution | Optional at provision; Foundation may defer custom domains | Yes (catalogue rows) | `organization_id` (nullable until assigned) |
| `blessboard.churches` | BlessBoard product profile for one org | BlessBoard | Tied to org | `active` / `inactive` / `suspended` / `archived` | Church key, church operational status for product | Requires active BlessBoard enrolment | **No** — requires `organization_id` (UNIQUE) | `organization_id` → `platform.organizations.id` |
| `blessboard.branches` | Campuses / HQ under a church | BlessBoard | Church | Branch status; HQ primary | Branch identity, HQ vs campus | Church provision creates HQ | Branches only under a church | `church_id` → `churches.id` |
| `blessboard.users` | BlessBoard login principals | BlessBoard | Platform identity for BB | User active/inactive | Credentials, email | After org/church exist (or independently if ops create early — avoid) | Technically yes; useless without roles/context | `users.id` |
| `blessboard.user_roles` | Role grants (platform_admin, church_hq_admin, branch_admin, …) | BlessBoard | Scoped to org/church/branch as role requires | Grant/revoke | Authorization | With user for first admin | Role row alone invalid | `user_id` + scope FKs per role rules |
| `blessboard.platform_church_registration_applications` | Self-serve / enquiry registration intake | BlessBoard (platform intake) | Applicant → support | Pre- and post-provision | Intake form data, application lifecycle | Alone at submit | **Yes** before provision | Future: `organization_id` → org after provision; today: **none** |

### 2.2 Explicit answers

| # | Question | Answer |
|---|----------|--------|
| 1 | Is `platform.organizations` the canonical tenant? | **Yes.** One organization = one platform tenant. |
| 2 | Is `blessboard.churches` the BlessBoard product profile? | **Yes.** At most one church row per organization (`UNIQUE (organization_id)`). Requires active BlessBoard enrolment. |
| 3 | Should registration applications link to `platform.organizations` after provisioning? | **Yes.** Add nullable FK `organization_id` (set when provision succeeds). Applications may exist without an org before provision. |
| 4 | Should `/admin/organizations` remain the canonical list? | **Yes.** Sole list of provisioned tenants. |
| 5 | Should “Churches” be only a product-filtered view? | **Yes.** Optional `?product=blessboard` (or equivalent filter) on the **same** Organizations list — not a second directory. |
| 6 | Where should pending registration applications appear? | **`/admin/registration-applications`** (list + detail), linked to org detail when provisioned. |

### 2.3 Creation / coexistence rules

**Must be created together for a usable Foundation Free church (logical unit):**

1. `platform.organizations`  
2. BlessBoard `organization_products` enrolment  
3. `organization_subscriptions` for Free/Foundation plan (via existing plan assign / provision default)  
4. `blessboard.churches`  
5. HQ `blessboard.branches`  
6. First admin `blessboard.users` + appropriate `user_roles`  
7. Application row updated with `organization_id` + provisioned status  

**May exist without the others (allowed):**

- Application without organization (submitted, not yet provisioned, or failed).  
- Organization without church (platform tenant before BlessBoard provision — ops/CLI edge case).  
- Organization without custom domain (Foundation expected).  
- Domains without org (unassigned catalogue — rare).  

**Rejected alternatives:**

- Treating `blessboard.churches` as the platform tenant.  
- Treating the application row as the long-term tenant.  
- Creating `public.church_organizations` or any V4 parallel.  
- Dual “tenant” + “organization” identities for the same church.

### 2.4 Terminology

| Context | Canonical term | Notes |
|---------|----------------|-------|
| Technical / schema / APIs | **Organization**, **Church**, **Branch**, **Registration application** | Do not rename tables in Foundation. |
| Platform-admin UI | **Organizations** (nav + list) | Column/badge: “BlessBoard church” when enrolled. |
| Public marketing / register form | **Church** | “Register Your Church”; still maps to Organization + Church on provision. |
| Avoid as UI synonym of Organization | “Tenant”, “Account”, “Institution” | “Tenant” appears in host/routing jargon; do not use as admin list title. |
| Avoid for church applications | “Registrations” alone | Clashes with HQ/BA **member** registration queues. Prefer **Church applications** / **Registration applications**. |

---

## 3. Admin information architecture

### 3.1 Option comparison

| Criterion | Option 1: Tabs on `/admin/organizations` (All / New Registrations / Follow-up / Onboarding / Published / Suspended) | Option 2: Keep orgs list + add `/admin/registration-applications` | Option 3: Product filter `/admin/organizations?product=blessboard` only |
|-----------|----------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------|------------------------------------------------------------------------|
| Duplication risk | **High** — mixes unprovisioned applications with live tenants in one list metaphor | **Low** — queue vs tenants separated | **Low** for multi-product; **does not solve** applications queue |
| Route clarity | Ambiguous (tabs share one path) | Clear: tenants vs applications | Clear for product filter; incomplete alone |
| User understanding | Confusing: “organization” that is only an application | Clear: Applications → then Organization after provision | Good for GetPro/NGO coexistence; silent on leads |
| Future GetPro / NGO | Weak — BlessBoard-only tab names on shared orgs | Strong — orgs stay multi-product; BB apps are product-specific | **Strongest** for multi-product list filtering |
| Query complexity | High (union apps + orgs) | Moderate (two queries) | Low (filter enrolment) |
| Mobile navigation | Many tabs hard on bottom nav | One extra sidebar/drawer item | No new nav item |
| Dashboard integration | Easy links to tab query params | Easy links to applications filters + org filters | Easy for suspended/published org metrics only |
| Implementation cost | High (hybrid list) | Medium (new list/detail; reuse shell) | Low as **enhancement** to existing list |

### 3.2 Chosen architecture: **Option 2 + Option 3 as org-list enhancement**

**Primary (Foundation):** Option 2  

- `/admin/organizations` — provisioned organizations (canonical).  
- `/admin/organizations/:organizationKey` — org detail; show linked application, onboarding/follow-up summary when present.  
- `/admin/registration-applications` — church registration application queue.  
- `/admin/registration-applications/:id` — application detail (contact, plan, provision status, link to org when set).  

**Secondary (same list, not a second list):** Option 3  

- Support `?product=blessboard` (and later other products) on `/admin/organizations`.  
- Optional status filters on the **same** route: e.g. `?status=suspended`, later publication filters when data is available.  

**Rejected as primary:** Option 1 tabs that put “New Registrations” inside Organizations as peer tabs to live tenants (duplicate concept risk and union-query complexity).

### 3.3 Recommended admin route structure (target — not implemented in this prompt)

| Route | Purpose |
|-------|---------|
| `GET /admin/organizations` | Canonical provisioned tenant list (+ optional `product`, `status`, `q`, `page`) |
| `GET /admin/organizations/:organizationKey` | Tenant detail; branches; plan; linked application; onboarding/follow-up summary |
| `GET /admin/registration-applications` | Application queue (`status`, follow-up filters later) |
| `GET /admin/registration-applications/:id` | Application detail + actions (later prompts) |
| Existing | `/admin`, plans, subscriptions, domains, deployments, settings, account — unchanged roles |

**Nav (future):** Keep **Organizations**. Add one item: **Church applications** (or **Registration applications**) → `/admin/registration-applications`. Do **not** add a second top-level **Churches** nav pointing at a different list.

### 3.4 How proposed “tabs” map without Option 1

| Desired view | Where it lives |
|--------------|----------------|
| All Organizations | `/admin/organizations` |
| New Registrations | `/admin/registration-applications` (e.g. pending / recently submitted) |
| Needs Follow-up | Filter on applications **and/or** org detail follow-up fields (later model) — not a duplicate org list |
| Onboarding | Org detail (+ optional org list filter when onboarding columns exist) |
| Published / Suspended | Filters on `/admin/organizations` (and publication derived from `public_pages` later) |

---

## 4. Application ↔ organization relationship

| Stage | Application | Organization |
|-------|-------------|--------------|
| Submitted | Exists; `organization_id` NULL | None |
| Provisioning | Exists; still NULL or locked | Being created by orchestrator (later) |
| Provisioned | `organization_id` SET; immutable thereafter | Canonical tenant; appears in Organizations |
| Provisioning failed | Exists; NULL; retryable | May be partial — orchestrator must define cleanup (later) |
| Rejected / cancelled | Exists; never linked (or link forbidden) | None |

**Rules:**

1. Applications **may** exist without an organization.  
2. After successful provision, application **must** store `organization_id` (FK to `platform.organizations`).  
3. Organization is authoritative for ongoing ops; application remains authoritative for **intake snapshot** (submitted name, contact, consent, source).  
4. Do not promote the application into a second tenant identity.

*(Exact status enums and onboarding columns are out of scope for 2A; covered in later prompts.)*

---

## 5. Duplicate structures that must not be created

| Forbidden duplicate | Why |
|---------------------|-----|
| Second admin list “All Churches” parallel to Organizations | Same join as existing directory |
| Top-level nav **Churches** + **Organizations** for the same rows | Duplicate navigation |
| `/admin/churches` mirroring `/admin/organizations` | Duplicate route |
| Tabs that union applications into Organizations as if they were orgs | Duplicate tenant concept |
| V4 `/admin/church/platform-inquiries` or `public.church_platform_inquiries` on V5 | Wrong schema; absent on foundation DB |
| GetPro `/admin/leads` as BlessBoard church queue | Unrelated product |
| Reusing HQ/BA **Registrations** for church applications | Member domain clash |
| Second organization table / `public.church_organizations` | Parallel tenant model |
| Second provisioning path copying V4 `provisionChurchOrganization` | Dual identity + wrong tables |
| Dashboard “Open tickets” repurposed as the applications queue without a real applications route | Semantic collision |
| Stitch Create Org GUI as a second create path that bypasses applications + V5 orchestrator | Dual create entry (CLI ops create may remain separate by policy) |

---

## 6. Decision log (2A only)

| Decision | Chosen | Rejected | Reason | Impact |
|----------|--------|----------|--------|--------|
| Canonical tenant | `platform.organizations` | Church-as-tenant; application-as-tenant | Matches V5 schema + PA | All lists/FKs hang off org |
| BlessBoard profile | `blessboard.churches` (1:1) | Merging church into org row | Existing UNIQUE FK + enrolment | Provision continues two-step platform→church |
| Admin list | `/admin/organizations` | New `/admin/churches` | Audit + live UI | Extend filters only |
| Applications location | `/admin/registration-applications` | Tabs-only Option 1; V4 inquiries | Clear queue; multi-product safe | New routes later; wire dormant repo |
| Product coexistence | Optional `?product=` on orgs | Separate product silos | GetPro/NGO future | Filter enhancement |
| App→org link | FK after provision | No link; soft key-only | Traceability + admin UX | Future migration |
| Public UI term | “Church” | Showing “Organization” on marketing | Product language | Map to org+church on write |
| Technical term | Organization / Church / Application | Collapsing names | Avoid ambiguity | Docs + code comments |

---

## 7. Explicit non-goals (this prompt)

- Status family design, onboarding table choice, provisioning orchestrator, path tenancy, dashboard cards, migrations, routes, UI implementation.

---

## 8. Confirmation

- No application code changed  
- No migrations created or executed  
- No database records changed  
- No routes added  
- No dashboard items added  
- No V4 code changed  

**Companion:** Full flow audit — [`ADMIN_CONSOLE_REGISTRATION_FLOW_AUDIT.md`](./ADMIN_CONSOLE_REGISTRATION_FLOW_AUDIT.md)
