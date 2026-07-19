# V5 Shadow Mode Evidence Worksheet

**Companions:** [`V5_SHADOW_MODE_RUNBOOK.md`](./V5_SHADOW_MODE_RUNBOOK.md) · [`V5_SHADOW_ROUTING_READINESS.md`](./V5_SHADOW_ROUTING_READINESS.md)  
**Mode:** Manual evidence capture after a supervised shadow enable — **creating this file does not enable shadow**  
**Secrets:** Do not paste `DATABASE_URL`, passwords, tokens, cookies, or full connection strings  

Mark: **Pass** · **Fail** · **Blocked** · **N/A**

---

## Run header

| Field | Value |
|-------|-------|
| Evidence pack ID | `shadow-<YYYYMMDD>-____` |
| Operator | |
| Observer | |
| Deployment / flip timestamp (UTC) | |
| All-workers restart timestamp (UTC) | |
| Commit SHA / package | |
| Apex host (label only) | e.g. apex production host — fill from ticket |
| Demo tenant host (label only) | e.g. demo canonical host — fill from ticket |
| Deployment code | `blessboard-org-v5` |
| DB identity expected | `blessboard-platform-v5` |

### Expected catalogue refs (fill IDs from PA / readiness — keys required)

| Ref | Expected key | Expected UUID (from secure ticket / PA — optional) |
|-----|--------------|-----------------------------------------------------|
| Organization | `diagnostic-church` | `________________` |
| Church | `diagnostic-church` | `________________` |
| HQ branch | `hq` | `________________` |
| Primary branch | `hq` (same as HQ if primary) | `________________` |

Shadow logs use **keys**, not UUIDs. UUIDs are for operator cross-check only — do not put them in public chat.

---

## Environment confirmation

| Check | Expected | Observed | Evidence | Pass/Fail |
|-------|----------|----------|----------|-----------|
| `BLESSBOARD_TENANT_ROUTING_MODE` | `shadow` (panel; all workers) | | Redacted env screenshot / note | |
| `PLATFORM_DEPLOYMENT_CODE` | `blessboard-org-v5` | | | |
| `BLESSBOARD_JOBS_ENABLED` | `0` / false | | | |
| `GETPRO_DATABASE_URL` | **unset** | | | |
| `DATABASE_IDENTITY_EXPECTED` | `blessboard-platform-v5` | | Ops confirm (no URL) | |
| Cookie Domain | Host-only (not `.blessboard.org`) | | DevTools cookie flags | |
| Mode ≠ authoritative | No accidental `authoritative` | | | |

---

## Routing-mode confirmation

| Check | Expected | Observed | Evidence | Pass/Fail |
|-------|----------|----------|----------|-----------|
| Pre-flip mode | `off` or unset→off | | | |
| Post-flip mode | `shadow` | | | |
| Workers agree | No mixed off/shadow | | Restart note | |
| Authoritative log absent as primary | No primary `blessboard_tenant_route` for demo `/` | | Log sample | |

---

## Apex hostname result

| Check | Expected | Observed | Evidence | Pass/Fail |
|-------|----------|----------|----------|-----------|
| `GET /healthz` | **200** V5 ok | | status + UTC | |
| `GET /` | **200** marketing/foundation | | | |
| `GET /login` | **200** | | | |
| No 5xx / stack | Pass | | | |

---

## Demo tenant hostname result

| Check | Expected | Observed | Evidence | Pass/Fail |
|-------|----------|----------|----------|-----------|
| `Host: <demo>` `GET /` | **200** | | status + UTC | |
| HTML shell | Foundation / apex chrome — **not** tenant CMS | | screenshot / HTML snippet (no secrets) | |
| Church CMS live site | **Absent** | | | |
| `Host: <demo>` `GET /healthz` | **200**; no new shadow spam required | | | |

---

## Catalogue match (from shadow log keys)

| Check | Expected | Observed | Evidence | Pass/Fail |
|-------|----------|----------|----------|-----------|
| Event name | `blessboard_tenant_route_shadow` | | log line / `requestId` | |
| `hostname` | demo tenant host | | | |
| `organizationKey` | `diagnostic-church` | | | |
| `churchKey` | `diagnostic-church` | | | |
| `primaryBranchKey` | `hq` | | | |
| Org UUID cross-check (optional) | matches header table | | ticket-only | |
| Church UUID cross-check (optional) | matches header table | | ticket-only | |
| HQ / primary branch UUID (optional) | matches header table | | ticket-only | |

---

## Diagnostic comparison outcome

| Check | Expected | Observed | Evidence | Pass/Fail |
|-------|----------|----------|----------|-----------|
| `platformResultType` | `resolved_tenant` | | | |
| `catalogueResultType` | `resolved` | | | |
| `proposedRouteOutcome` | `foundation` | | | |
| `proposedReason` | `shadow_match` | | | |
| `deploymentComparisonResult` | `match` | | | |
| Secrets in JSON | **None** | | | |

---

## Response behavior unchanged

| Check | Expected | Observed | Evidence | Pass/Fail |
|-------|----------|----------|----------|-----------|
| Demo Host still foundation | Same class as pre-shadow baseline | | before/after note | |
| Apex marketing unchanged | Still **200** apex chrome | | | |
| No tenant public content served | Pass | | | |
| Jobs still off | Pass | | | |

---

## Authentication transfer outcome

| Check | Expected | Observed | Evidence | Pass/Fail |
|-------|----------|----------|----------|-----------|
| Apex `/login` usable | **200**; login form present | | | |
| Optional: valid apex login | Session on apex; host-only cookie | | status only — no cookie value | |
| Tenant Host does not serve tenant password form | Redirect/transfer behavior unchanged vs foundation | | | |
| Raw transfer secrets not in HTML | Opaque `tr` only if present | | | |

Full portal transfer smoke is **not** required to accept shadow (users may be MISSING).

---

## Unknown-host behavior

| Check | Expected | Observed | Evidence | Pass/Fail |
|-------|----------|----------|----------|-----------|
| `Host: <unknown.blessboard.org>` `GET /` | **200** foundation (fail-soft) | | status | |
| No tenant CMS | Pass | | | |
| No crash / 5xx | Pass | | | |

---

## Inactive-domain behavior

| Check | Expected | Observed | Evidence | Pass/Fail |
|-------|----------|----------|----------|-----------|
| Inactive / non-primary domain fixture (if available) | Foundation **200**; shadow reason ≠ live tenant serve | | log reason code | |
| No catalogue bypass to CMS | Pass | | | |
| Skip if no safe fixture | N/A + reason | | | |

Do **not** suspend the shared demo domain solely for this check.

---

## Error logs

| Check | Expected | Observed | Evidence | Pass/Fail |
|-------|----------|----------|----------|-----------|
| Startup FATAL absent | No identity/DB fatal after restart | | | |
| No stack traces on apex/demo `/` | Pass | | | |
| Pool errors | Absent or explained | | code only | |
| Unexpected `mismatch` / `lookup_error` on demo | Absent (or ticket disposition) | | | |

---

## Request IDs

| Check | Expected | Observed | Evidence | Pass/Fail |
|-------|----------|----------|----------|-----------|
| Shadow event includes `requestId` | Present when logged | | list 1–3 IDs | |
| Correlates to access log | Optional match | | | |
| No secrets attached to IDs | Pass | | | |

Record IDs only:

```text
requestId-1: ________________
requestId-2: ________________
requestId-3: ________________
```

---

## Rollback readiness

| Check | Expected | Observed | Evidence | Pass/Fail |
|-------|----------|----------|----------|-----------|
| Rollback owner named | Filled on ticket | | | |
| Rollback action known | Set mode `off` + restart all workers | | | |
| Apex health baseline saved | Pre-flip `/healthz` **200** UTC | | | |
| Demo baseline saved | Pre-flip foundation **200** | | | |
| DB restore not required for mode rollback | Understood | | | |
| Rollback dry-narration done | Operator can recite steps | | | |

---

## Stop / fail triggers (any → NO-GO)

- Apex 5xx or login broken  
- Demo Host serves tenant CMS under intended shadow  
- `deploymentComparisonResult=mismatch` unresolved  
- Secrets in logs/HTML  
- `GETPRO_DATABASE_URL` set  
- Mixed worker modes  
- Uncertainty shadow vs authoritative  

---

## GO / NO-GO approval

| Question | Answer |
|----------|--------|
| Shadow evidence pack complete? | ☐ yes · ☐ no |
| Catalogue keys match expected? | ☐ yes · ☐ no |
| Response still foundation (unchanged class)? | ☐ yes · ☐ no |
| Rollback ready? | ☐ yes · ☐ no |
| Open SECURITY / CRITICAL issues? | ☐ none · ☐ IDs ____ |

| Decision | ☐ |
|----------|---|
| **GO** — accept shadow; remain on `shadow`; monitor | ☐ |
| **HOLD** — keep investigating; do not promote | ☐ |
| **NO-GO** — rollback to `off` now | ☐ |

| Role | Name | UTC | Signature |
|------|------|-----|-----------|
| Operator | | | |
| Observer / reviewer | | | |
| Approver (shadow accept only) | | | |

**Authoritative routing:** ☐ **not** authorized by this worksheet  

Evidence pack path (no secrets): `________________`
