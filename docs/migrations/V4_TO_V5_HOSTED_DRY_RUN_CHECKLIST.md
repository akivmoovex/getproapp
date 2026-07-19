# V4 → V5 hosted migration dry-run checklist

**Date:** 2026-07-19  
**Mode:** Supervised operator checklist — **do not execute** from this document alone  
**Purpose:** Run the **existing** `migrate:v4-to-v5` **plan** + **dry-run** against hosted source/target using placeholders only  
**Does not authorize:** `apply`, routing flips, DNS changes, or production cutover  

**Companions**

| Doc | Role |
|-----|------|
| [`V5_HOSTED_MIGRATION_AND_CUTOVER.md`](../database/V5_HOSTED_MIGRATION_AND_CUTOVER.md) | Full cutover runbook (includes dry-run + apply) |
| [`V4_TO_V5_MIGRATION_REHEARSAL.md`](../database/V4_TO_V5_MIGRATION_REHEARSAL.md) | Local fixture rehearsal **PASS** (not a hosted substitute) |
| [`V5_FINAL_MIGRATION_READINESS.md`](../database/V5_FINAL_MIGRATION_READINESS.md) | **READY WITH MANUAL CONDITIONS**; hosted dry-run = **M2** / blocker **H1** |
| [`V5_RELEASE_BLOCKERS.md`](../release/V5_RELEASE_BLOCKERS.md) | **B06** hosted dry-run/apply missing |
| [`V5_DEMO_TENANT_READINESS.md`](../testing/V5_DEMO_TENANT_READINESS.md) | Demo catalogue ≠ migration completeness |
| `db/scripts/migrate-v4-to-v5.js` | CLI: explicit `V4_SOURCE_*` / `V5_TARGET_*`; no `DATABASE_URL` fallback |

**Hard rules**

- Never print or paste real connection strings, passwords, or PII into tickets/chat.  
- Never set `GETPRO_DATABASE_URL` for this procedure.  
- Never run `migrate:v4-to-v5:apply` from this checklist.  
- Source must remain **read-only**; same host|port|db fingerprint for source and target is **refused**.  
- Local rehearsal PASS does **not** satisfy hosted dry-run (release blocker B06 / H1).

---

## Checklist readiness

| Question | Answer |
|----------|--------|
| Is this checklist ready for **supervised** dry-run execution? | **YES** — after named operators fill placeholders and approvals in §17 |
| Does it authorize apply? | **NO** |
| Has hosted dry-run been executed by creating this file? | **NO** |

---

## Roles (fill before start)

| Role | Name | ☐ |
|------|------|---|
| Dry-run lead | `________________` | ☐ |
| DB operator (source + target access) | `________________` | ☐ |
| Observer / second pair of eyes | `________________` | ☐ |
| Approver for later apply (not this run) | `________________` | ☐ |

**Change ticket / window ID:** `________________`  
**Git SHA / tag used:** `<GIT_SHA_OR_TAG>`  
**UTC start:** `________________`

---

## 1. Required source environment variables

Set in the **operator shell only** (not Hostinger app env for this dry-run):

| Variable | Placeholder | Purpose |
|----------|-------------|---------|
| `V4_SOURCE_DATABASE_URL` | `postgresql://USER:PASSWORD@V4_HOST:PORT/V4_DB` | Legacy V4 Postgres (church schema) |

Optional source-related (if documented for your extract path): none required beyond the URL for the stock CLI.

☐ Source URL obtained from approved secret store (not chat).

---

## 2. Required target environment variables

| Variable | Placeholder | Purpose |
|----------|-------------|---------|
| `V5_TARGET_DATABASE_URL` | `postgresql://USER:PASSWORD@V5_HOST:PORT/V5_DB` | Intended V5 foundation DB |
| `DATABASE_IDENTITY_EXPECTED` | `blessboard-platform-v5` | Target identity key gate |

**Recommended dry-run knobs** (placeholders — use approved values from cutover docs):

| Variable | Example placeholder | Purpose |
|----------|---------------------|---------|
| `V4_TO_V5_OUTPUT_DIR` | `/path/to/artifacts/v4-v5-dry-run-<UTC>` | Artifact directory |
| `V4_TO_V5_CANONICAL_DOMAIN_SUFFIX` | `blessboard.org` | Hostname synthesis |
| `V4_TO_V5_DEPLOYMENT_CODE` | `blessboard-org-v5` | Domain → deployment link |
| `V4_TO_V5_DATA_ENVIRONMENT` | `testing` or `production` | **Must match product decision** (readiness M4) |
| `V4_TO_V5_BATCH_SIZE` | `50` | Extract/load batch size |

☐ Target is the **intended** V5 project (not a random clone unless explicitly labeled disposable).  
☐ Identity expected string matches that project’s `platform.database_identity`.

---

## 3. Variables that must remain unset

| Variable | Why |
|----------|-----|
| `GETPRO_DATABASE_URL` | Must stay unset for V5; silent attach risk to wrong DB |
| `DATABASE_URL` as migrator input | Migrator **refuses** `DATABASE_URL` fallback — do not “help” by exporting it as a substitute for `V4_SOURCE_*` / `V5_TARGET_*` |
| `BLESSBOARD_TENANT_ROUTING_MODE=authoritative` (Hostinger) | Dry-run is DB-only; do not flip routing in this checklist |
| Apply flags | Do not pass `--confirm` (that is for **apply** only) |

Optional: leave Hostinger app env unchanged during dry-run; run CLI from a secured ops workstation.

☐ Confirmed `GETPRO_DATABASE_URL` unset in this shell (`echo` shows empty — do not print other secrets).

---

## 4. Source read-only verification

```bash
# Placeholders only — do not commit real URLs
export V4_SOURCE_DATABASE_URL='postgresql://USER:PASSWORD@V4_HOST:PORT/V4_DB'

# Connectivity (counts only; no PII dumps)
psql "$V4_SOURCE_DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT current_database();"
```

Capture **source entity counts** (illustrative — align with cutover Step 2):

```bash
psql "$V4_SOURCE_DATABASE_URL" -v ON_ERROR_STOP=1 -c "
SELECT 'tenants' AS entity, COUNT(*)::bigint AS n FROM public.tenants
UNION ALL SELECT 'church_organizations', COUNT(*) FROM public.church_organizations
UNION ALL SELECT 'church_branches', COUNT(*) FROM public.church_branches
ORDER BY 1;
" > "\${V4_TO_V5_OUTPUT_DIR}/source-counts-<UTC>.txt"
```

☐ Source DB reachable.  
☐ Count file stored under artifact dir (ticket path).  
☐ No full member/PII table dumps to chat.  
☐ Note: migrator opens source as **read-only pool**; dry-run must not change these counts (re-check after dry-run).

---

## 5. Target database identity verification

```bash
export V5_TARGET_DATABASE_URL='postgresql://USER:PASSWORD@V5_HOST:PORT/V5_DB'
export DATABASE_IDENTITY_EXPECTED='blessboard-platform-v5'

# Prefer identity check via temporary DATABASE_URL pointing at TARGET only
export DATABASE_URL="$V5_TARGET_DATABASE_URL"
npm run db:identity:check
npm run db:verify:foundation
```

☐ `db:identity:check` PASS for `blessboard-platform-v5`.  
☐ Foundation verify PASS (or failures documented + waived).  
☐ Target fingerprint ≠ source fingerprint (CLI will refuse sameness; still confirm projects intentionally).

Unset `DATABASE_URL` again before running migrator if you want a clean shell (migrator uses only `V4_SOURCE_*` / `V5_TARGET_*`):

```bash
unset DATABASE_URL
```

---

## 6. Target environment verification

| Check | Expect | ☐ |
|-------|--------|---|
| V5 migrations applied | `npm run db:status` against target (via `DATABASE_URL=$V5_TARGET_DATABASE_URL`) shows platform/blessboard current | ☐ |
| Products / deployments seeded | `blessboard` product + `blessboard-org-v5` deployment present (required for domain load) | ☐ |
| `public.tenants` / `public.session` | Absent on V5 (`to_regclass` null) | ☐ |
| Demo vs migrate scope | Demo tenant readiness is separate; dry-run may create many orgs — confirm stakeholders expect that on **this** target | ☐ |
| `V4_TO_V5_DATA_ENVIRONMENT` | Matches approved mapping decision (testing vs production) | ☐ |

**Stop** if target is production-shaped and the ticket only approved a disposable clone — retarget.

---

## 7. Network / connectivity checks

| Check | ☐ |
|-------|---|
| Ops host can reach `V4_HOST:PORT` (VPN/allowlist as required) | ☐ |
| Ops host can reach `V5_HOST:PORT` | ☐ |
| TLS/ssl mode matches secret-store connection strings | ☐ |
| Clock skew acceptable; artifact path writable | ☐ |
| Second operator can observe without needing password paste | ☐ |

---

## 8. Expected plan command

```bash
cd /path/to/getpro
git checkout <GIT_SHA_OR_TAG>

export V4_SOURCE_DATABASE_URL='postgresql://USER:PASSWORD@V4_HOST:PORT/V4_DB'
export V5_TARGET_DATABASE_URL='postgresql://USER:PASSWORD@V5_HOST:PORT/V5_DB'
export DATABASE_IDENTITY_EXPECTED='blessboard-platform-v5'
export V4_TO_V5_OUTPUT_DIR='/path/to/artifacts/v4-v5-dry-run-<UTC>'
export V4_TO_V5_CANONICAL_DOMAIN_SUFFIX='blessboard.org'
export V4_TO_V5_DEPLOYMENT_CODE='blessboard-org-v5'
export V4_TO_V5_DATA_ENVIRONMENT='<APPROVED_DATA_ENVIRONMENT>'
export V4_TO_V5_BATCH_SIZE='50'

mkdir -p "$V4_TO_V5_OUTPUT_DIR"

npm run migrate:v4-to-v5:plan
```

☐ Exit 0.  
☐ Console summary shows counts only (no URLs/passwords).  
☐ `migration-plan.json` written under output dir.

---

## 9. Expected dry-run command

```bash
# Same env as §8 — still NO --confirm
npm run migrate:v4-to-v5:dry-run
```

☐ Exit 0 (or non-zero only for safety/env failures — treat as **stop**).  
☐ Summary `written: 0` / dry-run does not persist business rows (local rehearsal pattern: `wouldWrite` > 0, `written: 0`).  
☐ Re-check source counts unchanged vs §4.  
☐ Do **not** immediately run apply.

---

## 10. Expected output files

Under `V4_TO_V5_OUTPUT_DIR` (and/or tooling defaults), expect:

| File | Purpose |
|------|---------|
| `migration-plan.json` | Planned entity groups / steps |
| `dry-run-summary.json` | Totals: accepted / skipped / conflicts / quarantined / wouldWrite / written |
| `conflict-report.json` | Conflict codes + safe identifiers |
| `skipped-record-report.json` | Skips / quarantine samples (sanitized in console path) |
| `reconciliation-report.json` | When produced by pipeline |
| `state/` | Pipeline state (do not commit secrets) |

☐ All present or absences explained.  
☐ Artifact directory path recorded on ticket (not the secrets).

---

## 11. Conflict categories

Classify every conflict/quarantine before any apply discussion:

| Category | Examples (codes / reasons) | Typical disposition |
|----------|----------------------------|---------------------|
| **Quarantine (expected)** | `invalid_slug`, `missing_contact`, `media_blob_copy_deferred` | Accept with waiver; do not weaken mappers |
| **Conflict (blocking)** | `hostname_taken`, `domain_hostname_mismatch`, `branch_key_mismatch`, `user_email_mismatch`, `blessboard_product_missing` | Fix target/source or abort |
| **Skip** | Already migrated / idempotent skip | Confirm intentional |
| **Mapping product gaps** | Readiness M4–M12 undecided rows | Waive or decide before apply |
| **Unexpected volume** | Conflict count ≫ local rehearsal | Stop; investigate |

☐ Conflict report reviewed by dry-run lead + DB operator.  
☐ No mapper weakening to “make green.”

---

## 12. Reconciliation checks

Compare **source counts** (§4) to dry-run **wouldWrite / accepted / quarantined** (and plan entity lists):

| Check | ☐ |
|-------|---|
| Eligible org/church/branch/member expectations documented | ☐ |
| Quarantine counts explained (invalid orgs, missing contacts, media deferred) | ☐ |
| `public_tenants` / `public_session` on target remain 0 | ☐ |
| Demo `diagnostic-church` coexistence risk reviewed if target already has demo data | ☐ |
| Media: confirm `media_blob_copy_deferred` still expected (blocker B08 / H3) | ☐ |

Fill a short table on the ticket (numbers only):

| Entity | Source n | Would write / accepted | Quarantine | Notes |
|--------|----------|------------------------|------------|-------|
| organizations | | | | |
| churches / branches | | | | |
| members | | | | |
| … | | | | |

---

## 13. Stop conditions

**Abort the dry-run session (and do not schedule apply) if any apply:**

1. Source and target fingerprints equal / same DB.  
2. `DATABASE_IDENTITY_EXPECTED` mismatch or identity check fail.  
3. `GETPRO_DATABASE_URL` was set in the shell or V5 app by mistake.  
4. Source counts change during dry-run (possible write to source — incident).  
5. Dry-run reports `written` > 0 unexpectedly.  
6. Unresolved **blocking** conflicts without signed waiver.  
7. Wrong target project (prod vs testing) for the ticket.  
8. Secrets leaked into chat/logs — rotate credentials; scrub artifacts.  
9. Operator cannot complete §17 approval trail for a future apply.

---

## 14. Evidence to capture

| Artifact | Required |
|----------|----------|
| Git SHA / tag | Yes |
| UTC timestamps start/end | Yes |
| Operator names | Yes |
| Safe connection fingerprints / host labels (no URLs) | Yes |
| `db:identity:check` / `db:verify:foundation` exit notes | Yes |
| Source count file | Yes |
| Plan + dry-run JSON summaries | Yes |
| Conflict / skip disposition list | Yes |
| Reconciliation table | Yes |
| Explicit statement: “apply not run” | Yes |

Store under the change ticket’s private artifact store — **not** in git.

---

## 15. Secret-redaction rules

| Never capture | OK to capture |
|---------------|---------------|
| Full `DATABASE_URL` / source / target URIs | Host fingerprint / sanitized host label |
| Passwords, tokens, JWT, cookies | Exit codes, counts, conflict **codes** |
| Member emails, phones, password hashes | Quarantine **reasons** + opaque source ids if tooling emits them |
| Raw quarantine `row` blobs with PII | Sanitized console summary from tooling |

If a secret appears in terminal scrollback: clear scrollback, rotate the exposed credential, note incident on ticket.

---

## 16. Cleanup

| Step | ☐ |
|------|---|
| `unset V4_SOURCE_DATABASE_URL V5_TARGET_DATABASE_URL DATABASE_URL` (and related) | ☐ |
| Close DB allowlist sessions / VPN if temporary | ☐ |
| Confirm source counts unchanged | ☐ |
| Confirm target business data unchanged by dry-run (spot-check counts) | ☐ |
| Move artifacts to ticket store; delete local copies with secrets if any | ☐ |
| Do **not** leave `--confirm` apply commands in shell history for casual re-run | ☐ |

Dry-run itself should not require target data rollback; if target was written unexpectedly → **incident** (stop; restore from backup per cutover rollback docs).

---

## 17. Approval required before apply

This checklist ends at **dry-run**. Apply requires a **separate** approval citing:

| Gate | Reference | ☐ |
|------|-----------|---|
| Hosted dry-run evidence pack complete | This checklist §§8–15 | ☐ |
| Conflicts disposition signed | §11 | ☐ |
| Mapping decisions M4–M12 answered or waived | Final readiness / cutover §8 | ☐ |
| Media blob strategy decided or waived | B08 / H3 | ☐ |
| Backups ≤24h for source + target | Cutover runbook | ☐ |
| Maintenance window + named rollback owner | Cutover roles | ☐ |
| Explicit command authorization | `npm run migrate:v4-to-v5:apply -- --confirm` only under cutover Step 5 | ☐ |

**Do not** treat a green dry-run as apply approval.

---

## Morning / session order (summary)

1. Fill roles + ticket (§ roles).  
2. Confirm unset vars (§3).  
3. Source counts (§4).  
4. Target identity + env (§5–§6).  
5. Connectivity (§7).  
6. `plan` (§8).  
7. `dry-run` (§9).  
8. Review outputs, conflicts, reconciliation (§10–§12).  
9. Capture evidence; cleanup (§14–§16).  
10. Schedule apply only after §17.

---

## Conclusion

| Item | Status |
|------|--------|
| Checklist complete for supervised **plan + dry-run** | **YES — ready for supervised execution** |
| Hosted dry-run already done | **NO** (still release blocker B06 / condition M2) |
| Apply authorized by this doc | **NO** |

**Bottom line:** Operators may execute this checklist under change control to satisfy the **hosted dry-run** evidence gap. Local rehearsal PASS is necessary background, not a substitute. Stop after dry-run until §17 approvals unlock apply via the hosted cutover runbook.
