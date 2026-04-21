# GetPro — roles and permissions

**Source of truth:** `src/auth/roles.js`, `src/auth/index.js`, and per-route middleware in `src/routes/admin/*.js` and other routers.

**Convention:** Roles are stored in `admin_users.role`. Multi-region users may have rows in `admin_user_tenant_roles`; session tenant + role can sync on each request (`admin.js`).

---

## Admin roles (code-defined)

| Role slug | Label in code / intent |
|-----------|-------------------------|
| `super_admin` | Full platform; `/admin/super`, `/admin/db`, `/admin/finance/*`; can scope to any tenant. |
| `tenant_manager` | Regional administrator: directory (incl. categories), content, tenant settings, users, CRM mutate, intake mutate, pay-run workflow, adjustments/disputes. |
| `csr` | Customer support: directory edit (not categories), CRM (scoped board), intake, price/deal validation views — **cannot** manage categories or featured/premium flags. |
| `tenant_editor` | Directory edit (not categories), CRM, intake — **cannot** manage tenant users, articles, tenant settings, or featured/premium flags. |
| `tenant_agent` | CRM + intake mutate; same broad family as editor for CRM/inake (see `roles.js`). |
| `tenant_viewer` | Read-only: dashboard + leads; **redirected** away from companies/categories/cities lists; **no POST** (`requireNotViewer`). |
| `end_user` | Documented as demo/end-user console; **`isTenantViewer`** is true → **same read-only constraints as `tenant_viewer`**. |
| `finance_viewer` | Pay-run **finance dashboard + finance detail + CSV exports** only; blocked from main pay-run screens (`isPayRunFinanceViewerOnly`). |
| `finance_operator` | Finance actions: reversal/correct ledger, approve pay run for payout (with policy), plus viewer-level finance reads. |
| `finance_manager` | Operator powers + soft-close pay runs, accounting period lock (with super), reversal window override (per `roles.js`). |

---

## Capability matrix (admin)

| Capability | super_admin | tenant_manager | csr | tenant_editor | tenant_agent | tenant_viewer / end_user | finance_viewer | finance_operator | finance_manager |
|------------|-------------|----------------|-----|---------------|--------------|--------------------------|----------------|------------------|-----------------|
| Admin login | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Dashboard | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| CRM access (`canAccessCrm`) | Yes | Yes | Yes | Yes | Yes | Yes | **No** | **No** | **No** |
| CRM mutate / claim pool | Yes | Yes | Yes | Yes | Yes | **No** | **No** | **No** | **No** |
| CSR task scope | Full + reassign | Full | **Own + unassigned new** | Full | Full | Read-only | — | — | — |
| Directory: categories CRUD | Yes | Yes | **No** | **No** | **No** | **No** | **No** | **No** | **No** |
| Directory: cities/companies/leads | Yes | Yes | Yes | Yes | Yes | **Redirect to leads** (no company/category/city lists) | **No** | **No** | **No** |
| Featured/premium company flags | Yes | Yes | **No** | **No** | **No** | **No** | **No** | **No** | **No** |
| Tenant users CRUD | Yes | Yes | **No** | **No** | **No** | **No** | **No** | **No** | **No** |
| Content CMS write | Yes | Yes | **No** | **No** | **No** | **No** | **No** | **No** | **No** |
| Settings hub (`canAccessSettingsHub`) | Yes | Yes | Yes | Yes | Yes | **No** | **No** | **No** | **No** |
| Tenant settings (contact/phone/commerce) | Yes | Yes | **No** | **No** | **No** | **No** | **No** | **No** | **No** |
| Intake read | Yes | Yes | Yes | Yes | Yes | Yes | **No** | **No** | **No** |
| Intake write | Yes | Yes | Yes | Yes | Yes | **No** | **No** | **No** | **No** |
| View intake price estimation | Yes | Yes | Yes | **No** | **No** | **No** | **No** | **No** | **No** |
| Company ↔ field-agent linkage mutate | Yes | Yes | **No** | **No** | **No** | **No** | **No** | **No** | **No** |
| Field-agent analytics (read) | Yes | Yes | Yes | Yes | Yes | Yes | **No** | **No** | **No** |
| Field-agent submission **correction** (analytics) | Yes | Yes | **No** | **No** | **No** | **No** | **No** | **No** | **No** |
| Pay runs / finance section (`canAccessPayRunSection`) | Yes | Yes | **No** | **No** | **No** | **No** | Yes | Yes | Yes |
| Pay run workflow write (create/lock/approve/pay) | Yes | Yes | **No** | **No** | **No** | **No** | **No** | **No** | **No** |
| Finance dashboard/detail CSV | Yes | Yes | **No** | **No** | **No** | **No** | Yes | Yes | Yes |
| Payment reverse/correct | Yes | Yes | **No** | **No** | **No** | **No** | **No** | Yes | Yes |
| Soft-close pay run | Yes | Yes | **No** | **No** | **No** | **No** | **No** | **No** | Yes |
| Pay-run adjustments & disputes admin | Yes | Yes | **No** | **No** | **No** | **No** | **No** | **No** | **No** |
| Super console `/admin/super` | Yes | **No** | **No** | **No** | **No** | **No** | **No** | **No** | **No** |
| DB tools `/admin/db` | Yes | **No** | **No** | **No** | **No** | **No** | **No** | **No** | **No** |
| Global finance `/admin/finance/*` | Yes | **No** | **No** | **No** | **No** | **No** | **No** | **No** | **No** |

**Pay runs:** Individual POSTs always re-check helpers such as `canPayRunWorkflowWrite`, `canPayRunReverseOrCorrect`, and `canApprovePayrunForPayout`. **CSR, tenant_editor, tenant_agent, and viewers do not receive pay-run nav or routes** (they fail `canAccessPayRunSection`).

---

## Screen access cheat sheet (admin)

| Screen / route prefix | Blocked for |
|----------------------|-------------|
| `/admin/categories*` | csr, tenant_editor, tenant_agent, viewers, finance-only |
| `/admin/companies*`, `/admin/cities*` | tenant_viewer, end_user (redirect) |
| `/admin/content/new`, content POST | csr, tenant_editor, tenant_agent, viewers, finance-only |
| `/admin/users*` | csr, tenant_editor, tenant_agent, viewers, finance-only |
| `/admin/settings/tenant*` | csr, tenant_editor, tenant_agent, viewers, finance-only |
| `/admin/crm*` | end_user, finance_* |
| `/admin/project-intake*`, `/admin/projects*` | end_user, finance_* |
| `/admin/field-agent-analytics*` | end_user, finance_* |
| `/admin/field-agent-pay-runs*` (non-finance views) | finance_viewer |
| `/admin/finance/*` | Everyone except super_admin |
| `/admin/super*`, `/admin/db*` | Everyone except super_admin |

---

## Non-admin personas

| Persona | Access model | Notes |
|---------|--------------|--------|
| **Public visitor** | No session | Public routes only; API posts create data + CRM tasks. |
| **Field agent** | `requireFieldAgent` | All `/field-agent/*` authenticated routes; separate session payload from admin. |
| **Company personnel** | `requireCompanyPersonnelAuth` | Only own `company_id` rows in portal repos. |
| **End client** | None | `/client/*` forms are open; review flow verifies phone + project code server-side. |

---

## Role-specific caveats

1. **Multi-membership:** Non-super users with several `admin_user_tenant_roles` rows use `POST /admin/tenant-scope` to switch active region; role may change per membership.
2. **Super admin default scope:** Directory data uses `getAdminTenantId(req)` — super admins must **pin** a tenant via super console “Act as region” when working on regional data (see `DATA_MODEL.md`).
3. **CRM “owner” edits:** Even with `canMutateCrm`, a user may only edit tasks they **own** unless `super_admin` (`adminCrm.js`).
4. **Finance viewer:** Explicitly excluded from bulk of pay-run pages; error text: “limited to the finance dashboard and finance detail.”
5. **Pay-run admin tools:** Adjustments, disputes list resolution = **`canManageTenantUsers`** only (tenant manager / super), not finance_operator.

---

## How to verify in QA

- Attempt each forbidden URL logged in as the role; expect **403 text** or **redirect** per middleware.
- For viewer, confirm **redirect** from `/admin/companies` to `/admin/leads`.
- For finance_viewer, confirm **403** on `/admin/field-agent-pay-runs` but **200** on finance dashboard routes registered with `requirePayRunAccess` only.
