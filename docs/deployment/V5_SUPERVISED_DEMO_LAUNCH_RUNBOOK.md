# BlessBoard V5 — Supervised demo launch runbook

**Date:** 2026-07-19  
**Scope:** Supervised **demo pilot** on testing deployment only — **not** estate-wide / production cutover  
**Constraint:** Creating this document does **not** deploy, flip Hostinger env, migrate, or approve any step  
**Demo target:** `diagnostic.blessboard.org` · org/church `diagnostic-church` · branch `hq` · app `blessboard-org-v5` · DB identity `blessboard-platform-v5` / `testing`

**Companions (read before execution)**

| Doc | Role |
|-----|------|
| [`V5_DEMO_TENANT_READINESS.md`](../testing/V5_DEMO_TENANT_READINESS.md) | Catalogue vs E2E gaps |
| [`V5_DEMO_PROVISIONING_COMMAND_AUDIT.md`](../testing/V5_DEMO_PROVISIONING_COMMAND_AUDIT.md) | Safe CLI + `--confirm` |
| [`V5_DEMO_TENANT_REMEDIATION_PLAN.md`](../testing/V5_DEMO_TENANT_REMEDIATION_PLAN.md) | Users / content remediation |
| [`V5_DEMO_E2E_SMOKE_TEST.md`](../testing/V5_DEMO_E2E_SMOKE_TEST.md) | Post-authoritative journeys |
| [`V5_DEPLOYED_SMOKE_RUNNER.md`](../testing/V5_DEPLOYED_SMOKE_RUNNER.md) | GET-only hosted smoke |
| [`V5_SHADOW_MODE_RUNBOOK.md`](./V5_SHADOW_MODE_RUNBOOK.md) | Shadow flip |
| [`V5_SHADOW_LOG_VALIDATOR.md`](../testing/V5_SHADOW_LOG_VALIDATOR.md) | Local redacted log check |
| [`V5_AUTHORITATIVE_PILOT_ALLOWLIST_DESIGN.md`](./V5_AUTHORITATIVE_PILOT_ALLOWLIST_DESIGN.md) | Host allow-list |
| [`V5_AUTHORITATIVE_ROUTING_PREREQUISITES.md`](./V5_AUTHORITATIVE_ROUTING_PREREQUISITES.md) | Authoritative gates |
| [`V5_MAINTENANCE_MODE_DESIGN.md`](../operations/V5_MAINTENANCE_MODE_DESIGN.md) | Write freeze (`BLESSBOARD_WRITE_MAINTENANCE`) |
| [`V5_HOSTED_MIGRATION_AND_CUTOVER.md`](../database/V5_HOSTED_MIGRATION_AND_CUTOVER.md) §5 | Rollback patterns (demo-scaled) |
| [`V5_INCIDENT_RESPONSE.md`](../operations/V5_INCIDENT_RESPONSE.md) | Incident stop |
| [`V5_RELEASE_CANDIDATE_CHECKLIST.md`](../release/V5_RELEASE_CANDIDATE_CHECKLIST.md) | RC / SHA discipline |
| [`V5_DEMO_CREDENTIALS_PLAN.md`](../security/V5_DEMO_CREDENTIALS_PLAN.md) | Vault-only passwords |

**Hard rules**

- No credentials, connection strings, or session secrets in this file, tickets, or evidence packs.  
- No production-wide cutover; no `BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST=*`.  
- No automated approvals — every gate is a human ☐ + signature.  
- Prefer dry-run CLIs; use `--confirm` only after signed Step 5.  
- Keep `GETPRO_DATABASE_URL` **unset** on V5.  
- Do not use `church:seed-demos` / legacy `public.tenants` paths.

---

## Execution-ready verdict (documentation assessment)

| Question | Answer |
|----------|--------|
| Is this **runbook** complete enough to supervise a demo launch? | **YES** — roles, sequence, commands, stops, rollback, evidence defined |
| Can operators execute **end-to-end today**? | **NO** until demo personas/content (readiness B02–B04), live shadow evidence (B01), and signed Leadership gates close — see [`V5_AUTHORITATIVE_ROUTING_PREREQUISITES.md`](./V5_AUTHORITATIVE_ROUTING_PREREQUISITES.md) **NOT READY** |
| Partial execution allowed? | **YES** — Steps 1–6 with routing `off` and read-only smoke; stop before shadow/authoritative without GO |

---

## Placeholders (fill before run)

| Alias | Example / meaning |
|-------|-------------------|
| `<APEX_BASE>` | `https://blessboard.org` |
| `<DEMO_HOST>` | `diagnostic.blessboard.org` |
| `<ORG_KEY>` | `diagnostic-church` |
| `<CHURCH_KEY>` | `diagnostic-church` |
| `<BRANCH_KEY>` | `hq` |
| `<DEPLOYMENT_CODE>` | `blessboard-org-v5` |
| `<IDENTITY_KEY>` | `blessboard-platform-v5` |
| `<GIT_SHA>` | Exact commit deployed to Hostinger |
| `<RC_ID>` | e.g. `blessboard-v5.0.0-rc.1` or `V5-rc.1` tip |
| `<EVIDENCE_DIR>` | Local folder for redacted artifacts (not git) |
| `<REDACTED_SHADOW_LOG>` | Path to redacted shadow extract |
| `<TICKET>` | Change / demo ticket ID |

---

## 1. Personnel and approval roles

| Role | Responsibility | Name | ☐ |
|------|----------------|------|---|
| **Demo lead** | Sequence control; go/no-go between phases | | ☐ |
| **App / deploy operator** | Hostinger env, restart **all** workers | | ☐ |
| **DB / identity operator** | Identity check; provision dry-run/confirm (no secrets in chat) | | ☐ |
| **QA** | Smoke + E2E worksheet | | ☐ |
| **Rollback owner** | Execute §14 immediately on stop | | ☐ |
| **Comms** | Stakeholder notice (demo window) | | ☐ |
| **Leadership** | Sign authoritative pilot enable (§10 / §17) | | ☐ |

Approvals are **manual**. Do not script “auto-approve.”

---

## 2. Pre-launch backup

| # | Action | Command / evidence | ☐ |
|---|--------|-------------------|---|
| 2.1 | Confirm V5 DB identity (read-only) | See §4.1 | ☐ |
| 2.2 | Record Hostinger snapshot / PITR label (ID only, no URL) | Ticket note: `V5_SNAPSHOT_ID=<ID>` | ☐ |
| 2.3 | Capture apex `/healthz` baseline | §6 curl | ☐ |
| 2.4 | Confirm write maintenance **off** | Hostinger: `BLESSBOARD_WRITE_MAINTENANCE` unset or `0` | ☐ |
| 2.5 | Confirm jobs **off**, media uploads **off** unless demo needs uploads | `BLESSBOARD_JOBS_ENABLED=0`; `BLESSBOARD_MEDIA_UPLOADS_ENABLED=0` (or signed `1`) | ☐ |

Demo launch does **not** require V4 freeze or estate migrate apply. If a DB write window is needed for provision, prefer short `BLESSBOARD_WRITE_MAINTENANCE=1` only with Demo lead + Rollback owner sign-off (see maintenance design) — default for this runbook: **leave write maintenance off** and use gated `--confirm` CLIs.

---

## 3. Commit and release candidate

| # | Action | Template | ☐ |
|---|--------|----------|---|
| 3.1 | Record deployed SHA | `git rev-parse HEAD` → `<GIT_SHA>` (on the machine that built/deployed) | ☐ |
| 3.2 | Confirm branch / RC | Expected: `V5` tip or `V5-rc.N` per [`V5_RELEASE_CANDIDATE_CHECKLIST.md`](../release/V5_RELEASE_CANDIDATE_CHECKLIST.md) | ☐ |
| 3.3 | Local regression (optional preflight) | `npm run test:blessboard:v5:regression:fast` | ☐ |
| 3.4 | Kill-switch / maintenance unit smoke | `npm run test:blessboard:kill-switches` · `npm run test:blessboard:write-maintenance` | ☐ |
| 3.5 | Ticket cites `<RC_ID>` + `<GIT_SHA>` | No secrets in ticket | ☐ |

Do **not** create tags from this runbook unless Leadership separately orders it.

---

## 4. Environment verification

### 4.1 Identity (operator laptop / bastion — values not printed)

```bash
export DATABASE_URL='<V5_DATABASE_URL>'
export DATABASE_IDENTITY_EXPECTED='<IDENTITY_KEY>'
# GETPRO_DATABASE_URL must be unset
unset GETPRO_DATABASE_URL

npm run db:identity:check
npm run db:status
npm run db:verify:foundation
```

Expect: identity match `<IDENTITY_KEY>`; no `public.tenants` / `public.session`.

### 4.2 Hostinger panel (presence only — do not paste secrets)

| Variable | Expected for demo launch start | ☐ |
|----------|--------------------------------|---|
| `PLATFORM_DEPLOYMENT_CODE` | `<DEPLOYMENT_CODE>` | ☐ |
| `DEPLOYMENT_ENV` | `testing` | ☐ |
| `BLESSBOARD_TENANT_ROUTING_MODE` | `off` (before §7) | ☐ |
| `BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST` | **empty / unset** until §9 | ☐ |
| `BLESSBOARD_JOBS_ENABLED` | `0` | ☐ |
| `BLESSBOARD_WRITE_MAINTENANCE` | unset or `0` | ☐ |
| `BLESSBOARD_MEDIA_UPLOADS_ENABLED` | `0` unless signed | ☐ |
| `GETPRO_DATABASE_URL` | **unset** | ☐ |
| `SESSION_COOKIE_NAME` | V5-specific (e.g. `blessboard_org_v5_sid`) | ☐ |

Restart **all** workers after any env change.

### 4.3 Health baseline

```bash
curl -sS '<APEX_BASE>/healthz'
curl -sS -o /dev/null -w '%{http_code}\n' '<APEX_BASE>/'
curl -sS -o /dev/null -w '%{http_code}\n' '<APEX_BASE>/login'
```

Expect: `/healthz` **200** with `"ok":true` and V5 mode string; `writeMaintenance` **false** or absent-as-false.

---

## 5. Demo tenant provisioning

**Gate:** Demo lead signs that catalogue remediation may write (users/content).  
**Default:** dry-run first; `--confirm` only after sign-off.

### 5.1 Catalogue dry-run (no `--confirm`)

```bash
npm run platform:tenant:provision -- \
  --organization-key <ORG_KEY> \
  --display-name 'BlessBoard Diagnostic Church' \
  --environment testing \
  --product blessboard \
  --tenant-key <ORG_KEY> \
  --hostname <DEMO_HOST> \
  --domain-type canonical \
  --deployment <DEPLOYMENT_CODE>

npm run blessboard:church:provision -- \
  --organization-key <ORG_KEY> \
  --church-key <CHURCH_KEY> \
  --display-name 'BlessBoard Diagnostic Church' \
  --environment testing \
  --hq-branch-key <BRANCH_KEY> \
  --hq-branch-name 'Headquarters' \
  --deployment <DEPLOYMENT_CODE>
```

Expect: plan JSON / `already_provisioned` without writes unless `--confirm` added.

### 5.2 Confirm writes (only if dry-run OK + signed)

```bash
# Same commands as 5.1 with trailing --confirm
# Passwords via stdin only — never in argv history if avoidable:
# printf '%s' '<PASSWORD_FROM_VAULT>' | npm run blessboard:user:create -- ... --password-stdin
```

Follow [`V5_DEMO_TENANT_READINESS.md`](../testing/V5_DEMO_TENANT_READINESS.md) §6 / remediation plan for PA / HQ / BA / member + published Home/About.  
Store credentials only in vault ([`V5_DEMO_CREDENTIALS_PLAN.md`](../security/V5_DEMO_CREDENTIALS_PLAN.md)).

### 5.3 Forbidden

```bash
# DO NOT RUN against V5 foundation DB:
# npm run church:seed-demos
# npm run church:demo-admin
```

---

## 6. Smoke tests with routing off

```bash
# Confirm mode still off on Hostinger, then:
npm run smoke:v5:deployed -- \
  --base-url <APEX_BASE> \
  --tenant-host <DEMO_HOST> \
  --json > '<EVIDENCE_DIR>/smoke-routing-off-<UTC>.json'
```

Expect: exit **0**; apex GETs **200**; tenant Host `/` **200** foundation (not CMS); unknown host controlled; no secrets in report.

Manual curl cross-check:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: <DEMO_HOST>' '<APEX_BASE>/'
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: unknown.blessboard.org' '<APEX_BASE>/'
```

**Stop** if smoke fails — do not proceed to shadow.

---

## 7. Shadow mode

Execute [`V5_SHADOW_MODE_RUNBOOK.md`](./V5_SHADOW_MODE_RUNBOOK.md) under Demo lead + App operator.

```bash
# Hostinger V5 — then restart ALL workers:
BLESSBOARD_TENANT_ROUTING_MODE=shadow
# Keep allow-list empty; jobs 0; write maintenance 0
```

Verify:

```bash
curl -sS '<APEX_BASE>/healthz'
curl -sS -o /dev/null -w '%{http_code}\n' '<APEX_BASE>/'
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: <DEMO_HOST>' '<APEX_BASE>/'
# Demo Host HTML must remain foundation (no tenant CMS chrome) under shadow
```

Capture redacted shadow log lines to `<REDACTED_SHADOW_LOG>` (strip cookies, tokens, URLs with secrets before save).

---

## 8. Shadow log validation

```bash
npm run verify:v5:shadow-log -- --file '<REDACTED_SHADOW_LOG>' \
  --hostname <DEMO_HOST> \
  --organization-key <ORG_KEY> \
  --church-key <CHURCH_KEY> \
  --primary-branch-key <BRANCH_KEY>

npm run verify:v5:shadow-log -- --file '<EVIDENCE_DIR>/unknown-host-redacted.log' \
  --mode unknown-host \
  --hostname unknown.blessboard.org
```

Expect: exit **0**. File validator JSON report under `<EVIDENCE_DIR>/`.  
**Stop** on fail or secret patterns — rollback routing to `off` (§14).

Leadership / Demo lead: ☐ Shadow evidence **approved** (ticket `<TICKET>`).

---

## 9. Demo hostname allow-list

Set **before** authoritative (exact host only — never `*`):

```bash
# Hostinger V5 — restart ALL workers after save:
BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST=<DEMO_HOST>
# Example: diagnostic.blessboard.org
# Do NOT set * for supervised demo
```

Confirm empty allow-list fail-closed behavior is understood: if mode is accidentally `authoritative` with empty list → foundation only.

---

## 10. Authoritative pilot

**Blocked until:** §5 personas/content READY · §8 shadow approved · Leadership signature below · allow-list = `<DEMO_HOST>` only.

```bash
# Hostinger V5 — signed enable only — restart ALL workers:
BLESSBOARD_TENANT_ROUTING_MODE=authoritative
BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST=<DEMO_HOST>
BLESSBOARD_JOBS_ENABLED=0
BLESSBOARD_WRITE_MAINTENANCE=0
```

Immediate verify:

```bash
curl -sS '<APEX_BASE>/healthz'
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: <DEMO_HOST>' '<APEX_BASE>/'
# Expect tenant public chrome for demo host when content published
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: unknown.blessboard.org' '<APEX_BASE>/'
# Expect controlled not-found / foundation — not another org’s CMS
```

Record authoritative-enable UTC: `<ISO-8601>` (rollback clock for this pilot).

| Approver | Decision | UTC | ☐ |
|----------|----------|-----|---|
| Demo lead | ☐ go · ☐ no-go | | ☐ |
| Leadership | ☐ go · ☐ no-go | | ☐ |
| Rollback owner (ack) | ☐ ready | | ☐ |

---

## 11. E2E execution

Run [`V5_DEMO_E2E_SMOKE_TEST.md`](../testing/V5_DEMO_E2E_SMOKE_TEST.md) journeys for the demo tenant (T06+ under authoritative; apex T01–T05 anytime).

```bash
# Re-run read-only smoke (still useful under authoritative):
npm run smoke:v5:deployed -- \
  --base-url <APEX_BASE> \
  --tenant-host <DEMO_HOST> \
  --json > '<EVIDENCE_DIR>/smoke-authoritative-<UTC>.json'
```

Manual: PA / HQ / BA / MEM in **separate** private windows; vault credentials only.  
Mark Pass/Fail/Blocked per T-row; capture screenshots without password fields.

Optional: if uploads are in scope, enable `BLESSBOARD_MEDIA_UPLOADS_ENABLED=1` only with signed note; otherwise leave `0`.

---

## 12. Monitoring

| Signal | How | Pass |
|--------|-----|------|
| `/healthz` | Periodic curl during window | **200**; `writeMaintenance` false |
| Apex `/` `/login` | Spot check | **200**; no stacks |
| Demo Host | Spot check | Expected shell for current mode |
| Shadow / route logs | Hostinger logs | No secrets; allow-list denials expected for non-demo hosts under authoritative |
| 5xx rate | Access logs | No sustained spike |
| Jobs | Env | Remain `0` |

See [`V5_MONITORING_REQUIREMENTS.md`](../operations/V5_MONITORING_REQUIREMENTS.md) for severity guidance.

---

## 13. Stop conditions

**Immediate stop** → execute §14 if any:

1. Apex `/healthz`, `/`, or `/login` **5xx** or stack traces in HTML.  
2. Non-demo tenant host serves demo (or any) church CMS under pilot.  
3. Allow-list set to `*` or cleared while mode stays `authoritative` without approval.  
4. Session cookie `Domain=.blessboard.org` (parent domain).  
5. Secrets in logs, HTML, smoke JSON, or evidence pack.  
6. `GETPRO_DATABASE_URL` set on V5.  
7. Workers disagree on routing mode / allow-list after restart.  
8. Authz bypass (wrong-role **200** on admin).  
9. Write maintenance stuck **on** outside an approved freeze.  
10. Operator uncertainty whether mode is `shadow` vs `authoritative`.

Do **not** “fix forward” by widening allow-list or enabling jobs.

---

## 14. Rollback

### 14.1 Routing / allow-list (primary)

```bash
# Hostinger V5 — restart ALL workers:
BLESSBOARD_TENANT_ROUTING_MODE=off
# Clear or leave empty:
BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST=
BLESSBOARD_JOBS_ENABLED=0
BLESSBOARD_WRITE_MAINTENANCE=0
BLESSBOARD_MEDIA_UPLOADS_ENABLED=0
```

Verify:

```bash
curl -sS '<APEX_BASE>/healthz'
curl -sS -o /dev/null -w '%{http_code}\n' '<APEX_BASE>/'
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: <DEMO_HOST>' '<APEX_BASE>/'
```

Expect: foundation on demo Host; no new authoritative/shadow tenant CMS; healthz **200**.

### 14.2 Optional intermediate

```bash
BLESSBOARD_TENANT_ROUTING_MODE=shadow
BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST=
```

Only if Demo lead wants observational logs without tenant HTML.

### 14.3 Do not

- Drop V5 database  
- Create `public.tenants` / `public.session`  
- Set `GETPRO_DATABASE_URL`  
- Reverse-write into V4  
- Estate DNS cutover / `*` allow-list  

DNS revert only if apex itself is unreachable beyond the routing flag.

---

## 15. Evidence package

Store under `<EVIDENCE_DIR>` (not committed to git):

| Item | File / note |
|------|-------------|
| Ticket ID | `<TICKET>` |
| `<GIT_SHA>` / `<RC_ID>` | text |
| Healthz samples (UTC) | `healthz-*.json` (no secrets) |
| Smoke JSON (off + authoritative) | `smoke-*.json` |
| Redacted shadow logs + validator reports | `shadow-*.log` / `shadow-*.json` |
| Allow-list / mode change timestamps | worksheet |
| E2E Pass/Fail table | export from demo E2E plan |
| Screenshots | no password fields; blur PII |
| Approval signatures | §10 / §17 |

Forbidden in pack: `.env`, raw `DATABASE_URL`, passwords, session cookies, unretracted transfer `tr=` values.

---

## 16. Post-launch observation

| Window | Actions | ☐ |
|--------|---------|---|
| T+0–30 min | Healthz + demo Host + one PA/HQ login | ☐ |
| T+2 h | Re-check logs for secret patterns; unknown-host noise only | ☐ |
| T+24 h | Demo lead: keep / roll back / schedule teardown of disposable users | ☐ |
| Credential hygiene | Rotate demo passwords per credentials plan after shared demo day | ☐ |

If demo ends: set routing `off`, clear allow-list, restart; leave catalogue data unless ops requests cleanup (no invent SQL).

---

## 17. Final approval

| Gate | Owner | Decision | UTC | ☐ |
|------|-------|----------|-----|---|
| Shadow evidence accepted | Demo lead + QA | ☐ go · ☐ no-go | | ☐ |
| Demo data / personas ready | Demo lead | ☐ go · ☐ no-go | | ☐ |
| Allow-list = demo host only | App operator | ☐ confirmed | | ☐ |
| Authoritative pilot enable | Leadership | ☐ go · ☐ no-go | | ☐ |
| E2E demo complete / hold | QA + Demo lead | ☐ pass · ☐ hold · ☐ rolled back | | ☐ |
| Evidence pack filed | Demo lead | ☐ | | ☐ |

**This section does not auto-approve.** Unsigned rows mean **stop**.

---

## Suggested documentation commit message

```
docs(deployment): add supervised V5 demo launch runbook

Sequence demo provision, off/smoke, shadow, allow-list pilot,
E2E, monitoring, rollback, and evidence without production cutover.
```
