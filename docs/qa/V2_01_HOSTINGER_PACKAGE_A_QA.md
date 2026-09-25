# V2.01 Hostinger Package A QA

**Task:** `V2_01_HOSTINGER_PACKAGE_A_IMPLEMENTATION`  
**Date:** 2026-09-25  
**Branch:** `V8` (local tip `e5bd58ad`)  
**Environment:** Testing  
**Scope:** Package A only — `www.neuniversity.org` → `neuniversity.org`, `www.pronline.org` → `pronline.org`  
**Account home (runtime):** `/home/u549637099`  

**Prerequisites:**  
- [`V2_01_HOSTINGER_UNUSED_HOST_AUDIT.md`](./V2_01_HOSTINGER_UNUSED_HOST_AUDIT.md)  
- [`V2_01_HOSTINGER_WORKER_CONSOLIDATION_PLAN.md`](./V2_01_HOSTINGER_WORKER_CONSOLIDATION_PLAN.md)

**Verdict:** `V2_01_PACKAGE_A_BLOCKED`

---

## Executive summary

Package A is **authorized by this task** but **not applied**. This agent session has **no hPanel credentials and no Hostinger SSH keys**, so Hostinger domain/website configuration cannot be changed safely from here.

Live baseline confirms:

1. Canonical destinations already exist and are healthy.  
2. App Express already issues **301** from www hub paths to apex — **and still runs a distinct sticky Node PID per www hostname**.  
3. Therefore an Express-only redirect **does not** achieve Package A’s goal (retire the dedicated www worker).  
4. Hostinger documents hPanel **Redirects** (and `.htaccess` www→apex patterns). Applying those **and unbinding www from the Node Web App** requires operator hPanel access.  
5. NPROC before/after: **NOT AVAILABLE** here — do not claim savings.

**STOP condition met:** hosting configuration inaccessible → manual hPanel instructions below; no unsupported server/code changes; no Package B; production untouched.

---

## 1. Authorization and scope

| Item | Status |
|------|--------|
| Package A hosts | `www.neuniversity.org`, `www.pronline.org` **only** |
| Explicit task authorization to change Hostinger for Package A | **Yes** (this ticket) |
| Agent ability to open hPanel / Hostinger SSH | **No** |
| Package B / GetPro / Netraz | **Out of scope — not touched** |
| Production TLDs | **Out of scope — not touched** |
| App code / deploy / process kill | **Not done** (would not remove workers alone) |

---

## 2. Baseline (pre-change) — 2026-09-25 probe

### 2.1 Canonical destinations and app mappings

| www hostname | Canonical destination | Deployment | gitSha | Release cwd tree |
|--------------|----------------------|------------|--------|------------------|
| `www.neuniversity.org` | `https://neuniversity.org` | `moovex-platform-v8-testing` | `e5bd58adc7cf` | `…/domains/neuniversity.org/hbuilds/versions/01a0d83b-…/nodejs` |
| `www.pronline.org` | `https://pronline.org` | `moovex-platform-testing` | `03a89106e2fe` | `…/domains/pronline.org/hbuilds/versions/01a0bf10-…/nodejs` |

Registry (`canonicalHostRegistry`): both www hosts are `siteType: platform` with `redirectTargetOrigin` set to the apex HTTPS origin. Runtime middleware redirects platform hosts with `redirectTargetOrigin` via Express **301** (path-preserving).

### 2.2 Sticky Node PIDs (Package A + apex)

| Hostname | PID (sticky 5/5) | Notes |
|----------|------------------|-------|
| `www.neuniversity.org` | `2308499` | **Dedicated worker** — Package A target |
| `neuniversity.org` | `1992434` | Canonical V8 hub — **keep** |
| `www.pronline.org` | `1535403` | **Dedicated worker** — Package A target |
| `pronline.org` | `522765` | Canonical V7 hub — **keep** |

www PID ≠ apex PID on both lines → same Web App / tree, **not** the same OS worker.

### 2.3 HTTPS / certificates

| Hostname | TLS | SAN includes www? | Validity (GMT) |
|----------|-----|-------------------|----------------|
| `www.neuniversity.org` / `neuniversity.org` | Let’s Encrypt OK | Yes (`neuniversity.org`, `www.neuniversity.org`) | 2026-09-10 → 2026-12-09 |
| `www.pronline.org` / `pronline.org` | Let’s Encrypt OK | Yes (`pronline.org`, `www.pronline.org`) | 2026-09-16 → 2026-12-15 |

Preserve these certs (or re-issue covering www) when changing bindings so HTTPS redirects do not break.

### 2.4 Current redirect behavior (Express / Node path)

| URL | Status | Location / body |
|-----|--------|-----------------|
| `https://www.neuniversity.org/` | **301** | `https://neuniversity.org/` |
| `https://www.neuniversity.org/login` | **301** | `https://neuniversity.org/login` |
| `https://www.neuniversity.org/healthz` | **200** JSON | Still served by www Node PID |
| `https://www.neuniversity.org/__platform/runtime` | **200** | `pid=2308499` |
| `https://www.pronline.org/` | **301** | `https://pronline.org/` |
| `https://www.pronline.org/login` | **301** | `https://pronline.org/login` |
| `https://www.pronline.org/healthz` | **200** JSON | Still served by www Node PID |
| `https://www.pronline.org/__platform/runtime` | **200** | `pid=1535403` |

**Interpretation:** UX redirect for hub pages already works. Diagnostic routes still warm a **separate** www worker. Package A success requires **edge/hPanel** redirect (or equivalent) **without** attaching www to Node — not more Express redirect logic.

### 2.5 Required surfaces (untouched baseline)

| Check | Result |
|-------|--------|
| `blessboard.neuniversity.org/login` | 200 HTML |
| `activeclinic.neuniversity.org/login` | 200 HTML |
| V8 BB/AC `/healthz` | 200, `moovex-platform-v8-testing`, SHA `e5bd58adc7cf`, PIDs `2018658` / `2308239` |
| V7 BB/AC `/healthz` | 200, `moovex-platform-testing`, SHA `03a89106e2fe`, PIDs `107171` / `798264` |
| `blessboard.com` / `activeclinic.org` `/healthz` | 200, `moovex-platform-production`, SHA `03a89106e2fe` |
| Production `/__platform/runtime` | 404 (gated) |

Full BB+AC login → editor → publish was **not** re-run end-to-end in this blocked session (no hosting change to validate against). Login pages respond 200.

### 2.6 NPROC

| Metric | Result |
|--------|--------|
| hPanel Max Processes avg/peak | **NOT AVAILABLE** (no panel access) |
| Claimed Package A NPROC savings | **None claimed** |

---

## 3. Does Hostinger support www → apex without a dedicated Node worker?

| Approach | Supported by Hostinger docs? | Removes dedicated www Node PID? | Notes |
|----------|------------------------------|----------------------------------|-------|
| Express / app `301` (current) | N/A (app) | **No** — live counterexample | `/` redirects; `/healthz` + runtime still on www PID |
| hPanel **Domains → Redirects** | **Yes** ([Redirects](https://docs.hostinger.com/websites/redirects), [support 1583406](https://www.hostinger.com/support/1583406-how-to-set-up-a-redirect-in-hostinger/)) | **Unverified until after unbind** | Prefer 301; must not leave www attached to Node if goal is PID drop |
| `.htaccess` www→non-www rewrite | Documented | **Risky on Node Web Apps** | Hostinger regenerates `public_html/.htaccess` on Node redeploy — do **not** rely on hand-edits |
| Remove www from Node website domain list + panel redirect | Ops pattern | **Likely** (goal of Package A) | Keep DNS + SSL; redirect at edge; wait for idle stop |
| DNS CNAME www → apex only | DNS docs for www records | **Insufficient alone** | DNS alias without unbind still hits Node if www remains a vhost on the app |

**Conclusion:** Hostinger **can** redirect www at the panel layer. Guaranteeing **no** dedicated www Node worker requires **unbind www from the Node Web App** (or equivalent non-Node site type), then verifying with `/__platform/runtime` after an idle window. That step is **operator-only** from hPanel.

---

## 4. Changes applied by this agent

| Change | Applied? |
|--------|----------|
| hPanel redirect | **No** |
| Unbind www from Node | **No** |
| DNS edit | **No** |
| SSL change | **No** |
| Express / deploy | **No** |
| Package B hosts | **No** |
| Production | **No** |

**Reason:** Hostinger configuration inaccessible → **STOP** per task.

---

## 5. Manual hPanel instructions (operator)

Perform **only** for Package A hosts. Do not modify BB/AC product hosts, GetPro/Netraz, or production.

### 5.1 Record baselines (before)

1. hPanel → **Resource Usage** → screenshot Max Processes (6h or 24h).  
2. Optional: Snapshots → count `node` / `lsnode`.  
3. From a workstation, capture PID matrix:

```bash
for h in www.neuniversity.org neuniversity.org www.pronline.org pronline.org \
  blessboard.neuniversity.org activeclinic.neuniversity.org \
  blessboard.pronline.org activeclinic.pronline.org
do
  echo "==== $h"
  curl -sS -m 20 "https://$h/healthz"
  echo
  curl -sS -m 20 "https://$h/__platform/runtime" | node -e \
    'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const j=JSON.parse(d);console.log({pid:j.pid,deploymentCode:j.deploymentCode,gitSha:j.gitSha})})'
done
```

Expected pre-change: www PIDs distinct from apex (see §2.2).

### 5.2 Preferred sequence (V8 then V7)

#### A. `www.neuniversity.org` → `https://neuniversity.org`

1. Open the **V8** Node website dashboard (domain tree `neuniversity.org` / app name ≈ `moovex-platform-v8-testing`).  
2. Note Domains currently attached: expect apex + www + BB + AC.  
3. **Redirects** (Domains → Redirects, or Website Dashboard → Redirects):  
   - Redirect from: `www.neuniversity.org` (empty path / entire host if UI allows)  
   - Redirect to: `https://neuniversity.org` (preserve path if option exists)  
   - Type: **301**  
4. **Unbind** `www.neuniversity.org` from the Node Web App domain list so LiteSpeed/`lsnode` no longer starts a www vhost worker.  
   - Do **not** remove `neuniversity.org`, `blessboard.neuniversity.org`, or `activeclinic.neuniversity.org`.  
5. Confirm SSL still covers www (existing LE SAN) or re-issue if the panel warns.  
6. DNS: keep `www` pointing at Hostinger (A/CNAME) so the redirect endpoint remains reachable — do not point www at an unrelated third party.

#### B. `www.pronline.org` → `https://pronline.org`

1. Open the **V7** Node website dashboard (`pronline.org` / `moovex-platform-testing`).  
2. Same pattern: hPanel **301** www → `https://pronline.org`, then **unbind www only**.  
3. Do **not** remove `pronline.org`, `blessboard.pronline.org`, `activeclinic.pronline.org`, or (this ticket) GetPro/Netraz hosts.

### 5.3 Avoid

- Editing Node-generated `.htaccess` as the sole fix (overwritten on redeploy).  
- Express-only “fix” deploys for Package A.  
- Killing PIDs manually.  
- Unbinding apex hubs or product hosts.  
- Package B or production domain changes.

### 5.4 Idle wait

After unbind, wait **≥60 minutes** with no traffic to www (Hostinger idle stop duration not measured here). Then verify (§6).

---

## 6. Verification checklist (after operator applies)

Mark each after change. Until then, status = **BLOCKED / not run**.

| # | Check | Pass criteria | Status |
|---|-------|---------------|--------|
| 1 | `https://www.neuniversity.org/` | 301 (or edge redirect) → `https://neuniversity.org/` ; HTTPS valid | Not run |
| 2 | `https://www.pronline.org/` | 301 → `https://pronline.org/` ; HTTPS valid | Not run |
| 3 | www `/__platform/runtime` | **No** dedicated Node PID (404/edge/non-JSON, or not sticky app runtime) | Not run |
| 4 | Apex hubs `/healthz` | 200; same deployment codes as baseline | Not run |
| 5 | V8 BB+AC `/healthz` | 200 `moovex-platform-v8-testing`; PIDs still present | Not run |
| 6 | V7 BB+AC `/healthz` | 200 `moovex-platform-testing` (isolation) | Not run |
| 7 | BB V8 login → editor smoke | Login + open website editor | Not run |
| 8 | AC V8 login → editor smoke | Login + open editor / clinic admin | Not run |
| 9 | Publish smoke (one BB or AC) | Draft save / publish succeeds on V8 product host | Not run |
| 10 | V7 isolation script sample | e.g. one `v2-*-hosted.js` still sees V7 BB healthz SHA family | Not run |
| 11 | Production | `blessboard.com` + `activeclinic.org` `/healthz` still `moovex-platform-production` | Not run |
| 12 | PID before/after | www PIDs gone from matrix; other Package A–out-of-scope hosts unchanged | Not run |
| 13 | NPROC | hPanel graph before/after same window — **record only**; do not invent savings | Not available until panel |

### 6.1 Success definition for Package A

- www bookmarks still land on canonical apex over HTTPS.  
- www no longer exposes a **distinct sticky** testing Node PID via `/__platform/runtime`.  
- BB+AC V8 + V7 isolation + production identity unchanged.  
- **Optional:** hPanel Max Processes movement documented if visible — **never** required to claim PASS without measurement.

### 6.2 Failure / rollback triggers

- Apex or product host `/healthz` regression.  
- www TLS errors / redirect loops.  
- Production deployment code change.  
- Accidental unbind of BB/AC hosts.

---

## 7. Rollback

1. Re-attach `www.neuniversity.org` to the V8 Node Web App in hPanel.  
2. Re-attach `www.pronline.org` to the V7 Node Web App.  
3. Delete or disable the Package A panel redirects if they conflict.  
4. Confirm SSL.  
5. Hit www `/` and `/__platform/runtime` — expect restore of sticky PIDs (may take a cold start).  
6. Re-check BB/AC + production `/healthz`.

No git rollback required if no app deploy was made (this session made none).

---

## 8. Measurements summary

| Metric | Before (this session) | After |
|--------|----------------------|-------|
| `www.neuniversity.org` PID | `2308499` | **N/A — change not applied** |
| `www.pronline.org` PID | `1535403` | **N/A** |
| Testing Node PID count (known matrix) | 10 (incl. both www) | Unchanged |
| Est. PID savings if Package A succeeds later | up to **~2** | **Not realized** |
| NPROC | Not measured | Not measured |
| Claimed NPROC savings | — | **None** |

---

## 9. Explicit non-actions

| Action | Status |
|--------|--------|
| hPanel / DNS / SSL / unbind | **Not performed** (no access) |
| Express redirect deploy | **Not performed** (insufficient for PID goal) |
| Package B | **Not performed** |
| Production changes | **Not performed** |
| Process kill / restart | **Not performed** |
| Unmeasured savings claim | **Not claimed** |

---

## Verdict

**`V2_01_PACKAGE_A_BLOCKED`**

Blocked because **Hostinger configuration is inaccessible** from this environment (no hPanel, no account SSH), not because Package A is invalid.

- Baselines recorded (§2).  
- Express www→apex redirect already exists and **does not** retire www workers.  
- Operator must apply hPanel redirect + **unbind www from Node** (§5), then complete verification (§6).  
- Re-open this ticket after operator change to target **`V2_01_PACKAGE_A_QA_PASS`** with before/after PID matrix and optional hPanel NPROC screenshots — still without inventing unmeasured savings.
