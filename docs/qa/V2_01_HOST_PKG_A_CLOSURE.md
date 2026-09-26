# V2.01 HOST-PKG-A Closure

**Task:** `V2_01_HOST_PKG_A_CLOSURE`  
**Date:** 2026-09-26  
**Branch:** `V8` tip `79cb11facab7`  
**Deployment:** `moovex-platform-v8-testing` (V8) · `moovex-platform-testing` (V7 isolation)  
**Production:** **READ-ONLY** — `moovex-platform-production` `03a89106e2fe` **untouched**  
**Mode:** Infrastructure definition + live re-probe only — **no** hPanel/DNS/`.htaccess`/unbind/restart/Express changes

**Sources:**  
`V2_01_OVERNIGHT_BACKLOG_SUMMARY.md` · `V2_01_PLATFORM_INFRA_BACKLOG_REPORT.md` · `V2_01_HOSTINGER_PACKAGE_A_QA.md` · `V2_01_HOSTINGER_UNUSED_HOST_AUDIT.md` · `V2_01_HOSTINGER_PROCESS_AUDIT.md` · `HOSTINGER_ACCOUNT_WIDE_PROCESS_AUDIT.md`

---

## Verdict

**`HOST_PKG_A_READY_FOR_OWNER_ACTION`**

Package A is **fully specified and still not applied**. Cursor cannot close it: there is **no Hostinger hPanel access and no account SSH** in this environment. Live probes (this session) reconfirm the dual sticky www workers and that Express **301** alone does **not** retire them.

| Verdict option | When |
| --- | --- |
| `HOST_PKG_A_CLOSED` | After owner unbind + idle wait + verification §7 all pass |
| `HOST_PKG_A_READY_FOR_OWNER_ACTION` | **Now** — requirement, baselines, and owner steps are exact |
| `HOST_PKG_A_BLOCKED` | If scope/access were unclear — **not** this case |

---

## 1. Exact HOST-PKG-A requirement (reconstructed)

| Field | Definition |
| --- | --- |
| **ID** | **HOST-PKG-A** (severity **P0** ops / capacity) |
| **Hosts in scope** | **Only** `www.neuniversity.org` and `www.pronline.org` |
| **Canonical targets** | `https://neuniversity.org` (V8 hub) · `https://pronline.org` (V7 hub) |
| **Goal** | Stop LiteSpeed/`lsnode` from keeping a **dedicated Node PID** for each www hostname, while bookmarks to www still land on apex over HTTPS |
| **Success (process)** | www `/__platform/runtime` no longer returns a **distinct sticky** Node PID (404 / edge / non-app), **or** www never hits the Node Web App |
| **Success (product)** | V8 BB+AC, V8 apex, V7 BB+AC (+ hubs kept), production identities **unchanged** |
| **Out of scope** | Package B (`getproapp` / `netraz`), Package C/D, production TLDs, BB/AC product hosts, Express code, blind `.htaccess`, process kills |
| **NPROC claim** | **Forbidden** without hPanel Max Processes before/after — estimated **~2** Node PIDs only |

**Why Express redirect is insufficient (already proven):**  
Hub paths (`/`, `/login`) already **301** via app middleware (`redirectTargetOrigin`). Diagnostic routes (`/healthz`, `/__platform/runtime`) still execute on the **www** vhost → **separate sticky PID**. Package A therefore requires **edge/hPanel redirect + unbind www from the Node Web App**, not another app redirect.

---

## 2. Current state (live 2026-09-26)

### 2.1 Identities

| Host | `/healthz` | deploymentCode | gitSha | schema |
| --- | --- | --- | --- | --- |
| `blessboard.neuniversity.org` | 200 | `moovex-platform-v8-testing` | `79cb11facab7` | true |
| `activeclinic.neuniversity.org` | 200 | same | same | true |
| `neuniversity.org` | 200 | same | same | true |
| **`www.neuniversity.org`** | 200 | same | same | true |
| `blessboard.pronline.org` | 200 | `moovex-platform-testing` | `03a89106e2fe` | true |
| `activeclinic.pronline.org` | 200 | same | same | true |
| `pronline.org` | 200 | same | same | true |
| **`www.pronline.org`** | 200 | same | same | true |
| `getproapp.pronline.org` / `netraz.pronline.org` | 200 | V7 testing | `03a89106e2fe` | true (Package B — **not** Package A) |
| `blessboard.com` / `www.blessboard.com` / `activeclinic.org` | 200 | `moovex-platform-production` | `03a89106e2fe` | true |

Production `/__platform/runtime`: **404** (gated) — PIDs not measurable; **no production mutation**.

### 2.2 Sticky Node PID matrix (Package A + required neighbors)

| Hostname | PID (3/3 sticky) | Same tree as apex? | Package A |
| --- | ---: | --- | --- |
| **`www.neuniversity.org`** | **1841608** | Yes (`…/domains/neuniversity.org/hbuilds/…`) | **TARGET** |
| `neuniversity.org` | 1841761 | — | **KEEP** |
| `blessboard.neuniversity.org` | 116577 | same V8 tree | KEEP |
| `activeclinic.neuniversity.org` | 3993427 | same V8 tree | KEEP |
| **`www.pronline.org`** | **215891** | Yes (`…/domains/pronline.org/hbuilds/…`) | **TARGET** |
| `pronline.org` | 1553960 | — | **KEEP** |
| V7 BB / AC / GetPro / Netraz | distinct PIDs | V7 tree | KEEP / Package B |

**UNIQUE testing Node PIDs observed = 10** (same count as prior audits; PIDs rotate after redeploy — expected).  
**www PID ≠ apex PID** on both lines → one Web App / release tree does **not** imply one OS worker.

### 2.3 www → apex redirects (application layer)

| URL | Status | Location |
| --- | ---: | --- |
| `https://www.neuniversity.org/` | **301** | `https://neuniversity.org/` |
| `https://www.pronline.org/` | **301** | `https://pronline.org/` |
| `https://www.neuniversity.org/healthz` | **200** JSON | Still www Node (PID above) |
| `https://www.pronline.org/__platform/runtime` | **200** | Still www Node |

### 2.4 Already true (do not re-do in app)

| Fact | Evidence |
| --- | --- |
| App www→apex 301 for hub UX | Live 301 (above) + Package A QA §2.4 |
| Canonical registry `redirectTargetOrigin` | Documented in Package A QA |
| Cloud Startup NPROC ceiling **200** | Prior Hostinger / process audits |
| Per-hostname `lsnode` spawn | Live PID matrix + process audits |
| Jobs off on V8 testing | Prior `/healthz` / overnight summary |
| Account home `u549637099` | Runtime `cwd` paths |
| Agent has **no** Hostinger SSH keys | `~/.ssh` has no account keys; Package A QA **BLOCKED** historically |
| hPanel Redirects are the supported edge pattern | Hostinger docs cited in Package A QA §3 |
| Blind `.htaccess` on Node apps is unsafe | Regenerated on Node redeploy (Package A QA §3) |

### 2.5 Not observable from Cursor

| Item | Why |
| --- | --- |
| Account NPROC avg/peak (~113 historical) | Owner hPanel Resource Usage only |
| Authoritative Web Apps ↔ domain bind list | Owner hPanel |
| Account-wide `ps` / `lsnode` count | SSH or support |
| Confirmed idle-stop duration | Not measured — plan **≥60 min** quiet after unbind |
| HOST-CONSOL (multi-host one PID) | Separate ticket; **UNVERIFIED**; do not conflate with Package A |

---

## 3. Target state

| Surface | Target |
| --- | --- |
| `www.neuniversity.org` | Edge **301** → `https://neuniversity.org…` (path-preserving if panel allows); **not** attached to V8 Node Web App; **no** sticky www Node PID |
| `www.pronline.org` | Same → `https://pronline.org…` on V7 line |
| DNS | `www` still resolves to Hostinger so redirect endpoint works |
| SSL | www remains covered (existing LE SAN preferred) |
| Apex + BB + AC (V8 and V7) | Unchanged bindings and health |
| Production | Unchanged |
| NPROC | Optional graph movement recorded; **not** required to declare Package A process success |

---

## 4. Exact blocking access

| Action | Who | Available in Cursor? |
| --- | --- | --- |
| Unbind `www.*` from Node Web App domain list | **Owner hPanel** | **No** |
| Create/confirm hPanel Domains → Redirects (301 www→apex) | **Owner hPanel** | **No** |
| Screenshot Max Processes before/after | **Owner hPanel** | **No** |
| Confirm full website/domain inventory | **Owner hPanel** | **No** |
| Account `ps` / process dump | **Owner SSH** or Hostinger support | **No** |
| DNS change (only if panel requires) | **Owner** | **No** — and **not required** if www stays on Hostinger with panel redirect |
| Express / git deploy for Package A | Dev | **Must not** — insufficient and out of scope |
| Hostinger support ticket | Owner (optional; more relevant to **HOST-CONSOL**) | Not required to *apply* Package A |

**Bottom line:** Package A is blocked solely on **owner hPanel** (unbind + redirect). SSH is helpful for NPROC composition, **not** mandatory to execute Package A.

---

## 5. Smallest owner / Hostinger action list

Do **only** these steps. Prefer V8 www first, then V7 www.

### Before (5 minutes)

1. hPanel → **Resource Usage** → screenshot Max Processes (6h or 24h).  
2. Run the PID matrix script in §7.1; save output (expect www PIDs ≠ apex).

### Apply — V8 (`www.neuniversity.org`)

1. Open Node website for `neuniversity.org` / `moovex-platform-v8-testing`.  
2. **Redirects:** `www.neuniversity.org` → `https://neuniversity.org` · type **301** · preserve path if available.  
3. **Unbind** `www.neuniversity.org` from the Node app domain list.  
4. **Do not** remove `neuniversity.org`, `blessboard.neuniversity.org`, or `activeclinic.neuniversity.org`.  
5. Confirm SSL still covers www (or re-issue when panel warns).

### Apply — V7 (`www.pronline.org`)

1. Open Node website for `pronline.org` / `moovex-platform-testing`.  
2. Same: **301** www → `https://pronline.org`, then **unbind www only**.  
3. **Do not** remove `pronline.org`, `blessboard.pronline.org`, `activeclinic.pronline.org`, GetPro, or Netraz (Package B is separate).

### After

1. Wait **≥60 minutes** with no intentional www traffic (idle stop unmeasured).  
2. Run verification §7.  
3. Screenshot Max Processes again; record only — **do not invent** savings.  
4. Reply to this ticket with before/after PID + screenshots → reopen for **`HOST_PKG_A_CLOSED`**.

### Explicitly do **not**

- Edit Node-generated `.htaccess` as the fix.  
- Deploy Express redirect changes.  
- Kill PIDs.  
- Unbind apex or product hosts.  
- Touch production TLDs.  
- Start Package B in the same change window unless separately approved.

---

## 6. Expected worker / process effect

| Expectation | Confidence |
| --- | --- |
| Up to **~2** fewer sticky testing **Node** PIDs (one per www host) after idle | **High** for PID matrix; **Low** for account NPROC graph |
| Fewer PG pools (default max **5**/worker) as side effect | Informative only |
| Account NPROC drop of ~2 may be **invisible** vs ~113 average if other processes dominate | Do not claim NPROC win without graph |
| Apex / BB / AC PIDs unchanged | Required |

---

## 7. Verification (after owner change)

### 7.1 Commands

```bash
# Redirects (no follow)
curl -sSI https://www.neuniversity.org/ | head -20
curl -sSI https://www.pronline.org/ | head -20

# PID matrix — www should NOT return sticky app runtime JSON with distinct Node PID
for h in www.neuniversity.org neuniversity.org www.pronline.org pronline.org \
  blessboard.neuniversity.org activeclinic.neuniversity.org \
  blessboard.pronline.org activeclinic.pronline.org
do
  echo "==== $h"
  curl -sS -m 20 "https://$h/healthz" | head -c 200; echo
  curl -sS -m 20 "https://$h/__platform/runtime" | python3 -c \
    'import sys,json; d=json.load(sys.stdin); print({k:d.get(k) for k in ("pid","deploymentCode","gitSha")})' \
    2>/dev/null || echo "NO_APP_RUNTIME"
done

# Production unchanged (read-only)
curl -sS https://blessboard.com/healthz | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["gitSha"],d["deploymentCode"])'
curl -sS https://activeclinic.org/healthz | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["gitSha"],d["deploymentCode"])'
```

### 7.2 Pass criteria

| # | Check | Pass |
| --- | --- | --- |
| 1 | www `/` | 301 (or equivalent edge) → apex; HTTPS OK |
| 2 | www `/__platform/runtime` | No dedicated sticky Node PID |
| 3 | V8 BB+AC+apex `/healthz` | 200 · `moovex-platform-v8-testing` |
| 4 | V7 BB+AC `/healthz` | 200 · `moovex-platform-testing` |
| 5 | Production BB+AC `/healthz` | Still `03a89106e2fe` · `moovex-platform-production` |
| 6 | Optional smoke | One V8 BB + one V8 AC login/editor hit |
| 7 | NPROC | Screenshots filed; savings claimed **only** if graph supports it |

---

## 8. Rollback

1. Re-attach `www.neuniversity.org` to the V8 Node Web App.  
2. Re-attach `www.pronline.org` to the V7 Node Web App.  
3. Disable Package A panel redirects if they conflict.  
4. Confirm SSL.  
5. Hit www `/` and `/__platform/runtime` — expect sticky PIDs to return (cold start OK).  
6. Re-check BB/AC + production `/healthz`.

No git rollback if no app deploy was made for Package A.

---

## 9. What this session did / did not do

| Done | Not done |
| --- | --- |
| Reconstructed HOST-PKG-A from docs | hPanel unbind / redirects |
| Live re-probe identities, PIDs, 301s | DNS / SSL / `.htaccess` edits |
| Confirmed no SSH Hostinger keys | Express changes |
| Wrote minimal owner action list | Process restart/kill |
| Production read-only check | NPROC savings claim |
| | Package B / production domain work |

---

## 10. Relation to other HOST-* items

| ID | Relation |
| --- | --- |
| **HOST-PKG-A** | This document — **ready for owner** |
| **HOST-PKG-B** | Separate owner gate (GetPro/Netraz) — do not bundle |
| **HOST-CONSOL** | Support question: can multi-domain share one `lsnode`? — **not** Package A |
| **HOST-NPROC-BASELINE** | Owner screenshots before/after Package A |

---

## FINAL VERDICT (repeat)

**`HOST_PKG_A_READY_FOR_OWNER_ACTION`**

Requirement, current state, target state, access blocker, safe steps, expected PID effect, verification, and rollback are exact. Closing to **`HOST_PKG_A_CLOSED`** requires owner hPanel apply + post-change verification — not further Cursor app work.
