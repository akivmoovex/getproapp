# BlessBoard V5 — Post-cutover validation plan

**Date:** 2026-07-19  
**Mode:** Validation planning only — **do not deploy**, flip routing, enable jobs, or mutate production from this file  
**Purpose:** Structured checks after authoritative enable / estate cutover across four time windows  
**Companions:** [`V5_PRODUCTION_CUTOVER_MASTER_RUNBOOK.md`](./V5_PRODUCTION_CUTOVER_MASTER_RUNBOOK.md) · [`V5_MONITORING_REQUIREMENTS.md`](../operations/V5_MONITORING_REQUIREMENTS.md) · [`V5_INCIDENT_RESPONSE.md`](../operations/V5_INCIDENT_RESPONSE.md) · [`V4_TO_V5_RECONCILIATION_TEMPLATE.md`](../migrations/V4_TO_V5_RECONCILIATION_TEMPLATE.md) · [`V5_DEMO_E2E_SMOKE_TEST.md`](../testing/V5_DEMO_E2E_SMOKE_TEST.md) / [`V5_DEMO_EXECUTION_WORKSHEET.md`](../testing/V5_DEMO_EXECUTION_WORKSHEET.md)

---

## Standing rules

| Rule | Detail |
|------|--------|
| No deploy from this doc | Evidence and escalation only |
| No invented SLOs | Where no quiet-window baseline exists, mark **BASELINE REQUIRED** — do not page on guessed percentages |
| Secrets | Never paste `DATABASE_URL`, passwords, `SESSION_SECRET`, raw tokens, cookies, or PII into tickets |
| Cross-tenant | Always **CRITICAL** until disproven ([incident response](../operations/V5_INCIDENT_RESPONSE.md)) |
| Fail closed | Do not disable identity, CSRF, throttling, or auth to “pass” validation |
| `GETPRO_DATABASE_URL` | Must remain unset on V5 |
| Jobs / API | Validate **configured** state; do not enable for convenience |

**T0 definition:** UTC timestamp when `BLESSBOARD_TENANT_ROUTING_MODE=authoritative` became live for the **cutover scope** (pilot hosts or estate) **and** write maintenance was intentionally off (or remaining on with signed exception). Record T0 on the change ticket.

**Rollback clock:** Cutover docs use a **≤4h** decision window after authoritative enable for major routing/DB rollback ([monitoring §4.3](../operations/V5_MONITORING_REQUIREMENTS.md)). Stages after 4h still require investigation/rollback when CRITICAL criteria below are met.

---

## Role fill-in (per cutover)

| Role | Name | ☐ |
|------|------|---|
| Validation lead | `________________` | ☐ |
| App / Hostinger operator | `________________` | ☐ |
| DB operator | `________________` | ☐ |
| QA | `________________` | ☐ |
| Customer support observer | `________________` | ☐ |
| Rollback owner | `________________` | ☐ |
| Leadership (stabilization sign-off) | `________________` | ☐ |

---

## Threshold language (mandatory)

| Class | Meaning | Numeric rates |
|-------|---------|---------------|
| **Investigate** | Open ticket; sample logs; do **not** auto-rollback | Rate signals: **BASELINE REQUIRED** until quiet baseline recorded |
| **Rollback** | Execute containment/rollback per incident + cutover Stage 22 | Prefer **qualitative / absolute** criteria below — not invented % |

### Absolute / qualitative triggers (allowed without baseline)

| Condition | Class | Action |
|-----------|-------|--------|
| `/healthz` ≠ 200 sustained on apex or in-scope tenant inventory | **Rollback** (CRITICAL) | Page; routing demote / package restore per incident |
| Database identity FATAL / mismatch | **Rollback** (CRITICAL) | Halt; `db:identity:check`; never bypass |
| Wrong tenant HTML or data for a known hostname under authoritative | **Rollback** (CRITICAL) | Contain; treat as cross-tenant until scoped |
| Confirmed cross-tenant read/write | **Rollback** (CRITICAL) | Incident playbook E; mode → `off`/`shadow` as directed |
| Secret leak in logs/tickets | **Rollback** + rotate (CRITICAL) | Rotate exposed secrets; preserve logs |
| Login / transfer / session **mass failure** on pilot/estate (qualitative: “unusable” / majority of smoke personas fail) | **Rollback** (HIGH→CRITICAL) | Auth outage playbook |
| Parent-domain session cookie (`Domain=.blessboard.org`) observed | **Rollback** (CRITICAL) | Session containment; rotate if needed |
| Sustained process crash loop post-restart | **Rollback** (CRITICAL) | Redeploy last known-good; keep routing from promoting |
| Unexpected `BLESSBOARD_JOBS_ENABLED=1` while policy requires off | **Investigate** → disable immediately | Config drift; not rate-based |
| API/webhooks delivering when product says not shipped / not enabled | **Investigate** → kill | Confirm entitlement/kill-switch |

### Rate / latency signals (no baseline → do not invent)

| Signal | Investigate when | Rollback when |
|--------|------------------|---------------|
| 4xx rate | Step-change vs recorded baseline — **BASELINE REQUIRED** | Only if coupled to qualitative outage (auth mass fail, wrong-tenant) |
| 5xx rate | Any new cluster of 5xx on apex/pilot after T0 — sample; absolute page floor **BASELINE REQUIRED** | Sustained customer-facing 5xx with failed smoke + Rollback owner judgment (cutover ≤4h clock) |
| Slow requests (p95/p99) | Qualitative “unusable” or step-change vs baseline — **BASELINE REQUIRED** | Rarely alone; combine with 5xx/outage |
| Unknown-host errors | Step-change vs baseline or known inventory host failing as unknown — **BASELINE REQUIRED** for scanner noise | Known production hostname resolves unknown/wrong → **Rollback** candidate |
| Login failure / 429 rate | Spike vs baseline — **BASELINE REQUIRED**; distinguish throttle cool-down | Mass failure without 429 explanation → **Rollback** |
| CSRF / authz 403 surge | Spike after role migrate — **BASELINE REQUIRED** | Only with confirmed broken CSRF pairing or wrong-tenant authz |

**Baseline capture:** During first quiet hour (or pre-cutover shadow watch), record sampled counts per signal in the ticket. Until then, all rate cells remain **BASELINE REQUIRED**.

---

## Check catalogue

Each check: what to do, windows, evidence, owner, investigate / rollback.

Legend for windows: **15m** · **1h** · **Day** (first business day) · **Week**

| ID | Check | 15m | 1h | Day | Week | Owner | Evidence | Investigate | Rollback |
|----|-------|-----|----|-----|------|-------|----------|-------------|----------|
| C01 | Apex availability | ● | ● | ● | ○ | App op + QA | `/healthz` 200; `/` `/login` 200; UTC stamps | Intermittent ≠200 | Sustained apex down / healthz fail |
| C02 | Tenant host resolution | ● | ● | ● | ○ | App op + QA | Curl/browser Host inventory; route log keys (no UUIDs in chat) | Single host misconfig | Wrong tenant / known host → unknown |
| C03 | Login success | ● | ● | ● | ○ | QA | Smoke personas succeed; host-only cookie | Elevated 401 with valid fixtures | Mass login failure |
| C04 | Login failure (invalid) | ● | ○ | ○ | ○ | QA | Invalid creds controlled deny; no session | Unexpected 5xx on invalid | N/A alone |
| C05 | Transfer-token success | ● | ● | ● | ○ | QA | Apex→tenant land; replay fails; no token in logs | Intermittent transfer fail | Mass transfer failure |
| C06 | Session creation | ● | ● | ○ | ○ | QA | Session cookie set; store healthy | Isolated session errors | Cluster session create failures |
| C07 | Logout | ● | ○ | ○ | ○ | QA | Session cleared; re-auth required | Sticky session after logout | N/A alone unless security exposure |
| C08 | Registration | ○ | ● | ● | ○ | QA | Pending→approve path or honest messaging | Form 5xx / silent drop | Mass registration outage (if in scope) |
| C09 | Member access | ● | ● | ● | ○ | QA | Member portal routes for fixture | Unexpected 403 surge — **BASELINE REQUIRED** | Cross-org member data |
| C10 | Branch admin | ● | ● | ● | ○ | QA | BA smoke paths; branch scope | Wrong-branch bleed suspicion | Confirmed cross-branch/org |
| C11 | HQ | ● | ● | ● | ○ | QA | HQ smoke; org scope | Authz surge — **BASELINE REQUIRED** | Cross-org HQ data |
| C12 | Platform admin | ● | ● | ● | ○ | QA | PA smoke on apex; no tenant data leak | Elevated PA 5xx | PA sees wrong org secrets/data |
| C13 | Package entitlements | ○ | ● | ● | ● | QA + Product | Plan display + feature gates match subscription | Soft-limit confusion | Active plan fail-closed for all orgs (catalogue break) |
| C14 | Branch limits | ○ | ● | ● | ● | QA + Product | Foundation max-branch enforce; Growth unlimited behavior | Soft limit UX bugs | Hard incorrect unlock of paid features estate-wide |
| C15 | Public content | ● | ● | ● | ○ | QA | Home/About/events published as expected | Empty vs draft leak | Draft/private content public |
| C16 | Forms and requests | ○ | ● | ● | ○ | QA | Submit + staff view; CSRF OK | Isolated CSRF/5xx | Mass form loss / cross-tenant submissions |
| C17 | Attendance and giving | ○ | ● | ● | ○ | QA | Read/list; info-only giving (no fake checkout) | Module 5xx | Cross-tenant attendance/giving |
| C18 | Media | ○ | ● | ● | ○ | QA + Ops | Fetch allowlisted assets; upload per kill-switch policy | 404 wave if blobs deferred (check waiver) | Private media public; upload on when policy off |
| C19 | Custom domains | ○ | ● | ● | ● | App op + QA | Entitled orgs resolve; Foundation fail-closed | DNS/SSL ops issues | Untitled custom domain serves wrong tenant |
| C20 | Jobs | ● | ● | ● | ● | App op | Env `BLESSBOARD_JOBS_ENABLED` matches policy (usually `0`) | Unexpected enable | Leave enabled against policy after notice = contain (disable) |
| C21 | API / webhooks | ● | ● | ● | ● | App op | If **not shipped/enabled:** confirm no live delivery. If enabled under signed change: delivery success/fail + auth | Drift vs entitlement | Unauthorized webhook fan-out / secret leak |
| C22 | 4xx rates | ○ | ● | ● | ● | App op | Sampled access-log counts | Step-change — **BASELINE REQUIRED** | Only with qualitative outage |
| C23 | 5xx rates | ● | ● | ● | ● | App op | Sampled 5xx + `requestId` | Any new cluster; floor **BASELINE REQUIRED** | Sustained + failed smoke + ≤4h judgment |
| C24 | Slow requests | ○ | ● | ● | ● | App op | Morgan timing sample | Unusable / step-change — **BASELINE REQUIRED** | Combined with outage only |
| C25 | Unknown-host errors | ● | ● | ● | ● | App op | Sample `unknown_domain` / invalid hostname | Scanner noise step-change — **BASELINE REQUIRED** | Inventory host unknown/wrong |
| C26 | Cross-tenant incidents | ● | ● | ● | ● | Validation lead + Security | Zero confirmed; support queue scan | Suspected → escalate CRITICAL | Confirmed → immediate rollback/contain |
| C27 | Data reconciliation drift | ○ | ● | ● | ● | DB op | Re-run count/sample queries vs Stage 12 baseline | Unexplained delta — **BASELINE REQUIRED** for churn rates | Sudden mass loss/duplication / identity break |

● = required in window · ○ = sample / as-needed

---

## Window plans

### A. First 15 minutes (T0 → T0+15m)

**Goal:** Prove the estate/pilot is alive and not serving the wrong tenant.

| Step | Checks | Owner | Pass criteria |
|------|--------|-------|---------------|
| A1 | C01 healthz + apex home/login | App op | 200s recorded |
| A2 | C02 inventory Hosts (pilot or priority list) | App op + QA | Expected tenant/apex outcome |
| A3 | C03–C07 one happy-path auth chain (login → transfer → session → logout) | QA | PASS |
| A4 | C09–C12 one persona each (member / BA / HQ / PA) smoke landing | QA | PASS or signed skip if persona missing |
| A5 | C15 spot public home | QA | Expected content or honest empty |
| A6 | C20 / C21 jobs + API state | App op | Matches signed policy |
| A7 | C23 / C25 / C26 log skim | App op | No CRITICAL qualitative hits |
| A8 | Record baseline seed counts for C22–C24 if quiet | App op | Ticket note or **BASELINE REQUIRED** still marked |

**Stop / rollback:** Any absolute rollback row in threshold table. Prefer routing demote before DB restore unless data corruption suspected.

**Evidence pack (15m):** UTC T0; healthz snippets; Host checklist; auth smoke row; env job/API flags; log sample `requestId`s (no secrets).

---

### B. First hour (T0 → T0+60m)

**Goal:** Broaden functional coverage; start rate sampling; first integrity pulse.

| Step | Checks | Owner | Pass criteria |
|------|--------|-------|---------------|
| B1 | Repeat A1–A2 on full in-scope inventory | App op | No new wrong-tenant |
| B2 | C08 registration (if in scope) | QA | Controlled success |
| B3 | C13–C14 entitlements + branch limit spot | QA + Product | Matches plan |
| B4 | C16–C18 forms/requests, attendance/giving, media | QA | Module smoke PASS / waiver |
| B5 | C19 custom domain sample (entitled + non-entitled) | App op + QA | Fail-closed where required |
| B6 | C22–C25 first rate/latency sample sheet | App op | Numbers recorded **or** explicitly **BASELINE REQUIRED** |
| B7 | C27 integrity query set #1 vs cutover reconcile | DB op | No BLOCKING drift |
| B8 | Support queue scan (see §Customer-support) | Support | No CRITICAL themes |

**Rollback clock:** By T0+4h, Leadership/Rollback owner must decide continue vs demote if HIGH/CRITICAL unresolved ([monitoring §4.3](../operations/V5_MONITORING_REQUIREMENTS.md)).

**Evidence pack (1h):** Expanded smoke worksheet; entitlement notes; first integrity query output (counts only); support themes; baseline sheet started.

---

### C. First business day

**Goal:** Real-user and ops load; drift and entitlement confidence.

| Step | Checks | Owner | Pass criteria |
|------|--------|-------|---------------|
| C-day-1 | C01–C02 open/close of business probes | App op | Stable availability |
| C-day-2 | C03–C12 role matrix sample (not only happy path) | QA | Authz holds |
| C-day-3 | C13–C14 package edge cases (Foundation at limit if fixture exists) | Product + QA | Soft/hard behavior as designed |
| C-day-4 | C15–C18 staff workflows with real tickets (redacted) | QA + Support | No systemic module failure |
| C-day-5 | C19 DNS/custom-domain tickets | App op | No wrong-tenant |
| C-day-6 | C20–C21 confirm jobs/API still policy-aligned after any panel edits | App op | No silent enable |
| C-day-7 | C22–C25 end-of-day rates vs morning baseline | App op | Investigate step-changes — **BASELINE REQUIRED** if morning missing |
| C-day-8 | C27 integrity query set #2 | DB op | Explain or waive deltas |
| C-day-9 | Support observation digest | Support | Themes filed; CRITICAL escalated |

**Evidence pack (day):** Daily probe log; support digest; integrity #2; rate sheet with baseline reference.

---

### D. First week

**Goal:** Stabilization — residual risk accepted or fixed; sign-off ready.

| Step | Checks | Owner | Pass criteria |
|------|--------|-------|---------------|
| D1 | Spot C01–C02 mid-week + end-week | App op | No regression |
| D2 | C13–C14 / C19 weekly entitlement & domain review | Product + Ops | No estate-wide catalogue break |
| D3 | C20–C21 weekly config attestation | App op | Policy match |
| D4 | C22–C25 weekly trend vs baseline | App op | Investigations closed or accepted |
| D5 | C26 zero open cross-tenant incidents | Validation lead | Confirmed |
| D6 | C27 integrity query set #3 (week) | DB op | Drift understood; no silent mass loss |
| D7 | Customer-support week summary | Support | Themes + severity |
| D8 | Stabilization sign-off (§Final) | Leadership + leads | Signed |

**Evidence pack (week):** Trend notes; integrity #3; incident list (none CRITICAL open); sign-off table.

---

## Data integrity queries

**Rules:** Run only against the **intended V5** project with identity check first. Record **counts and keys**, never emails/PII/URLs. Do not invent expected totals — compare to Stage 12 reconciliation artifacts / prior query set.

**Preflight (every set):**

```bash
# Placeholders only — secrets from secret store, not chat
export DATABASE_URL='<V5_TARGET_DATABASE_URL>'
export DATABASE_IDENTITY_EXPECTED='<EXPECTED>'
npm run db:identity:check
```

**Query set (adapt schema names to foundation; operators paste console-safe counts into ticket):**

| # | Intent | Example check (illustrative SQL shape) | Compare to |
|---|--------|----------------------------------------|------------|
| Q1 | Orgs / churches / branches present | `COUNT(*)` org, church, branch | Reconcile baseline |
| Q2 | Domains bound | `COUNT(*)` domains; sample hostname→orgKey | Reconcile + DNS inventory |
| Q3 | Users / role grants | Counts by role type (no emails) | Reconcile / demo fixtures |
| Q4 | Memberships | Active membership count | Reconcile |
| Q5 | Subscriptions / plan_key | Counts by `plan_key` + status | Plan-key inventory |
| Q6 | Negative: no legacy session shape | Confirm absence of `public.session` / `public.tenants` (information_schema) | Must remain absent |
| Q7 | Content published | Counts `public_pages` / announcements / events (as deployed) | Prior set |
| Q8 | Ops modules | Forms, requests, attendance, giving method counts | Prior set |
| Q9 | Media metadata | Media asset counts; note blob waiver if binaries deferred | Prior set + B08 waiver |
| Q10 | Quarantine / skip stability | Counts of known quarantine tables/flags if present | Must not silently shrink via destructive cleanup |

**Drift classes**

| Finding | Investigate | Rollback |
|---------|-------------|----------|
| Count delta within signed waiver / expected post-cutover writes | Document | No |
| Unexplained loss of orgs/domains/members | **Investigate** immediately; treat as HIGH | Mass loss / identity break → **Rollback** (restore) |
| Duplicate orgKey / hostname collision | HIGH investigate | If serving wrong tenant → **Rollback** |
| `public.session` / `public.tenants` appeared | CRITICAL | **Rollback** / incident — forbidden shape |
| Source V4 counts changed during migrate window (if still monitoring source) | HIGH | Stop further migrate; incident |

Fill deltas on a copy of [`V4_TO_V5_RECONCILIATION_TEMPLATE.md`](../migrations/V4_TO_V5_RECONCILIATION_TEMPLATE.md) “post-cutover pulse” section in the ticket — **do not invent numbers**.

---

## Customer-support observations

Support does **not** need DB access. Capture themes only (redact PII).

| Window | Owner | What to watch | Escalate when |
|--------|-------|---------------|---------------|
| 15m | Support on standby | War-room pings | Any “wrong church” / “see other church’s data” |
| 1h | Support | Login/transfer complaints; “site down” | Qualitative mass outage → Validation lead |
| Day | Support | Ticket categories: login, content missing, permissions, media 404, custom domain | Cross-tenant language → CRITICAL; media 404 → check blob waiver before panic |
| Week | Support | Trend vs day-1; training vs defect | Repeat CRITICAL themes; entitlement “paid feature missing” estate-wide |

**Observation log (ticket):**

| UTC | Channel | Theme (no PII) | Count | Severity guess | Linked check ID | ☐ |
|-----|---------|----------------|-------|----------------|-----------------|---|
| | | | | | | ☐ |

---

## Evidence index (per cutover)

| Artifact | Location (ticket path) | Owner | ☐ |
|----------|------------------------|-------|---|
| T0 UTC + scope (pilot/estate) | `________________` | Validation lead | ☐ |
| 15m pack | `________________` | App op / QA | ☐ |
| 1h pack | `________________` | QA / DB op | ☐ |
| Business-day digest | `________________` | Support / App op | ☐ |
| Week pack + trends | `________________` | Validation lead | ☐ |
| Baseline rate sheet | `________________` or **BASELINE REQUIRED** | App op | ☐ |
| Integrity Q1–Q10 sets (#1–#3) | `________________` | DB op | ☐ |
| Incident list (if any) | `________________` | Incident lead | ☐ |

---

## Final stabilization sign-off

Complete only after **first week** window (or Leadership-accepted shorter pilot scope with written residual risk).

| Criterion | Status | Notes |
|-----------|--------|-------|
| No open CRITICAL incidents (esp. cross-tenant / identity / wrong tenant) | ☐ PASS · ☐ FAIL | |
| Apex + in-scope tenant resolution stable | ☐ PASS · ☐ FAIL | |
| Auth chain (login / transfer / session / logout) stable | ☐ PASS · ☐ FAIL | |
| Role scopes (member / BA / HQ / PA) spot-checked | ☐ PASS · ☐ FAIL | |
| Entitlements + branch limits behave per package | ☐ PASS · ☐ FAIL · ☐ WAIVED | |
| Jobs / API/webhooks match signed policy | ☐ PASS · ☐ FAIL | |
| Rate/latency baselines recorded **or** explicitly accepted as **BASELINE REQUIRED** with manual watch | ☐ PASS · ☐ ACCEPTED | |
| Integrity pulses #1–#3 explained | ☐ PASS · ☐ FAIL | |
| Support week digest reviewed | ☐ PASS · ☐ FAIL | |
| V4 fallback decision still valid (cutover Stage 22) | ☐ PASS · ☐ UPDATED | |

### Signatures

| Role | Name | Date (UTC) | Scope | ☐ |
|------|------|------------|-------|---|
| Leadership | | | | ☐ |
| Validation lead | | | | ☐ |
| Rollback owner | | | | ☐ |
| QA | | | | ☐ |
| DB operator | | | | ☐ |
| Customer support observer | | | | ☐ |

**Stabilization verdict:** ☐ **STABLE** · ☐ **STABLE WITH ACCEPTED RESIDUALS** · ☐ **NOT STABLE** (continue watch / rollback)

---

## Explicit non-goals

- Deploying, enabling authoritative, or turning on jobs/API from this document  
- Inventing numeric burn rates, error budgets, or SLO percentages without a measured baseline  
- Disabling security controls to reduce ticket noise  
- Claiming media blob parity if Stage 12 / B08 deferred blobs without waiver  

---

## Document control

| Field | Value |
|-------|--------|
| Created | 2026-07-19 |
| Depends on | Cutover master Stages 15–24 evidence; monitoring + incident runbooks |
| Next update when | First real post-cutover baseline sheet attached to a change ticket |
