# BlessBoard V5 — Backup and recovery requirements

**Date:** 2026-07-19  
**Mode:** Requirements documentation only — **do not** configure, trigger, or verify hosted backups from this file  
**Purpose:** Define what must be backed up, who owns it, and what remains unknown before migration apply and cutover  
**Companions:** [`V5_HOSTED_MIGRATION_AND_CUTOVER.md`](../database/V5_HOSTED_MIGRATION_AND_CUTOVER.md) · [`V4_TO_V5_ROLLBACK_REHEARSAL.md`](../migrations/V4_TO_V5_ROLLBACK_REHEARSAL.md) · [`V5_INCIDENT_RESPONSE.md`](./V5_INCIDENT_RESPONSE.md) · [`V5_MONITORING_REQUIREMENTS.md`](./V5_MONITORING_REQUIREMENTS.md)

---

## Standing rules

| Rule | Detail |
|------|--------|
| No false claims | **Do not** mark a backup as existing without ticket evidence (snapshot ID, PITR point, dump path, restore test notes) |
| This audit | Creating this document **does not** create or prove any backup |
| Secrets | Backup artifacts must not embed plaintext DB URLs, `SESSION_SECRET`, passwords, or raw tokens; store credentials in the approved secret store only |
| No V5→V4 reverse-write | Recovery does not mean syncing V5 rows back into V4 |
| Classification honesty | Use exactly: **VERIFIED** · **DOCUMENTED ONLY** · **UNKNOWN** · **EXTERNAL RESPONSIBILITY** |

### Classification definitions

| Class | Meaning |
|-------|---------|
| **VERIFIED** | Confirmed in-repo (code/schema/docs present) **or** ticket evidence cited in a filled evidence row — not assumed |
| **DOCUMENTED ONLY** | Required or described in runbooks/code comments; hosted backup/restore **not** evidenced here |
| **UNKNOWN** | No evidence in this repo pass that backup exists, is enabled, or was restore-tested for the intended project |
| **EXTERNAL RESPONSIBILITY** | Owned by a provider or host (Supabase, Hostinger, Git host); BlessBoard ops must still **record** evidence |

---

## 1. Area catalogue

For each area: what must be backed up, responsible system, retention decision, restore verification, relationship checks, secret handling, and classification.

### 1.1 Supabase database backups

| Field | Requirement |
|-------|-------------|
| What | Full Postgres project used by V5 (`DATABASE_URL` target): platform + blessboard schemas, including identity, catalogue, users/roles, content, ops, media metadata, `platform.schema_migrations`, sessions tables as deployed |
| Responsible system | **Supabase** (PITR / daily backups / manual snapshot — plan-dependent) |
| Retention decision needed | **YES** — plan tier retention days; how long to keep pre-apply and pre-cutover snapshot IDs; who may purge |
| Restore verification | Restore to a **non-production** project or approved clone; run `db:identity:check` + `db:verify:foundation` + sample counts — **not** claimed done in this doc |
| Relationship integrity | After restore: org→church→branch; domain→org/deployment; member→org; role→user; no unexpected `public.tenants` |
| Secret handling | Connection strings only in secret store; snapshot IDs are OK in tickets; never paste restored DB passwords into git |
| Classification | **EXTERNAL RESPONSIBILITY** + **DOCUMENTED ONLY** (cutover requires recording snapshot/PITR) + **UNKNOWN** (no evidence in this pass that the intended hosted project backup is enabled, current, or restore-tested) |

### 1.2 Migration checkpoints

| Field | Requirement |
|-------|-------------|
| What | `V4_TO_V5_OUTPUT_DIR/state/` checkpoint JSON + plan/dry-run/apply/conflict/skip/reconciliation reports for each migrate window |
| Responsible system | **Operator workstation / ticket artifact store** (tooling writes local JSON; not Supabase) |
| Retention decision needed | **YES** — keep until rollback window ends + post-incident period; then archive or destroy per ticket |
| Restore verification | Checkpoints are for **resume/forensics**, not full DB restore; verify artifact completeness (files listed in cutover §7) |
| Relationship integrity | N/A directly; use with DB restore + reconciliation template |
| Secret handling | Scrub any accidental URL paste from artifacts before archiving; summaries must stay console-safe |
| Classification | **VERIFIED** (code writes checkpoints) · **DOCUMENTED ONLY** (hosted artifact retention process) · **UNKNOWN** (whether any hosted-run artifacts currently exist) |

### 1.3 Schema migration history

| Field | Requirement |
|-------|-------------|
| What | `platform.schema_migrations` ledger + checksum-verified migration files in git (`db/migrations/**`) |
| Responsible system | **Inside Supabase DB backup** + **Git** for source SQL |
| Retention decision needed | **YES** — DB retention follows §1.1; git tag retention separate |
| Restore verification | After DB restore: `npm run db:status` / foundation verify; ledger matches expected heads |
| Relationship integrity | Applied versions consistent with app release tag |
| Secret handling | Migration SQL should not contain production secrets |
| Classification | **VERIFIED** (table + migrator in repo) · backup of hosted ledger = **UNKNOWN** / covered only if §1.1 evidenced |

### 1.4 Platform identity records

| Field | Requirement |
|-------|-------------|
| What | `platform.database_identity` (and related identity fields used by gates) |
| Responsible system | **Supabase DB backup** |
| Retention decision needed | Same as §1.1; identity row is **high criticality** for safe boot |
| Restore verification | `DATABASE_IDENTITY_EXPECTED` match via `db:identity:check`; never “fix” by rewriting identity to match a wrong DB without incident process |
| Relationship integrity | `environment_code` aligns with `DEPLOYMENT_ENV` policy for that project |
| Secret handling | Identity keys are not passwords but treat project binding as sensitive operational data |
| Classification | **VERIFIED** (schema/gates in repo) · hosted backup **UNKNOWN** without §1.1 evidence |

### 1.5 Organization / church / branch catalogue

| Field | Requirement |
|-------|-------------|
| What | `platform.organizations`, enrolments, deployments links, `blessboard.churches`, `blessboard.branches`, domains as deployed |
| Responsible system | **Supabase DB backup** |
| Retention decision needed | Same as §1.1; catalogue is required for routing |
| Restore verification | Count + UUID/key samples per reconciliation template; domain→org checks |
| Relationship integrity | **Required:** org↔church↔branch; domain hostname→org/deployment |
| Secret handling | No passwords in catalogue; avoid dumping member PII when verifying |
| Classification | **DOCUMENTED ONLY** / **UNKNOWN** for hosted backup evidence |

### 1.6 User and role records

| Field | Requirement |
|-------|-------------|
| What | Users, credentials **hashes**, role assignments (HQ/BA/PA/member as modeled) |
| Responsible system | **Supabase DB backup** |
| Retention decision needed | Same as §1.1; define who may access restored PII |
| Restore verification | Sample auth path on restored clone; role→user→org/branch links |
| Relationship integrity | Roles scoped to correct org/branch UUIDs; no cross-tenant role rows |
| Secret handling | **Never** export password hashes to chat/git; restored DB access tightly controlled; app secrets (`SESSION_SECRET`) are **not** in DB — back up separately in secret store |
| Classification | **DOCUMENTED ONLY** / **UNKNOWN** for hosted backup evidence |

### 1.7 Public content

| Field | Requirement |
|-------|-------------|
| What | Published/draft pages, events, and related public CMS rows in blessboard content tables |
| Responsible system | **Supabase DB backup** |
| Retention decision needed | Same as §1.1 |
| Restore verification | Sample page_key rows; published flags; org/church FK |
| Relationship integrity | Content → church/org; no orphan published pages for missing church |
| Secret handling | Content may include contacts — treat restores as confidential |
| Classification | **DOCUMENTED ONLY** / **UNKNOWN** for hosted backup evidence |

### 1.8 Operational data

| Field | Requirement |
|-------|-------------|
| What | Attendance, giving summaries, announcements, forms/requests (as in scope), audit events, registrations — per deployed modules |
| Responsible system | **Supabase DB backup** |
| Retention decision needed | **YES** — audit/append-only retention may exceed general DB tier; decide explicitly |
| Restore verification | Module counts + sample FK to org/branch; audit immutability expectations documented |
| Relationship integrity | Ops rows → org/branch; giving/attendance scope checks |
| Secret handling | Strip payment secrets already policy for migrate; do not copy payment secrets into tickets |
| Classification | **DOCUMENTED ONLY** / **UNKNOWN** for hosted backup evidence |

### 1.9 Media metadata

| Field | Requirement |
|-------|-------------|
| What | Media library rows (keys, visibility, content-type, church scope) |
| Responsible system | **Supabase DB backup** |
| Retention decision needed | Same as §1.1 |
| Restore verification | Metadata rows exist; public/private flags; church scope |
| Relationship integrity | Metadata → church; object key referenced in storage |
| Secret handling | Do not log signed URLs into backup tickets |
| Classification | **DOCUMENTED ONLY** / **UNKNOWN** for hosted backup evidence |

### 1.10 Uploaded media objects

| Field | Requirement |
|-------|-------------|
| What | Binary objects in object storage (e.g. Supabase Storage buckets used by V5 media) |
| Responsible system | **EXTERNAL RESPONSIBILITY** (storage provider) — **separate** from Postgres backup |
| Retention decision needed | **YES** — bucket versioning/replication; retention after soft-delete; pre-cutover copy policy |
| Restore verification | Object exists for metadata key; checksum if available; authz on private objects |
| Relationship integrity | Every public/private metadata row resolves or is intentionally tombstoned |
| Secret handling | Storage service keys only in secret store; rotate if leaked |
| Classification | **EXTERNAL RESPONSIBILITY** · **DOCUMENTED ONLY** (blob migrate often deferred — readiness H3/B08) · **UNKNOWN** whether bucket backup/versioning is enabled for the intended project |

### 1.11 Deployment configuration documentation

| Field | Requirement |
|-------|-------------|
| What | Hostinger env **variable names and approved values that are non-secret**; runbooks; DNS inventory templates; `PLATFORM_DEPLOYMENT_CODE`, routing mode policy |
| Responsible system | **Git docs** + **ticket** for live panel screenshots (redacted) + **secret store** for secret values |
| Retention decision needed | **YES** — how long to keep redacted panel evidence packs |
| Restore verification | Rebuild env from documented reference + secret store; identity check; healthz |
| Relationship integrity | `PLATFORM_DEPLOYMENT_CODE` matches DB deployment; `GETPRO_DATABASE_URL` unset |
| Secret handling | Never commit `DATABASE_URL` / `SESSION_SECRET` / passwords; document **presence** only |
| Classification | **VERIFIED** (env reference + runbooks in repo) · live Hostinger config backup **UNKNOWN** · secrets **EXTERNAL** to secret store (process **DOCUMENTED ONLY**) |

### 1.12 Git repository and tags

| Field | Requirement |
|-------|-------------|
| What | Application source, migrations, docs; **annotated tags** for cutover releases |
| Responsible system | **Git host** (remote) + developer clones |
| Retention decision needed | **YES** — protected branch rules; tag immutability; how long forks retain |
| Restore verification | `git checkout <TAG>`; install; test suite subset; confirm migration files match DB ledger expectation |
| Relationship integrity | Tag SHA recorded on cutover ticket matches deployed package |
| Secret handling | `.env` must remain untracked; scan history if leak suspected |
| Classification | **VERIFIED** (repo exists in workspace) · remote replication/backup policy **UNKNOWN** / **EXTERNAL RESPONSIBILITY** (Git host) without ticket evidence |

---

## 2. Cross-cutting requirements

### 2.1 What must be backed up (minimum for cutover)

| # | Asset | Required before apply? | Required before authoritative? |
|---|-------|------------------------|--------------------------------|
| 1 | V4 DB dump or provider backup (legacy SoR) | **YES** | **YES** |
| 2 | V5 Supabase snapshot / PITR point ID recorded | **YES** | **YES** |
| 3 | Migration artifact dir (if migrate in window) | At apply | Keep through rollback window |
| 4 | Git tag / SHA of release | **YES** | **YES** |
| 5 | Secret store entries current | **YES** | **YES** |
| 6 | Media **objects** (if blobs are SoR on V5) | If blobs in use | **YES** if V5-only media |
| 7 | Redacted Hostinger env evidence | Recommended | **YES** |

Until rows in the evidence register (§6) are filled, treat hosted backup status as **UNKNOWN**.

### 2.2 Retention decision needed (checklist)

Operators must record decisions (ticket), not invent defaults here:

| Decision | Options to choose | Recorded? |
|----------|-------------------|-----------|
| Supabase backup retention days | Per plan / custom | ☐ |
| Pre-apply snapshot keep-until date | | ☐ |
| Pre-cutover snapshot keep-until date | | ☐ |
| Post-cutover snapshot keep-until date | | ☐ |
| Migration artifact retention | | ☐ |
| Audit event retention vs DB tier | | ☐ |
| Storage object versioning / soft-delete retention | | ☐ |
| Git tag / release package retention | | ☐ |

### 2.3 Restore verification (minimum)

After any restore drill or real restore:

1. `db:identity:check` PASS for expected key.  
2. `db:verify:foundation` (or documented waiver).  
3. Catalogue relationship samples (org/church/branch/domain).  
4. One auth smoke on a **clone** or approved env (not casual prod writes).  
5. Media: metadata↔object spot check if storage restored.  
6. Record duration (actual minutes) — do not publish invented RTO.

### 2.4 Relationship integrity checks

| Check | On |
|-------|-----|
| Identity row singleton / expected key | Every DB restore |
| Domain hostname → correct org + deployment | Routing-critical |
| Church → org; branch → church | Catalogue |
| Roles → user + tenant scope | Authz |
| Content/ops/media metadata → church/org | Modules |
| `public.tenants` / `public.session` absent on V5 | Isolation |

### 2.5 Secret handling

| Do | Do not |
|----|--------|
| Keep DB URLs and `SESSION_SECRET` in secret store | Put secrets in backup tickets or git |
| Record snapshot **IDs** and project **refs** | Paste connection strings into Slack/chat |
| Rotate secrets if backup media is leaked | Assume DB backup includes Hostinger secrets (it does not) |
| Restrict who can download logical dumps | Email dumps with user tables unencrypted |

---

## 3. Window-specific backups

### 3.1 Pre-migration backup

| Item | Requirement | Evidence status in this pass |
|------|-------------|------------------------------|
| V4 backup / dump within policy window (cutover: aim ≤24h) | Mandatory before apply | **DOCUMENTED ONLY** — **UNKNOWN** if done |
| V5 snapshot / PITR point before apply | Mandatory | **DOCUMENTED ONLY** — **UNKNOWN** if done |
| Dry-run artifacts archived | Recommended before apply | **UNKNOWN** |
| Git SHA frozen | Mandatory | Operator fills |

### 3.2 Pre-cutover backup

| Item | Requirement | Evidence status in this pass |
|------|-------------|------------------------------|
| Fresh V5 snapshot after successful apply + verify (recommended) | Before shadow/authoritative | **DOCUMENTED ONLY** — **UNKNOWN** |
| V4 backup still retained | Through rollback window | **UNKNOWN** |
| DNS inventory + env redacted pack | Before authoritative | **DOCUMENTED ONLY** |
| Media objects if V5 is blob SoR | Before authoritative | **UNKNOWN** |

### 3.3 Post-cutover backup

| Item | Requirement | Evidence status in this pass |
|------|-------------|------------------------------|
| V5 snapshot after authoritative stable | Strongly required | **DOCUMENTED ONLY** — **UNKNOWN** |
| Retain pre-cutover snapshots until rollback window ends | Mandatory policy | **DOCUMENTED ONLY** |
| Capture actual restore-drill time if performed | For operations learning | **UNKNOWN** |

---

## 4. Recovery testing cadence

| Cadence | Scope | Status |
|---------|-------|--------|
| Before first hosted **apply** | Tabletop restore decision (leave dirty vs PITR) — see rollback rehearsal | **DOCUMENTED ONLY** |
| Before first **authoritative** | At least one **supervised** restore verification on a clone **or** documented waiver with leadership — **decision needed** | **UNKNOWN** whether performed |
| Quarterly (proposed) | Identity + foundation verify on restored clone; media spot check | **DOCUMENTED ONLY** — not scheduled in-repo |
| After major schema migration | Ledger + smoke | **DOCUMENTED ONLY** |

**Do not** claim quarterly restores occur until the evidence register shows dates.

---

## 5. Recovery evidence (register template)

Copy to the change ticket. Leave blank rather than guessing.

| Evidence ID | Asset | Snapshot / PITR / dump / tag ID | Taken UTC | Taken by | Restore tested? | Result | Classification after evidence |
|-------------|-------|----------------------------------|-----------|----------|-----------------|--------|-------------------------------|
| E1 | V4 DB | | | | ☐ yes ☐ no | | |
| E2 | V5 DB pre-migrate | | | | ☐ yes ☐ no | | |
| E3 | V5 DB pre-cutover | | | | ☐ yes ☐ no | | |
| E4 | V5 DB post-cutover | | | | ☐ yes ☐ no | | |
| E5 | Migration artifacts path | | | | n/a | | |
| E6 | Git tag / SHA | | | | ☐ checkout OK | | |
| E7 | Media bucket / versioning note | | | | ☐ yes ☐ no | | |
| E8 | Secret store inventory (names only) | | | | ☐ rotation OK | | |

Until E2/E3 are filled, hosted V5 backup remains **UNKNOWN** for go/no-go discussions.

---

## 6. Summary classification matrix

| Area | Classification (this pass) |
|------|----------------------------|
| Supabase database backups | EXTERNAL RESPONSIBILITY + DOCUMENTED ONLY + **UNKNOWN** (no evidence) |
| Migration checkpoints | VERIFIED (tooling) + DOCUMENTED ONLY (retention) + UNKNOWN (hosted artifacts) |
| Schema migration history | VERIFIED (in-repo) + UNKNOWN (hosted backup of ledger) |
| Platform identity records | VERIFIED (in-repo) + UNKNOWN (hosted backup) |
| Org/church/branch catalogue | DOCUMENTED ONLY + UNKNOWN (hosted backup) |
| User and role records | DOCUMENTED ONLY + UNKNOWN (hosted backup) |
| Public content | DOCUMENTED ONLY + UNKNOWN (hosted backup) |
| Operational data | DOCUMENTED ONLY + UNKNOWN (hosted backup) |
| Media metadata | DOCUMENTED ONLY + UNKNOWN (hosted backup) |
| Uploaded media objects | EXTERNAL RESPONSIBILITY + DOCUMENTED ONLY + **UNKNOWN** |
| Deployment configuration documentation | VERIFIED (docs) + UNKNOWN (live panel export) |
| Git repository and tags | VERIFIED (workspace repo) + EXTERNAL RESPONSIBILITY + UNKNOWN (remote backup policy) |

---

## 7. Critical unknowns

| ID | Unknown | Why it blocks confidence |
|----|---------|--------------------------|
| U1 | Whether the **intended** Supabase project has backups/PITR **enabled** and current | Cannot authorize apply/cutover on hope |
| U2 | Whether any **restore test** was completed for that project | Untested backup is not a recovery plan |
| U3 | **Retention** days and purge policy | Risk of losing pre-apply snapshots too early |
| U4 | Whether **Storage** objects are versioned/backed up independently of Postgres | Metadata restore without blobs ⇒ broken media |
| U5 | Whether **V4** backup within ≤24h exists for the next window | Rollback to V4 SoR may be impossible |
| U6 | Where migration **artifacts** will be stored for hosted runs | Forensics/resume gap |
| U7 | Git **remote** protection (tag immutability, backup) | Deploy pin may be unverifiable long-term |
| U8 | Who can approve **production** restore and measured RTO | Authority/time gap under incident stress |

**Gate:** Treat U1–U2–U5 as **BLOCKING** for hosted apply / authoritative cutover until evidence register rows are filled or explicitly waived in writing by Cutover lead + DB operator.

---

## 8. What this document does *not* do

- Configure Supabase backups or PITR  
- Trigger snapshots or dumps  
- Prove that any hosted backup currently exists  
- Invent RPO/RTO SLAs  

---

## Conclusion

Backup/recovery **requirements** are defined and classified. Almost all hosted backup **evidence** is **UNKNOWN** in this pass; provider DB and storage are **EXTERNAL RESPONSIBILITY**. Repo-side migration tooling, schema ledger, identity gates, and ops docs are **VERIFIED** as existing code/documentation only.

**Suggested commit message:**

```
Document V5 backup and recovery requirements with evidence classes.

Define owned assets, window backups, and critical unknowns without claiming hosted backups exist.
```
