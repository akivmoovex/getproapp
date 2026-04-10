# Field Agent provider moderation and CRM linkage

This document describes the **implemented** Field Agent system as of the current codebase: PostgreSQL tables, admin CRM linkage, source-of-truth boundaries, and informational audit notes. It does not describe unimplemented features.

## TL;DR (mental model)

- Field agents **create** provider rows in **`field_agent_provider_submissions`** (`status`: `pending` \| `approved` \| `rejected`; **`commission_amount`**, **`rejection_reason`** on that table).
- A **`crm_tasks`** row is the **workflow / queue** surface; it **links** to a submission with **`source_type = field_agent_provider`** and **`source_ref_id =`** that submission’s `id` (same tenant).
- Admins **open the CRM task detail** and POST approve / reject / commission; handlers update **`field_agent_provider_submissions` only** for moderation (see `src/routes/admin/adminCrm.js`).
- **`crm_task_comments`** / **`crm_audit_logs`** hold **append-only informational** traceability (including automated notes via `insertCommentWithAudit` on approve/reject); they are **not** moderation truth.
- **Commission-only** POST (`…/field-agent-submission/commission`) updates the submission row only and **does not** append a CRM comment.
- **Viewers** (`canMutateCrm` false) see submission **summary** on the task; **editors** with **`canMutateCrm`** can act.

## Data relationships (diagram)

Provider applications (moderation path):

```text
field_agents
  └── field_agent_provider_submissions   ← source of truth: status, commission_amount, rejection_reason
         │
         │   CRM link: source_type = field_agent_provider, source_ref_id = submission id
         ▼
      crm_tasks                            ← workflow / queue only (not moderation truth)
         ├── crm_task_comments            ← append-only (manual + informational approve/reject notes)
         └── crm_audit_logs               ← append-only (includes audit row for comments)
```

Callback leads (separate CRM linkage; **not** provider moderation):

```text
field_agents
  └── field_agent_callback_leads
         │
         │   CRM link: source_type = field_agent_callback, source_ref_id = lead id
         ▼
      crm_tasks
```

## Non-goals

- **`crm_tasks` does not store** provider moderation truth (no moderation columns added for this flow; workflow columns are unrelated to submission `pending` / `approved` / `rejected`).
- **Moderation is not duplicated** across tables: **`field_agent_provider_submissions`** is the single authority.
- **Dashboards** do **not** derive submission moderation state from CRM Kanban/workflow columns; they read **`field_agent_provider_submissions`** (and related repo queries).
- **Comments and audit rows** are **not** used as source of truth; optional note insertion failure does **not** block approve/reject.

**Stack context:** Node.js + Express + PostgreSQL; multi-tenant (`tenant_id` isolation). Production often runs on **Hostinger** (LiteSpeed / Node). Env loading is deterministic: **host-injected env first**, optional **`.env.production`** merge for missing keys when `NODE_ENV=production` (see `src/startup/bootstrap.js`, `docs/CONFIG_AND_DEPLOYMENT.md`). **`DATABASE_URL` or `GETPRO_DATABASE_URL` is mandatory** for a healthy worker.

Regional hosts such as **`zm.getproapp.org`** / **`il.getproapp.org`** (and **pronline.org** / **getproapp.org** deployments) use the same app; tenant resolution follows `BASE_DOMAIN` and host routing (`README.md`).

---

## A. Field Agent system overview

**Purpose:** Field agents (per-tenant accounts) submit **provider directory applications** and **callback (“call me”) leads**. Admins work those items from the **CRM** queue. **Moderation** of provider applications (approve / reject / commission) is performed by admins from a **linked CRM task**, not by field agents.

**Main PostgreSQL tables (field agent domain):**

| Table | Role |
|-------|------|
| `field_agents` | Login accounts scoped by `tenant_id`. |
| `field_agent_provider_submissions` | Provider application rows and **moderation truth** (`status`, `commission_amount`, `rejection_reason`). |
| `field_agent_callback_leads` | “Call me back” style leads (separate flow from provider moderation). |

Schema files: `db/postgres/002_field_agent.sql` (see `db/postgres/README.md`).

**Main modules / routes (non-exhaustive):**

| Area | Location |
|------|----------|
| Field agent HTTP routes | `src/routes/fieldAgent.js` |
| Field agent authentication | `src/auth/fieldAgentAuth.js` |
| Submission persistence | `src/db/pg/fieldAgentSubmissionsRepo.js` |
| CRM task creation for submissions / callbacks | `src/fieldAgent/fieldAgentCrm.js` (wraps `createCrmTaskFromEvent`) |
| Admin CRM (tasks, moderation POSTs) | `src/routes/admin/adminCrm.js` |
| Field agent views | `views/field_agent/*` |
| CRM task detail partial (provider card) | `views/partials/crm_task_inner.ejs` |

**Interaction:** Field agents submit data → rows are stored in the tables above → CRM tasks may be created with `source_type` / `source_ref_id` pointing at those rows → admins open the task and moderate **only** via routes that update `field_agent_provider_submissions`.

---

## B. Table explanations

### `field_agents`

Per-tenant field agent users (credentials, display name, etc.). Used for login and for associating submissions and leads.

### `field_agent_provider_submissions`

One row per provider application. **Authoritative** for:

- **`status`:** `pending` \| `approved` \| `rejected` (no other values in application logic).
- **`commission_amount`:** set on approve (optional) and adjustable while approved; set to **0** on reject in repo code.
- **`rejection_reason`:** required for reject (non-empty); cleared on approve in repo code.

### `field_agent_callback_leads`

Callback leads; CRM may link tasks with `source_type = field_agent_callback`. **Not** the provider moderation table.

### `crm_tasks`

Workflow / queue surface: Kanban-style task rows (`status`, `owner_id`, etc.). **Does not** store provider moderation state (`status` here is CRM workflow, not submission moderation). **`source_type`** and **`source_ref_id`** link a task to an originating entity when applicable.

### `crm_task_comments`

Append-only **thread comments** on a task (user id + body). Used for manual comments and for **informational** notes after approve/reject (see below).

### `crm_audit_logs`

Append-only **audit** rows per task (`action_type`, `details`). `crmTasksRepo.insertCommentWithAudit` inserts a comment **and** an audit entry (same pattern as `POST /admin/crm/tasks/:id/comments`).

---

## C. Source-of-truth boundaries

- **`field_agent_provider_submissions`** is the **only** source of truth for provider moderation: approve/reject state, commission, rejection reason.
- **`crm_tasks`** is the **queue / task shell** only: linkage via `source_type` / `source_ref_id`, workflow fields, assignment. **No** moderation columns are added to `crm_tasks` for this flow.
- **`crm_task_comments` / `crm_audit_logs`** provide **append-only informational traceability** (including automated notes on approve/reject). They are **not** authoritative for moderation decisions.
- Dashboards and counts for field agents read submission truth via repo helpers (e.g. `countByAgentAndStatus`, `sumCommissionLastDays`, `listRejectedWithReason` in `fieldAgentSubmissionsRepo.js`).

---

## D. Moderation lifecycle

- **`pending` → `approved`:** `approveFieldAgentSubmission` in `fieldAgentSubmissionsRepo.js` runs only when current status is `pending`; optional commission; clears `rejection_reason`.
- **`pending` → `rejected`:** `rejectFieldAgentSubmission` requires a **non-empty** trimmed `rejection_reason`; sets `commission_amount` to **0**.
- **Commission after approval:** `updateFieldAgentSubmissionCommission` updates commission **only** when status is `approved`.
- **Admin entry point:** Actions are **POST**ed from the **CRM task detail** for a task whose linkage matches a provider submission (see below). Routes use `loadFieldAgentProviderContext` for validation; updates are **tenant-scoped** (`getAdminTenantId`, `getTaskByIdAndTenant`, `getSubmissionByIdForAdmin`).

---

## E. CRM linkage model

For provider submissions:

- **`crm_tasks.source_type`** must be **`field_agent_provider`** (string match in `adminCrm.js`).
- **`crm_tasks.source_ref_id`** must be the **`field_agent_provider_submissions.id`** for that tenant.

Admin routes resolve the task by id **and** tenant, then load the submission by `source_ref_id` **and** tenant. A defensive check ensures the loaded submission id matches the reference. **No** moderation state is written to `crm_tasks`.

Task creation from code uses `notifyProviderSubmissionToCrm` in `src/fieldAgent/fieldAgentCrm.js` (`sourceType: "field_agent_provider"`, `sourceRefId: submissionId`).

---

## F. UI behavior (`views/partials/crm_task_inner.ejs`)

When `fieldAgentProviderSubmission` is present (loaded in `loadCrmTaskDetailData` when linkage is valid):

| Submission status | `canMutateCrm` | Behavior |
|-------------------|----------------|----------|
| `pending` | yes | Approve + reject forms (commission optional on approve). |
| `approved` | yes | Commission edit form only. |
| `rejected` | yes | Read-only summary; rejection reason when present. |
| any | no (`tenant_viewer` / read-only CRM) | Summary only; no moderation actions. |

Overlay mode may send a hidden **`next`** field; redirects use **`safeCrmRedirect`** (allows safe relative paths under `/admin/crm`).

---

## G. Informational audit notes (approve / reject)

After a **successful** approve or reject mutation, `adminCrm.js` calls **`crmTasksRepo.insertCommentWithAudit`** so the task gains:

- A row in **`crm_task_comments`** (informational body).
- A related row in **`crm_audit_logs`** (same helper as manual comments).

**Approve** note (informational, not authoritative):

- Base: `Field agent provider submission #<id> approved.`
- If the optional **`commission_amount`** field was submitted (non-empty), appends: ` Commission on approve (informational): <value>.`

**Reject** note:

- Base: `Field agent provider submission #<id> rejected.`
- Optionally appends a **truncated** (200 chars) reason: ` Reason (informational): …` (with ellipsis if truncated).

**Commission-only** POST (`…/field-agent-submission/commission`) **does not** append a comment.

**Failure policy:** If `insertCommentWithAudit` throws, the error is caught and **ignored**; the moderation redirect still happens (note is best-effort).

All moderation POSTs require **`canMutateCrm`** (see `src/auth/roles.js`).

---

## H. Roles and permissions

| Actor | Behavior |
|-------|----------|
| **Field agent user** | Logs in via field agent auth; submits provider submissions and callback leads; sees own dashboard; **does not** moderate submissions. |
| **Admin with CRM access, no mutate** (e.g. `tenant_viewer`) | Can open CRM and see linked submission **summary**; **cannot** approve/reject/edit commission (`canMutateCrm` is false). |
| **Admin CRM editor / mutator** (`canMutateCrm` true: e.g. `tenant_manager`, `tenant_editor`, `tenant_agent`, `super_admin` per `roles.js`) | Can approve, reject, and edit commission when the UI allows. |

---

## I. Dashboard behavior

Field agent dashboards rely on **submission table** queries updated by moderation (counts, commission sums, rejected lists). No dependency on `crm_tasks` for moderation truth.

---

## J. Testing

**File:** `tests/field-agent-moderation-integration.test.js`

- **Skips** when PostgreSQL is not configured (`isPgConfigured()` / no `DATABASE_URL` / `GETPRO_DATABASE_URL`).
- **Repository integration:** approve/reject/commission updates, duplicate constraint, tenant isolation on `getSubmissionByIdForAdmin`, **`authenticateFieldAgent`**, **`createCrmTaskFromEvent`**, callback CRM task creation, cleanup.
- **HTTP integration (when DB is configured):** **`supertest`** against a minimal Express app mounting production **`adminRoutes`** with memory sessions and **`POST /admin/login`**. Covers moderation POSTs (approve/reject/commission), `canMutateCrm` vs viewer, unauthenticated redirect, linkage errors, tenant scope mismatch, `safeCrmRedirect`, comment/audit increments on approve/reject, and no new comment on commission-only update.

---

## Debugging tips

1. **Submission truth:** Inspect **`field_agent_provider_submissions`** for **`status`**, **`commission_amount`**, **`rejection_reason`** for the tenant/submission id.
2. **CRM linkage:** For the related **`crm_tasks`** row, confirm **`source_type`** and **`source_ref_id`** match a provider submission (`field_agent_provider` + submission `id`); mismatches explain missing or wrong task cards.
3. **Informational trace:** Check **`crm_task_comments`** / **`crm_audit_logs`** only for **append-only** history (e.g. approve/reject notes from `insertCommentWithAudit`). Absence of a comment does not change submission truth.
4. **Do not** infer moderation state from CRM **workflow** position or **`crm_tasks.status`** — that is the task queue, not submission moderation.

---

## Admin analytics (reporting)

Read-only **Field agent analytics** for the scoped tenant: **`GET /admin/field-agent-analytics`** (nav **Field agents** next to CRM when **`canAccessCrm`** is true — same gate as the CRM board, so **read-only CRM viewers** can open this page; there are no mutating actions).

Implementation:

- **`src/db/pg/fieldAgentAnalyticsRepo.js`** — SQL aggregates on `field_agent_provider_submissions`, `field_agents`, `field_agent_callback_leads` only (not `crm_tasks`).
- **`src/routes/admin/adminFieldAgentAnalytics.js`** + **`views/admin/field_agent_analytics.ejs`**.

Metrics include submission counts by status, commission sum/average on **approved** rows (in-range rows only), callback lead counts, per-agent breakdown, and **daily** trends for **new submissions** and **new callback leads** (counts by row **`created_at`**).

**Filters (query params):** optional **`from`** / **`to`** (inclusive date inputs; applied as UTC day bounds on `created_at`), optional **`agent`** (field agent id — must belong to the tenant; unknown ids yield empty summary counts, no cross-tenant leak), optional **`days`** (7–90) for the **trend tables only**.

**Filter semantics:** The **summary** KPIs respect **date range + agent**. The **per-agent** table respects **date range only** (always all agents — not narrowed when an agent is selected). **Trend** charts use a **rolling** last **`days`** UTC calendar days from **now**, independent of From/To; they still respect the **agent** filter.

**Limitation:** there is no `approved_at` column; **approval-by-day** charts are not provided (would require guessing from `updated_at`, which also changes on commission edits).

---

## Related documentation

- `README.md` — deploy, tenants, env.
- `docs/CONFIG_AND_DEPLOYMENT.md` — env and production policy.
- `docs/DATA_MODEL.md` — multi-tenant tables (cross-link to this doc for field agent moderation).
- `db/postgres/README.md` — SQL apply order for field agent schema.
- `docs/architecture/field-agent-moderation-diagram.md` — one-page ASCII diagrams (system context, flow, roles).
- `docs/ADMIN_UI.md` — admin UI tokens; CRM task detail partial for Field Agent card.
