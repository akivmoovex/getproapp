# BlessBoard V5 — Incident response runbook

**Date:** 2026-07-19  
**Mode:** Operational procedure — **do not** modify application code or infrastructure from this document alone  
**Purpose:** Detect, contain, diagnose, and recover V5 incidents during shadow, pilot, and cutover  
**Companions:** [`V5_MONITORING_REQUIREMENTS.md`](./V5_MONITORING_REQUIREMENTS.md) · [`V5_LOGGING_DATA_EXPOSURE_AUDIT.md`](../security/V5_LOGGING_DATA_EXPOSURE_AUDIT.md) · [`V5_SHADOW_MODE_RUNBOOK.md`](../deployment/V5_SHADOW_MODE_RUNBOOK.md) · [`V4_TO_V5_ROLLBACK_REHEARSAL.md`](../migrations/V4_TO_V5_ROLLBACK_REHEARSAL.md) · [`V5_HOSTED_MIGRATION_AND_CUTOVER.md`](../database/V5_HOSTED_MIGRATION_AND_CUTOVER.md)

---

## Standing rules

| Rule | Detail |
|------|--------|
| Cross-tenant exposure | Always **CRITICAL** — contain first, investigate second |
| Secret leakage | Requires **rotation** of every exposed secret; treat as CRITICAL |
| Logs | **Do not delete** logs before evidence preservation; copy/export first |
| Credentials | Never paste passwords, tokens, or full DB URLs into tickets, chat, or this runbook |
| Contacts | Use **named roles filled on the change ticket** — this doc does not invent phone trees or vendor contacts |
| Fail closed | Do not disable identity gates, CSRF, throttling, or auth “to restore service” |
| `GETPRO_DATABASE_URL` | Must remain **unset** on V5 Hostinger |

**Placeholders only in commands** — replace `<APEX_HOST>`, `<TENANT_HOST>`, etc. Do not commit real secrets.

---

## Severity matrix

| Severity | Definition | Initial response | Examples |
|----------|------------|------------------|----------|
| **CRITICAL** | Active or plausible cross-tenant data exposure; secret leak; wrong DB/identity; full apex outage; authoritative serving wrong tenant | Immediate containment; page Cutover/Incident lead + security-aware owner from ticket | Cross-tenant access; secret leakage; identity mismatch; wrong tenant resolved under authoritative |
| **HIGH** | Auth/session/transfer outage; migration apply failure mid-window; domain misconfig affecting pilots; sustained 5xx | Contain within watch window; Rollback owner on standby | Auth outage; session failure; transfer-token failure; migration failure |
| **MEDIUM** | CSRF surge; performance degradation; single-tenant hostname issues without data exposure | Triage same day; may defer routing changes | CSRF surge; slow responses; one tenant Host down |
| **LOW** | Transient noise; scanner unknown-host spikes with no pilot impact | Track; no customer comms unless asked | Benign unknown hostname noise |

**Escalation default:** If unsure whether cross-tenant risk exists → treat as **CRITICAL** until disproven.

---

## Role fill-in (per launch / window)

| Role | Name (from ticket) | ☐ |
|------|--------------------|---|
| Incident lead | `________________` | ☐ |
| App / Hostinger operator | `________________` | ☐ |
| DB operator | `________________` | ☐ |
| Rollback owner | `________________` | ☐ |
| Comms owner | `________________` | ☐ |
| Security reviewer (if cross-tenant or secret) | `________________` | ☐ |

---

## Global first minutes (all severities)

1. Open incident timeline (§ template below); assign Incident lead.  
2. Record routing mode, deployment code, UTC, git SHA if known.  
3. **Preserve evidence** (export/copy logs) **before** any log rotation or host restart that might wipe buffers — restarts are still allowed for containment after a snapshot if possible.  
4. Redact secrets from anything shared (§ monitoring redaction).  
5. Decide containment using the matching incident section.

---

## Safe diagnostic command templates

Use only after containment decision; never echo secret values.

```bash
# Health (apex)
curl -sS -o /dev/null -w '%{http_code}\n' "https://<APEX_HOST>/healthz"

# Apex home
curl -sS -o /dev/null -w '%{http_code}\n' "https://<APEX_HOST>/"

# Tenant Host header against apex origin (shadow/authoritative diagnostics)
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: <TENANT_HOST>' "https://<APEX_HOST>/"

# Identity check (ops workstation; URL from secret store — do not paste into chat)
export DATABASE_URL='<FROM_SECRET_STORE>'
export DATABASE_IDENTITY_EXPECTED='blessboard-platform-v5'
npm run db:identity:check
unset DATABASE_URL
```

**Hostinger panel (manual):** confirm `BLESSBOARD_TENANT_ROUTING_MODE`, `PLATFORM_DEPLOYMENT_CODE`, `BLESSBOARD_JOBS_ENABLED`, `GETPRO_DATABASE_URL` **unset**, `DATABASE_URL` **present** (do not screenshot full URL).

**Routing containment (template):**

```bash
# Set in Hostinger V5 env, then restart ALL workers
BLESSBOARD_TENANT_ROUTING_MODE=off
BLESSBOARD_JOBS_ENABLED=0
```

---

# Incident playbooks

Each playbook uses the same nine steps.

---

## A. Apex unavailable

**Default severity:** CRITICAL (full) / HIGH (intermittent)

### 1. Detection
`/healthz` or `/` ≠200; process crash; user reports apex down; startup FATAL in logs.

### 2. Immediate containment
Keep routing from promoting further; do not enable jobs. If recent deploy, prepare rollback of **app package** (panel) — do not change DB identity to “fix” it.

### 3. Evidence to preserve
UTC; healthz codes; startup/FATAL lines; worker count; last deploy SHA; **copy logs before restart if crash-looping**.

### 4. Safe diagnostic commands
Healthz/home curls; panel worker status; identity check only if DB suspected.

### 5. Escalation
Incident lead → App operator → DB operator if pool/identity errors.

### 6. Rollback option
Redeploy last known-good V5 package; if post-authoritative and V4 still valid, Rollback owner may restore V4 traffic per cutover/rollback rehearsal.

### 7. User communication
Comms owner: brief “BlessBoard apex unavailable — investigating” to agreed channel on ticket; no ETAs invented.

### 8. Recovery validation
healthz 200; apex `/` and `/login` 200; sample login if auth stack up.

### 9. Post-incident review
Root cause (env, deploy, DB, host); crash-loop prevention; update monitoring watch.

---

## B. Tenant hostname unavailable

**Default severity:** HIGH (pilot) / MEDIUM (single non-pilot) / CRITICAL if wrong content flashes

### 1. Detection
Host header curl fails; users report tenant site down; DNS NXDOMAIN; route outcome unexpected.

### 2. Immediate containment
If authoritative and content wrong → routing `off` immediately. If merely unresolved → do not flip modes randomly; fix DNS/domain row.

### 3. Evidence to preserve
Hostname; DNS lookup results (no secrets); `blessboard_tenant_route*` / `platform_host_comparison` samples (keys/reasons); panel domain status.

### 4. Safe diagnostic commands
Host-header curl; compare DNS inventory; identity check if DB errors accompany.

### 5. Escalation
App operator + DNS owner from ticket; DB if catalogue missing.

### 6. Rollback option
Routing `off`; DNS reverse only if recently changed (TTL wait).

### 7. User communication
Affects specific host — name the hostname only if already public; avoid listing other tenants.

### 8. Recovery validation
Pilot Host returns expected status for current mode (foundation under shadow; tenant under authoritative).

### 9. Post-incident review
DNS TTL, domain row, deployment code mismatch.

---

## C. Database identity mismatch

**Default severity:** CRITICAL

### 1. Detection
Startup `[blessboard] FATAL` identity mismatch/missing; `db:identity:check` fail; wrong project suspected.

### 2. Immediate containment
**Stop** serving if process still up on wrong assumptions: take app offline or ensure routing `off` + stop workers if needed. **Do not** rewrite identity row to match a wrong database. **Do not** set `GETPRO_DATABASE_URL` as workaround.

### 3. Evidence to preserve
Sanitized host fingerprint; expected vs actual `environment_code` / identity key from check output; panel which URL **key** is set (not value); timestamps.

### 4. Safe diagnostic commands
`npm run db:identity:check` with URL from secret store only.

### 5. Escalation
DB operator + Incident lead immediately; security reviewer if any doubt traffic hit wrong data.

### 6. Rollback option
Point app at correct V5 project URL from secret store **or** restore previous package/env; V4 traffic restore if customer-facing risk.

### 7. User communication
Generic outage / maintenance; **never** discuss database names or fingerprints publicly.

### 8. Recovery validation
Identity check PASS; foundation verify as appropriate; healthz 200; no FATAL on restart.

### 9. Post-incident review
How wrong URL entered panel; add dual-control for DB URL changes.

---

## D. Wrong tenant resolved

**Default severity:** CRITICAL under authoritative; HIGH under shadow (proposal only) if keys wrong

### 1. Detection
User sees another church’s content/branding; logs show unexpected `organizationKey`/`churchKey` for hostname; comparison mismatch ignored.

### 2. Immediate containment
**CRITICAL path:** set `BLESSBOARD_TENANT_ROUTING_MODE=off` + restart all workers **now**. Disable jobs. Preserve logs. Do not “fix domain and keep authoritative.”

### 3. Evidence to preserve
Hostname; observed keys vs expected keys; `requestId`s; screenshots **without** PII; access times; whether data was viewed/mutated (user report).

### 4. Safe diagnostic commands
Host-header curl after `off`; compare domain→org mapping in PA (read-only); do not dump member tables.

### 5. Escalation
Incident lead + security reviewer + Rollback owner; treat as potential cross-tenant until scoped.

### 6. Rollback option
Routing `off`; V4 restore if authoritative cutover; DNS reverse if host pointed wrongly.

### 7. User communication
Urgent to affected orgs only (ticket distribution list); do not detail other tenant’s data.

### 8. Recovery validation
With mode `off`, no tenant CMS; after careful fix, re-test **one** pilot Host in shadow before any authoritative return.

### 9. Post-incident review
Domain row, enrolment, deployment mismatch; mandatory security review sign-off.

---

## E. Cross-tenant access concern

**Default severity:** CRITICAL (always)

### 1. Detection
Report or evidence that User A accessed org/church B data/UI; IDOR suspicion; shared session across hosts unexpectedly.

### 2. Immediate containment
Routing `off`; consider taking V5 app offline if exposure ongoing; revoke sessions if tooling exists (ops); **rotate** `SESSION_SECRET` if session forgery suspected (forces re-login — coordinate). Preserve all logs — **do not delete**.

### 3. Evidence to preserve
Full timeline; `requestId`s; roles; hosts; authz paths; whether writes occurred; copy of access logs covering window.

### 4. Safe diagnostic commands
Health/routing confirm `off`; identity check; **no** production data exports to laptops without DB operator approval.

### 5. Escalation
Security reviewer + Incident lead + leadership contact **named on ticket** (not invented here).

### 6. Rollback option
V4 SoR restore; keep V5 offline/forensic; no V5→V4 reverse-write of suspect rows without counsel.

### 7. User communication
Comms owner + security reviewer approve wording; acknowledge investigation; avoid speculative blame.

### 8. Recovery validation
Only after root cause fixed and security reviewer signs; start routing `off` → shadow sample → separate approval for authoritative.

### 9. Post-incident review
Mandatory; track corrective actions; credential/session rotation proof.

---

## F. Authentication outage

**Default severity:** HIGH / CRITICAL if all logins fail during pilot

### 1. Detection
Apex/tenant login 5xx/500; mass failure reports; startup OK but login broken.

### 2. Immediate containment
Do not disable rate limits. If post-deploy, freeze further deploys. Routing `off` if auth outage coincides with wrong-tenant risk; otherwise keep mode stable while fixing.

### 3. Evidence to preserve
Status codes on `POST` login paths; `requestId`; error handler codes; deploy SHA; 429 vs 5xx distinction.

### 4. Safe diagnostic commands
GET `/login` 200; do **not** script password attempts (throttle); identity/DB connectivity check.

### 5. Escalation
App operator; DB if session/user tables unreachable.

### 6. Rollback option
Previous app package; V4 login path if cut over.

### 7. User communication
“Sign-in temporarily unavailable”; advise waiting on 429 cool-down if throttle-related.

### 8. Recovery validation
One successful apex login + logout; tenant login if authoritative; no password in evidence.

### 9. Post-incident review
Env `SESSION_SECRET`, DB, deploy regression.

---

## G. Session failure

**Default severity:** HIGH

### 1. Detection
Users bounced to login repeatedly; cookie not set; session create errors; sudden mass logout.

### 2. Immediate containment
If `SESSION_SECRET` rotated unexpectedly mid-flight, expect mass logout — communicate; do not rotate again without cause. Confirm cookie name/domain env.

### 3. Evidence to preserve
Cookie **names** and flags only (not values); `requestId`; timing vs deploy/secret change.

### 4. Safe diagnostic commands
Login GET/POST status; check panel `SESSION_COOKIE_NAME` / scheme / secure flags (values that are not secrets).

### 5. Escalation
App operator; security if forgery suspected → treat closer to cross-tenant.

### 6. Rollback option
Restore previous known-good session env **from secret store**; app package rollback.

### 7. User communication
“Please sign in again”; avoid asking users to paste cookies.

### 8. Recovery validation
Create session, hit authenticated page, logout, confirm cookie cleared.

### 9. Post-incident review
Secret rotation process; multi-worker env consistency.

---

## H. Transfer-token failure

**Default severity:** HIGH

### 1. Detection
Apex→tenant (or reverse) transfer fails; users stuck on apex after tenant login intent; redacted `tr`/`code` query failures.

### 2. Immediate containment
Do not log or ask users for raw transfer URLs. Prefer apex-only workaround messaging. If tokens leaking in referrer logs, treat as secret leakage for those tokens (short-lived) + review.

### 3. Evidence to preserve
`requestId`; path without query; outcome codes; apex origin / host config (non-secret).

### 4. Safe diagnostic commands
Manual browser transfer by **operator test account** only; confirm access log redaction still shows `REDACTED`.

### 5. Escalation
App operator; security if tokens appeared in plaintext tickets/chat → rotation/review.

### 6. Rollback option
App package; routing `off` if tenant entry unsafe.

### 7. User communication
Use apex login directly if available; “tenant handoff delayed.”

### 8. Recovery validation
Successful transfer with test account; subsequent GET shows redacted query in logs.

### 9. Post-incident review
Clock skew, cookie domain, one-time token consume bugs.

---

## I. Authorization bypass suspicion

**Default severity:** CRITICAL until disproven

### 1. Detection
Lower-privilege user reaches HQ/PA/other-org actions; 200 where 403 expected; IDOR on IDs.

### 2. Immediate containment
Routing `off` and/or disable write routes by taking app to maintenance if needed; preserve logs; identify accounts involved; force logout / secret rotation if session integrity doubtful.

### 3. Evidence to preserve
Actor role aliases (not passwords); paths; `requestId`; whether mutations occurred; screenshots redacted.

### 4. Safe diagnostic commands
Reproduce with **isolated test accounts** only after containment; never use production member PII in repro notes.

### 5. Escalation
Security reviewer + Incident lead immediately.

### 6. Rollback option
Prior release known to enforce authz; V4 restore if live cutover.

### 7. User communication
Security-approved only; may require direct outreach to affected orgs.

### 8. Recovery validation
Negative tests: BA cannot hit other org; member cannot hit HQ; CSRF still required.

### 9. Post-incident review
Mandatory security review; regression tests before authoritative return.

---

## J. CSRF failure surge

**Default severity:** MEDIUM / HIGH if all POSTs fail after release

### 1. Detection
Spike of `error=csrf` or 403 on POSTs; users cannot save.

### 2. Immediate containment
**Do not** disable CSRF. Check for cookie domain/`Secure`/`SameSite` misconfig or multi-worker secret skew.

### 3. Evidence to preserve
Rate of CSRF failures vs baseline; deploy SHA; cookie flag notes (not token values).

### 4. Safe diagnostic commands
Single manual POST with valid session; compare workers’ env presence for session/CSRF secrets.

### 5. Escalation
App operator; Incident lead if pilot blocked.

### 6. Rollback option
Previous package/env that issued CSRF correctly.

### 7. User communication
“Forms temporarily failing; retry after fix” — do not ask users to bypass CSRF.

### 8. Recovery validation
Create/update one record with CSRF OK; confirm surge down.

### 9. Post-incident review
CDN/proxy cookie stripping; secret rotation mid-flight.

---

## K. Media exposure

**Default severity:** CRITICAL if private media public; HIGH if signed URL leak; MEDIUM if 404 noise

### 1. Detection
Private asset reachable without auth; wrong-church media; storage URL in public logs/tickets.

### 2. Immediate containment
Remove public link / unpublish / soft-restrict via product controls; rotate storage credentials **if keys leaked**; routing `off` if tenant boundary involved. Preserve access logs showing fetches.

### 3. Evidence to preserve
Asset ids/keys (not binary); URLs **redacted** to path patterns; who could access; time window.

### 4. Safe diagnostic commands
Fetch suspected URL once from ops network to confirm; do not mass-download; do not paste signed URLs into chat.

### 5. Escalation
Security reviewer if private data exposed; App + DB/storage operator.

### 6. Rollback option
Revert media visibility flags; prior app if handler bug; credential rotation in provider panel (ticket owner).

### 7. User communication
Security-approved; notify affected org if private media exposed.

### 8. Recovery validation
Private asset returns 401/403/404 as designed; public only if intentionally public.

### 9. Post-incident review
ACL rules; logging of URLs; upload allowlist.

---

## L. Secret leakage

**Default severity:** CRITICAL

### 1. Detection
Password, `SESSION_SECRET`, DB URL, tokens, or cookies in git, chat, screenshots, logs, or tickets.

### 2. Immediate containment
**Rotate** every exposed secret immediately (session secret, DB passwords, storage keys, demo passwords per credentials plan). Invalidate sessions. Remove secret from the medium **after** recording that it was exposed (ticket note: “type X exposed in channel Y” — **not** the value). If in git history, follow org secret-scrub process (do not paste secret into issues).

### 3. Evidence to preserve
Where/when exposed; who had access; rotation completion times; **never** preserve the secret value in the incident doc.

### 4. Safe diagnostic commands
None that print secrets. Confirm app works after rotation with test login.

### 5. Escalation
Security reviewer + Incident lead; DB operator for DB URL/password.

### 6. Rollback option
N/A for the secret itself — rotation is the control; app rollback only if deploy caused leak.

### 7. User communication
If customer-impacting sessions dropped, say “security reset — please sign in again”; do not describe the secret.

### 8. Recovery validation
Old secret rejected; new secret works; search confirms value not still in open channels.

### 9. Post-incident review
How leak happened; add pre-commit / chat policy reminders.

---

## M. Migration failure

**Default severity:** HIGH / CRITICAL if wrong target or source mutated

### 1. Detection
Apply non-zero exit; `batch_rolled_back`; unexpected `written`; source counts changed; identity fail mid-run.

### 2. Immediate containment
**Stop** further apply/resume; do not start shadow/authoritative; do not run destructive cleanup SQL. Confirm source read-only counts.

### 3. Evidence to preserve
`batchId`; plan/dry-run/apply summaries; checkpoints; conflict reports; fingerprints (sanitized); **do not delete** artifact dir.

### 4. Safe diagnostic commands
Re-read summaries; `db:identity:check`; source count query templates from dry-run checklist (counts only).

### 5. Escalation
DB operator + Cutover lead; Rollback owner if customer-facing.

### 6. Rollback option
Per [`V4_TO_V5_ROLLBACK_REHEARSAL.md`](../migrations/V4_TO_V5_ROLLBACK_REHEARSAL.md): leave V5 artifact or approved PITR; never V5→V4 reverse-write.

### 7. User communication
If still on V4: usually none. If freeze window: maintenance extension message via Comms owner.

### 8. Recovery validation
Source unchanged; target disposition decided; no routing promotion until reconcilation signed.

### 9. Post-incident review
Partial-batch handling; approval gaps.

---

## N. Domain misconfiguration

**Default severity:** HIGH (pilot) / CRITICAL if points at wrong org under authoritative

### 1. Detection
`deployment_mismatch`; `hostname_taken`; DNS to wrong place; PA domain row incorrect.

### 2. Immediate containment
If wrong tenant risk → routing `off`. Freeze further DNS changes except controlled reverse.

### 3. Evidence to preserve
DNS inventory row; domain row keys; comparison log sample; TTL.

### 4. Safe diagnostic commands
Host-header curl; DNS lookup; PA read-only domain detail.

### 5. Escalation
DNS owner + App operator; treat as wrong-tenant if content mismatch.

### 6. Rollback option
DNS reverse; routing `off`; fix domain row before any authoritative return.

### 7. User communication
Hostname-specific downtime/misroute notice.

### 8. Recovery validation
Resolution keys match expected org/church; shadow sample clean.

### 9. Post-incident review
Change control for DNS + PA domain edits.

---

## O. Performance degradation

**Default severity:** MEDIUM / HIGH if pilot unusable

### 1. Detection
Slow pages; morgan timing spike; timeouts; upload slowness; no baseline → qualitative “unusable.”

### 2. Immediate containment
Disable nonessential load (keep jobs `0`); avoid heavy admin exports; do not disable security controls.

### 3. Evidence to preserve
Timing samples with `requestId`; path; UTC; concurrent deploy/migration activity.

### 4. Safe diagnostic commands
healthz; sample timed curls; DB identity/connectivity (not EXPLAIN with PII).

### 5. Escalation
App + DB operators; Incident lead if pilot blocked.

### 6. Rollback option
Prior app package if regression; scale/host provider actions only via ticket owners (no invented vendor calls).

### 7. User communication
“Degraded performance — investigating”; suggest retry.

### 8. Recovery validation
Key journeys acceptable to Incident lead; timings back near pre-incident samples.

### 9. Post-incident review
Capture baseline for monitoring doc; capacity notes.

---

## Incident timeline template

```text
Incident ID: INC-V5-<UTC>-____
Severity: [ ] CRITICAL  [ ] HIGH  [ ] MEDIUM  [ ] LOW
Type: [ ] A apex  [ ] B tenant host  [ ] C identity  [ ] D wrong tenant
      [ ] E cross-tenant  [ ] F auth  [ ] G session  [ ] H transfer
      [ ] I authz bypass  [ ] J CSRF  [ ] K media  [ ] L secret leak
      [ ] M migration  [ ] N domain  [ ] O performance
Routing mode at detect: ____________
PLATFORM_DEPLOYMENT_CODE: ____________
Git SHA / package: ____________

UTC detected: ____________  Detected by: ____________
UTC contained: ____________  Containment action: ____________
UTC customer impact start/end: ____________ / ____________

Evidence preserved (paths, not secrets):
- logs copy: ____________
- requestIds: ____________
- artifacts: ____________

Secrets rotated? [ ] yes (list TYPES only) [ ] n/a
Logs deleted before preserve? [ ] NO (required)

Chronology:
- ____:____Z  ____________
- ____:____Z  ____________
- ____:____Z  ____________

Comms sent: [ ] yes  channel/ticket: ____________
Rollback used: [ ] none  [ ] routing off  [ ] V4 restore  [ ] app package  [ ] other ____________

Recovery validation: [ ] pass  [ ] fail — notes ____________
Post-incident review scheduled: ____________
Incident lead sign-off: ____________  UTC: ____________
```

---

## Suitability for supervised launch

| Question | Answer |
|----------|--------|
| Is this runbook suitable for **supervised launch** (shadow / limited pilot with named roles)? | **YES** — playbooks, severity matrix, containment, and evidence rules are defined |
| Does it replace a 24/7 SOC or external pager product? | **NO** |
| Are external vendor/phone contacts listed? | **NO** (by design — fill from the change ticket) |
| Cross-tenant / secret handling adequate? | **YES** if roles are named and CRITICAL path (routing `off` + rotation) is followed |
| Code/infra changed by writing this file? | **NO** |

**Bottom line:** Suitable for supervised V5 launch **when** Incident lead, App operator, DB operator, Rollback owner, and Comms owner are named on the launch ticket and understand CRITICAL = contain first. Not sufficient alone for unattended production without a watch rota and filled contacts.
