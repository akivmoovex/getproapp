# V4 → V5 data mapping (inventory + design)

**Status:** design only — **no data migration executed**.  
**Sources:** `db/postgres/049_church_core.sql` … `126_*`, `src/db/pg/ensureChurchSchema.js`, `db/migrations/platform/*`, `db/migrations/blessboard/*`, repository code.  
**Constraint:** do **not** connect to hosted Supabase or production DBs for this work. Local tooling is dry-run / fixture-only until an explicit load phase is approved.

V4 BlessBoard church data lives in **`public.church_*`** (~129 tables) plus shared **`public.tenants`**, **`public.admin_users`**, and Express **`public.session`**.  
V5 targets are **`platform.*`** + **`blessboard.*`** only (separate foundation DB).

---

## 1. Principles

| Principle | Rule |
|-----------|------|
| Dual-run safety | V4 remains source of truth until cutover; V5 loads are additive and reversible via migration batch tags |
| Deterministic IDs | Every migrated row gets a stable UUID from `uuid_v5(namespace, "table:legacyId")` — re-runs produce the same IDs |
| Fail closed | Rows that cannot satisfy V5 CHECKs/triggers are **quarantined**, not partially inserted |
| No destructive downgrade | Migration never deletes V4 rows; V5 rollback deletes only rows tagged with the migration batch |
| Privacy | Drop national ID / health / family / raw bank credentials; redact audit metadata |
| Ownership | Platform owns orgs/domains/subscriptions; BlessBoard owns church catalogue and product data |
| Sessions | Never migrate `public.session`, `platform.deployment_sessions`, or `platform.auth_transfers` |

### Environment assignment

| V4 signal | V5 `data_environment` |
|-----------|------------------------|
| `church_organizations.data_environment` when present (`107`) | Map 1:1 if already `production`/`pilot`/`demo`/`testing` |
| Missing / unknown | **Decision required** — default proposal: `pilot` for non-prod hostnames, `production` only when explicitly flagged in run config |
| Org vs church | Must match exactly (`blessboard.churches` trigger rejects mismatch) |

### Ownership mapping (canonical)

```
public.tenants.id  ──(optional bridge note)──►  (not a V5 row; org is primary)
public.church_organizations.id  ──►  platform.organizations
                                 └──►  blessboard.churches (1:1 with org)
public.church_branches.id       ──►  blessboard.branches
branch host_slug / org slug     ──►  platform.domains (+ deployment)
```

V5 allows **one church per organization**. V4 already models one `church_organizations` row per tenant church network — that maps cleanly.

---

## 2. Migration order

| Step | Domain | Why |
|------|--------|-----|
| 0 | Seeds: `products`, `deployments`, `plans`, `plan_features` | Required FKs; not from V4 tenant rows |
| 1 | `platform.organizations` | Root identity |
| 2 | `platform.organization_products` | Church insert trigger requires active BlessBoard enrolment |
| 3 | `platform.organization_subscriptions` (+ optional entitlements) | From `plan_code` / package history |
| 4 | `platform.domains` | Hostname routing |
| 5 | `blessboard.churches` | Catalogue root |
| 6 | `blessboard.branches` | Requires church; designate HQ + primary |
| 7 | `blessboard.church_settings` / `branch_settings` | 1:1 settings |
| 8 | `blessboard.users` | Staff identities (email-normalized unique globally) |
| 9 | `blessboard.user_roles` | After users + org/church/branch |
| 10 | `blessboard.media_assets` (+ blob copy out-of-band) | Before announcement attachments / resources |
| 11 | Public content: pages → sections → leaders, ministries, events, sermons, contact_channels, giving_methods | Content FKs |
| 12 | `blessboard.members` → `member_branch_memberships` → registrations | People |
| 13 | Participation: `ministry_memberships`, `event_registrations` | After members + ministries/events |
| 14 | Announcements (+ audiences, attachments, optional reads) | After media + members |
| 15 | Aggregate attendance (`attendance_events` + `attendance_entries`) | Branch-scoped |
| 16 | Giving categories → entries | Needs staff user for `recorded_by_user_id` |
| 17 | Resources / forms / submissions / member_requests (+ history) | After media + members |
| 18 | `platform.audit_events` (optional, redacted) | Append-only; last |
| — | **Skip** | Sessions, auth transfers, per-member QR attendance, pastoral/safeguarding, billing invoices, groups/volunteers/surveys (Phase 2+) |

### Rollback strategy

1. Every load batch writes `migration_batch_id` into a **local** checkpoint store (and, when load is enabled, optional `notes` / mapping table — not yet implemented as destructive writes).
2. Rollback = delete V5 rows **created by that batch** in **reverse dependency order**, then restore checkpoint cursor.
3. V4 is untouched.
4. Dry-run mode never opens a write transaction on V5.

---

## 3. Source → target maps

For each legacy source below: source key, target, transformation, normalization, unsupported fields, duplicates, missing data, environment, ownership, order, rollback, reconciliation.

### 3.1 Tenants / organizations

#### `public.tenants` → *(bridge only)*

| Field | Value |
|-------|--------|
| **Source key** | `tenants.id` (INTEGER) |
| **Target** | No direct V5 table. Record in ID map as `tenant:{id}` → unused UUID for audit only |
| **Transformation** | Prefer `church_organizations` as the tenant identity for BlessBoard |
| **Normalization** | n/a |
| **Unsupported** | Entire row (GetPro multi-product tenant fields) |
| **Duplicates** | Multiple church orgs can share one tenant historically — map each org independently |
| **Missing data** | Orgs without tenant FK → quarantine |
| **Environment** | From linked org |
| **Ownership** | Platform |
| **Order** | 0 (optional note) |
| **Rollback** | Drop mapping entries only |
| **Reconciliation** | `SELECT COUNT(*) FROM public.tenants` vs mapped tenant notes |

#### `public.church_organizations` → `platform.organizations` + `blessboard.churches` + enrolment

| Field | Value |
|-------|--------|
| **Source key** | `church_organizations.id`; natural `slug` |
| **Target** | `platform.organizations` (`organization_key` ← slug); `platform.organization_products` (`product_tenant_key` ← slug); `blessboard.churches` (`church_key` ← slug, `organization_id` ← new org UUID) |
| **Transformation** | `display_name` ← `name`; status map: `active`→`active`, `inactive`/`suspended`→same on church, org `suspended`→`inactive`, `archived`/`dormant`→`retired` (org) + `archived` (church); `legal_name` ← optional column if present |
| **Normalization** | `slug` → lowercase key `^[a-z][a-z0-9_-]{0,63}$`; reject otherwise |
| **Unsupported** | `storage_bytes_*`, billing package columns beyond plan key, dormancy warning fields, account-manager links |
| **Duplicates** | Unique `organization_key` / `church_key`; on conflict → skip if same batch fingerprint, else quarantine |
| **Missing data** | Empty `name` → use slug; missing `data_environment` → run config default |
| **Environment** | See §1 |
| **Ownership** | Platform org + BlessBoard church |
| **Order** | 1–5 |
| **Rollback** | Delete church → org_product → org (batch-scoped) |
| **Reconciliation** | Count orgs by status; join map `legacy_org_id` ↔ `organization_id`; assert 1 church per migrated org |

#### Plan / subscription

| Field | Value |
|-------|--------|
| **Source key** | `church_organizations.plan_code` (+ optional `church_organization_package_history`) |
| **Target** | `platform.organization_subscriptions.plan_id` via `platform.plans.plan_key` |
| **Transformation** | Map `free`/`growth`/`professional`/`partner` 1:1 when valid; unknown → `free` + override note |
| **Unsupported** | Invoice lines, payment tokens, price book amounts (billing deferred) |
| **Duplicates** | One current subscription per org+product |
| **Missing data** | Null plan → `free` |
| **Order** | 3 |
| **Reconciliation** | `plan_code` histogram vs V5 `plan_key` histogram |

---

### 3.2 Churches / branches

Church catalogue is covered in §3.1 (`church_organizations` → `blessboard.churches`).

#### `public.church_branches` → `blessboard.branches`

| Field | Value |
|-------|--------|
| **Source key** | `id`; natural `(organization_id, slug)` |
| **Target** | `blessboard.branches` |
| **Transformation** | `branch_key` ← `slug`; `display_name` ← `name`; `branch_type`: first/HQ heuristic — if slug in (`hq`,`head-office`,`headquarters`) or org flag → `hq`, else `branch`; `is_primary`: exactly one per church (prefer HQ); status map including `archived`/`suspended` |
| **Normalization** | slug → key regex; `country` → `country_code` ISO-2 uppercase when valid |
| **Unsupported** | `welcome_message`, `service_times`, `location_text`, `pastor_name`, contact blobs (→ settings / public content); `member_registration_enabled` (→ settings policy later) |
| **Duplicates** | Unique `(church_id, branch_key)`; host_slug uniqueness handled under domains |
| **Missing data** | No HQ → create synthetic HQ branch `hq` from org name (**decision**) or quarantine |
| **Environment** | Inherited from church |
| **Ownership** | Church (no `organization_id` on branch row) |
| **Order** | 6 |
| **Rollback** | Delete branches by batch |
| **Reconciliation** | Branch counts per org; exactly one `hq` and one `is_primary` |

---

### 3.3 Domains

| Field | Value |
|-------|--------|
| **Source key** | `church_branches.host_slug` (unique when set); fallback `church_organizations.slug` |
| **Target** | `platform.domains` |
| **Transformation** | `hostname` ← `{host_slug}.{canonical_suffix}` for canonical type (suffix from run config, e.g. `blessboard.org`); custom hostnames if ever stored as FQDN → `domain_type=custom` only when entitled |
| **Normalization** | Lowercase; strip protocol/path/port; V5 trigger enforces |
| **Unsupported** | V4 has **no** `custom_domains` table — only slug-based hosts |
| **Duplicates** | Unique `hostname`; conflict → quarantine |
| **Missing data** | Empty host_slug → derive from org slug + branch key |
| **Environment** | Deployment code from run config (`blessboard-org-v5`) |
| **Ownership** | Org + product + deployment |
| **Order** | 4 |
| **Rollback** | Delete domains by batch |
| **Reconciliation** | Every active branch has ≥1 active domain OR documented exception |

---

### 3.4 Users / roles

V4 has **separate** admin tables (not unified users).

#### `public.church_hq_admins` → `blessboard.users` + `user_roles(church_hq_admin)`

| Field | Value |
|-------|--------|
| **Source key** | `id`; natural `(organization_id, username)` |
| **Target** | `blessboard.users`, `blessboard.user_roles` |
| **Transformation** | Prefer `email` column when present; else synthesize `username@{orgKey}.migrated.invalid` (**decision**); copy bcrypt `password_hash` if length 20–200; `display_name`; role scoped to church |
| **Normalization** | Email lower/trim; status map |
| **Unsupported** | Username-as-login; granular finance flags (`can_view_finance`); security_version counters (reset) |
| **Duplicates** | Global unique `email_normalized` — merge roles onto existing user if email collision |
| **Missing data** | No email + no username → quarantine |
| **Order** | 8–9 |
| **Reconciliation** | Count HQ admins vs `user_roles` where `role_key='church_hq_admin'` |

#### `public.church_branch_admins` → `users` + `user_roles(branch_admin)`

| Field | Value |
|-------|--------|
| **Source key** | `id`; `(branch_id, username)` |
| **Target** | Same pattern; role requires church_id + branch_id |
| **Unsupported** | Per-permission boolean flags (pastoral, attendance, finance…) — V5 uses coarse roles |
| **Duplicates** | Same email across branches → one user, multiple `branch_admin` roles |
| **Reconciliation** | Branch admin counts per branch |

#### `public.church_ministry_leaders` → *(Phase 2 / unsupported as staff role)*

| Field | Value |
|-------|--------|
| **Target** | No first-class V5 role; optional map to `blessboard.leaders` public profile **without** login, or quarantine credentials |
| **Unsupported** | Login accounts for ministry leaders |
| **Decision** | Whether leaders get invited `users` later |

#### `public.admin_users` (platform)

| Field | Value |
|-------|--------|
| **Target** | `blessboard.users` + `user_roles(platform_admin)` for BlessBoard platform operators only |
| **Unsupported** | Non-BlessBoard GetPro admin scope |

#### Sessions / password resets / login attempts

| Source | Target |
|--------|--------|
| `public.session` | **Do not migrate** |
| `church_login_attempts`, `*_password_reset_*`, `church_password_reset_rate_limits` | **Do not migrate** (ephemeral security) |

---

### 3.5 Members

#### `public.church_members` → `blessboard.members` + `member_branch_memberships`

| Field | Value |
|-------|--------|
| **Source key** | `id`; live unique `(branch_id, email)` / phone |
| **Target** | `blessboard.members` (church-scoped); `member_branch_memberships` (`is_primary=true` for home branch) |
| **Transformation** | Split `full_name` → `first_name`/`last_name` (last token = last name; missing → `"(unknown)"`); status: `verified`→`active`, `rejected`→`archived` or `inactive` (**decision**), `pending`→`pending`, `suspended`→`suspended`; **do not** auto-create `blessboard.users` from member passwords |
| **Normalization** | Email lower; phone → E.164 `+…`; require email or phone |
| **Unsupported** | `password_hash`, emergency contacts beyond policy, import_batch metadata (optional side table), national ID if added later, communication consent (until V5 column exists) |
| **Duplicates** | Same email on two branches of one org → **one member**, two memberships (merge); cross-org same email → separate members (church-scoped unique) |
| **Missing data** | No contact → quarantine; empty name → quarantine or placeholder |
| **Order** | 12 |
| **Rollback** | Delete memberships then members |
| **Reconciliation** | Member counts by status; membership count ≥ member count; contact uniqueness |

#### `church_member_branch_history`

| Field | Value |
|-------|--------|
| **Target** | No V5 history table yet — export to migration report JSON; optional future table |
| **Unsupported** | Full history replay |

#### `church_member_import_batches` / `_rows`

| Field | Value |
|-------|--------|
| **Target** | Skip operational import UI state |

---

### 3.6 Settings

#### `church_branch_website_content` → `church_settings` / `branch_settings` / public pages

| Field | Value |
|-------|--------|
| **Source key** | `branch_id` (1:1) |
| **Target** | `blessboard.branch_settings` (address/contact/geo); `blessboard.church_settings` (org-level website status); `public_pages`/`page_sections` for hero/about/mission/vision text; `leaders` from `leadership_json`; `ministries` seeds from `ministries_json` if structured |
| **Transformation** | JSON blobs → typed rows; invalid JSON → quarantine blob to report |
| **Unsupported** | Giving bank placeholders here (see giving settings); raw HTML if present (strip/reject) |
| **Duplicates** | 1:1 upsert by branch/church |
| **Missing data** | Create empty settings shells |
| **Order** | 7 then 11 |
| **Reconciliation** | Non-empty website fields produce ≥1 published or draft page section |

#### `church_giving_settings` → `giving_methods` (+ categories)

| Field | Value |
|-------|--------|
| **Target** | `blessboard.giving_methods` (instructions only — **no bank account numbers** in V5 public CMS if policy forbids); category names → `giving_categories` |
| **Unsupported** | Raw bank/MoMo secrets — store as “contact office” method or quarantine PII |
| **Decision** | Whether any payment detail is allowed in `giving_methods.instructions` |

#### Other V4 settings (`attendance_branch_rules`, `appointment_settings`, pastoral automation, communication policies)

| Field | Value |
|-------|--------|
| **Target** | **Unsupported in V5 schema today** — inventory only; Phase 2 |

---

### 3.7 Public content

| V4 source | V5 target | Notes |
|-----------|-----------|-------|
| `church_ministries` | `blessboard.ministries` | `slug` → not a V5 natural key (no unique slug); keep in ID map; status draft/published/archived |
| `church_departments` | *(unsupported)* | No V5 department table |
| `church_events` | `blessboard.events` | Map visibility/status; registration stack deferred |
| `church_sermons` | `blessboard.sermons` | `media_url`/`resource_url` strings; blob copy optional |
| Website leadership JSON / implicit leaders | `blessboard.leaders` | No business key — ID map only |
| Contact fields on website content | `contact_channels` | Split phone/email/social |
| — | `public_pages` + `page_sections` | Synthesize allowlisted `page_key` shells from content |

**Common rules:** church_id from org map; branch_id from branch map (nullable for church-wide); archived irreversible; publish requires active scope.

**Duplicates:** No natural keys on most content — use deterministic UUID from legacy id; re-run idempotent.

**Reconciliation:** Counts per type per church; published ≤ total.

---

### 3.8 Announcements

| V4 source | V5 target |
|-----------|-----------|
| `church_announcements` | `blessboard.announcements` (+ default audience `members`) |
| `church_announcement_attachments` | `media_assets` then `announcement_attachments` |
| `church_hq_broadcasts` (+ targets/deliveries) | Map broadcast → church-wide announcement **or** quarantine (no HQ broadcast entity in V5) |
| `church_feed_item_reads` | Optional `announcement_reads` when source is announcement |

| Field | Value |
|-------|--------|
| **Unsupported** | Delivery analytics, scheduled broadcast worker state, pin/feature flags if no V5 column |
| **Missing data** | Empty body → quarantine |
| **Order** | 14 |
| **Reconciliation** | Announcement counts; attachment count ≤ media assets linked |

---

### 3.9 Events / ministries (detail)

Covered under public content. Additional:

| V4 | V5 |
|----|-----|
| `church_member_ministries` | `ministry_memberships` |
| `church_ministry_join_requests` | `ministry_memberships` status `pending`/`rejected` |
| `church_event_registration_*` (full stack) | Partial: `event_registrations` for simple member↔event only; **form questions/answers unsupported** |
| `church_duty_roster`, activity notes | Unsupported Phase 2 |

---

### 3.10 Attendance

| V4 source | V5 target |
|-----------|-----------|
| `church_attendance_records` | `attendance_events` + `attendance_entries` |

| Field | Value |
|-------|--------|
| **Transformation** | One event per record; `event_date` ← `service_date`; `title` ← `service_label` or `"Service"`; `event_type` ← heuristic from label else `other`; status: `recorded`→`approved` (set `submitted_at`/`approved_at` ← `updated_at`), `void`→`archived`; `headcount` → entry category `other` or split if breakdown columns exist |
| **Unsupported** | **All per-member attendance:** `attendance_check_ins`, QR tokens, offline queue, exemptions, cross-branch auth, service sessions |
| **Missing data** | Need a system/staff `recorded` user — use designated migration actor user per org |
| **Order** | 15 |
| **Reconciliation** | Sum of entry counts = legacy headcount (within tolerance); void/archived counts |

---

### 3.11 Giving

| V4 source | V5 target |
|-----------|-----------|
| `church_giving_summaries` | `giving_entries` (+ ensure `giving_categories`) |
| Category JSON / settings | `giving_categories` |

| Field | Value |
|-------|--------|
| **Transformation** | `amount` ← `total_amount_cents / 100.0` as NUMERIC(14,2); `currency` ← `currency_code`; `giving_date` ← last day of `period_year`/`period_month`; status `draft`→`draft`, `finalized`→`approved`; category `general` default |
| **Unsupported** | Donor PII (none in summaries — good); invoice/billing tables; category cents columns beyond mapped JSON |
| **Duplicates** | Unique period in V4 → one entry (or one per category if split) |
| **Missing data** | `recorded_by_user_id` required → migration actor user |
| **Order** | 16 |
| **Reconciliation** | Sum amounts by branch-month vs legacy totals (cent-exact) |

#### `church_monthly_reports`

| Field | Value |
|-------|--------|
| **Target** | Unsupported as first-class V5 table — optional export JSON; figures already in attendance/giving |

---

### 3.12 Resources / forms / requests

| V4 source | V5 target |
|-----------|-----------|
| `church_resources` | `blessboard.resources` (and/or `forms` if `resource_type='form'` **and** schema can be synthesized — else URL-only resource) |
| `church_member_requests` | `member_requests` + initial `member_request_status_history` |
| `church_prayer_requests` | `member_requests` with `category='prayer'` |
| `church_public_contact_submissions` | Unsupported or future contact inbox |
| `church_event_registration_forms` / surveys | **Unsupported** (schema-driven V5 forms are allowlisted and different) |

| Field | Value |
|-------|--------|
| **Unsupported** | Survey branching, volunteer shifts, pastoral cases, safeguarding |
| **Order** | 17 |
| **Reconciliation** | Request counts by status; resources with `media_asset_id` resolve |

---

### 3.13 Attachments / media

| V4 source | V5 target |
|-----------|-----------|
| `church_announcement_attachments`, `church_hq_broadcast_attachments`, `church_pastoral_attachments` | `blessboard.media_assets` + link tables where they exist |
| Files on disk / object paths (`stored_filename`, `stored_relpath`) | Copy blob → V5 storage; set `storage_bucket`/`storage_key`/`sha256`/`byte_size`/`mime_type` |

| Field | Value |
|-------|--------|
| **Unsupported** | Pastoral polymorphic attachments until pastoral domain exists; files >50MB |
| **Missing data** | Missing file on disk → metadata quarantine, no asset row |
| **Order** | 10 (assets) then dependents |
| **Reconciliation** | File checksum match; orphan assets report |

---

### 3.14 Audit records

| V4 source | V5 target |
|-----------|-----------|
| `church_audit_logs` | `platform.audit_events` (optional) |

| Field | Value |
|-------|--------|
| **Transformation** | Map `actor_type`/`actor_id` → `actor_user_id` when resolvable; `action` ← legacy action; `outcome` default `success`; redact `metadata_json` via same rules as V5 audit service; `deployment_code` from run config |
| **Unsupported** | Unresolvable actors (store null); oversized metadata (truncate/drop keys) |
| **Duplicates** | Append-only — re-run must skip already-mapped legacy audit ids |
| **Order** | 18 |
| **Rollback** | **Cannot UPDATE/DELETE** audit_events — rollback = leave rows or use separate archive DB; prefer migrate-once |
| **Reconciliation** | Count migrated vs eligible legacy rows after redaction filter |

---

## 4. Explicitly out of scope (Phase 2+)

| Domain | V4 tables (examples) | Reason |
|--------|----------------------|--------|
| Billing / invoices | `church_billing_*`, trials, credits | No V5 billing yet |
| Per-member attendance | check-ins, QR, offline | V5 is aggregate-only |
| Pastoral / safeguarding | `church_pastoral_*`, incidents | No V5 tables |
| Groups / discipleship / volunteers | `church_groups*`, `117_*` | No V5 tables |
| Appointments / surveys | `116_*` | No V5 tables |
| Pilot flags / readiness / releases | `106`–`110`, `121` | Ops, not tenant CMS |
| HQ broadcast delivery analytics | deliveries/targets | No V5 equivalent |
| Express sessions | `public.session` | Ephemeral |

---

## 5. Duplicate strategy (summary)

| Entity | Strategy |
|--------|----------|
| Org / church / branch keys | Natural key unique; identical fingerprint → idempotent skip |
| Domains | Hostname unique; conflict quarantine |
| Users | Merge by `email_normalized`; attach additional roles |
| Members | Merge within church by email/phone; multi-branch → memberships |
| Content / announcements / attendance / giving | Deterministic UUID; idempotent upsert by ID map |
| Audit | Skip if legacy id already mapped |

---

## 6. Missing-data strategy (summary)

| Situation | Action |
|-----------|--------|
| Required FK missing | Quarantine row; continue batch |
| Invalid key/email/phone | Attempt normalize; else quarantine |
| Required V5 actor user | Create/use `migration-actor@{orgKey}.local` staff user |
| No HQ branch | Config policy: synthesize or fail org |
| Blob missing | Skip media; link dependents quarantine |
| Unknown plan_code | Assign `free` + note |

---

## 7. Reconciliation plan

For each migrated org (and global totals):

1. **Row counts** — legacy eligible vs V5 loaded vs quarantined.
2. **ID map coverage** — every successful load has `legacy_table+id` → UUID.
3. **Invariant checks** — 1 church/org; ≤1 HQ; ≤1 primary branch; membership primary uniqueness.
4. **Financial** — giving monthly totals match cents.
5. **Attendance** — headcount sums match.
6. **Auth** — every V4 HQ/branch admin email maps to a role with correct scope.
7. **Domains** — hostnames resolve for active branches.
8. **Orphans** — V5 FKs point only to mapped parents.

Tooling emits a **reconciliation report** JSON (see §8). Example SQL shapes (run against paired local extracts — not hosted):

```sql
-- Orgs
SELECT COUNT(*) FROM church_organizations WHERE status = 'active';
-- vs
SELECT COUNT(*) FROM platform.organizations o
JOIN migration_id_map m ON m.v5_table = 'platform.organizations' AND m.v5_id = o.id;

-- Giving cents
SELECT branch_id, period_year, period_month, total_amount_cents
FROM church_giving_summaries WHERE status = 'finalized';
-- vs sum(giving_entries.amount * 100) grouped by mapped branch + month
```

---

## 8. Local migration tooling architecture

Package path: `src/migration/v4ToV5/`.

| Component | Responsibility |
|-----------|----------------|
| **Extract interface** | `extract(entity, cursor) → { rows, nextCursor }` — reads from fixture files or a **local** PG URL only; never hosted |
| **Transform interface** | Pure `transform(entity, row, ctx) → { ok, record, warnings, quarantine? }` |
| **Load interface** | `load(entity, records, { dryRun })` — **dry-run default**; real writes gated behind explicit future flag (not implemented) |
| **ID map** | Deterministic UUID v5; persistent JSON checkpoint file |
| **Checkpointing** | Per-entity cursor + batch id + counts |
| **Dry-run mode** | Transforms + validates + reports; zero V5 writes |
| **Reconciliation report** | Counts, mismatches, quarantine samples |

See module README in `src/migration/v4ToV5/index.js` exports.

---

## 9. Blockers requiring product decisions

1. Default `data_environment` when V4 column missing.
2. Synthetic email policy for username-only admins.
3. Whether to synthesize an HQ branch when none exists.
4. Canonical hostname suffix / deployment pairing for `host_slug`.
5. Member `rejected` → `archived` vs `inactive`.
6. Whether member login passwords are invited-reset only (recommended) vs hash copy into `users`.
7. HQ broadcasts → announcements vs drop.
8. Giving settings: allow payment details in `giving_methods` or strip.
9. Ministry leader accounts: public `leaders` only vs future role.
10. Audit migration: migrate / sample / skip (append-only complicates rollback).
11. Custom domain entitlement when importing FQDN hosts on free plans.
12. Phase 2 scope priority among pastoral, groups, per-member attendance, billing.

---

## 10. Authority references

- V4 apply list: `src/db/pg/ensureChurchSchema.js`
- V4 model doc: `docs/church/CHURCH_DATABASE_MODEL.md`
- V5 architecture: `docs/database/ARCHITECTURE.md`
- Mapping tests: `npm run test:migration:mapping`
