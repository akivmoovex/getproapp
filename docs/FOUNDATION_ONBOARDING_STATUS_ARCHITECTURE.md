# Foundation Onboarding & Status Architecture (Prompt 2B)

**Status:** Architecture decision — analysis only (expanded)  
**Date:** 2026-07-19  
**Inputs:**
- [`docs/ADMIN_CONSOLE_REGISTRATION_FLOW_AUDIT.md`](./ADMIN_CONSOLE_REGISTRATION_FLOW_AUDIT.md)
- [`docs/FOUNDATION_ENTITY_ADMIN_ARCHITECTURE.md`](./FOUNDATION_ENTITY_ADMIN_ARCHITECTURE.md)
- Live V5 testing DB (`DATABASE_URL`, identity `blessboard-platform-v5`) — SELECT only

**Constraints:** No application code, migrations, DB writes, routes, admin screens, dashboards, provisioning, or V4 changes in this prompt.

**Approved 2A decisions used here:** org = canonical tenant; church = 1:1 BlessBoard profile; `/admin/organizations` = provisioned list; applications at `/admin/registration-applications`; app may exist before org; FK after provision; no parallel “All Churches”; no V4 inquiries; follow-up helps, never blocks Free portal access.

---

## 1. Executive recommendation

Keep **seven separate state families**. Do not overload one `status` column.

| Concern | Foundation home |
|---------|-----------------|
| Application lifecycle | `platform_church_registration_applications.application_status` (replace overloaded `status`) |
| Provisioning | Same table: `provisioning_status` + `organization_id` |
| Admin verification | `blessboard.users.status` (`invited` → `active`); email-verify subsystem **deferred** |
| Onboarding | New 1:1 `blessboard.organization_onboarding` → `platform.organizations` |
| Follow-up / callbacks | Same onboarding row + append-only contact notes |
| Publication | Derive site state from `public_pages` (+ optional cached aggregate on onboarding) |
| Org operational | Existing `platform.organizations.status` (`active` / `inactive` / `retired`) |

**Chosen models:** Onboarding **MODEL E** (summary table + derived checklist facts). Follow-up on **organization_onboarding**. Notes **MODEL 4** (append-only contacts + audit for status changes). New Free churches: org **`active`** immediately (not “provisional” org status).

---

## 2. Current-field inventory

### 2.1 Live / migration fields (relevant)

| Schema.table | Column | Type | Default | Null | CHECK (migration) | Indexes | Code refs | UI today | Tests | Live |
|--------------|--------|------|---------|------|-------------------|---------|-----------|----------|-------|------|
| `blessboard.platform_church_registration_applications` | `status` | text | `pending` | NO | `pending\|contacted\|closed` | `(status, created_at DESC)` | insert only; **no admin writer** | none | register-church | yes |
| same | `review_notes` | text | null | YES | length | — | selected, never written | none | schema tests | yes |
| same | `created_at` / `updated_at` | timestamptz | now() | NO | updated≥created | email/status indexes | service | none | yes | yes |
| `platform.organizations` | `status` | text | `active` | NO | `active\|inactive\|retired` | status idx | PA directory | org status | PA shell | yes |
| `blessboard.churches` | `status` | text | `active` | NO | `active\|inactive\|suspended\|archived` | status idx | provision / routing | church status on org detail | yes | yes |
| `blessboard.branches` | `status` | text | `active` | NO | same family as church | — | provision | branch catalogue | yes | yes |
| `blessboard.users` | `status` | text | `active` | NO | `active\|inactive\|suspended\|invited` | status idx | create/auth | — | auth tests | yes |
| same | `last_login_at` | timestamptz | null | YES | — | — | auth on login | — | partial | yes |
| `blessboard.public_pages` | `status` | text | `draft` | NO | `draft\|published\|archived` | status idx | content admin | content UI | content tests | yes |
| same | `published_at` | timestamptz | null | YES | published ⇒ not null | — | content | — | yes | yes |
| `platform.domains` | `verified_at` | timestamptz | — | YES | — | — | domain admin | domain detail | PA | yes |
| `platform.audit_events` | — | — | — | — | — | — | audit service | no PA browser | yes | yes |

**Absent today (searched):** `application_status`, `provisioning_status`, `onboarding_*`, `follow_up_*`, `callback_*`, `assigned_support*`, `first_contacted_at`, `website_publication_status`, `organization_id` on applications, email verification tokens, dedicated support-notes tables on V5.

### 2.2 Ambiguous generic `status`

| Table | Meaning today | Risk if overloaded |
|-------|---------------|-------------------|
| applications.`status` | Lead disposition (`pending/contacted/closed`) — **conflates** follow-up | High — replace with split columns |
| organizations.`status` | Platform operational | Do not store onboarding/publication here |
| churches.`status` | Product lifecycle / suspend | Prefer for suspend; not publication |
| users.`status` | Account lifecycle incl. `invited` | Closest to verification proxy |
| public_pages.`status` | Per-page publish | Site aggregate must be derived |

---

## 3. Seven state families

### 3.1 Application lifecycle

| | |
|--|--|
| **Owning table** | `blessboard.platform_church_registration_applications` |
| **Column** | `application_status` |
| **Allowed** | `submitted` · `duplicate_review` · `rejected` · `cancelled` · `closed` |
| **Initial** | `submitted` |
| **Terminal** | `rejected`, `cancelled`, `closed` |
| **Actors** | System (submit); `platform_admin` (disposition) |
| **Timestamps** | Prefer `created_at` as submitted; add `closed_at` / `rejected_at` only if ops needs them — optional |
| **Audit** | Yes on disposition |
| **Admin list** | Yes |
| **Church admin** | No |

**Not in this column:** provisioning, follow-up, verification, publication.

### 3.2 Provisioning lifecycle

| | |
|--|--|
| **Owning table** | applications |
| **Column** | `provisioning_status` + nullable `organization_id` |
| **Allowed** | `not_started` · `provisioning` · `provisioned` · `provisioning_failed` |
| **Initial** | `not_started` |
| **Terminal** | `provisioned` (success); failed is **retryable** until cancelled/rejected |
| **Actors** | Orchestrator only |
| **Timestamps** | `provisioning_started_at`, `provisioned_at`, `provisioning_failed_at` (**required** for ops) |
| **Audit** | Required |
| **Authority after success** | Organization exists; `organization_id` + `provisioned` prove commit |
| **Admin list** | Yes |
| **Church admin** | No |

### 3.3 Administrator verification

| | |
|--|--|
| **Owning table** | `blessboard.users` |
| **Column** | `status` (`invited` / `active` / …); optional later `email_verified_at` |
| **Foundation meaning** | `invited` ≈ unverified setup; `active` ≈ may use portal fully |
| **Actors** | System / first login; PA later for lock |
| **Audit** | On forced changes |
| **Admin** | Yes (summary) |
| **Church admin** | Own account only |

**No V5 email-verify tokens today** — do not invent `verification_sent` until invite email exists.

### 3.4 Onboarding progress

| | |
|--|--|
| **Owning table** | `blessboard.organization_onboarding` (new, 1:1 org) |
| **Column** | `onboarding_status` + `checklist_state` JSONB |
| **Allowed status** | `not_started` · `in_progress` · `completed` · `skipped` |
| **Initial** | `not_started` at provision |
| **Actors** | Church admin (checklist); PA (complete/skip/reopen) |
| **Percent** | **Derived** from checklist keys at query time (optional cache on row only if measured slow) |
| **Audit** | complete / skip / reopen |
| **Admin + church** | Yes (church sees checklist; PA sees summary) |

### 3.5 Support follow-up

| | |
|--|--|
| **Owning table** | `organization_onboarding` |
| **Column** | `follow_up_status` + assignment + contact timestamps |
| **Allowed** | `new` · `call_pending` · `contacted` · `needs_help` · `self_onboarding` · `completed` · `unreachable` · `not_interested` |
| **Initial** | `new` |
| **Actors** | `platform_admin` **only** |
| **Blocks access?** | **Never** |
| **Audit** | Status changes yes |
| **Admin** | Yes |
| **Church** | No |

### 3.6 Public website publication

| | |
|--|--|
| **Authoritative pages** | `public_pages.status` |
| **Site aggregate** | Derived: any published home/about? → `published`; else if checklist ready → `ready_to_publish`; else `unpublished` |
| **Optional cache** | `organization_onboarding.website_publication_status` |
| **Initial after Free provision** | `unpublished` |
| **Actors** | Church admin publish; PA may force unpublish / suspend override |
| **Admin + church** | Yes |

### 3.7 Organization operational status

| | |
|--|--|
| **Owning table** | `platform.organizations` |
| **Column** | existing `status` |
| **Allowed** | `active` · `inactive` · `retired` |
| **Initial for Free** | **`active`** |
| **Suspend** | Prefer church `suspended` + org `inactive` as paired admin action (no new org enum) |
| **Actors** | PA / provisioner |
| **Audit** | Yes |

---

## 4. Application lifecycle (answers)

Minimal set: **`submitted` · `duplicate_review` · `rejected` · `cancelled` · `closed`**  
(Provisioning is **separate** column — do not put `provisioning` / `provisioned` inside `application_status`.)

| # | Answer |
|---|--------|
| 1 | Synchronous Free: leave `application_status=submitted`; set `provisioning_status` `not_started`→`provisioning`→`provisioned`\|`failed` in same request |
| 2 | Success ends with `provisioning_status=provisioned` + `organization_id`; application may stay `submitted` until support `closed` |
| 3 | `duplicate_review` when email/org-key collision or suspected duplicate church — human review |
| 4 | `provisioning_failed` is **retryable** (same keys / idempotent orchestrator) |
| 5 | Callback/follow-up **must not** change `application_status` |
| 6 | Verification **must not** change `application_status` |
| 7 | Soft-close only; **no hard delete** in Foundation (retain PII for dispute/ops; retention policy later) |
| 8 | Yes — failed/rejected keep full intake snapshot |
| 9 | Idempotent retry via `applicationId` + provisioning status (2C orchestrator) |
| 10 | Proof of commit: `organization_id IS NOT NULL` AND `provisioning_status='provisioned'` AND org row exists |

**Timestamps (material):** `provisioning_started_at`, `provisioned_at`, `provisioning_failed_at`.  
`created_at` = submitted. Optional later: `rejected_at`, `closed_at`.

**Backfill:** `pending`→`submitted` + `provisioning_status=not_started`; `contacted`→`submitted` (follow-up applied only after onboarding row exists); `closed`→`closed`.

---

## 5. Provisioning status ownership

**Store on the application** (`provisioning_status` + `organization_id`), not as a contradictory org field.

| Situation | Representation |
|-----------|----------------|
| Not started | `not_started`, `organization_id` NULL |
| In progress | `provisioning` (row locked) |
| Completed | `provisioned` + FK |
| Failed retryable | `provisioning_failed` + error code; org **not** committed (outer TX rollback) |
| Failed permanent | same + `application_status=rejected` or `cancelled` after PA decision |
| Duplicate blocked | `application_status=duplicate_review`; provisioning stays `not_started` or failed |
| Partial create | **Must not persist** after 2C TX refactor; if seen, ops cleanup + failed |

**Authoritative after org exists:** organization/church rows + application FK. Do not invent a second provisioning flag on the org.

---

## 6. Administrator verification model

### Current V5 capability
- Users: `active|inactive|suspended|invited`; password hash; `last_login_at`
- **No** email verification tokens, invite emails, or phone verify in V5 blessboard auth
- Login works with password for `active` users; `invited` available in schema but create path typically inserts `active`

### Foundation recommendation (smallest)

| Item | Decision |
|------|----------|
| Owner | `blessboard.users` |
| Scope | **Per user** (first admin) |
| States | Use `invited` → `active` if password-setup/invite ships; else **`active` at create** and treat verification as **deferred / N/A** |
| Portal before verify | If `active` with password: **yes**. If future `invited` without password: login blocked until setup |
| Restrict before verify | Defer publish-gated actions only if product requires; default Free: portal OK |
| Publish require verify? | **No** for Foundation (publication separate) |
| Visible on applications / org detail? | Yes as summary (“Admin: active / invited”) |
| Tokens | Defer email verify tables |
| Without subsystem | Document “verification deferred”; do not fake `verified` |

**Answers:** (1) users (2) per user (3) if `active`+password yes; if invited-only no (4) optional publish later (5) no (6) yes summary (7) yes (8) `last_login_at`; email_verified_at deferred (9) password path yes; email verify no (10) full email verify deferred.

---

## 7. Onboarding model options

| Model | Verdict |
|-------|---------|
| A — all on application | Reject long-term |
| B — fields on churches only | Weak for CLI orgs without app; church vs org |
| **C — `organization_onboarding` 1:1 org** | Adopt as summary home |
| D — derive only | Good for %; weak for follow-up assignment |
| **E — hybrid C + derived checklist** | **Choose** |

**Owning table:** `blessboard.organization_onboarding`  
**FK:** `organization_id` PK/FK → `platform.organizations`  
**Optional:** `application_id` UNIQUE NULL  

**Checklist keys (boolean/facts, derived where possible):**

| Key | Preferred source |
|-----|------------------|
| organization_details | org display_name/legal |
| church_profile | church row |
| first_branch | HQ branch exists |
| public_contact | settings / public contact page content |
| service_times | content/settings when present |
| logo | media/settings |
| first_leader | user_roles count ≥ 1 beyond creator |
| website_previewed | onboarding flag or first GET `/c/:slug` log (defer) |
| website_published | derived from `public_pages` |
| first_member_invited | member exists (defer if no invite) |

**Percentage:** compute from checklist weights at read time.

---

## 8. Follow-up and callback model

**Location:** `organization_onboarding` (not application long-term).  
Pre-provision contacts: application detail + temporary `review_notes` or wait until provision creates onboarding row.

### Follow-up statuses

| Status | Meaning | Terminal? | Access impact |
|--------|---------|-----------|---------------|
| `new` | Not yet queued for call | No | None |
| `call_pending` | In call queue | No | None |
| `contacted` | At least one successful contact | No | None |
| `needs_help` | Stuck; priority support | No | None |
| `self_onboarding` | Declined help / progressing alone | No | None |
| `completed` | Support closed | Soft terminal | None |
| `unreachable` | No response after attempts | Soft terminal | None |
| `not_interested` | Declined product | Soft terminal | None |

**Transitions (summary):** `new`→`call_pending`|`self_onboarding`|`contacted`; `call_pending`→`contacted`|`unreachable`|`not_interested`; `contacted`↔`needs_help`|`self_onboarding`|`completed`; PA may reopen soft terminals.

**Confirm:** Follow-up **never** auto-suspends or blocks Free portal/login.

Also store: `assigned_support_user_id`, `first_contacted_at`, `last_contacted_at`, optional `next_follow_up_at`.

---

## 9. Support notes and contact history

| Model | Verdict |
|-------|---------|
| 1 Overwrite text | Insufficient |
| 2 Append-only notes only | Good |
| 3 Audit only | Poor UX for agents |
| **4 Append-only contacts + audit on status** | **Choose** |

**Table:** `blessboard.organization_support_contacts` (name aligned to repo style)

Suggested columns: `id`, `organization_id` (required), `application_id` (nullable), `created_by_user_id`, `contact_method` (`phone`|`email`|`other`), `outcome` (short enum or text), `note` (1–2000 chars), `contacted_at`, `next_follow_up_at` nullable, `created_at`.

**Rules:** Product-onboarding notes only — no pastoral/member PII. Status changes also → `platform.audit_events`. Deprecate new writes to application `review_notes` after this table exists.

---

## 10. Publication status

**Smallest aggregate set:** `unpublished` · `ready_to_publish` · `published`  
(Do not add `setup_incomplete` / `suspended` as publication enums — suspend is operational override.)

| # | Answer |
|---|--------|
| 1 | Initial: **unpublished** |
| 2 | Minimum: org/church/HQ exist + church admin chooses publish; optional checklist gate later |
| 3 | Church admin (entitled) |
| 4 | PA may unpublish / force draft |
| 5 | Org/church inactive/suspended → public routes deny regardless of page status |
| 6 | Suspension **overrides access**; does not necessarily rewrite page rows |
| 7 | Page-level `published_at` already; site-level optional |
| 8 | `ready_to_publish` **derived** from checklist |
| 9 | Path `/c/:slug`: unpublished → coming-soon/404 policy (owner); never full public content |

**Owner of page truth:** `public_pages`. Aggregate may cache on onboarding.

---

## 11. Organization operational status

Use existing **`active` | `inactive` | `retired`**.  
New Free churches: **`active`**.

| Case | Representation |
|------|----------------|
| Newly provisioned usable | org `active`, church `active`, provisioning `provisioned` |
| Active onboarding | org `active` + onboarding_status `in_progress` |
| Active published | org `active` + site `published` |
| Suspended | church `suspended` and/or org `inactive` |
| Archived | org `retired` / church `archived` |
| Provision failed | **no org**; application `provisioning_failed` |

| Capability | active | inactive/retired | no org |
|------------|--------|------------------|--------|
| Login (user active) | yes | deny tenant | n/a |
| Portal | yes | no | n/a |
| Public site | if published & not overridden | no | n/a |
| Plan changes | yes | limited | n/a |
| Support actions | yes | yes | via application |

**Reject** new org status values `provisional` / `onboarding` / `pending`.

---

## 12. Last activity

**Canonical meaning (Foundation):** **last church-admin portal login** for users with roles on that org (`users.last_login_at` max among scoped roles).

Fallback display: `organization_onboarding.last_activity_at` updated on checklist/publish writes if no login yet.

**Do not** invent a free-text manually edited “last activity”.

---

## 13. Admin field placement

### `/admin/registration-applications` list
Show: application_status, church/contact, plan, submitted (`created_at`), provisioning_status, linked org key, verification summary, follow_up_status, assignee, last_contacted.  
Hide: full message body, IP/UA, raw password (never stored).

### Application detail
Intake payload, provisioning history/timestamps/error, linked org, contacts, retry affordance, follow-up controls (if org linked), audit.

### `/admin/organizations` list
Org status, product, plan, onboarding_status/%, publication aggregate, verification summary, follow_up (optional badge), last activity.

### Organization detail
Linked application, checklist, contacts, publication, support assignment, branches/plan (existing).

---

## 14. Dashboard metric sources (future)

| Metric | Counts | Filter | Click target | Double-count risk |
|--------|--------|--------|--------------|-------------------|
| New registrations today | **Applications** | `created_at::date = today` | `/admin/registration-applications?…` | Do not mix with orgs |
| New provisioned churches this week | **Organizations** with BlessBoard | `created_at` week + enrolment | `/admin/organizations?…` | Not applications |
| Awaiting first call | Orgs/onboarding | `follow_up_status in (new, call_pending)` | applications or orgs filter | Prefer orgs with onboarding |
| Provisioning failures | Applications | `provisioning_status=provisioning_failed` | applications | — |
| Unverified administrators | Users | `status=invited` (if used) else defer metric | org detail | Defer if all active |
| Onboarding incomplete | Orgs | onboarding not completed/skipped | organizations | — |
| Unpublished websites | Orgs | aggregate ≠ published | organizations | — |
| Published churches | Orgs | aggregate = published | organizations | — |
| Suspended organizations | Orgs/churches | org inactive or church suspended | organizations | Define one rule |

---

## 15. Status ownership matrix

| Concept | Owning table | Column | Initial | Allowed | Changed by | Trigger | PA visible | Church visible | Audit | Stored/derived |
|---------|--------------|--------|---------|---------|------------|---------|------------|----------------|-------|----------------|
| Application lifecycle | applications | application_status | submitted | submitted, duplicate_review, rejected, cancelled, closed | system/PA | submit/disposition | Y | N | Y | stored |
| Provisioning | applications | provisioning_status + organization_id | not_started | not_started, provisioning, provisioned, provisioning_failed | orchestrator | register/retry | Y | N | Y | stored |
| Verification | users | status (+ email_verified_at later) | invited or active | invited, active, inactive, suspended | system/PA | create/login | Y | self | Y forced | stored |
| Onboarding | organization_onboarding | onboarding_status + checklist | not_started | not_started, in_progress, completed, skipped | church/PA | checklist | Y | Y | Y terminal | hybrid |
| Follow-up | organization_onboarding | follow_up_status | new | (see §8) | PA | calls | Y | N | Y | stored |
| Publication | public_pages + aggregate | status / derived | unpublished | unpublished, ready_to_publish, published | church/PA | publish | Y | Y | page Y | hybrid |
| Org operational | organizations | status | active | active, inactive, retired | PA | suspend | Y | limited | Y | stored |
| Last activity | users / onboarding | last_login_at / last_activity_at | null | timestamps | system | login/write | Y | N | N | hybrid |

---

## 16. Required schema changes

### REQUIRED FOR FOUNDATION

| Change | Details |
|--------|---------|
| applications.`organization_id` | UUID NULL FK → organizations; index; set on provision |
| Split status | Add `application_status`, `provisioning_status`; backfill; drop old CHECK/`status` after cutover |
| Provisioning timestamps | `provisioning_started_at`, `provisioned_at`, `provisioning_failed_at`, `provisioning_error_code` nullable |
| `blessboard.organization_onboarding` | 1:1 org; follow-up + onboarding + assignment + contact timestamps + checklist JSONB |
| `blessboard.organization_support_contacts` | Append-only; FK org; optional application_id |

### OPTIONAL FOR FOUNDATION

| Change | Details |
|--------|---------|
| `users.email_verified_at` | If email verify ships |
| Cached `website_publication_status` | If derive is expensive |
| `rejected_at` / `closed_at` | Ops reporting |

### DEFERRED

| Change | Details |
|--------|---------|
| Email verification token tables | |
| Separate follow-up table | |
| New org status values | |
| Pre-provision follow-up columns on application | |
| V4 inquiry restore | Forbidden |

**Rollback:** additive columns first; dual-read old `status` during backfill; no destructive drop until verified.

---

## 17. Duplicate-prevention rules

1. No second tenant-status system.  
2. Onboarding truth not only on the application.  
3. Follow-up ≠ application_status.  
4. Publication ≠ organization.status.  
5. One overwrite note field **or** history table with clear deprecation — not both as truth.  
6. Do not duplicate full audit payloads into notes.  
7. One checklist (organization_onboarding), not admin vs church copies.  
8. “New churches” metrics: applications **or** orgs — never summed.  
9. No V4 inquiry statuses.  
10. Prefer Organization / Church / Application vocabulary (2A).

---

## 18. Deferred capabilities

Email verification flow; phone verify; multi-agent CRM; pastoral notes; SLA timers; auto-suspend on unreachable; path public “previewed” telemetry; paid onboarding packages.

---

## 19. Open owner decisions

1. Auto-`closed` application after provision vs leave `submitted`?  
2. First admin `invited` vs `active` at create?  
3. Suspend = church only, org only, or both?  
4. Unpublished public URL: soft page vs 404?  
5. Pre-provision support calls allowed before onboarding row exists?  
6. Exact checklist keys for Foundation MVP?  
7. Allow one email across multiple orgs?

---

## 20. Confirmation

- No application code changed  
- No migrations created or executed  
- No database records changed  
- No routes / admin screens / dashboard items added  
- No V4 code changed  

**Companions:** 2A entity/admin · 2C provisioning · 2D path routing
