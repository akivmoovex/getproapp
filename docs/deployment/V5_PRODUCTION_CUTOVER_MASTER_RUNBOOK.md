# BlessBoard V5 — Production cutover master runbook

**Date:** 2026-07-19  
**Mode:** Master orchestration documentation only — **do not execute** any stage from this file alone  
**Purpose:** Single ordered cutover path from final approval through evidence and sign-off  
**Verdict (documents as of this date):** **NOT READY** — see §Verdict and §Blocking prerequisites

---

## Authority sources (read before any stage)

| Area | Documents |
|------|-----------|
| Combined order | [`docs/migrations/V5_COMBINED_MIGRATION_ORDER_RUNBOOK.md`](../migrations/V5_COMBINED_MIGRATION_ORDER_RUNBOOK.md) |
| Hosted migrate / cutover | [`docs/database/V5_HOSTED_MIGRATION_AND_CUTOVER.md`](../database/V5_HOSTED_MIGRATION_AND_CUTOVER.md) |
| Dry-run / reconcile / rollback | [`V4_TO_V5_HOSTED_DRY_RUN_CHECKLIST.md`](../migrations/V4_TO_V5_HOSTED_DRY_RUN_CHECKLIST.md) · [`V4_TO_V5_RECONCILIATION_TEMPLATE.md`](../migrations/V4_TO_V5_RECONCILIATION_TEMPLATE.md) · [`V4_TO_V5_ROLLBACK_REHEARSAL.md`](../migrations/V4_TO_V5_ROLLBACK_REHEARSAL.md) |
| Final migration readiness | [`docs/database/V5_FINAL_MIGRATION_READINESS.md`](../database/V5_FINAL_MIGRATION_READINESS.md) |
| Plan-key | [`docs/migrations/BLESSBOARD_PLAN_KEY_MIGRATION_PLAN.md`](../migrations/BLESSBOARD_PLAN_KEY_MIGRATION_PLAN.md) |
| Release blockers | [`docs/release/V5_RELEASE_BLOCKERS.md`](../release/V5_RELEASE_BLOCKERS.md) |
| Security | Session / CSRF / authz / media audits under `docs/security/` · [`NETWORK_FEATURE_SECURITY_AUDIT.md`](../security/NETWORK_FEATURE_SECURITY_AUDIT.md) as applicable |
| Demo launch | [`V5_SUPERVISED_DEMO_LAUNCH_RUNBOOK.md`](./V5_SUPERVISED_DEMO_LAUNCH_RUNBOOK.md) · demo readiness / E2E under `docs/testing/` |
| Shadow / authoritative | [`V5_SHADOW_MODE_RUNBOOK.md`](./V5_SHADOW_MODE_RUNBOOK.md) · [`V5_SHADOW_ROUTING_READINESS.md`](./V5_SHADOW_ROUTING_READINESS.md) · [`V5_AUTHORITATIVE_ROUTING_PREREQUISITES.md`](./V5_AUTHORITATIVE_ROUTING_PREREQUISITES.md) |
| Monitoring / incident | [`docs/operations/V5_MONITORING_REQUIREMENTS.md`](../operations/V5_MONITORING_REQUIREMENTS.md) · [`V5_INCIDENT_RESPONSE.md`](../operations/V5_INCIDENT_RESPONSE.md) |
| Backup / recovery | [`docs/operations/V5_BACKUP_RECOVERY_REQUIREMENTS.md`](../operations/V5_BACKUP_RECOVERY_REQUIREMENTS.md) |
| Write maintenance | [`docs/operations/V5_MAINTENANCE_MODE_DESIGN.md`](../operations/V5_MAINTENANCE_MODE_DESIGN.md) · Hostinger cutover Step 1b |
| Schema / identity | [`docs/database/HOSTED_SUPABASE_RUNBOOK.md`](../database/HOSTED_SUPABASE_RUNBOOK.md) |
| Env | [`docs/deployment/V5_ENV_REFERENCE.md`](./V5_ENV_REFERENCE.md) (or successor env docs) |

**This master runbook does not replace** the detailed checklists above. Each stage points to the subordinate runbook for full command text and evidence templates.

---

## Standing hard prohibitions

| Prohibition | Why | Evidence |
|-------------|-----|----------|
| **Unsupervised apply** — never run `migrate:v4-to-v5:apply` without named DB operator + Cutover lead on the change ticket, identity gate PASS, and signed window | Writes to production-shaped V5 data | Release blockers X03 · Hosted cutover |
| **Destructive cleanup before reconciliation** — no DROP/TRUNCATE of migration artifacts, quarantine rows, or “orphan” cleanup until Stage 12 reconcile is signed | Destroys forensic evidence; hides count deltas | Combined order · Rollback rehearsal |
| **Secret sharing in chat/logs** — no full `DATABASE_URL`, passwords, `SESSION_SECRET`, tokens, or PII in tickets, chat, or committed evidence | Rotation + exposure risk | Incident response · Backup requirements |
| **`public.session` fallback** — never create or rely on `public.session` / `public.tenants` on V5 | Legacy session shape; wrong product surface | Hosted hard rules H04 · Blockers |
| **`GETPRO_DATABASE_URL` fallback** — must remain **unset** on V5 Hostinger and migration shells; migrator uses only `V4_SOURCE_*` / `V5_TARGET_*` | Silent attach to wrong DB | Blockers X05 · H02 |
| **Global authoritative activation without pilot evidence** — never set estate-wide `BLESSBOARD_TENANT_ROUTING_MODE=authoritative` until Stages 15–19 pilot evidence + Leadership sign-off | Changes public HTML / tenant resolution | Authoritative prereqs · Blockers X02 · B01/B09 |

**Also forbidden (standing):** reverse-write V5→V4; infer routing from `NODE_ENV` / Git branch / hostname; `church:seed-demos` on V5; parent-domain cookie `Domain=.blessboard.org`; CI/CD auto-flip routing or auto-apply hosted migration; in-place `UPDATE plan_key`.

**Placeholders only:** `<V4_SOURCE_DATABASE_URL>`, `<V5_TARGET_DATABASE_URL>`, `<APEX_HOST>`, `<TENANT_HOST>`, `<DATABASE_IDENTITY_EXPECTED>`, `<OUTPUT_DIR>`, etc.

---

## Role fill-in (per cutover window)

| Role | Name | ☐ |
|------|------|---|
| Cutover lead | `________________` | ☐ |
| Leadership approver | `________________` | ☐ |
| Product (mapping / plan-key) | `________________` | ☐ |
| App / Hostinger operator | `________________` | ☐ |
| DB operator | `________________` | ☐ |
| Rollback owner | `________________` | ☐ |
| QA / smoke owner | `________________` | ☐ |
| Comms owner | `________________` | ☐ |
| Security reviewer (if needed) | `________________` | ☐ |

---

## Stage matrix (1–24)

### Stage 1 — Final approval

| Field | Content |
|-------|---------|
| **Owner** | Leadership + Cutover lead |
| **Command/action** | Open change ticket; confirm window start/end; confirm scope (estate vs pilot hosts); confirm V4 remains customer-of-record until Stage 16/22 decision; collect signed go/no-go against [`V5_RELEASE_BLOCKERS.md`](../release/V5_RELEASE_BLOCKERS.md) production gates |
| **Expected** | Written approval with names, window, scope, and abort authority; **no** routing or migrate apply started |
| **Evidence** | Signed ticket row: date, approvers, scope list, abort contact |
| **Stop condition** | Missing Leadership signature; any CRITICAL blocker B06–B10 still open without waiver; window conflicts with V4 freeze capacity |
| **Rollback** | Do not start Stages 2+; cancel ticket |

---

### Stage 2 — V4 source freeze policy

| Field | Content |
|-------|---------|
| **Owner** | Cutover lead + Product + App operator |
| **Command/action** | Publish freeze policy: who may write to V4 during window; duration; exception process; communication to admins. Prefer **read-mostly** or documented write-stop before dry-run/apply. Record freeze start timestamp |
| **Expected** | Operators and customers know V4 write policy; freeze start logged |
| **Evidence** | Freeze notice + ticket timestamp; optional V4 write-rate note |
| **Stop condition** | No freeze policy; uncontrolled V4 writes expected during apply |
| **Rollback** | Delay Stages 9–11; extend freeze planning — do not apply |

---

### Stage 3 — V4 backup

| Field | Content |
|-------|---------|
| **Owner** | DB operator |
| **Command/action** | Capture V4 backup/snapshot/PITR point per provider runbook (**EXTERNAL**). Record snapshot ID / PITR timestamp only — never paste connection strings. Confirm retention covers rollback window ([`V5_BACKUP_RECOVERY_REQUIREMENTS.md`](../operations/V5_BACKUP_RECOVERY_REQUIREMENTS.md)) |
| **Expected** | Documented backup artifact ID ≤24h (or signed PITR coverage); classification not UNKNOWN for this window |
| **Evidence** | Ticket: provider, snapshot/PITR ID, time UTC, retention days, operator initials |
| **Stop condition** | No backup evidence; retention shorter than rollback plan; secrets in ticket |
| **Rollback** | Abort cutover; do not proceed to migrate |

---

### Stage 4 — V5 target backup

| Field | Content |
|-------|---------|
| **Owner** | DB operator |
| **Command/action** | Capture V5 target project backup/snapshot/PITR **before** any migrate apply or plan-key writes. Same secret rules. Prefer restore-tested clone if available ([backup requirements](../operations/V5_BACKUP_RECOVERY_REQUIREMENTS.md)) |
| **Expected** | Pre-apply V5 snapshot ID recorded; restore path known (≤4h target per M08) |
| **Evidence** | Ticket: V5 project label (not URL), snapshot/PITR ID, time UTC, restore owner |
| **Stop condition** | UNKNOWN backup status; no restore owner; identity of target project unclear |
| **Rollback** | Abort; restore from prior known-good only if already damaged (incident process) |

---

### Stage 5 — Maintenance or write-control activation

| Field | Content |
|-------|---------|
| **Owner** | App operator + Cutover lead |
| **Command/action** | For migrate apply window on live V5 app: set Hostinger `BLESSBOARD_WRITE_MAINTENANCE=1` (or `true`/`on`/`yes`); restart **all** workers; confirm `/healthz` shows `writeMaintenance: true`; confirm jobs forced off. Reads (GET/HEAD) remain available; logout POSTs allowed. See [`V5_MAINTENANCE_MODE_DESIGN.md`](../operations/V5_MAINTENANCE_MODE_DESIGN.md) and cutover Step 1b |
| **Expected** | Mutating HTTP → 503 maintenance page/JSON; healthz flag true; no unsupervised PA break-glass |
| **Evidence** | healthz snippet (no secrets); sample 503 on POST; restart confirmation |
| **Stop condition** | Flag not observed on all instances; writes still succeed; maintenance left on after reopen without decision |
| **Rollback** | Set `BLESSBOARD_WRITE_MAINTENANCE=0` / unset, restart all workers (only if aborting before apply or after signed reopen) |

---

### Stage 6 — Database identity verification

| Field | Content |
|-------|---------|
| **Owner** | DB operator |
| **Command/action** | With shell env pointing at **V5 target only** (never `GETPRO_DATABASE_URL`): set `DATABASE_URL=<V5_TARGET_DATABASE_URL>` and `DATABASE_IDENTITY_EXPECTED=<expected>` then `npm run db:identity:check`. Confirm V4 and V5 fingerprints differ (separate projects) |
| **Expected** | Identity PASS; environment_code matches policy; no silent GetPro/V4 attach |
| **Evidence** | Console-safe identity check output; fingerprint separation note |
| **Stop condition** | Identity FAIL; `GETPRO_DATABASE_URL` set; fingerprints collide |
| **Rollback** | Stop all DB writes; escalate CRITICAL per incident response |

---

### Stage 7 — Schema migration verification

| Field | Content |
|-------|---------|
| **Owner** | DB operator |
| **Command/action** | On V5 target: `npm run db:status` (and foundation verify as per [`HOSTED_SUPABASE_RUNBOOK.md`](../database/HOSTED_SUPABASE_RUNBOOK.md)). Confirm schema heads match release candidate; **no** `public.tenants` / `public.session` created |
| **Expected** | Ledger matches intended V5 release; foundation verify PASS |
| **Evidence** | `db:status` summary; verify output; explicit “no public.session” note |
| **Stop condition** | Pending migrations unexpected; foundation verify FAIL; legacy public session tables present |
| **Rollback** | Do not apply V4 data; restore V5 from Stage 4 if schema was wrongly mutated |

---

### Stage 8 — Plan-key migration

| Field | Content |
|-------|---------|
| **Owner** | Product + Engineering + DB operator |
| **Command/action** | Only when [`BLESSBOARD_PLAN_KEY_MIGRATION_PLAN.md`](../migrations/BLESSBOARD_PLAN_KEY_MIGRATION_PLAN.md) is **READY**. Prefer **before** production V4 apply (combined order Option A): inventory subscriptions; insert `foundation`/`network`; copy features; repoint FKs; same-release update `mapPlanKey` + provision + seeds. **Never** in-place rename. Partner disposition must be decided. If plan-key still NOT READY: **skip writes**; run Stage 9–11 against **legacy** keys only and block estate authoritative until plan-key closes |
| **Expected** | Approved vocabulary live **or** explicit deferral recorded with gate “before authoritative / production reopen” |
| **Evidence** | Inventory counts; remount report **or** signed deferral referencing plan §27–§28 |
| **Stop condition** | Attempting SQL while plan NOT READY; inactivating plans with live FKs; unresolved `partner` without waiver |
| **Rollback** | Restore V5 from Stage 4 snapshot; revert app release that changed mapper/provision |

---

### Stage 9 — V4-to-V5 migration dry run

| Field | Content |
|-------|---------|
| **Owner** | DB operator (supervised) |
| **Command/action** | Export **only** `V4_SOURCE_DATABASE_URL` and `V5_TARGET_DATABASE_URL` (no `DATABASE_URL` fallback for migrator). Set output dir. Run `npm run migrate:v4-to-v5:plan` then `npm run migrate:v4-to-v5:dry-run`. Review quarantine/conflict reports. Local rehearsal PASS is **not** a substitute |
| **Expected** | Dry-run completes; summaries written; no target writes; conflicts enumerated |
| **Evidence** | `dry-run-summary.json` + conflict/skip lists under `<OUTPUT_DIR>` (scrub secrets) |
| **Stop condition** | Env fallback used; identity wrong; dry-run errors without waiver; product mapping M4–M12 unanswered (B07) |
| **Rollback** | N/A (no writes); fix mapping/env and re-run dry-run |

---

### Stage 10 — Conflict approval

| Field | Content |
|-------|---------|
| **Owner** | Product + Cutover lead + DB operator |
| **Command/action** | Walk every conflict/quarantine/skip from Stage 9; mark accept / waive / must-fix. Close or waive media blob strategy (B08). Sign “go for apply” |
| **Expected** | Signed conflict table; no silent skip of CRITICAL rows |
| **Evidence** | Conflict approval table on ticket; waivers attached |
| **Stop condition** | Unreviewed CRITICAL conflicts; unsigned go-for-apply |
| **Rollback** | Remain on dry-run; do not enter Stage 11 |

---

### Stage 11 — V4-to-V5 apply

| Field | Content |
|-------|---------|
| **Owner** | DB operator + Cutover lead (**supervised only**) |
| **Command/action** | Confirm Stages 3–10 + write maintenance. Same explicit source/target env. `npm run migrate:v4-to-v5:apply -- --confirm`. Monitor checkpoints. **No CI auto-apply** |
| **Expected** | Apply summary PASS or bounded failures per approved waivers; checkpoints under `state/` |
| **Evidence** | `apply-summary.json`; checkpoint list; operator + lead initials |
| **Stop condition** | Unsupervised run; identity fail mid-window; mass unexpected errors; secret print in logs |
| **Rollback** | Stop apply; restore V5 from Stage 4; keep V4 as source of truth; file incident ([`V5_INCIDENT_RESPONSE.md`](../operations/V5_INCIDENT_RESPONSE.md) · rollback rehearsal) |

---

### Stage 12 — Reconciliation

| Field | Content |
|-------|---------|
| **Owner** | DB operator + QA |
| **Command/action** | `npm run migrate:v4-to-v5:verify`. Fill [`V4_TO_V5_RECONCILIATION_TEMPLATE.md`](../migrations/V4_TO_V5_RECONCILIATION_TEMPLATE.md). Compare counts / samples / quarantine. **No destructive cleanup** |
| **Expected** | Reconcile deltas explained or waived; template signed |
| **Evidence** | Reconciliation file + signed deltas |
| **Stop condition** | Unexplained count gaps; cleanup attempted before sign-off |
| **Rollback** | Treat as apply failure: restore V5 snapshot; V4 remains live |

---

### Stage 13 — Second-run idempotency verification

| Field | Content |
|-------|---------|
| **Owner** | DB operator |
| **Command/action** | Optional but recommended: second `npm run migrate:v4-to-v5:apply -- --confirm` on same pair. Expect no duplicate orgs/domains; near-zero new writes |
| **Expected** | Idempotent apply report; no duplicate critical entities |
| **Evidence** | Second apply summary vs first |
| **Stop condition** | Duplicates or unbounded writes on second run |
| **Rollback** | Incident + V5 restore from Stage 4; do not proceed to routing |

---

### Stage 14 — Domain / routing checks

| Field | Content |
|-------|---------|
| **Owner** | App operator + QA |
| **Command/action** | With routing still **`off`** (or as documented for pre-shadow): verify DNS apex + pilot hosts → V5 app; Hostinger env: `PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5`, V5-only `DATABASE_URL`, `GETPRO_DATABASE_URL` **unset**, `SESSION_SECRET` ≥32, jobs policy per env docs. Curl `/healthz` with Host headers. Confirm V4 production path still intact for non-cutover traffic |
| **Expected** | Foundation HTML on V5; identity healthy; V4 customer path unchanged until later stages |
| **Evidence** | Dig/curl notes; env checklist (no secret values); V4 smoke note |
| **Stop condition** | Wrong DNS; GetPro URL set; identity mismatch; V4 broken unexpectedly |
| **Rollback** | Fix DNS/env; do not enable shadow/authoritative |

---

### Stage 15 — Shadow validation

| Field | Content |
|-------|---------|
| **Owner** | App operator + QA |
| **Command/action** | Execute [`V5_SHADOW_MODE_RUNBOOK.md`](./V5_SHADOW_MODE_RUNBOOK.md) fully: set `BLESSBOARD_TENANT_ROUTING_MODE=shadow`, restart all workers, capture §7–§10 + §14 evidence pack (apex, tenant Host still foundation HTML, shadow log keys, unknown host, no secrets in logs) |
| **Expected** | Live shadow evidence pack complete (B01 closed) |
| **Evidence** | Shadow evidence pack on ticket |
| **Stop condition** | Shadow readiness “GO to enable” without live pack; logs leak secrets; tenant HTML changes under shadow |
| **Rollback** | Set mode=`off`, restart all workers; file incident if needed |

---

### Stage 16 — Supervised authoritative activation

| Field | Content |
|-------|---------|
| **Owner** | Leadership + App operator (**pilot hosts only first**) |
| **Command/action** | Confirm [`V5_AUTHORITATIVE_ROUTING_PREREQUISITES.md`](./V5_AUTHORITATIVE_ROUTING_PREREQUISITES.md) PASS including signed approval (B09) and demo/pilot data (B02–B05) as required for scope. Enable `authoritative` **only** for approved pilot scope — **not** global estate without Stage 15 evidence + pilot success. Prefer supervised demo launch path first ([`V5_SUPERVISED_DEMO_LAUNCH_RUNBOOK.md`](./V5_SUPERVISED_DEMO_LAUNCH_RUNBOOK.md)) |
| **Expected** | Pilot hosts resolve V5 tenant HTML correctly; non-pilot policy documented |
| **Evidence** | Signed pilot approval; Host checks; before/after notes |
| **Stop condition** | Global flip without pilot evidence; prerequisites NOT READY; unsigned approval |
| **Rollback** | Mode=`shadow` or `off` per incident severity; restart all workers |

---

### Stage 17 — Authentication / session tests

| Field | Content |
|-------|---------|
| **Owner** | QA |
| **Command/action** | Login/logout; transfer flows; CSRF 403 on bad token; cookie **host-only** (no `Domain=.blessboard.org`); session survives expected paths only. Use smoke plan T-items for auth |
| **Expected** | Auth matrix PASS on pilot; no cross-host session leak |
| **Evidence** | Browser DevTools cookie notes; smoke rows |
| **Stop condition** | Parent-domain cookie; cross-tenant session; transfer wrong-host success |
| **Rollback** | Disable authoritative (Stage 16 rollback); rotate `SESSION_SECRET` if leak suspected |

---

### Stage 18 — Role and tenant-scope tests

| Field | Content |
|-------|---------|
| **Owner** | QA |
| **Command/action** | Platform admin / HQ / branch / member role matrix on pilot org; confirm no cross-org data; HQ vs branch scope. Requires personas (B02) |
| **Expected** | Authz matrix holds live |
| **Evidence** | Role-matrix smoke checklist |
| **Stop condition** | Cross-tenant read/write; missing personas |
| **Rollback** | Contain per incident (CRITICAL if cross-tenant); routing rollback |

---

### Stage 19 — Public / member / admin smoke tests

| Field | Content |
|-------|---------|
| **Owner** | QA |
| **Command/action** | Execute hosted E2E / smoke ([`V5_DEMO_E2E_SMOKE_TEST.md`](../testing/V5_DEMO_E2E_SMOKE_TEST.md) and/or `npm run smoke:v5:deployed` against **allowlisted testing hosts only**). Cover public, member, HQ, branch, PA as in scope |
| **Expected** | Critical paths PASS or waived |
| **Evidence** | Smoke report + screenshots/notes (no PII/secrets) |
| **Stop condition** | Critical path FAIL without waiver; runner pointed at production without approval |
| **Rollback** | Routing + write-maintenance as needed; keep V4 primary if estate not cut |

---

### Stage 20 — Media checks

| Field | Content |
|-------|---------|
| **Owner** | QA + Ops |
| **Command/action** | Verify media metadata; upload kill-switch policy (`BLESSBOARD_MEDIA_UPLOADS_ENABLED`); sample asset fetch; confirm blob strategy waiver or copy complete (B08). Soft-archive behavior only |
| **Expected** | Agreed media behavior; no unexpected 404 storm without waiver |
| **Evidence** | Media sample checklist; waiver if blobs deferred |
| **Stop condition** | Production uploads enabled contrary to policy; mass broken assets without waiver |
| **Rollback** | Keep uploads disabled; document customer impact; do not destructive-delete media rows |

---

### Stage 21 — Monitoring period

| Field | Content |
|-------|---------|
| **Owner** | App operator + Cutover lead |
| **Command/action** | Run watch window per [`V5_MONITORING_REQUIREMENTS.md`](../operations/V5_MONITORING_REQUIREMENTS.md): healthz, error rates, auth failures, unknown-host noise, routing mode stability, write-maintenance state, job disabled flags. Page on CRITICAL per [`V5_INCIDENT_RESPONSE.md`](../operations/V5_INCIDENT_RESPONSE.md) |
| **Expected** | Stable metrics for agreed duration; no cross-tenant alerts |
| **Evidence** | Watch log with timestamps; alert outcomes |
| **Stop condition** | Unexplained 5xx spike; identity/routing anomalies; secret in logs |
| **Rollback** | Incident playbooks: mode demote, maintenance on, restore DB if data corruption |

---

### Stage 22 — V4 fallback decision

| Field | Content |
|-------|---------|
| **Owner** | Leadership + Cutover lead |
| **Command/action** | Explicit decision: **keep V4 primary**, **dual-run**, or **decommission path later**. Fallback = serve customers from V4 + set V5 routing `off`/`shadow` as appropriate — **not** V5→V4 reverse sync |
| **Expected** | Written decision with trigger criteria for future fallback |
| **Evidence** | Decision record on ticket |
| **Stop condition** | Assumed “V4 deleted” without decision; reverse-write proposed |
| **Rollback** | Execute documented fallback: DNS/env to V4 path; V5 mode off; communicate |

---

### Stage 23 — Cleanup and evidence

| Field | Content |
|-------|---------|
| **Owner** | DB operator + Cutover lead |
| **Command/action** | **Only after** Stage 12 reconcile signed and Stage 21 watch OK: archive migration artifacts; scrub secrets from copies; reopen writes (`BLESSBOARD_WRITE_MAINTENANCE=0`) when Leadership approves; **no** premature DROP of quarantine. Update blocker doc status in a follow-up ticket (do not invent PASS here) |
| **Expected** | Evidence pack complete; maintenance off only when intentional; artifacts retained per backup policy |
| **Evidence** | Archive location (path/ticket); maintenance off confirmation; evidence index |
| **Stop condition** | Cleanup before reconcile; secrets left in git; maintenance forgotten on/off |
| **Rollback** | Restore artifacts from ticket store; re-enable maintenance if writes unsafe |

---

### Stage 24 — Final sign-off

| Field | Content |
|-------|---------|
| **Owner** | Leadership + Cutover lead + QA + DB operator |
| **Command/action** | Sign production cutover complete **or** record partial (pilot-only) completion. Confirm prohibitions held. List residual accepted limitations (A01–A10) and deferred (D01+) |
| **Expected** | Named signatures; scope clarity (pilot vs estate); residual risk list |
| **Evidence** | Sign-off table below |
| **Stop condition** | Pressure to sign while CRITICAL blockers open |
| **Rollback** | N/A — if unsigned, cutover is **not** complete |

#### Sign-off table

| Role | Name | Date (UTC) | Scope (pilot / estate) | ☐ |
|------|------|------------|------------------------|---|
| Leadership | | | | ☐ |
| Cutover lead | | | | ☐ |
| DB operator | | | | ☐ |
| QA | | | | ☐ |
| App operator | | | | ☐ |

---

## Suggested chronological grouping

```text
Approval & freeze     → Stages 1–2
Backups & writes      → Stages 3–5
Identity & schema     → Stages 6–7
Plan-key (if READY)   → Stage 8
Migrate               → Stages 9–13
Pre-routing verify    → Stage 14
Shadow → pilot auth   → Stages 15–16
Prove product         → Stages 17–20
Watch & decide        → Stages 21–22
Close                 → Stages 23–24
```

**Demo / pilot track** may run in parallel **before** estate migrate (combined order), but **estate production cutover** still requires Stages 1–24 as applicable. Global authoritative remains gated on pilot evidence.

---

## Verdict — READY or NOT READY

### **NOT READY**

Current documentation and evidence packs do **not** support executing this master runbook through production estate cutover.

| Gate | Document status |
|------|-----------------|
| Hosted V4→V5 dry-run/apply | **MISSING** (B06 / H01) |
| Plan-key migration | **NOT READY TO IMPLEMENT** (B12 / C01–C04) |
| Shadow live evidence pack | **MISSING** (B01) |
| Authoritative pilot | **NOT READY** (B01–B05, B09) |
| Demo personas / CMS / samples | **MISSING** (B02–B04) |
| Estate cutover gates (backups, window, DNS, Hostinger) | **OPEN** (B10 / M08) — backups largely **UNKNOWN** / DOCUMENTED ONLY |
| Mapping decisions M4–M12 / media blobs | **OPEN** (B07 / B08) |
| Production cutover approval | **UNSIGNED** |

Local rehearsal PASS and shadow “GO to enable” are **not** production cutover readiness.

---

## Blocking prerequisites (must close before Stage 11 / 16 / estate 24)

### Before any hosted migrate **apply** (Stage 11)

| ID | Prerequisite |
|----|----------------|
| B06 / H01 | Hosted dry-run + plan artifacts against intended V4 source / V5 target |
| B07 | Product mapping answers or waivers (M4–M12) |
| B08 | Media blob strategy or signed 404-risk waiver |
| B10 / M08 | Backups ≤24h (or PITR) on **both** V4 and V5 with restore owner; ≤4h rollback plan |
| H02–H04 | Explicit `V4_SOURCE_*` / `V5_TARGET_*`; identity gate; no `public.session` / no reverse-write |
| Stage 1 | Signed cutover window + abort authority |
| Stage 5 | Write maintenance on for live apply window (if V5 app live) |
| Stage 10 | Conflict approval signed |
| X03 | Supervised operators only — no CI apply |

### Before plan-key **writes** (Stage 8)

| ID | Prerequisite |
|----|----------------|
| B12 / plan §27–28 | Plan-key plan READY; partner disposition; inventory captured |
| Same-release | `mapPlanKey` + provision + seeds aligned with data remount |

### Before **authoritative** (Stage 16) — pilot

| ID | Prerequisite |
|----|----------------|
| B01 | Live shadow evidence pack |
| B02–B05 | Personas, published pages, samples, hosted smoke |
| B09 | Signed Leadership pilot approval |
| B11 / M01–M02 | Hostinger + DNS operator confirm |
| X02 | Manual only; **not** global without pilot evidence |

### Before **estate** final sign-off (Stage 24)

| ID | Prerequisite |
|----|----------------|
| All of the above for production scope | |
| Stages 17–21 | Auth, roles, smoke, media, monitoring period PASS or waived |
| Stage 22 | Explicit V4 fallback / dual-run decision |
| Stage 23 | Evidence archived; no destructive pre-reconcile cleanup |
| Residual | Accepted limitations documented; CRITICAL blockers closed or formally waived |

---

## Related npm scripts (reference only — do not run from this doc)

| Script | Role |
|--------|------|
| `npm run db:identity:check` | Stage 6 |
| `npm run db:status` / foundation verify | Stage 7 |
| `npm run migrate:v4-to-v5:plan` | Stage 9 |
| `npm run migrate:v4-to-v5:dry-run` | Stage 9 |
| `npm run migrate:v4-to-v5:apply -- --confirm` | Stages 11 / 13 — **supervised only** |
| `npm run migrate:v4-to-v5:verify` | Stage 12 |
| `npm run migrate:v4-to-v5:rehearsal` | Local only — not hosted cutover |
| `npm run smoke:v5:deployed` | Stage 19 — allowlisted testing hosts only |

---

## Document control

| Field | Value |
|-------|--------|
| Created | 2026-07-19 |
| Execution from this file | **Forbidden** without subordinate runbook evidence + signed ticket |
| Supersedes | None — orchestrates existing runbooks |
| Next update when | Hosted dry-run evidence exists; plan-key READY; shadow pack filed; authoritative pilot signed |
