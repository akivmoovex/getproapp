# Field Agent moderation — architecture diagram (one page)

**Purpose:** Visual map of the **implemented** provider-submission moderation path: who touches what, which PostgreSQL tables hold truth vs workflow vs traceability, and how approve/reject flows through Express to the database. Callback leads are shown for context only; they are not provider moderation.

---

## 1. System context

```text
┌─────────────────────┐         ┌──────────────────────────┐
│  Field Agent user   │         │  Admin (CRM viewer /     │
│                     │         │  editor, canMutateCrm)   │
└──────────┬──────────┘         └────────────┬─────────────┘
           │                                 │
           ▼                                 ▼
┌─────────────────────┐         ┌──────────────────────────┐
│  Field Agent UI     │         │  Admin CRM UI            │
│  views/field_agent│         │  task board + detail      │
│                     │         │  (crm_task_inner.ejs)   │
└──────────┬──────────┘         └────────────┬─────────────┘
           │                                 │
           ▼                                 ▼
┌─────────────────────────────────────────────────────────────┐
│  Express                                                     │
│  src/routes/fieldAgent.js  ·  src/auth/fieldAgentAuth.js     │
│  src/fieldAgent/fieldAgentCrm.js  →  createCrmTaskFromEvent   │
│  src/routes/admin/adminCrm.js  →  moderation POSTs           │
│  src/db/pg/fieldAgentSubmissionsRepo.js                      │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │  PostgreSQL           │
                    │  (tables below)       │
                    └──────────────────────┘
```

**Admin analytics (read-only):** Tenant-scoped KPIs at **`GET /admin/field-agent-analytics`** (`src/routes/admin/adminFieldAgentAnalytics.js`, `src/db/pg/fieldAgentAnalyticsRepo.js`). Reads **`field_agents`**, **`field_agent_provider_submissions`**, and **`field_agent_callback_leads` only** — not **`crm_tasks`** (workflow surface is excluded from these aggregates). Daily trend tables use a **rolling UTC window**, not the optional summary date-range filters (see `docs/field-agent-moderation.md`).

---

## 2. Data model relationships

```text
field_agents
     │
     ├──────────────────────────────┐
     │                              │
     ▼                              ▼
field_agent_provider_submissions    field_agent_callback_leads
 (moderation truth:                    (linked CRM tasks use
  status, commission_amount,           source_type = field_agent_callback)
  rejection_reason)
     │                              │
     │  link: source_type = field_agent_provider
     │        source_ref_id = submission id
     ▼                              │
     └────────────┬─────────────────┘
                  ▼
            crm_tasks                    ← workflow / queue cards only
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
 crm_task_comments    crm_audit_logs
 (notes, incl.         (append-only;
  informational         audit rows;
  approve/reject        comment insert
  via insertCommentWithAudit)  also logs "comment")
```

---

## 3. Moderation request flow (provider submission)

```text
 1. Field agent submits provider form
        │
        ▼
 2. Row inserted in field_agent_provider_submissions (e.g. status = pending)
        │
        ▼
 3. CRM task created; crm_tasks.source_type = field_agent_provider
                      crm_tasks.source_ref_id = submission id
        │
        ▼
 4. Admin opens linked CRM task detail
        │
        ├──► Approve or Reject POST (canMutateCrm)
        │         │
        │         ▼
        │    5. field_agent_provider_submissions updated (approve/reject repo)
        │         │
        │         ▼
        │    6. insertCommentWithAudit → crm_task_comments + crm_audit_logs
        │         (informational; failure does not block step 5)
        │
        └──► Commission-only POST → submission row updated only; no comment row
        │
        ▼
 7. Field agent dashboard reads field_agent_provider_submissions (counts, sums, etc.)
```

---

## 4. Roles and permissions

```text
  Field Agent user ──────────► submit; dashboard; no moderation

  Admin + CRM access
        │
        ├── canMutateCrm = false  ("viewer") ──► summary on task; no approve/reject/commission
        │
        └── canMutateCrm = true   ("editor" / mutator) ──► approve, reject, commission edit
```

`canMutateCrm` is defined in `src/auth/roles.js` (e.g. `tenant_manager`, `tenant_editor`, `tenant_agent`, `super_admin`; not `tenant_viewer`).

---

## 5. Source of truth

```text
┌─────────────────────────────────────────────────────────────┐
│  Moderation truth     →  field_agent_provider_submissions    │
│                         (status, commission_amount,          │
│                          rejection_reason)                   │
├─────────────────────────────────────────────────────────────┤
│  Workflow surface     →  crm_tasks                           │
│                         (queue card; source_type /           │
│                          source_ref_id link only)            │
├─────────────────────────────────────────────────────────────┤
│  Traceability         →  crm_task_comments + crm_audit_logs  │
│                         (append-only; not authoritative)     │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Debugging checklist

| Step | Check |
|------|--------|
| 1 | `field_agent_provider_submissions`: `status`, `commission_amount`, `rejection_reason` for the submission id + tenant. |
| 2 | `crm_tasks`: `source_type = field_agent_provider`, `source_ref_id` matches submission id; same `tenant_id`. |
| 3 | `crm_task_comments` / `crm_audit_logs`: optional history only; missing rows do not change moderation truth. |
| 4 | Do **not** infer submission moderation from `crm_tasks` workflow columns alone. |

---

## See also

- [`docs/field-agent-moderation.md`](../field-agent-moderation.md) — full narrative (tables, routes, UI, audit notes, admin analytics).
- [`docs/DATA_MODEL.md`](../DATA_MODEL.md) — multi-tenant data model.
- [`docs/CONFIG_AND_DEPLOYMENT.md`](../CONFIG_AND_DEPLOYMENT.md) — environment and deployment.
