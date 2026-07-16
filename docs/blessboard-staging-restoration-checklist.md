# BlessBoard staging restoration checklist

Application-level verification only. This document does **not** change Hostinger, Supabase, or other hosting-provider infrastructure. Do not restore over production.

**Last updated:** 2026-07-16

---

## Purpose

Prove that a recent database backup can be restored into a **staging** (or other non-production) database, then record the result in BlessBoard diagnostics so health warnings and pilot readiness stay accurate.

The app never invents successful backup records. Recording success means an operator completed this checklist (or an equivalent provider restore) and attested the outcome.

---

## Prerequisites

- Access to the provider backup console (e.g. Supabase / managed Postgres dashboard).
- A **staging** Postgres database URL that is **not** production.
- Ability to run `pg_dump` / `pg_restore` (or the provider’s point-in-time / snapshot restore into staging).
- Super-admin access to `https://blessboard.com/admin/church/diagnostics` (or local equivalent) to record the result.

Optional CLI (records attestation only — does not run a restore):

```bash
node scripts/record-church-backup-verification.js --help
```

---

## Checklist

### A. Verify a backup exists (provider)

1. Open the provider backup / snapshot UI for the **production** database.
2. Confirm a recent successful backup or snapshot exists within the agreed RPO window.
3. Copy a non-secret **evidence reference** (snapshot id, backup filename, or ticket id). Do **not** paste connection strings, passwords, or API keys.
4. Record a backup verification in diagnostics (outcome `success` + evidence), or via CLI.

### B. Restore into staging (manual)

Use provider tools or local commands against **staging only**. Example pattern (adjust hosts/paths; never point at production):

```bash
# Example only — run against STAGING credentials from your secrets store, not from this repo.
# 1) Export from a backup file or restore-target dump you already obtained safely:
# pg_restore --clean --if-exists --no-owner --dbname="$STAGING_DATABASE_URL" ./staging-restore.dump
#
# Or use the provider “restore snapshot to new/staging project” flow in the console.
```

Confirm after restore:

- [ ] Staging app (or `psql` against staging) connects successfully.
- [ ] Core church tables exist (e.g. `church_organizations`, `church_branches`).
- [ ] Spot-check: row counts or a known staging fixture look sane.
- [ ] No production DNS / production env vars were pointed at this restored DB.

### C. Record the restoration test

In **Support Monitoring → Backup verification → Record restoration test**:

| Field | Guidance |
|-------|----------|
| Outcome | `success`, `failed`, or `partial` |
| Environment | Prefer `staging` (required) |
| Evidence | Ticket / run id (no secrets) |
| Notes | What was restored and what you verified |

Or CLI:

```bash
node scripts/record-church-backup-verification.js restoration-test \
  --outcome success \
  --environment staging \
  --evidence "ops-ticket-123" \
  --notes "Restored snapshot X into staging; church_organizations readable."
```

### D. Attachments / local files (awareness)

Church uploads live on application disk under `data/uploads/church/…` unless otherwise configured. A DB-only restore does **not** restore those files. Note any file-restore gap in the restoration-test notes.

---

## What this does not do

- Does not configure or change Hostinger / Supabase backup schedules.
- Does not run `pg_dump` or restore against production from the app.
- Does not create fake “last successful backup” timestamps on deploy or boot.

---

## Related

- Diagnostics UI: `/admin/church/diagnostics`
- Production checklist: [blessboard-production-checklist.md](./blessboard-production-checklist.md)
- Stale threshold env: `BLESSBOARD_BACKUP_STALE_DAYS` (default `7`)
