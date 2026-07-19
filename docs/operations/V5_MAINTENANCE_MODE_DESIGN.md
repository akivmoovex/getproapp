# BlessBoard V5 — Maintenance mode design

**Date:** 2026-07-19  
**Mode:** Design + implementation status  
**Implementation:** Global write maintenance shipped as `BLESSBOARD_WRITE_MAINTENANCE` (see env reference). **Do not enable on Hostinger from docs alone.**  
**Companions:** [`V5_HOSTED_MIGRATION_AND_CUTOVER.md`](../database/V5_HOSTED_MIGRATION_AND_CUTOVER.md) · [`V5_FEATURE_FLAG_KILL_SWITCH_AUDIT.md`](./V5_FEATURE_FLAG_KILL_SWITCH_AUDIT.md) · [`V5_ENVIRONMENT_VARIABLE_REFERENCE.md`](../deployment/V5_ENVIRONMENT_VARIABLE_REFERENCE.md) · [`V5_INCIDENT_RESPONSE.md`](./V5_INCIDENT_RESPONSE.md)

---

## 1. Purpose

Decide what maintenance mode V5 needs for **hosted migration and cutover**, given existing kill switches (routing mode, jobs, media uploads, entitlements) and what gaps remain for a safe write freeze with clear UX.

---

## 2. Candidate models

| Model | Definition | Fit for V5 cutover |
|-------|------------|--------------------|
| **A. Full deployment maintenance** | Entire app returns maintenance HTML (except perhaps `/healthz`) | Heavy-handed; hides apex marketing; poor for “we’re migrating, status here” |
| **B. Tenant-specific maintenance** | Per org/church/host flag | Useful later for single-church incidents; **not** required for estate migrate/cutover |
| **C. Global write maintenance** | GETs (and `/healthz`) stay up; **all state-changing methods fail closed** with one message | Matches freeze need during migrate apply / dual-write prevention |
| **D. Migration-only maintenance** | Same as C, but only documented for migrate windows (no separate product mode) | Procedure-only; still needs **one** enforceable switch or ops will improvise |

**Smallest useful model:** **C — global write maintenance** (D is the ops *use* of C, not a separate runtime mode).

---

## 3. Assessment matrix (desired behavior under write maintenance)

| Surface | Desired under global write maintenance | Today without new mode | Gap |
|---------|----------------------------------------|-------------------------|-----|
| **Apex availability** | **GET** marketing (`/`, `/features`, …) **200**; honest banner optional | Always available in foundation | Banner/message missing |
| **Tenant public availability** | **GET** published pages **200** if routing authoritative; else foundation | Routing/allow-list already gate serve | No maintenance copy |
| **Login behavior** | **GET** `/login` **200**; **POST** login **blocked** (or allowed — see §5) | Login POST always mutates session | Policy choice |
| **Existing sessions** | Remain until expiry; cookie not cleared by mode flip | Sessions persist | OK |
| **Admin access** | **GET** shells optional; **POST**/mutations **blocked** | Mutations still work if session valid | **Gap** |
| **Read-only pages** | Allowed (reports, audit list, published CMS) | Allowed | OK |
| **State-changing forms** | Fail closed (**403/503** + message); no silent success | CSRF/authz only | **Gap** |
| **Uploads** | Fail closed | `BLESSBOARD_MEDIA_UPLOADS_ENABLED` (default off) | Covered if left `0`; write mode should still reject if somehow `1` |
| **Background jobs** | Off | Foundation + `BLESSBOARD_JOBS_ENABLED` fail-closed on V5 code | Covered |
| **API / webhooks** | N/A (not shipped); future must honor same write gate | Entitlements false | Defer until shipped |
| **Custom domains** | Same as tenant host; no special mode | Routing + allow-list + entitlement | No extra mode needed |
| **Health checks** | `GET /healthz` **200** always; body may include `maintenance: true` (no secrets) | `/healthz` independent of routing | Preserve; extend optionally |

---

## 4. What existing deployment controls already cover

| Need | Existing control | Sufficient alone? |
|------|------------------|-------------------|
| Stop tenant HTML estate-wide | `BLESSBOARD_TENANT_ROUTING_MODE=off` / `shadow` | **Partial** — stops CMS serve; does **not** stop apex writes or admin POSTs on apex |
| Pilot blast radius | `BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST` | Yes for serve; not a write freeze |
| Stop cron | Jobs kill switch / foundation | Yes |
| Stop media uploads | `BLESSBOARD_MEDIA_UPLOADS_ENABLED` | Yes for uploads only |
| Stop premium Network writes | Entitlements | Org-scoped; not a window freeze |
| Load balancer “site down” | Hostinger / DNS | Full outage — not preferred for migrate |

**Verdict on “existing only”:** Combining routing `off` + jobs `0` + media `0` reduces risk but **does not** give a coherent cutover freeze: HQ/PA/member **POST**s and registration can still mutate the V5 DB while migrate/reconcile runs, and users see normal forms (false confidence).

Cutover runbook §2.2 already expects a documented **V4 write freeze method**; V5 needs a matching **app-level write freeze**, not only DB role gymnastics.

---

## 5. Recommended design (when later implemented)

### 5.1 Single env flag (deployment-scoped)

| Field | Proposal |
|-------|----------|
| Name | `BLESSBOARD_WRITE_MAINTENANCE` (or `BLESSBOARD_MAINTENANCE_MODE=write`) |
| Default | **Off** / unset → normal operation (**fail-open for availability**; fail-closed only when explicitly on) |
| Enable | `1` \| `true` \| `yes` \| `on` |
| Disable / rollback | unset or `0` \| `false` \| `no` \| `off`; **restart all workers** |
| Invalid token | Treat as **off** (availability) **or** **on** (safety)? → Prefer **on (fail closed for writes)** when token present but unknown — document; unset stays off |

Do **not** invent a second overlapping “migration mode” env.

### 5.2 Enforcement (route/service — navigation alone insufficient)

| Layer | Behavior when ON |
|-------|------------------|
| Middleware (early) | Block `POST`/`PUT`/`PATCH`/`DELETE` with **503** (or **403**) + fixed HTML/JSON `{ ok:false, reason:"write_maintenance" }` |
| Allowlist methods | `GET`, `HEAD`, `OPTIONS` pass |
| Exception paths | **`GET /healthz` only** as hard exception; optionally allow CSRF cookie mint on GET |
| Login POST | **Block** during freeze (no new sessions) — simplest; ops use existing sessions or wait |
| Logout POST | **Allow** (session revoke is safer than forcing sticky sessions) — optional exception |
| Uploads | Blocked by middleware even if media flag is `1` |
| Jobs | Remain independently off; write maintenance does not start jobs |
| API/webhooks | When shipped: same middleware on API routers |

### 5.3 User-facing message

- Short, static copy: e.g. “BlessBoard is temporarily unavailable for changes. Please try again soon.”
- Same message for apex and tenant; **no** org names, URLs with secrets, stack traces, or env dumps.
- Optional apex banner on GET pages (presentation-only; enforcement remains middleware).

### 5.4 Sessions

- Do **not** mass-revoke on enable (avoids stampede and ops lockout complexity).
- Blocking login POST + mutations is enough for freeze.
- Optional break-glass: **none** in v1 (keep surface small); use Hostinger off + DB if disaster.

### 5.5 Health

```json
{ "ok": true, "mode": "v5-foundation", "writeMaintenance": true }
```

Presence flags only — never secrets.

### 5.6 Tenant-specific / full outage

| Variant | Recommendation |
|---------|----------------|
| Tenant-specific | **Defer** until multi-tenant production support needs per-church freezes |
| Full deployment maintenance | **Defer** as primary; use only as Hostinger/DNS last resort |
| Migration-only | Use **global write maintenance** + runbook; no separate flag |

### 5.7 Testability without hosted deployment

- Unit: parse flag fail-closed/open rules.
- Integration: in-process Express — GET `/` and `/healthz` **200**; POST `/login` and a sample CSRF POST → maintenance status; no DB writes asserted.
- Do not require Hostinger to validate.

### 5.8 Rollback

```text
BLESSBOARD_WRITE_MAINTENANCE=0
# restart ALL workers
# curl /healthz → writeMaintenance false or absent
# spot-check one POST recovers
```

---

## 6. Cutover procedure sketch (ops — not implementation)

1. Announce window.  
2. V4: existing freeze method (runbook).  
3. V5: set write maintenance **ON** + confirm jobs `0` + media `0`.  
4. Run migrate apply / reconcile against V5 DB.  
5. Smoke **GET**-only / healthz.  
6. Clear write maintenance; enable routing per signed plan.  
7. If abort: keep write maintenance on or routing `off`; do not dual-write.

---

## 7. Non-goals

- Per-screen flags  
- Replacing routing mode / allow-list  
- Fancy status page CMS  
- Tenant-scoped DB rows for v1  
- Enabling API/webhook maintenance before those features ship  

---

## 8. Conclusion

| Option | Decision |
|--------|----------|
| **IMPLEMENT GLOBAL WRITE MAINTENANCE** | **YES — recommended next implementation batch** (design accepted; code not in this task) |
| IMPLEMENT TENANT MAINTENANCE | **No** for cutover v1 — **DEFER** |
| EXISTING DEPLOYMENT CONTROLS SUFFICIENT | **No** — kill switches are incomplete for a coordinated write freeze + UX |
| DEFER (all maintenance work) | **No** for global write mode; **Yes** for tenant/full-site variants |

### Final label

**IMPLEMENT GLOBAL WRITE MAINTENANCE**

Smallest useful model: one deployment env flag that **fail-closes writes**, keeps **`/healthz` and safe GETs**, shows a **fixed user message**, **rolls back by unset/0 + restart**, and is **testable in-process**. Tenant-specific and full-site outage modes remain deferred; migration windows use this global write gate plus existing routing/jobs/media controls.

---

## Suggested documentation commit message

```
docs(operations): design V5 global write maintenance mode

Recommend one write-freeze flag for migrate/cutover; defer tenant
and full-site modes; document gaps vs existing kill switches.
```
