# V4 → V5 reconciliation report template

**Purpose:** Reusable hosted migration reconciliation worksheet (dry-run **or** apply).  
**Mode:** Fill after migration tooling emits counts/reports — **do not invent numbers**.  
**Does not authorize:** apply, routing flips, or cutover by itself.

**Companions**

| Doc | Role |
|-----|------|
| [`V4_TO_V5_HOSTED_DRY_RUN_CHECKLIST.md`](./V4_TO_V5_HOSTED_DRY_RUN_CHECKLIST.md) | Hosted plan/dry-run procedure |
| [`V5_HOSTED_MIGRATION_AND_CUTOVER.md`](../database/V5_HOSTED_MIGRATION_AND_CUTOVER.md) | Cutover + reconciliation step |
| [`V4_TO_V5_MIGRATION_REHEARSAL.md`](../database/V4_TO_V5_MIGRATION_REHEARSAL.md) | Local fixture PASS (reference shape only) |
| Tooling outputs | `migration-plan.json`, `dry-run-summary.json` / `apply-summary.json`, `conflict-report.json`, `skipped-record-report.json`, `reconciliation-report.json` |

Copy this file (or paste sections into the change ticket) and replace every `________________` / blank cell. Store completed reports in the ticket artifact store — **not** in git with secrets or PII.

---

## Report header

| Field | Value |
|-------|-------|
| Report ID | `recon-<UTC>-________________` |
| Change ticket | `________________` |
| Mode | ☐ dry-run only · ☐ apply · ☐ apply + verify · ☐ second-run idempotency |
| Git SHA / tag | `<GIT_SHA_OR_TAG>` |
| Operator (fill) | `________________` |
| Reviewer (fill) | `________________` |
| UTC started | `________________` |
| UTC completed | `________________` |
| Artifact directory (path only) | `/path/to/artifacts/________________` |

**Secret rule:** Record host fingerprints and database names only. Never paste connection URLs, passwords, emails, phones, or password hashes into this report.

---

## Severity levels

Use exactly one severity per finding / entity disposition:

| Severity | Meaning | Gate effect |
|----------|---------|-------------|
| **BLOCKING** | Unexpected loss, identity mismatch, unresolved conflict, orphan FK, or written≠0 on dry-run | **Stop** — no apply / no cutover |
| **REVIEW** | Needs human decision (mapping waiver, quarantine volume, product gap) | Must disposition before apply approval |
| **ACCEPTED** | Expected quarantine/skip/waiver with signed rationale | Allowed to proceed with signature |
| **INFORMATIONAL** | Context only (timing, batch size, deferred Phase 2 domains) | No gate |

Every entity row below must end with a **Disposition** using one of these severities.

---

## Hard rule: totals alone are insufficient

**Counts are necessary but not sufficient.**

Before marking any entity **Verified**:

1. **UUID stability** — sample source primary keys ↔ target UUID/id mapping (or documented synthetic IDs) for ≥ N pilot rows (document N; default **5** per critical entity, **10** for members/domains if estate is large).  
2. **Relationship integrity** — verify parent links (org→church→branch; domain→org/deployment; member→org/branch; role→user+org/branch; content→org/branch). Orphans = **BLOCKING**.  
3. **Key uniqueness** — organization keys, branch keys, hostnames, user emails must not collide unexpectedly.  
4. **Eligibility math** — `Source − expected quarantine/skip = Planned/Migrated` (within documented tolerance of **0** unless waived).  
5. **Negative checks** — V5 must not gain `public.tenants` / `public.session`; source row counts must not change during migrate.

If only aggregate `COUNT(*)` was compared → entity disposition remains **REVIEW** (or **BLOCKING** for production apply sign-off).

---

## 1. Source fingerprint

| Field | Value |
|-------|-------|
| Label | V4 source |
| Database name | `________________` |
| Host fingerprint (sanitized) | `________________` |
| Fingerprint SHA-256 prefix (16+) | `________________` |
| Read-only confirmed | ☐ yes · ☐ no (**BLOCKING** if no) |
| Source count snapshot file | `source-counts-<UTC>.txt` |
| Severity | ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL |

Notes: `________________`

---

## 2. Target fingerprint

| Field | Value |
|-------|-------|
| Label | V5 target |
| Database name | `________________` |
| Host fingerprint (sanitized) | `________________` |
| Fingerprint SHA-256 prefix (16+) | `________________` |
| Distinct from source | ☐ yes · ☐ no (**BLOCKING** if no) |
| Severity | ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL |

Notes: `________________`

---

## 3. Target identity

| Field | Value |
|-------|-------|
| `DATABASE_IDENTITY_EXPECTED` | `blessboard-platform-v5` (or approved) |
| Actual `identity_key` | `________________` |
| `environment_code` | `________________` |
| `db:identity:check` | ☐ PASS · ☐ FAIL |
| `db:verify:foundation` | ☐ PASS · ☐ FAIL · ☐ waived |
| Severity | ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL |

Notes: `________________`

---

## Master entity table

Fill from plan / dry-run or apply summaries, then verify. Use integers or `n/a`.

| Entity | Source | Planned | Migrated | Skipped | Conflict | Verified |
|--------|--------|---------|----------|---------|----------|----------|
| organizations | | | | | | ☐ |
| churches | | | | | | ☐ |
| branches | | | | | | ☐ |
| domains | | | | | | ☐ |
| users | | | | | | ☐ |
| roles | | | | | | ☐ |
| members | | | | | | ☐ |
| public content | | | | | | ☐ |
| announcements | | | | | | ☐ |
| attendance | | | | | | ☐ |
| giving summaries | | | | | | ☐ |
| forms | | | | | | ☐ |
| requests | | | | | | ☐ |
| media metadata | | | | | | ☐ |
| **verification totals** | | | | | | ☐ |

**Column definitions**

| Column | Meaning |
|--------|---------|
| Source | Count on V4 (eligible extract set or full table — note which) |
| Planned | Plan / dry-run `wouldWrite` or eligible planned rows |
| Migrated | Rows written on apply (`written`) or present on target after migrate |
| Skipped | Idempotent skip or intentional non-migrate |
| Conflict | Loader conflicts (blocking until dispositioned) |
| Verified | Counts **and** UUID/relationship sample checks passed |

---

## 4. Organizations

| Entity | Source | Planned | Migrated | Skipped | Conflict | Verified |
|--------|--------|---------|----------|---------|----------|----------|
| organizations | | | | | | ☐ |

| Check | Result | Severity |
|-------|--------|----------|
| Sample org UUID/key mapping (list opaque ids only) | `________________` | |
| Invalid slug quarantines match expectation | ☐ | ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL |
| Enrolments / product links present for migrated orgs | ☐ | |

Disposition: ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL  
Rationale: `________________`

---

## 5. Churches

| Entity | Source | Planned | Migrated | Skipped | Conflict | Verified |
|--------|--------|---------|----------|---------|----------|----------|
| churches | | | | | | ☐ |

| Check | Result |
|-------|--------|
| Each sample church → organization UUID | ☐ |
| HQ / settings row expectations | ☐ |

Disposition: ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL  
Rationale: `________________`

---

## 6. Branches

| Entity | Source | Planned | Migrated | Skipped | Conflict | Verified |
|--------|--------|---------|----------|---------|----------|----------|
| branches | | | | | | ☐ |

| Check | Result |
|-------|--------|
| Sample branch → church/org FK | ☐ |
| `branch_key` uniqueness / no `branch_key_mismatch` left open | ☐ |
| Synthetic HQ branch (if used) documented | ☐ |

Disposition: ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL  
Rationale: `________________`

---

## 7. Domains

| Entity | Source | Planned | Migrated | Skipped | Conflict | Verified |
|--------|--------|---------|----------|---------|----------|----------|
| domains | | | | | | ☐ |

| Check | Result |
|-------|--------|
| Hostname → org / deployment link | ☐ |
| No unexpected `hostname_taken` / `domain_hostname_mismatch` | ☐ |
| Canonical suffix policy applied | ☐ |

Disposition: ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL  
Rationale: `________________`

---

## 8. Users

| Entity | Source | Planned | Migrated | Skipped | Conflict | Verified |
|--------|--------|---------|----------|---------|----------|----------|
| users | | | | | | ☐ |

| Check | Result |
|-------|--------|
| Sample user id/email hash presence (no plaintext emails in report) | ☐ |
| No open `user_email_mismatch` | ☐ |
| Synthetic email policy for username-only (M5) | ☐ waived · ☐ applied · ☐ n/a |

Disposition: ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL  
Rationale: `________________`

---

## 9. Roles

| Entity | Source | Planned | Migrated | Skipped | Conflict | Verified |
|--------|--------|---------|----------|---------|----------|----------|
| roles | | | | | | ☐ |

| Check | Result |
|-------|--------|
| Sample role → user + org/branch scope | ☐ |
| Unsupported ministry-leader mapping disposition (M11) | ☐ |

Disposition: ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL  
Rationale: `________________`

---

## 10. Members

| Entity | Source | Planned | Migrated | Skipped | Conflict | Verified |
|--------|--------|---------|----------|---------|----------|----------|
| members | | | | | | ☐ |

| Check | Result |
|-------|--------|
| Memberships count vs members (expect alignment) | ☐ |
| Sample member → org/branch | ☐ |
| `missing_contact` quarantine expected | ☐ |
| Rejected-status mapping (M8) | ☐ |

Disposition: ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL  
Rationale: `________________`

---

## 11. Public content

| Entity | Source | Planned | Migrated | Skipped | Conflict | Verified |
|--------|--------|---------|----------|---------|----------|----------|
| public content | | | | | | ☐ |

| Check | Result |
|-------|--------|
| Sample pages/events linked to correct org/church | ☐ |
| Published-only visibility spot-check (post-routing, separate) | ☐ n/a at DB-only stage |

Disposition: ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL  
Rationale: `________________`

---

## 12. Announcements

| Entity | Source | Planned | Migrated | Skipped | Conflict | Verified |
|--------|--------|---------|----------|---------|----------|----------|
| announcements | | | | | | ☐ |

| Check | Result |
|-------|--------|
| Sample announcement → org UUID | ☐ |
| HQ broadcast → announcement vs drop (M9) | ☐ |

Disposition: ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL  
Rationale: `________________`

---

## 13. Attendance

| Entity | Source | Planned | Migrated | Skipped | Conflict | Verified |
|--------|--------|---------|----------|---------|----------|----------|
| attendance | | | | | | ☐ |

| Check | Result |
|-------|--------|
| Sample attendance event → branch/org | ☐ |
| Headcount / date sanity on sample | ☐ |

Disposition: ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL  
Rationale: `________________`

---

## 14. Giving summaries

| Entity | Source | Planned | Migrated | Skipped | Conflict | Verified |
|--------|--------|---------|----------|---------|----------|----------|
| giving summaries | | | | | | ☐ |

| Check | Result |
|-------|--------|
| Sample giving row → org/branch | ☐ |
| Payment secrets stripped / quarantined (M10) — no secrets in artifacts | ☐ |

Disposition: ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL  
Rationale: `________________`

---

## 15. Forms

| Entity | Source | Planned | Migrated | Skipped | Conflict | Verified |
|--------|--------|---------|----------|---------|----------|----------|
| forms | | | | | | ☐ |

| Check | Result |
|-------|--------|
| In scope for this migrate batch? | ☐ yes · ☐ no / Phase 2 |
| If yes: sample form → org + field integrity | ☐ |
| If no: recorded under unsupported legacy (§22) | ☐ |

Disposition: ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL  
Rationale: `________________`

---

## 16. Requests

| Entity | Source | Planned | Migrated | Skipped | Conflict | Verified |
|--------|--------|---------|----------|---------|----------|----------|
| requests | | | | | | ☐ |

| Check | Result |
|-------|--------|
| In scope for this migrate batch? | ☐ yes · ☐ no / Phase 2 |
| If yes: sample request → form/org relationship | ☐ |

Disposition: ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL  
Rationale: `________________`

---

## 17. Media metadata

| Entity | Source | Planned | Migrated | Skipped | Conflict | Verified |
|--------|--------|---------|----------|---------|----------|----------|
| media metadata | | | | | | ☐ |

| Check | Result |
|-------|--------|
| Metadata rows migrated vs skipped | ☐ |
| Blob copy deferred (`media_blob_copy_deferred`) | ☐ expected · ☐ waived · ☐ BLOCKING if blobs required |
| Checksum / storage verify (if blobs copied) | ☐ n/a · ☐ PASS · ☐ FAIL |

Disposition: ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL  
Rationale: `________________`

---

## 18. Skipped records

| Metric | Value |
|--------|-------|
| Total skipped | |
| Idempotent skips (already present) | |
| Intentional policy skips | |
| Report file | `skipped-record-report.json` |

| Sample (opaque id + reason only) | Severity |
|----------------------------------|----------|
| `________________` | ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL |
| `________________` | ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL |

Overall disposition: ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL

---

## 19. Transformed records

| Metric | Value |
|--------|-------|
| Accepted / mapped | |
| Would write (dry-run) | |
| Written (apply) | |
| Warnings (count) | |

| Transform class | Count | Notes | Severity |
|-----------------|-------|-------|----------|
| Direct map | | | ☐ INFORMATIONAL |
| Key/normalization rewrite | | | ☐ REVIEW · ☐ ACCEPTED |
| Synthetic field (email, HQ branch, hostname) | | | ☐ REVIEW · ☐ ACCEPTED |
| Status remaps | | | ☐ REVIEW · ☐ ACCEPTED |

UUID sample: list **opaque** source→target pairs (no PII): `________________`

Disposition: ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL

---

## 20. Conflicts

| Metric | Value |
|--------|-------|
| Conflict count | |
| Report file | `conflict-report.json` |

| Code | Count | Owner decision | Severity |
|------|-------|----------------|----------|
| `hostname_taken` | | fix / abort / waive | ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED |
| `domain_hostname_mismatch` | | | ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED |
| `branch_key_mismatch` | | | ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED |
| `user_email_mismatch` | | | ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED |
| `blessboard_product_missing` | | | ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED |
| Other: `________________` | | | ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED |

**Rule:** Any conflict without signed disposition = **BLOCKING** for apply/cutover.

Overall disposition: ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL

---

## 21. Duplicates

| Check | Count / result | Severity |
|-------|----------------|----------|
| Duplicate organization keys on target | | ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL |
| Duplicate hostnames | | ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL |
| Duplicate user emails | | ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL |
| Duplicate branch keys within org | | ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL |
| Expected merge/dedupe cases (documented) | | ☐ REVIEW · ☐ ACCEPTED |

Notes: `________________`

---

## 22. Unsupported legacy data

Record V4 domains **not** migrated in this batch (Phase 2 / out of scope). Totals alone do not clear these — stakeholders must accept residual gaps.

| Legacy area | Source approx. n | Disposition | Severity |
|-------------|------------------|------------|----------|
| Pastoral / care | | defer / waive | ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL |
| Groups | | | ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL |
| Billing / plans (commercial) | | | ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL |
| Surveys | | | ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL |
| Media **blobs** | | | ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED |
| Forms / requests (if out of scope) | | | ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL |
| Other: `________________` | | | ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL |

Signed waiver reference (if any): `________________`

---

## 23. Verification totals

| Entity | Source | Planned | Migrated | Skipped | Conflict | Verified |
|--------|--------|---------|----------|---------|----------|----------|
| verification totals (rollup) | | | | | | ☐ |

| Tooling check | Result |
|---------------|--------|
| `migrate:v4-to-v5:verify` | ☐ PASS · ☐ FAIL · ☐ not run |
| Source counts unchanged vs pre-migrate snapshot | ☐ yes · ☐ no (**BLOCKING**) |
| `public.tenants` / `public.session` on V5 | ☐ absent · ☐ present (**BLOCKING**) |
| UUID/relationship samples complete per hard rule | ☐ yes · ☐ no (**REVIEW**/ **BLOCKING** for apply) |

Rollup disposition: ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL

---

## 24. Second-run idempotency

| Field | Value |
|-------|-------|
| Second apply / dry-run performed? | ☐ yes · ☐ no · ☐ n/a (dry-run only report) |
| Written on second run | (expect `0` or documented delta only) |
| Accepted | |
| Skipped | |
| Conflicts | |
| Quarantined | |

| Outcome | Severity |
|---------|----------|
| `written=0` and skips explain prior rows | ☐ ACCEPTED · ☐ INFORMATIONAL |
| Unexpected new writes or conflicts | ☐ BLOCKING · ☐ REVIEW |

Notes: `________________`

---

## 25. Rollback readiness

| Check | ☐ |
|-------|---|
| V4 backup / PITR point recorded (≤24h of window) | ☐ |
| V5 backup / PITR point recorded | ☐ |
| Routing remains `off` or pre-agreed mode (no surprise authoritative) | ☐ |
| Rollback owner named | `________________` |
| Rollback drill / tabletop reference | `________________` |
| No V5→V4 reverse-write assumed | ☐ confirmed |

Rollback readiness disposition: ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL

---

## 26. Finding log (optional detail)

| ID | Entity / area | Severity | Summary (no PII) | Disposition owner | Closed? |
|----|---------------|----------|------------------|-------------------|---------|
| F01 | | ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL | | | ☐ |
| F02 | | ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL | | | ☐ |
| F03 | | ☐ BLOCKING · ☐ REVIEW · ☐ ACCEPTED · ☐ INFORMATIONAL | | | ☐ |

---

## 27. Approval signatures

**Gate:** Sign only if (a) no open **BLOCKING** findings, (b) every **REVIEW** item has a written disposition, (c) UUID/relationship samples completed for verified entities, (d) secrets redacted.

| Role | Name | Date (UTC) | Signature / initials | Approves |
|------|------|------------|----------------------|----------|
| Dry-run / migrate operator | | | | Evidence pack accurate |
| DB operator | | | | Fingerprints, identity, backups |
| Reconciliation reviewer | | | | Entity table + UUID checks |
| Product (mapping waivers) | | | | M4–M12 / unsupported legacy |
| Cutover lead | | | | Proceed to next gate* |

\* Next gate examples: dry-run complete → schedule apply; apply complete → shadow; **not** automatic authoritative.

| Overall reconciliation verdict | ☐ PASS · ☐ PASS WITH ACCEPTED WAIVERS · ☐ FAIL |
|--------------------------------|--------------------------------------------------|
| Highest open severity | ☐ none · ☐ INFORMATIONAL · ☐ ACCEPTED · ☐ REVIEW · ☐ BLOCKING |
| Apply authorized by this report alone? | **NO** — requires cutover runbook §17 / G9 style approvals |
| Authoritative routing authorized? | **NO** |

---

## How to use

1. After hosted plan/dry-run or apply, copy this template into the ticket artifacts.  
2. Fill fingerprints and identity first — abort on mismatch.  
3. Fill the master table from tooling JSON (not memory).  
4. Complete per-entity UUID/relationship checks — do not mark Verified on counts alone.  
5. Disposition every conflict, skip, duplicate, and unsupported legacy row.  
6. Run second-apply idempotency when in apply mode.  
7. Confirm rollback readiness.  
8. Collect signatures only when gates in §27 are met.

**Template status:** Ready for reuse on supervised hosted dry-run and apply reconciliation. No migration tools were executed to create this file.
