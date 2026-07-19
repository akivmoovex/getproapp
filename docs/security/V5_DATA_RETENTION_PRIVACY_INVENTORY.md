# BlessBoard V5 — Data retention and privacy inventory

**Date:** 2026-07-19  
**Nature:** Technical inventory for operators and engineers — **not legal advice**  
**Mode:** Documentation only — **do not** change schema or delete data from this document  
**Companions:** [`AUDIT_RETENTION.md`](../database/AUDIT_RETENTION.md) · [`V5_BACKUP_RECOVERY_REQUIREMENTS.md`](../operations/V5_BACKUP_RECOVERY_REQUIREMENTS.md) · [`V5_LOGGING_DATA_EXPOSURE_AUDIT.md`](./V5_LOGGING_DATA_EXPOSURE_AUDIT.md) · [`ARCHITECTURE.md`](../database/ARCHITECTURE.md)

---

## Standing rules

| Rule | Detail |
|------|--------|
| Legal periods | **Do not invent.** Where product/ops has not decided, mark **POLICY DECISION REQUIRED** |
| Documented only | Audit **400-day** online retention is the main **documented** product retention number found for V5 |
| Soft delete ≠ erasure | Status `archived` / `void` / `revoked` is not a documented right-to-erasure workflow |
| Tenant scope | Most church data is scoped by `church_id` / `branch_id` / `organization_id` — deletion must not cross tenants |
| Backups | DB/storage backups may retain copies after app-level archive — see backup requirements |

### Column glossary for inventory tables

| Column | Meaning |
|--------|---------|
| **Data** | Tables / stores |
| **Purpose** | Why stored |
| **Scope** | Tenant / deployment boundary |
| **Sensitivity** | Rough technical class (not a legal rating) |
| **Current retention** | What exists in code/docs today |
| **Deletion support** | Product/ops capability observed |
| **Export support** | Product/ops capability observed |

### Sensitivity labels (technical)

| Label | Examples |
|-------|----------|
| **HIGH** | Credentials, session/transfer security material, private notes, form answers, private media |
| **FINANCIAL** | Giving amounts/references (aggregate; no card/bank instruments in schema) |
| **PII** | Names, email, phone |
| **OPERATIONAL** | Counts, statuses, catalogue keys |
| **SECURITY** | Hashes, throttle state, audit security events |

---

## Inventory

### 1. User accounts

| Data | Purpose | Scope | Sensitivity | Current retention | Deletion support | Export support |
|------|---------|-------|-------------|-------------------|------------------|----------------|
| `blessboard.users` (`email_*`, `password_hash`, `display_name`, `status`, `last_login_at`) | Login identity | Global unique email; tenant via roles/sessions | **HIGH** (credential) + **PII** | **POLICY DECISION REQUIRED** | Soft `status` (`active`/`inactive`/`suspended`/`invited`); no hard-delete product path found; FKs often `ON DELETE RESTRICT` | None (CLI create only) |

---

### 2. Roles

| Data | Purpose | Scope | Sensitivity | Current retention | Deletion support | Export support |
|------|---------|-------|-------------|-------------------|------------------|----------------|
| `blessboard.user_roles` | Authorization assignments | `organization_id` required; `church_id` / `branch_id` per role | **OPERATIONAL** (maps user→tenant power) | **POLICY DECISION REQUIRED** | Soft `status`; no hard-delete product path found | None (CLI assign only) |

**Tenant-scope deletion:** Role rows **must** be considered when removing a person from an org/church.

---

### 3. Member profiles

| Data | Purpose | Scope | Sensitivity | Current retention | Deletion support | Export support |
|------|---------|-------|-------------|-------------------|------------------|----------------|
| `blessboard.members`, `blessboard.member_branch_memberships` | Church person record + branch membership | `church_id`; memberships `branch_id` | **PII** (names, email, phone). Migration states: no national ID/health/financial/family columns | **POLICY DECISION REQUIRED** | Soft archive (`status` includes `archived`; reactivation blocked by trigger). Memberships soft status | **None** (bulk member export out of scope in architecture docs) |

---

### 4. Registrations

| Data | Purpose | Scope | Sensitivity | Current retention | Deletion support | Export support |
|------|---------|-------|-------------|-------------------|------------------|----------------|
| `blessboard.member_registrations` | Join / intake workflow | `church_id`, `branch_id` | **PII** + **HIGH** (`review_notes` may contain private staff notes) | **POLICY DECISION REQUIRED** | Soft lifecycle (`submitted`/`approved`/`rejected`/`withdrawn`); no hard-delete product path found | **None** (explicitly out of scope) |

---

### 5. Announcements and read tracking

| Data | Purpose | Scope | Sensitivity | Current retention | Deletion support | Export support |
|------|---------|-------|-------------|-------------------|------------------|----------------|
| `blessboard.announcements`, `announcement_audiences`, `announcement_reads`, `announcement_attachments` | Church communications + read receipts | `church_id`; optional `branch_id` | **OPERATIONAL** / possible **PII** in `title`/`body`; reads link `member_id` | **POLICY DECISION REQUIRED** | Soft archive on announcement (“no hard delete” in migration/admin). Child audience/attachment rows may be replaced (DELETE children on edit). Reads cascade with parent/member | None |

---

### 6. Ministry memberships

| Data | Purpose | Scope | Sensitivity | Current retention | Deletion support | Export support |
|------|---------|-------|-------------|-------------------|------------------|----------------|
| `blessboard.ministry_memberships` | Ministry join / roster | `church_id` (+ ministry) | **PII** link via `member_id`; **HIGH** if `message` / `review_notes` hold private text | **POLICY DECISION REQUIRED** | Soft statuses (`pending`/`active`/`rejected`/`left`/`cancelled`); member FK may `ON DELETE CASCADE` | None |

---

### 7. Event registrations

| Data | Purpose | Scope | Sensitivity | Current retention | Deletion support | Export support |
|------|---------|-------|-------------|-------------------|------------------|----------------|
| `blessboard.event_registrations` | RSVP / event signup | `church_id` | **PII** via `member_id` | **POLICY DECISION REQUIRED** | Soft cancel (`cancelled` + `cancelled_at`); row retained (unique member+event) | None |

---

### 8. Attendance summaries

| Data | Purpose | Scope | Sensitivity | Current retention | Deletion support | Export support |
|------|---------|-------|-------------|-------------------|------------------|----------------|
| `blessboard.attendance_events`, `blessboard.attendance_entries` | Aggregate headcounts (not individual check-in lists) | `church_id`, `branch_id` | **OPERATIONAL**; `notes` on entries may be **HIGH** if free text used for private remarks | **POLICY DECISION REQUIRED** | Soft archive on events; entry rows may be **hard-deleted** when counts rewritten | No CSV product export; HQ reports UI only |

---

### 9. Giving summaries

| Data | Purpose | Scope | Sensitivity | Current retention | Deletion support | Export support |
|------|---------|-------|-------------|-------------------|------------------|----------------|
| `blessboard.giving_categories`, `blessboard.giving_entries`; CMS `blessboard.giving_methods` | Aggregate giving tracking + public giving instructions | `church_id`; entries `branch_id` | **FINANCIAL** (`amount`, `currency`, `reference`, `notes`, `void_reason`). **No** card/bank/gateway secret columns in schema | **POLICY DECISION REQUIRED** | Soft archive categories; soft `void` entries (no reactivate). Methods draft/published/archived | None |

---

### 10. Resources

| Data | Purpose | Scope | Sensitivity | Current retention | Deletion support | Export support |
|------|---------|-------|-------------|-------------------|------------------|----------------|
| `blessboard.resources` | Member/admin resource library (links to media) | `church_id`; optional `branch_id` | **OPERATIONAL** / **HIGH** if linked media is private | **POLICY DECISION REQUIRED** | Soft archive | File download of linked media (not a data dump). **Note:** public website CMS (`public_pages`, etc.) is separate from `resources` |

---

### 11. Forms and submissions

| Data | Purpose | Scope | Sensitivity | Current retention | Deletion support | Export support |
|------|---------|-------|-------------|-------------------|------------------|----------------|
| `blessboard.forms`, `blessboard.form_submissions` | Custom forms + answers | `church_id`; branch scope as modeled | **HIGH** — `answers_json` may contain arbitrary **PII** / private content; `schema_json` defines fields | **POLICY DECISION REQUIRED** | Soft archive on forms and submissions; no hard-delete product path found | **None** (no bulk export endpoint found) |

---

### 12. Requests and history

| Data | Purpose | Scope | Sensitivity | Current retention | Deletion support | Export support |
|------|---------|-------|-------------|-------------------|------------------|----------------|
| `blessboard.member_requests`, `blessboard.member_request_status_history` | Member care / help requests | `church_id`, `branch_id` | **HIGH** — `subject`, `message`, history `note` are private-note class; optional private `media_asset_id` | **POLICY DECISION REQUIRED** | Soft close statuses; migration: no hard deletes for requests. History is **append-style** (inserts; no history UPDATE/DELETE found) | None |

---

### 13. Media metadata

| Data | Purpose | Scope | Sensitivity | Current retention | Deletion support | Export support |
|------|---------|-------|-------------|-------------------|------------------|----------------|
| `blessboard.media_assets` (+ object storage binaries) | Upload library | `church_id`; optional `branch_id` | **HIGH** for private assets (`original_filename`, storage keys, uploader). Binaries are separate store | Metadata: **POLICY DECISION REQUIRED**. Objects: **POLICY DECISION REQUIRED** (see backup doc) | Soft archive (`status` + `archived_at`); object retention **UNKNOWN** / provider | Authenticated private download — not metadata export |

---

### 14. Audit events

| Data | Purpose | Scope | Sensitivity | Current retention | Deletion support | Export support |
|------|---------|-------|-------------|-------------------|------------------|----------------|
| `platform.audit_events` | Security/ops audit trail | `organization_id` required; optional `church_id`/`branch_id`; `deployment_code` | **SECURITY** / **OPERATIONAL**; `metadata_json` allowlisted/redacted in app | **Documented: 400 days** online default; soft target ≥12 months HQ-visible (`AUDIT_RETENTION.md`). Longer archive: **POLICY DECISION REQUIRED** | **Append-only** (triggers block UPDATE/DELETE). Ops-only purge after retention | HQ list UI; **no CSV/export** documented |

---

### 15. Sessions

| Data | Purpose | Scope | Sensitivity | Current retention | Deletion support | Export support |
|------|---------|-------|-------------|-------------------|------------------|----------------|
| `platform.deployment_sessions` | Authenticated browser sessions | `deployment_code`, `organization_id`, optional church/branch | **SECURITY** — `session_token_hash`, `ip_hash`, `user_agent_hash` (raw token in cookie only) | Absolute TTL in app (~12h) + `expires_at`; revoked rows: **POLICY DECISION REQUIRED** for row purge | Soft revoke (`revoked_at`); expire by TTL | None |

---

### 16. Authentication-transfer records

| Data | Purpose | Scope | Sensitivity | Current retention | Deletion support | Export support |
|------|---------|-------|-------------|-------------------|------------------|----------------|
| `platform.auth_transfers` | Apex↔tenant auth handoff | org/church/branch + `deployment_code` | **SECURITY** — `transfer_token_hash`; `requested_hostname`, `return_path` | Short TTL (≤5 min in service); consumed/expired row purge: **POLICY DECISION REQUIRED** | Consume (`consumed_at`) / expire; no product hard-delete found | None |

---

### 17. Login throttling records

| Data | Purpose | Scope | Sensitivity | Current retention | Deletion support | Export support |
|------|---------|-------|-------------|-------------------|------------------|----------------|
| **No Postgres table** — in-process `express-rate-limit` MemoryStore; key = SHA-256(`email\|ip`) | Brute-force / abuse control | Per Node worker (not shared across instances) | **SECURITY** (ephemeral hashed key material) | Ephemeral — lost on process restart; window e.g. login 20 / 15 min | N/A (memory) | N/A |

---

## Cross-cutting identification

### Data with no documented retention policy

All of §1–13 and §15–16 **except** audit’s 400-day online default → **POLICY DECISION REQUIRED**.  
Media **object** soft-delete retention → **POLICY DECISION REQUIRED**.  
Backup retention of PII copies → see backup requirements (also decision needed).

### Append-only data

| Store | Nature |
|-------|--------|
| `platform.audit_events` | Enforced append-only; ops purge only after retention |
| `blessboard.member_request_status_history` | Append-style history inserts |

### Data that may contain private notes

| Store | Fields |
|-------|--------|
| Registrations | `review_notes` |
| Ministry memberships | `message`, `review_notes` |
| Attendance entries | `notes` |
| Giving entries | `notes`, `void_reason` |
| Member requests + history | `subject`, `message`, `note` |
| Form submissions | `answers_json` (arbitrary) |
| Announcements | `body` (unstructured) |

### Financial information

| Store | What | What is **not** stored |
|-------|------|------------------------|
| `giving_entries` | Aggregate `amount` / `currency` / `reference` | Card numbers, bank accounts, gateway API secrets |
| `giving_methods` | Public instructions / external URL | Payment processor credentials |

### Session / security data

| Store | Notes |
|-------|-------|
| `deployment_sessions` | Token **hash** only in DB |
| `auth_transfers` | Token **hash** only; short TTL |
| Login throttle | Memory only; hashed email\|ip key |
| Audit | Must not store passwords/tokens (documented exclusions) |
| `users.password_hash` | Credential material — HIGH |

### Records requiring tenant-scope deletion

Any erasure or offboarding workflow **must** be scoped and ordered across at least:

- `user_roles` for the organization/church/branch  
- `members` + memberships + registrations for `church_id`  
- participation, announcements reads, forms/submissions, requests  
- media assets for `church_id`  
- sessions / transfers for that tenant context  
- audit remains append-only (do not “fix” history by delete without ops purge policy)

**No complete tenant-wipe product tooling was found** — treating tenant erasure as **MISSING TOOLING** + **POLICY DECISION REQUIRED**.

### Data migration implications (V4→V5)

| Topic | Implication |
|-------|-------------|
| PII copy | Migrate copies names/emails/phones/admins into V5; dual retention until V4 decommission policy |
| Giving | Aggregates may migrate; payment **secrets** must not be copied (strip/quarantine policy in cutover docs) |
| Media | Metadata may migrate; **blobs often deferred** — V4 may remain blob SoR temporarily |
| Audit | Volume/append-only implications called out in migration readiness (M12) |
| Quarantine | Invalid/missing-contact rows may be skipped — not silent “deletion” of source |
| Sessions/transfers/throttle | **Not** meaningful migrate targets (ephemeral/security) |

### Backup-retention implications

| Topic | Implication |
|-------|-------------|
| Soft archive | Remains in DB backups until backup retention elapses |
| Audit 400-day purge | Older rows may still exist in snapshots taken before purge |
| Media objects | Storage backup/versioning separate from Postgres — **UNKNOWN** without evidence |
| Logical dumps | May contain full PII — handle as **HIGH** sensitivity artifacts |
| Secret store | App secrets are **not** in DB backup — rotate/retain separately |

---

## Report summary

### 1. Data categories inventoried

User accounts; roles; member profiles; registrations; announcements + reads; ministry memberships; event registrations; attendance summaries; giving summaries; resources; forms + submissions; requests + history; media metadata (+ objects noted); audit events; sessions; auth transfers; login throttling (memory).

### 2. High-sensitivity areas

| Area | Why |
|------|-----|
| `password_hash` / sessions / transfers | Credential and session security |
| Form `answers_json`, request messages, review notes | Unstructured private content |
| Private media objects + metadata | Confidential files |
| Member/registration PII | Identity contact data |
| Giving amounts | Financial aggregates (instrument data absent by design) |
| Audit metadata | Security-relevant trail (redacted, still sensitive) |

### 3. Missing retention decisions (**POLICY DECISION REQUIRED**)

- Users, roles, members, registrations, announcements/reads, participation, attendance, giving, resources, forms/submissions, requests (beyond soft status)  
- Session/transfer **row** purge after expiry  
- Media object retention after archive  
- Audit **archive** longer than 400-day online (if legally needed — not prescribed here)  
- Backup retention of PII-bearing snapshots  
- Tenant offboarding / erasure SLA  

### 4. Missing deletion / export tooling

| Gap | Status |
|-----|--------|
| Hard delete / right-to-erasure workflows | **Missing** (soft status/archive dominant) |
| Tenant-scoped wipe | **Missing** |
| Member/registration/forms bulk **export** | **Missing** (export often explicitly out of scope) |
| Audit CSV export | **Missing** (list UI only) |
| Giving/attendance CSV export | **Missing** (reports UI only) |
| Audit ops purge runbook usage | Documented pattern exists; not a product button |
| Login throttle persistence | N/A (memory) |

### 5. Suggested commit message

```
Document V5 data retention and privacy inventory.

Inventory personal and operational stores with sensitivity, deletion/export gaps, and required policy decisions without inventing legal periods.
```

---

## Conclusion

This inventory maps V5 technical data stores and highlights that **almost all retention beyond audit’s 400-day online default is undecided**, soft-archive is not erasure, and **export/tenant-deletion tooling is largely absent**. No schema was changed and no data was deleted.
