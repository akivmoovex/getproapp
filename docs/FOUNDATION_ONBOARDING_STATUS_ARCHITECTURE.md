# Foundation Onboarding & Status Architecture (Prompt 2B)

**Status:** Architecture decision — analysis only  
**Date:** 2026-07-19  
**Inputs:**
- [`docs/ADMIN_CONSOLE_REGISTRATION_FLOW_AUDIT.md`](./ADMIN_CONSOLE_REGISTRATION_FLOW_AUDIT.md)
- [`docs/FOUNDATION_ENTITY_ADMIN_ARCHITECTURE.md`](./FOUNDATION_ENTITY_ADMIN_ARCHITECTURE.md)

**Constraints:** No code, migrations, routes, database records, or V4 changes in this prompt.

---

## 1. Executive recommendation

Do **not** overload one `status` column with registration, provisioning, verification, follow-up, onboarding, and publication.

**Smallest durable Foundation model:**

| Concern | Location |
|---------|----------|
| Application intake lifecycle | Extend `blessboard.platform_church_registration_applications` |
| Provisioning outcome | Same application row (`provisioning_status` + `organization_id`) |
| Long-term onboarding + follow-up + support assignment | **One** new 1:1 table: `blessboard.organization_onboarding` (name TBD; linked to `platform.organizations`) |
| Support call history | **Append-only** `blessboard.organization_support_notes` |
| Admin verification | `blessboard.users` (existing `status`; optional `email_verified_at` later) |
| Publication | Existing `blessboard.public_pages.status` + derived “site published” readiness on onboarding row |
| Organization operational | Existing `platform.organizations.status` |
| Church operational | Existing `blessboard.churches.status` |

**Rejected:** storing everything forever on the application; separate onboarding **and** follow-up tables; inventing a second tenant; V4 support-notes tables.

---

## 2. Model evaluation

| Model | Summary | Pros | Cons | Verdict |
|-------|---------|------|------|---------|
| **A** — Everything on application | All statuses/notes on `platform_church_registration_applications` | Few tables | Orgs provisioned without apps (CLI); lifecycle after provision awkward; mixes intake with ops | **Reject** for long-term state |
| **B** — Long-term on org/church; intake on application | Split by lifetime | Matches 2A entity model | Org/church tables grow many support columns; church vs org which owner? | **Partial** — use for operational/publication; not for support notes |
| **C** — One onboarding/support table per org | 1:1 org sidecar | Clean; works for CLI-provisioned orgs too; one place for PA follow-up | One new table | **Adopt** |
| **D** — Separate onboarding + follow-up tables | Two sidecars | Strict separation | Overkill for Foundation; double joins | **Defer** |

**Chosen:** **C + B hybrid** — application holds intake + provisioning; `organization_onboarding` holds follow-up + onboarding progress; existing org/church/pages/users hold operational and publication primitives.

---

## 3. Status families (seven concepts)

### 3.1 Application status

| Field | Detail |
|-------|--------|
| **Owns** | `blessboard.platform_church_registration_applications` |
| **Column** | Replace overloaded `status` with **`application_status`** (migration later; backfill from current `status`) |
| **Allowed** | `submitted` · `duplicate_review` · `rejected` · `cancelled` · `closed` |
| **Initial** | `submitted` |
| **Meaning** | Intake / disposition of the **form record**, not ops health of the church |
| **Transitions** | `submitted` → `duplicate_review` \| `rejected` \| `cancelled` \| `closed`; `duplicate_review` → `submitted` \| `rejected` \| `cancelled` \| `closed`; terminal: `rejected`, `cancelled`, `closed`. Provision success does **not** require leaving `submitted`—prefer leaving application_status as `submitted` or moving to `closed` only when support closes the case. **Recommended after provision:** keep `submitted` until support closes → `closed`, or auto-`closed` when onboarding marked complete (product choice). |
| **Actors** | System (submit); `platform_admin` (reject/cancel/duplicate/close); never church admin |
| **Audit** | Yes — significant disposition changes → `platform.audit_events` |
| **Belongs on** | Application only |

**Do not reuse** current `pending` / `contacted` / `closed` as mixed follow-up meanings. Backfill map (later): `pending`→`submitted`; `contacted`→`submitted` + create follow-up `contacted` when org exists; `closed`→`closed`.

**Out of application_status:** provisioning, follow-up, publication.

---

### 3.2 Provisioning status

| Field | Detail |
|-------|--------|
| **Owns** | `blessboard.platform_church_registration_applications` |
| **Column** | New **`provisioning_status`** |
| **Allowed** | `not_started` · `provisioning` · `provisioned` · `provisioning_failed` |
| **Initial** | `not_started` |
| **Transitions** | `not_started` → `provisioning` → `provisioned` \| `provisioning_failed`; `provisioning_failed` → `provisioning` (retry); `provisioned` terminal for this column |
| **Actors** | System orchestrator only (HTTP/CLI registration provision). Admins do not hand-edit except via controlled retry action |
| **Audit** | **Required** (start, success, failure reason code) |
| **Belongs on** | Application (+ `organization_id` set on success). Optionally mirror last result on `organization_onboarding.provisioned_at` |

Also set nullable **`organization_id`** FK on success (per 2A).

---

### 3.3 Administrator verification status

| Field | Detail |
|-------|--------|
| **Owns** | `blessboard.users` (first admin user) |
| **Column** | Prefer existing **`users.status`**: Foundation uses `invited` → `active`. Optional later: `email_verified_at TIMESTAMPTZ` |
| **Allowed (Foundation)** | Derived: `unverified` if `status = 'invited'` (or no successful login yet); `verified` if `status = 'active'` after first login or explicit verify. Do **not** invent a parallel enum on the application |
| **Initial** | `invited` user (or `active` if Foundation ships password-at-register without email verify — **owner decision**) |
| **Transitions** | Invite/create → first login or verify → `active`; suspend → `suspended` |
| **Actors** | System; user (complete verify); `platform_admin` (resend / force — later) |
| **Audit** | Yes for admin-forced changes; login can be session audit |
| **Belongs on** | **User**, not application |

If email verification is deferred, document verification status as **`not_applicable` / deferred** in admin UI rather than inventing fake verified state.

---

### 3.4 Onboarding status

| Field | Detail |
|-------|--------|
| **Owns** | New **`blessboard.organization_onboarding`** (1:1 `organization_id`) |
| **Column** | **`onboarding_status`** |
| **Allowed** | `not_started` · `in_progress` · `completed` · `skipped` |
| **Initial** | `not_started` (row created when org is provisioned) |
| **Transitions** | `not_started` → `in_progress` → `completed`; `in_progress` → `skipped` (admin); `completed` / `skipped` terminal unless admin reopens → `in_progress` |
| **Actors** | Church admin (checklist progress); `platform_admin` (mark complete/skip/reopen) |
| **Audit** | Yes for complete / skip / reopen |
| **Belongs on** | Organization sidecar (not application) |

**Progress:** store **`checklist_state JSONB`** (keys for required Foundation steps) and/or **`onboarding_percent INT`** (0–100, derived or maintained). Also **`onboarding_completed_at`**.

CLI-provisioned orgs without an application still get an onboarding row.

---

### 3.5 Follow-up status

| Field | Detail |
|-------|--------|
| **Owns** | Same **`blessboard.organization_onboarding`** |
| **Column** | **`follow_up_status`** |
| **Allowed** | `new` · `call_pending` · `contacted` · `needs_help` · `self_onboarding` · `completed` · `unreachable` · `not_interested` |
| **Initial** | `new` |
| **Transitions** | `new` → `call_pending` \| `self_onboarding` \| `contacted`; `call_pending` → `contacted` \| `unreachable` \| `not_interested`; `contacted` → `needs_help` \| `self_onboarding` \| `completed`; `needs_help` → `contacted` \| `completed`; `self_onboarding` → `completed` \| `needs_help`; terminal-ish: `completed`, `not_interested` (reopen allowed by admin → `call_pending` / `needs_help`) |
| **Actors** | `platform_admin` only (church admins do not set follow-up) |
| **Audit** | Yes for status changes |
| **Belongs on** | Organization sidecar |

**Also on same row:** `assigned_support_user_id` (nullable FK → `blessboard.users` with `platform_admin` role), `first_contacted_at`, `last_contacted_at`, `last_activity_at`.

Applications **without** an org: show follow-up only after provision, **or** allow a minimal pre-provision follow-up on the application (`application_follow_up_status`) — **Foundation recommendation:** do **not** duplicate; support contacts pre-provision via application detail using notes + application_status only until org exists. Optional: keep temporary use of application `review_notes` until first provision.

---

### 3.6 Public website publication status

| Field | Detail |
|-------|--------|
| **Owns (authoritative pages)** | `blessboard.public_pages.status` per page: `draft` · `published` · `archived` |
| **Owns (aggregate readiness)** | `organization_onboarding.website_publication_status` **or** derive at read time |
| **Allowed (aggregate)** | `unpublished` · `ready_to_publish` · `published` |
| **Initial** | `unpublished` (Foundation: no public pages published at provision) |
| **Transitions** | `unpublished` → `ready_to_publish` (checklist) → `published` (when policy says site is live); `published` → `unpublished` if all pages unpublished / kill switch |
| **Actors** | Church admin (publish pages within entitlements); system derives aggregate; `platform_admin` may force unpublished |
| **Audit** | Page publish/unpublish should already be auditable; aggregate changes optional |
| **Belongs on** | Pages = church/branch content; aggregate = onboarding sidecar |

**Do not** invent a fourth publication enum on `platform.organizations`.

**Publication readiness** = checklist flag / aggregate `ready_to_publish`, not the same as org `active`.

---

### 3.7 Organization operational status

| Field | Detail |
|-------|--------|
| **Owns** | `platform.organizations.status` |
| **Allowed (existing)** | `active` · `inactive` · `retired` |
| **Initial** | `active` on successful Foundation provision |
| **Transitions** | Per existing platform rules; PA suspend/reactivate may map to `inactive` / `active` (note: org has **no** `suspended` value today — church has `suspended`) |
| **Actors** | Platform provisioner; `platform_admin` (when UI exists) |
| **Audit** | **Required** for admin-driven changes |
| **Belongs on** | Organization |

**Church product operational status:** keep using `blessboard.churches.status` (`active` · `inactive` · `suspended` · `archived`). Foundation “suspend church” should update **church** (and possibly org) consistently — **owner decision** on whether suspend means org `inactive`, church `suspended`, or both. Architecture rule: **do not invent a new org status value** without a platform migration; prefer church `suspended` + org `inactive` as a paired action in the orchestrator/admin service.

---

## 4. Status ownership matrix (summary)

| Concept | Owning table | Column / source | Initial | Audit |
|---------|--------------|-----------------|---------|-------|
| Application status | `platform_church_registration_applications` | `application_status` | `submitted` | Yes (disposition) |
| Provisioning status | applications | `provisioning_status` | `not_started` | Yes |
| Org link | applications | `organization_id` | NULL | Yes on set |
| Admin verification | `blessboard.users` | `status` (+ optional `email_verified_at`) | `invited` or `active` | Yes if forced |
| Onboarding status | `organization_onboarding` | `onboarding_status` | `not_started` | Yes (complete/skip) |
| Onboarding progress | `organization_onboarding` | `checklist_state` / percent / `onboarding_completed_at` | empty / 0 | Optional per step |
| Follow-up status | `organization_onboarding` | `follow_up_status` | `new` | Yes |
| Support assignment | `organization_onboarding` | `assigned_support_user_id` | NULL | Yes |
| Contact timestamps | `organization_onboarding` | `first_contacted_at`, `last_contacted_at` | NULL | Via notes/status |
| Last activity | `organization_onboarding` | `last_activity_at` | provision time | Optional |
| Publication (pages) | `public_pages` | `status` | `draft` | Yes |
| Publication (site) | onboarding aggregate or derived | `website_publication_status` | `unpublished` | Optional |
| Org operational | `platform.organizations` | `status` | `active` | Yes |
| Church operational | `blessboard.churches` | `status` | `active` | Yes |

---

## 5. Support-note storage

| Option | Verdict |
|--------|---------|
| Overwritten single `review_notes` on application | **Insufficient** for multiple calls; keep only as legacy intake scratch |
| Append-only notes table | **Adopt** |
| `platform.audit_events` only | Too coarse for agent-facing call notes; use audit **in addition** for status changes |
| V4 `public.church_platform_support_notes` | **Reject** — absent on V5 DB |

### Recommended: append-only notes + summary fields

**Table (future):** `blessboard.organization_support_notes`

| Column | Purpose |
|--------|---------|
| `id` | UUID PK |
| `organization_id` | FK required |
| `application_id` | Nullable FK (when note originated from application detail) |
| `author_user_id` | Platform admin user |
| `body` | Short note text |
| `created_at` | Immutable |

**On `organization_onboarding`:** optional `latest_note_preview` (denormalized) **or** read latest note by `created_at DESC` — prefer query latest to avoid dual-write; denormalize only if list performance requires it.

**Application `review_notes`:** deprecate for new writes after notes table exists; migrate last value into first support note when org is linked (optional backfill).

---

## 6. Proposed `organization_onboarding` shape (conceptual — not a migration)

One row per organization, created at provision time:

- `organization_id` UUID PK/FK  
- `application_id` UUID NULL UNIQUE (when self-serve)  
- `onboarding_status`, `checklist_state`, `onboarding_percent`, `onboarding_completed_at`  
- `follow_up_status`, `assigned_support_user_id`  
- `first_contacted_at`, `last_contacted_at`, `last_activity_at`  
- `website_publication_status` (or derive)  
- `created_at`, `updated_at`  

Satisfies: assigned support person, contact timestamps, follow-up status, onboarding progress, publication readiness, onboarding completed, last activity — **without** seven tables.

---

## 7. Requirements coverage

| Requirement | Where |
|-------------|--------|
| Assigned support person | `organization_onboarding.assigned_support_user_id` |
| First contacted | `first_contacted_at` (set on first transition into `contacted` or first note) |
| Last contacted | `last_contacted_at` (each contact note / status touch) |
| Follow-up status | `follow_up_status` |
| Onboarding progress | `checklist_state` / `onboarding_percent` |
| Publication readiness | aggregate `website_publication_status` + `public_pages` |
| Onboarding completed timestamp | `onboarding_completed_at` |
| Last activity | `last_activity_at` (portal login, checklist, publish — updated by services) |

---

## 8. Required future schema changes

*(Do not implement in this prompt.)*

### REQUIRED FOR FOUNDATION

| Change | Table | Notes |
|--------|-------|-------|
| Add `organization_id` UUID NULL FK → `platform.organizations` | applications | Index; set on provision |
| Split status: add `application_status`, `provisioning_status` | applications | Backfill; retire old CHECK; drop or stop writing old `status` |
| Create `blessboard.organization_onboarding` | new | 1:1 org; indexes on follow_up_status, assigned_support |
| Create `blessboard.organization_support_notes` | new | Append-only; FK org; index `(organization_id, created_at DESC)` |

### OPTIONAL FOR FOUNDATION

| Change | Notes |
|--------|-------|
| `users.email_verified_at` | If email verification ships |
| Denormalized `latest_note_preview` | Performance only |
| `website_publication_status` stored vs derived | Prefer derived if cheap |

### DEFERRED

| Change | Notes |
|--------|-------|
| Separate follow-up table | Model D |
| Pre-provision follow-up columns on application | Until volume requires it |
| New `suspended` value on `platform.organizations` | Prefer church `suspended` + org `inactive` pairing |
| Full audit history table per status field | Use `platform.audit_events` |

**Rollback risk:** status CHECK replacement needs careful backfill of existing `pending`/`contacted`/`closed` rows (testing DB currently has pending applications).

---

## 9. Transition rules — compact diagram

```text
Application:  submitted ──► duplicate_review / rejected / cancelled / closed
                 │
Provisioning: not_started ──► provisioning ──► provisioned
                                   │              │
                                   └── failed ◄───┘ (retry)
                                              │
                                              ▼
                         organization_onboarding created
                         follow_up=new, onboarding=not_started
                         website=unpublished
                         users.status=invited|active
```

---

## 10. Duplicate-prevention rules (status layer)

1. Never store follow-up **and** application disposition in one column.  
2. Never store publication only on the application.  
3. Never create V4 inquiry statuses on V5 tables.  
4. Never create a second onboarding table for “church” vs “organization” — org sidecar only (church is 1:1).  
5. Member `member_registrations.review_notes` remains unrelated.

---

## 11. Open owner decisions

1. After provision, auto-`closed` application or leave `submitted` until support closes?  
2. First admin: `invited` + verify vs `active` + password at register?  
3. Suspend action: church `suspended` only, org `inactive` only, or both?  
4. Pre-provision support calls: notes on application only until org exists — acceptable?  
5. Checklist keys for Foundation (minimum set)?

---

## 12. Confirmation

- No application code changed  
- No migrations created or executed  
- No database records changed  
- No routes added  
- No V4 code changed  

**Companions:** [`FOUNDATION_ENTITY_ADMIN_ARCHITECTURE.md`](./FOUNDATION_ENTITY_ADMIN_ARCHITECTURE.md) · [`ADMIN_CONSOLE_REGISTRATION_FLOW_AUDIT.md`](./ADMIN_CONSOLE_REGISTRATION_FLOW_AUDIT.md)
