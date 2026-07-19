# BlessBoard V5 — Monitoring and alerting requirements

**Date:** 2026-07-19  
**Mode:** Requirements only — **do not** implement Datadog, Sentry, PagerDuty, CloudWatch, or other external services from this document  
**Purpose:** Define what must be observable before **shadow**, **authoritative pilot**, and **production cutover**  
**Companions:** [`V5_LOGGING_DATA_EXPOSURE_AUDIT.md`](../security/V5_LOGGING_DATA_EXPOSURE_AUDIT.md) · [`V5_SHADOW_MODE_RUNBOOK.md`](../deployment/V5_SHADOW_MODE_RUNBOOK.md) · [`V5_ENVIRONMENT_VARIABLE_REFERENCE.md`](../deployment/V5_ENVIRONMENT_VARIABLE_REFERENCE.md) · [`V5_HOSTED_MIGRATION_AND_CUTOVER.md`](../database/V5_HOSTED_MIGRATION_AND_CUTOVER.md)

---

## 1. Scope and principles

| Principle | Rule |
|-----------|------|
| Log-first | Prefer existing structured console / access logs (`requestId`, event names, keys — not UUIDs in routing diagnostics) |
| No invented SLOs | Where no production baseline exists, thresholds are **BASELINE REQUIRED** |
| Fail closed stays fail closed | Monitoring must not propose disabling identity gates, CSRF, throttling, or auth |
| Manual is valid | Hostinger log tail + ticket checklist counts until an external stack is approved |
| Secrets never alert payloads | See §4 redaction |

**Severity**

| Severity | Meaning |
|----------|---------|
| **CRITICAL** | Process down, wrong DB, customer-facing outage risk — page immediately |
| **HIGH** | Auth/routing integrity risk — investigate within the watch window |
| **MEDIUM** | Elevated errors / abuse signals — triage same day |
| **LOW** | Capacity / hygiene — track in backlog |
| **INFO** | Expected diagnostic (e.g. shadow proposals) — sample, do not page |

---

## 2. Redaction requirements (mandatory)

| Never include in monitors, tickets, or alert text | Allowed |
|---------------------------------------------------|---------|
| `DATABASE_URL`, passwords, `SESSION_SECRET` | Presence flags, host fingerprint |
| Raw session / transfer / CSRF tokens | Outcome codes, `requestId` |
| Cookies, `Authorization` headers | Status, method, path **without** query |
| Email, phone, member names, form answers | Hashed throttle references (if any), org/church/**branch keys** |
| SQL params, driver full messages | Pool `code=` only |
| Upload binary / storage signed URLs | `upload_failed` / HTTP status |

**Prohibit:** shipping raw morgan lines that still contain query strings with `tr` / `code` / `transfer` into long-lived SIEM without the app’s redaction path. Prefer `req_id=` + status + timing.

Audit metadata must continue to use allowlisted keys only (`auditEventService` sanitization).

---

## 3. Signal catalogue

Threshold principle column: use **BASELINE REQUIRED** when no estate baseline exists. Operators record a 24–72h quiet baseline before paging on rates.

| Signal | Severity | Log/event source | Threshold principle | Required action |
|--------|----------|------------------|---------------------|-----------------|
| Application startup failures | CRITICAL | Startup banners / process exit: `[blessboard] FATAL`, bootstrap `workerMissingRequiredEnv`, LiteSpeed worker crash loops | Any fatal identity/DB gate exit; crash loop **BASELINE REQUIRED** (e.g. >N exits / 5m after baseline) | Page on-call; do not enable/keep shadow or authoritative; fix env; confirm all workers healthy |
| Database identity failure | CRITICAL | `blessBoardOrgDbGate` / `assertBlessBoardDatabaseIdentityOrExit` fatal lines (`identity mismatch`, missing identity) | **Any** fatal in `testing`/`production` | Halt deploy; run `db:identity:check` against intended project; never “bypass” |
| Database connectivity | CRITICAL | Pool errors (`code=` only); healthz failures; startup “no PostgreSQL pool” | Sustained healthz ≠200 or pool errors — **BASELINE REQUIRED** for rate | Check `DATABASE_URL` presence (not value); provider status; keep routing `off` if cold start fails |
| Deployment identity mismatch | HIGH | `platform_host_comparison` / platform `resultType=deployment_mismatch`; shadow `deploymentComparisonResult=mismatch` | Any sustained mismatch on **known pilot** hosts; spike **BASELINE REQUIRED** | Verify `PLATFORM_DEPLOYMENT_CODE` vs DB deployment; stop authoritative promotion |
| Unknown hostnames | MEDIUM / INFO | Platform `unknown_domain` / `invalid_hostname`; shadow/authoritative reasons | Noise expected; alert on **step-change** vs baseline — **BASELINE REQUIRED** | Confirm not a cutover DNS miss; distinguish scanners vs pilot hosts |
| Tenant-resolution failures | HIGH | Catalogue / platform `lookup_error`, `missing_organization`, `missing_enrolment`, inactive_* ; `blessboard_tenant_route*` reasons | Any on pilot hostname during shadow/pilot; estate rate **BASELINE REQUIRED** | Fix catalogue (org/enrolment/domain); do not flip authoritative |
| Church/branch mismatch | HIGH | Catalogue vs platform key divergence in comparison logs; route reasons for church/branch inconsistency | Any on pilot keys; volume **BASELINE REQUIRED** | Reconcile church/HQ/primary branch; block authoritative until fixed |
| Login failures and throttling | MEDIUM | HTTP **401/403** on login paths; **429** throttle responses (limiter does **not** log email); access log status | Failure rate and 429 rate — **BASELINE REQUIRED**; spike after deploy = investigate | Confirm not credential spray; do **not** disable limiter; coordinate demo cool-down |
| Session creation failures | HIGH | Login/session flows returning errors; safe error handler `event` lines with session-related `code`; user-visible login failure without 429 | Any unexplained cluster — **BASELINE REQUIRED** | Check DB session store, `SESSION_SECRET` presence (≥32), cookie flags; correlate `requestId` |
| Authentication transfer failures | HIGH | Apex↔tenant transfer failures (user-facing); access logs with redacted `tr`/`code`; transfer service outcomes (no token logs) | Failures on pilot transfer paths — **BASELINE REQUIRED** | Verify cookie host rules, apex origin env, transfer one-time token path; do not log tokens while debugging |
| Authorization denials | MEDIUM / INFO | HTTP **403** on HQ/BA/PA/member routes; service `FORBIDDEN` reasons (not always logged) | Steady denials expected; alert on **surge** after role migrate — **BASELINE REQUIRED** | Spot-check role assignments; distinguish authz vs CSRF vs routing |
| CSRF failures | MEDIUM | Redirects/`error=csrf`; 403 on state-changing POSTs; CSRF audit patterns | Spike after release — **BASELINE REQUIRED** | Verify CSRF cookie/form pairing; do not disable CSRF |
| 4xx rate | MEDIUM | Morgan access logs (`status` 4xx) + `requestId` | Overall and path-class rates — **BASELINE REQUIRED** | Triage top paths; separate authz/CSRF/unknown-host from true bugs |
| 5xx rate | HIGH / CRITICAL | Morgan 5xx; `createV5ErrorHandler` structured `{ event, requestId, status, code }` | Any sustained 5xx on apex/pilot — page if above baseline; absolute floor **BASELINE REQUIRED** | Rollback candidate; capture `requestId`; keep jobs disabled until stable |
| Slow requests | LOW / MEDIUM | Morgan timing field | p95/p99 — **BASELINE REQUIRED** | Check DB, uploads, cold workers; do not tune by guessing |
| Upload failures | MEDIUM / HIGH | Media upload JSON `upload_failed`; storage errors status-only | Failure rate — **BASELINE REQUIRED**; HIGH if all uploads fail post-deploy | Verify storage env presence, size allowlist, CSRF; no API body in tickets |
| Background jobs disabled/enabled state | HIGH (config drift) | Startup runtime diagnostics; `BLESSBOARD_JOBS_ENABLED`; job preflight skip reason `BLESSBOARD_JOBS_ENABLED=false` | **Config watch:** expected `0`/`false` until cutover explicitly enables; alert if **enabled unexpectedly** in shadow/pilot | Confirm panel env; disable if unintentional; never enable for monitoring convenience |
| Migration events | HIGH / INFO | Operator CLI console-safe summaries (`plan`/`dry-run`/`apply`); artifact files — **not** continuous app metrics | INFO for planned dry-run; HIGH if apply runs outside change ticket / unexpected `written` | Follow migration checklists; preserve artifacts; no secrets in chat |
| Domain-resolution diagnostics | INFO / HIGH | `platform_host_comparison`, platform host context, shadow `blessboard_tenant_route_shadow` (hostname, keys, `proposedReason`, `deploymentComparisonResult`) | INFO sampling in shadow; HIGH when pilot host proposes fail or mismatch | Use keys only; compare to DNS inventory; gate authoritative on clean pilot sample |

---

## 4. Minimum monitoring by phase

### 4.1 Before / during shadow mode

| Minimum | How (manual OK) |
|---------|-----------------|
| Process up / `/healthz` **200** | Periodic curl or panel health; record UTC |
| Startup FATAL absent after restart | Tail Hostinger / process logs once post-restart |
| `BLESSBOARD_TENANT_ROUTING_MODE=shadow` | Panel env screenshot (value only) |
| `BLESSBOARD_JOBS_ENABLED=0` | Panel confirm |
| Shadow events on pilot Host | Capture sample `blessboard_tenant_route_shadow` JSON (keys, reasons) |
| No authoritative `blessboard_tenant_route` as primary signal | Log sample review |
| Apex login still works | Manual smoke |
| Identity still valid | `db:identity:check` before flip (ops workstation) |

**Paging:** CRITICAL startup/identity/connectivity only. Shadow proposal volume is **INFO** unless pilot host shows unexpected fail reasons.

### 4.2 Authoritative pilot

| Minimum | How |
|---------|-----|
| All shadow minima, plus mode=`authoritative` | Env confirm |
| Pilot hostname serves expected tenant outcome | Curl/browser + log `blessboard_tenant_route` |
| 5xx / healthz watch for pilot + apex | Access logs; **BASELINE REQUIRED** after first quiet hour |
| Login + transfer smoke | Manual; note 429 cool-downs |
| Authz smoke (HQ/BA) | Manual; 403 surge → HIGH triage |
| CSRF on one POST | Manual |
| Upload one allowlisted file (if media in pilot) | Manual |
| Jobs remain at approved state (usually still off) | Env confirm |
| Rollback owner reachable | Named human for routing → `off` |

**Paging:** CRITICAL on identity/startup; HIGH on sustained 5xx or pilot resolution failure; do not page on every 403.

### 4.3 Production cutover

| Minimum | How |
|---------|-----|
| All pilot minima across inventory hosts | DNS inventory checklist |
| 4xx/5xx and slow-request baselines established | At least one supervised window of metrics or sampled logs — until then thresholds stay **BASELINE REQUIRED** |
| Migration apply window monitored | Operator presence; apply summary `written` vs plan; source counts unchanged |
| Post-authoritative rollback clock | Document enable UTC; 4h decision window per cutover runbook |
| Comms + status channel | On-call knows CRITICAL signals above |
| External APM optional | **Not required** by this doc; if added later, must obey §2 redaction |

---

## 5. Correlation fields (required in tickets)

When escalating any signal, include only:

- UTC timestamp  
- `requestId` (if HTTP)  
- `event` name (if structured)  
- hostname / orgKey / churchKey / branchKey (not UUIDs unless already in secure ticket store)  
- HTTP status / outcome / reason codes  
- Routing mode and `PLATFORM_DEPLOYMENT_CODE` (values, not secrets)  
- Git SHA / release id  

---

## 6. Readiness gaps

| Gap | Impact | Phase blocked? |
|-----|--------|----------------|
| No centralized log aggregation / alerting product wired | Relies on manual Hostinger tail + human watch | Shadow: **acceptable** with runbook; Pilot/cutover: **HIGH** operational risk until watch rota named |
| No quantitative 4xx/5xx/latency baselines | All rate alerts = **BASELINE REQUIRED** | Do not invent pages; collect quiet-window samples first |
| Login failures not console-logged by design | Must infer from access status + user reports | Acceptable; do not add PII logs “for monitoring” |
| Authorization denials often HTTP-only | Hard to distinguish surge without access-log sampling | Pilot needs explicit log sampling plan |
| Migration events are CLI/artifact, not app stream | Easy to miss unauthorized apply | Require change-ticket gate (process control) |
| Jobs “enabled” drift not auto-alerted | Misconfig risk | Panel checklist mandatory each flip |
| Multi-worker log fragmentation (LiteSpeed) | Incomplete view if only one worker tailed | Restart/verify **all** workers; document in watch runbook |
| External uptime check not specified | healthz may be local-only | Recommend (later) external healthz probe — out of scope to implement here |

**Verdict**

| Question | Answer |
|----------|--------|
| Requirements defined for shadow / pilot / cutover? | **YES** |
| External monitoring implemented? | **NO** (by design) |
| Ready for shadow with **manual** monitoring? | **YES**, if §4.1 minima + named watcher |
| Ready for authoritative pilot without baselines? | **CONDITIONAL** — proceed only with human watch + CRITICAL/HIGH qualitative triggers; rate pages wait for baseline |
| Ready for production cutover monitoring? | **NOT FULLY** until baselines recorded and watch/escalation rota exist (gap table) |

---

## 7. Explicit non-goals

- Installing or configuring third-party APM/alerting  
- Changing application log fields to include email/IP plaintext  
- Disabling CSRF, throttling, or identity checks to “reduce noise”  
- Inventing numeric burn rates without a measured baseline  

---

## Conclusion

This document is the monitoring **contract** for V5 routing promotion. Shadow can proceed with manual §4.1 checks. Authoritative pilot and cutover require named watchers, redaction discipline, and eventual baselines before automated rate paging. External services remain optional and unimplemented here.
