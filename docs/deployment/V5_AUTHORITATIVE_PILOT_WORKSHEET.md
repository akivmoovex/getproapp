# V5 Authoritative Pilot Execution Worksheet

**Companions:** [`V5_AUTHORITATIVE_ROUTING_PREREQUISITES.md`](./V5_AUTHORITATIVE_ROUTING_PREREQUISITES.md) · [`V5_SHADOW_EVIDENCE_WORKSHEET.md`](./V5_SHADOW_EVIDENCE_WORKSHEET.md) · [`V5_DEMO_EXECUTION_WORKSHEET.md`](../testing/V5_DEMO_EXECUTION_WORKSHEET.md) · [`V5_INCIDENT_RESPONSE.md`](../operations/V5_INCIDENT_RESPONSE.md)  
**Scope:** Supervised **pilot** on the **approved demo hostname only**  
**Not in scope:** Estate-wide / production cutover, DNS estate flips, hosted migrate apply  
**Constraint:** Creating this file does **not** enable `authoritative` and does **not** authorize a mode flip  

**Secrets:** Never paste passwords, tokens, cookies, or `DATABASE_URL` values  

Mark: **Pass** · **Fail** · **Blocked** · **Skip**

---

## Run header

| Field | Value |
|-------|-------|
| Pilot pack ID | `auth-pilot-<YYYYMMDD>-____` |
| Operator | |
| Observer / QA | |
| Approver (mode flip) | |
| Rollback owner | |
| Flip timestamp (UTC) | |
| All-workers restart (UTC) | |
| Commit SHA / package | |
| Approved demo hostname only | `________________` (must match ticket; default candidate `diagnostic.blessboard.org`) |
| Apex host | `________________` |
| Org / church / branch keys | `diagnostic-church` / `diagnostic-church` / `hq` |
| Deployment code | `blessboard-org-v5` |
| DB identity | `blessboard-platform-v5` |

**Hard scope rule:** Do **not** add other tenant hostnames to this pilot without a new signed ticket.

---

## Preconditions (all required before flip)

| # | Precondition | Evidence ref | Pass? |
|---|--------------|--------------|-------|
| P1 | Successful **shadow** evidence pack filed + **GO** | [`V5_SHADOW_EVIDENCE_WORKSHEET.md`](./V5_SHADOW_EVIDENCE_WORKSHEET.md) ID: `________` | ☐ |
| P2 | Successful **demo E2E** readiness: personas + published Home/About (or signed empty waiver) + samples for journeys below | Demo remediation / [`V5_DEMO_EXECUTION_WORKSHEET.md`](../testing/V5_DEMO_EXECUTION_WORKSHEET.md) prep | ☐ |
| P3 | No **CRITICAL** release blockers for **AUTHORITATIVE PILOT** open (esp. B01–B05, B09) | [`V5_RELEASE_BLOCKERS.md`](../release/V5_RELEASE_BLOCKERS.md) review UTC ______ | ☐ |
| P4 | Rollback readiness: owner named; mode→`off` rehearsed; apex/demo baselines saved | Incident / rollback docs | ☐ |
| P5 | Approved **demo hostname only** on ticket | Hostname matches header | ☐ |
| P6 | Database identity verified | `db:identity:check` PASS (ops; no URL in sheet) | ☐ |
| P7 | Organization / church / branch relationships verified | Org→enrolment→church→HQ/`hq` primary→domain→`blessboard-org-v5` | ☐ |
| P8 | Signed approval to set `BLESSBOARD_TENANT_ROUTING_MODE=authoritative` **for this hostname window** | Ticket signature | ☐ |
| P9 | `GETPRO_DATABASE_URL` unset; jobs at approved state (usually `0`) | Panel note | ☐ |
| P10 | Monitoring / incident lead reachable for window | Named on ticket | ☐ |

**If any precondition Fail/Blocked → do not flip. Worksheet stops.**

---

## Flip confirmation (after supervised enable — fill only if flip occurred)

| Check | Expected | Observed | Evidence | Pass/Fail |
|-------|----------|----------|----------|-----------|
| Mode on all workers | `authoritative` | | Redacted panel note | |
| Not mixed with `shadow`/`off` | Uniform | | | |
| Apex still healthy | `/healthz` `/` `/login` **200** | | | |

---

## Pilot checks

### Tenant homepage

| Check | Expected | Observed | Evidence | Pass/Fail |
|-------|----------|----------|----------|-----------|
| Demo Host `GET /` | **200** **tenant** public shell (not apex marketing-as-tenant-miss) | | screenshot | |
| Church display name | Present; **no** UUIDs | | | |
| Admin links in public chrome | **Absent** | | | |
| Log event | `blessboard_tenant_route` (authoritative) with expected keys | | `requestId` | |

### Public navigation

| Check | Expected | Observed | Evidence | Pass/Fail |
|-------|----------|----------|----------|-----------|
| Enabled nav/footer links | **200** or intentional empty | | href→status | |
| Draft pages | Not public | | | |
| Dead enabled links | None | | | |

### Login transfer

| Check | Expected | Observed | Evidence | Pass/Fail |
|-------|----------|----------|----------|-----------|
| Tenant `/login` | Redirect Apex `/login?tr=…`; no tenant password form | | redirect chain | |
| Transfer → intended portal | Lands `/member` or `/hq` or `/branch-admin` | | | |
| Replay transfer | Fails closed | | | |
| Raw secrets in HTML | Absent (opaque `tr` only) | | | |

### Member access

| Check | Expected | Observed | Evidence | Pass/Fail |
|-------|----------|----------|----------|-----------|
| MEM → `/member*` | **200** or honest empty | | | |
| Staff URLs as MEM | Denied (403/redirect) | | | |

### Branch-admin access

| Check | Expected | Observed | Evidence | Pass/Fail |
|-------|----------|----------|----------|-----------|
| BA → `/branch-admin*` | **200**; branch-scoped | | | |
| HQ-only routes as BA | Denied | | | |

### HQ access

| Check | Expected | Observed | Evidence | Pass/Fail |
|-------|----------|----------|----------|-----------|
| HQ → `/hq*` | **200**; church-wide | | | |
| Fabricated KPIs | Absent | | | |

### Platform-admin access

| Check | Expected | Observed | Evidence | Pass/Fail |
|-------|----------|----------|----------|-----------|
| PA → Apex `/admin*` | **200** | | | |
| Secrets on deployment detail | Absent | | | |

### Wrong-role rejection

| Check | Expected | Observed | Evidence | Pass/Fail |
|-------|----------|----------|----------|-----------|
| MEM→`/hq` or `/branch-admin` | 403/controlled | | | |
| BA→`/admin` (apex PA) | Denied | | | |
| HQ→PA routes | Denied | | | |
| Other-role data in body | Never | | | |

### Inactive tenant rejection

| Check | Expected | Observed | Evidence | Pass/Fail |
|-------|----------|----------|----------|-----------|
| Inactive/suspended fixture (if safe) | Controlled unavailable; not 500; no CMS bypass | | | |
| Skip if no fixture | Skip + reason — do not break shared demo | | | |

### Unknown-host rejection

| Check | Expected | Observed | Evidence | Pass/Fail |
|-------|----------|----------|----------|-----------|
| Unknown Host `/` | Fail-closed / foundation per product policy — **not** another tenant’s CMS | | status + log reason | |
| Cross-tenant content | **Never** | | | |

### Cookie scope

| Check | Expected | Observed | Evidence | Pass/Fail |
|-------|----------|----------|----------|-----------|
| Session cookie Domain | Host-only (not `.blessboard.org`) | | DevTools flags only | |
| Cookie name | Matches env (e.g. `blessboard_org_v5_sid`) | | name only | |

### Logout

| Check | Expected | Observed | Evidence | Pass/Fail |
|-------|----------|----------|----------|-----------|
| Logout each persona | Session cleared | | | |
| Protected rehit | Login/transfer required | | | |
| Logout CSRF | Missing CSRF → 403; no state change | | | |

### Media access

| Check | Expected | Observed | Evidence | Pass/Fail |
|-------|----------|----------|----------|-----------|
| Staff picker/upload (if in scope) | Church-scoped; CSRF enforced | | | |
| Private media as ANON | Denied | | | |
| Storage keys in HTML/JSON | Absent | | | |

### Logs and request IDs

| Check | Expected | Observed | Evidence | Pass/Fail |
|-------|----------|----------|----------|-----------|
| Authoritative route log | Present for demo `/` | | | |
| Keys match org/church/`hq` | Pass | | | |
| `requestId` captured | 1–3 IDs listed below | | | |
| Secrets in logs | None | | | |
| 5xx / FATAL | None unexplained | | | |

```text
requestId-1: ________________
requestId-2: ________________
requestId-3: ________________
```

### Rollback decision

| Check | Expected | Observed | Evidence | Pass/Fail |
|-------|----------|----------|----------|-----------|
| Rollback still one step | Set `BLESSBOARD_TENANT_ROUTING_MODE=off` + restart all workers | | | |
| Decision recorded | Go remain / Hold / Rollback now | | section below | |

---

## Explicit stop conditions

**Stop the pilot and roll back to `off` immediately if any apply:**

1. Wrong tenant / cross-tenant content on the demo Host (or any Host).  
2. Apex `/healthz`, `/`, or `/login` **5xx** or auth outage.  
3. Session cookie set with parent `Domain=.blessboard.org`.  
4. Secrets in HTML, logs, or PA screens.  
5. `GETPRO_DATABASE_URL` discovered set.  
6. Authorization bypass (wrong-role sees other-role data).  
7. Workers disagree on mode (mixed authoritative/shadow/off).  
8. Unknown host serves another church’s CMS.  
9. Operator cannot complete rollback.  
10. Scope creep: pressure to flip additional production hostnames in this window.

**Do not** “fix forward” into estate-wide cutover from a failed pilot.

---

## Defect log (short)

| ID | Area | Severity | Summary (no secrets) | Action |
|----|------|----------|----------------------|--------|
| D1 | | SECURITY / CONFIG / DATA / PRODUCT | | |
| D2 | | | | |

---

## GO / NO-GO (pilot only)

| Gate | ☐ |
|------|---|
| All preconditions P1–P10 were Pass before flip | ☐ |
| Tenant homepage + transfer + MEM/BA/HQ/PA Pass | ☐ |
| Wrong-role + cookie + logout Pass | ☐ |
| No open SECURITY defects | ☐ |
| Rollback owner confirms ready | ☐ |

| Decision | ☐ |
|----------|---|
| **GO** — leave **pilot** on `authoritative` for approved demo host only; continue monitor | ☐ |
| **HOLD** — keep investigating; consider rollback | ☐ |
| **NO-GO** — rollback to `off` **now** | ☐ |

| Role | Name | UTC | Sign |
|------|------|-----|------|
| Operator | | | |
| QA / observer | | | |
| Approver | | | |
| Rollback owner | | | |

**Estate-wide production cutover:** ☐ **not** authorized by this worksheet  

Evidence pack path: `________________`

---

## Worksheet readiness

| Question | Answer |
|----------|--------|
| Is this worksheet ready for **supervised pilot use** (as the execution/evidence form)? | **YES** — when P1–P10 are actually Pass and a signed flip ticket exists |
| Is the authoritative pilot **ready to run today** by creating this file? | **NO** — prerequisites docs still show shadow evidence / demo E2E / blockers incomplete until filled |
| Does this document enable authoritative routing? | **NO** |
| Does this document include production-wide cutover steps? | **NO** |
