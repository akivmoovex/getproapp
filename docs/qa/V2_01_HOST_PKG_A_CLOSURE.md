# V2.01 HOST-PKG-A Closure

**Task:** `V2_01_HOST_PKG_A_CLOSURE` (+ status update 2026-09-26)  
**Branch:** `V8`  
**Production:** **READ-ONLY** — do not modify  

**Superseding status (2026-09-26 — Hostinger customer evidence):**

---

## Verdict

**`HOST_PKG_A_BLOCKED_HOSTINGER_BACKEND`**

| Fact (owner / Hostinger customer surface) | Implication |
| --- | --- |
| www is **not** exposed separately in hPanel or DNS | No customer-visible “unbind www from Node” control |
| Hostname → runtime / vhost mapping is **not customer-visible** | Agent/owner cannot confirm binding from panel |
| Per-www worker ownership is **UNKNOWN** | App sticky PIDs are **correlation only**, not proof |
| PID observations alone do **not** prove separate workers | Do not claim NPROC/PID savings from probes |
| **No hPanel unbind action is available** | Do **not** instruct owner to unbind www in hPanel |
| Hostinger **backend / engineering** inspection required | Escalation: `V2_01_HOST_PKG_A_HOSTINGER_ESCALATION.md` |

**Historical note:** Earlier docs said `HOST_PKG_A_READY_FOR_OWNER_ACTION` and listed hPanel unbind steps. That path is **obsolete** given Hostinger’s customer-surface constraints. Keep baselines below for correlation only.

---

## 1. Exact HOST-PKG-A requirement (unchanged goal)

| Field | Definition |
| --- | --- |
| **ID** | **HOST-PKG-A** (P0 ops / capacity hypothesis) |
| **Hosts in scope** | `www.neuniversity.org`, `www.pronline.org` (relative to apex) |
| **Goal** | If separate www Node/lsnode workers exist, retire **www-only** runtime cost while apex Node apps stay active; prefer edge redirect that does not invoke Node |
| **Out of scope** | Package B, production TLDs, Express-only “fixes”, blind `.htaccess`, process kills |
| **NPROC claim** | **Forbidden** without Hostinger-confirmed worker mapping + panel graphs |

Express www→apex **301** for hub paths already exists and **does not** prove absence of a www worker.

---

## 2. Application-side baseline (correlation only — not proof of separate workers)

Probes from closure / post-owner verification sessions (PIDs rotate after redeploy):

| Host | Observed pattern | Use |
| --- | --- | --- |
| `www.neuniversity.org` | `/healthz` + `/__platform/runtime` **200**; sticky PID ≠ apex (e.g. later `3464039`) | Correlation |
| `www.pronline.org` | Same; sticky PID e.g. **215891** | Correlation |
| Testing unique Node PIDs | Often **10** | Correlation |
| Hub `/` | **301** → apex | Pre-existing app redirect |

**Do not** treat sticky www PIDs as proof of a separate www worker. Hostinger backend must confirm ownership.

---

## 3. Target state (if backend confirms separate www binding)

| Surface | Target |
| --- | --- |
| www | No **www-only** Node runtime binding (if one exists) |
| Apex Node apps | **Unchanged / active** |
| www → apex | Prefer **platform/web-server** redirect (not Node), if Hostinger can configure |
| Production | Untouched |
| NPROC | Record only after Hostinger states before/after effect |

---

## 4. Blocking access (updated)

| Need | Who | Customer-visible? |
| --- | --- | --- |
| Hostname → Node vhost / lsnode mapping | **Hostinger backend / engineering** | **No** |
| Confirm or remove www-only Node binding | **Hostinger backend** | **No** hPanel unbind |
| Platform-layer www→apex redirect without Node | **Hostinger** (if supported) | Maybe Redirects UI; mapping still opaque |
| Account NPROC graphs | Owner hPanel Resource Usage | Yes (measurement only) |
| SSH `ps` | Owner SSH or support | Optional |

**Bottom line:** HOST-PKG-A is **blocked on Hostinger backend inspection**, not on an owner hPanel unbind step.

---

## 5. Owner actions (allowed)

1. Submit / follow Hostinger support escalation (`V2_01_HOST_PKG_A_HOSTINGER_ESCALATION.md`).  
2. Optionally screenshot Max Processes for capacity context (does **not** close Package A alone).  
3. After Hostinger reply: ask engineering to re-probe public diagnostics and update verification doc.

### Explicitly do **not**

- Instruct or attempt **hPanel unbind of www** (not available / not exposed).  
- Add Express redirects as a “NPROC fix.”  
- Edit Node `.htaccess` blindly.  
- Kill PIDs.  
- Touch production apps or DB.  
- Claim PID/NPROC savings from app probes alone.

---

## 6. Expected worker effect

| Claim | Status |
| --- | --- |
| “www has its own worker” | **UNKNOWN** until Hostinger confirms |
| “Unbind saves ~2 PIDs” | **Not actionable** — no customer unbind; savings unknown |
| Express 301 saves a worker | **False** (counterexample historically; not proof either way now) |

---

## 7. Verification after Hostinger backend change

Only if Hostinger reports a mapping change or www-only binding removal:

- Re-probe apex + product BB/AC health.  
- Note whether www still returns app `/__platform/runtime` JSON (correlation).  
- Record Hostinger’s stated before/after worker/NPROC effect **verbatim**.  
- Production `/healthz` still `03a89106e2fe` · `moovex-platform-production`.

---

## 8. Related docs

| Doc | Role |
| --- | --- |
| `V2_01_HOST_PKG_A_POST_OWNER_VERIFICATION.md` | Probe results; status aligned to backend block |
| `V2_01_HOST_PKG_A_HOSTINGER_ESCALATION.md` | Paste-ready support ticket |
| `V2_01_POST_OVERNIGHT_TARGETED_SUMMARY.md` | Living status table |

---

## FINAL VERDICT (repeat)

**`HOST_PKG_A_BLOCKED_HOSTINGER_BACKEND`**

No owner hPanel unbind path. Per-www worker ownership UNKNOWN. Hostinger backend/engineering inspection required. No application code change from this status update.
