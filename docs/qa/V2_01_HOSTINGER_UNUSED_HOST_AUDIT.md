# V2.01 Hostinger Unused Host Audit

**Task:** `V2_01_HOSTINGER_UNUSED_HOST_AUDIT`  
**Date:** 2026-09-25  
**Branch:** `V8` (local tip `e5bd58ad`)  
**Environment:** Testing  
**Account home (runtime probe):** `/home/u549637099`  
**Priority:** P0  
**Mode:** Investigation only — **no** disable, unbind, restart, delete, deploy, or production change  

**Prerequisites:**  
- [`V2_01_HOSTINGER_PROCESS_AUDIT.md`](./V2_01_HOSTINGER_PROCESS_AUDIT.md)  
- [`V2_01_HOSTINGER_WORKER_CONSOLIDATION_PLAN.md`](./V2_01_HOSTINGER_WORKER_CONSOLIDATION_PLAN.md)

**Verdict:** `V2_01_UNUSED_HOST_AUDIT_COMPLETE`

---

## Executive summary

Live HTTPS probes (2026-09-25) still show **10 sticky testing Node PIDs** — **4** on V8 `*.neuniversity.org` (`moovex-platform-v8-testing`, SHA `e5bd58adc7cf`) and **6** on V7 `*.pronline.org` (`moovex-platform-testing`, SHA `03a89106e2fe`). Same build tree ≠ same OS worker.

For **current BlessBoard + ActiveClinic (BB+AC) QA**, keep warm:

| Keep | Why |
|------|-----|
| `blessboard.neuniversity.org` | Primary V8 / V2.0 BB hosted QA |
| `activeclinic.neuniversity.org` | Primary V8 / V2.0 AC hosted QA |
| `blessboard.pronline.org` | V7 isolation / regression (used by most `scripts/local/v2-*-hosted.js`) |
| `activeclinic.pronline.org` | V7 isolation / regression (shared-media + several AC scripts) |
| `neuniversity.org` | V8 platform hub (homepage / auth readiness scripts) |

**Do not assume V7 is unused** because its SHA is older. V2 hosted scripts actively hit V7 BB/AC for “untouched / isolation” checks.

**Strongest retirement candidates (propose only):** `www.neuniversity.org`, `www.pronline.org`, then (with product-owner OK) `getproapp.pronline.org` and `netraz.pronline.org`. Estimated **~2–4 sticky Node PID** savings if those four warm hosts stop receiving Node traffic after idle cleanup — **not** a proven account NPROC drop.

**SSH / hPanel:** Unavailable in this session → account NPROC baseline (113/200), full process composition, and complete Web App list remain **operator-measured**.

**Gate:** Explicit hosting-owner + QA-lead approval required before any unbind/redirect/delete.

---

## 1. Access and measurement baseline

### 1.1 What this session could measure

| Method | Result |
|--------|--------|
| Public `/healthz` | Available |
| Testing `/__platform/runtime` (PID, cwd, deployment) | Available |
| Sticky PID (5 sequential hits / host) | Available — all sticky |
| Authorized SSH to `u549637099` | **Unavailable** — local `ssh` present; **no** Hostinger account keys configured |
| `ps` / `pstree` / full account process list | **NOT AVAILABLE** |
| hPanel Resource Usage / Snapshots / Web Apps list | **NOT AVAILABLE** |
| Account Max Processes avg/peak | **NOT AVAILABLE** here (operator-reported ~113/200 in prior audit) |
| Production `/__platform/runtime` | Correctly **404** — production PIDs not measured |

### 1.2 Testing Node baseline (this probe)

| Line | Unique sticky Node PIDs | Deployment | gitSha | cwd tree |
|------|-------------------------|------------|--------|----------|
| V8 | **4** | `moovex-platform-v8-testing` | `e5bd58adc7cf` | `…/domains/neuniversity.org/hbuilds/versions/01a0d83b-aff4-70e4-9c20-08d34b53d837/nodejs` |
| V7 | **6** | `moovex-platform-testing` | `03a89106e2fe` | `…/domains/pronline.org/hbuilds/versions/01a0bf10-9fda-73e7-8d36-d9e70cc21247/nodejs` |
| **Testing total** | **10** | — | — | Two separate Hostinger release trees |

Jobs: V8 `jobsEnabled: false` on `/healthz`. Media root (both lines): `/home/u549637099/moovex-media`.

### 1.3 Account NPROC baseline

| Metric | Value | Confidence |
|--------|-------|------------|
| Plan Max Processes | **200** (account-wide) | High (prior audit / Hostinger docs) |
| Reported average | ~**113**/200 | Medium — operator/prior audit; **not re-read** from hPanel |
| Peak / red-line hits | **NOT AVAILABLE** | Need hPanel history |
| Share attributable to these 10 Node PIDs | **Unknown** | Other apps, PHP, cron, mail, production Node also count |
| Claim “retire N hosts ⇒ NPROC −N” | **Forbidden** until before/after hPanel graph | — |

---

## 2. Hostname matrix (live probe 2026-09-25)

Classification legend:

| Class | Meaning |
|-------|---------|
| **REQUIRED** | Needed for current BB+AC QA and/or V7 isolation used by current V2 scripts |
| **POTENTIALLY UNUSED** | Warm worker observed; no current BB+AC QA dependency found — still needs owner confirmation before retire |
| **UNKNOWN** | Insufficient evidence (503/TLS/DNS/no runtime) — inventory in hPanel first |
| **PRODUCTION — DO NOT TOUCH** | Live or production-adjacent product TLD / corporate surface |

### 2.1 V8 testing (`neuniversity.org`)

| Hostname | Role | PID | Class | QA evidence |
|----------|------|-----|-------|-------------|
| `blessboard.neuniversity.org` | BlessBoard product | `2018658` | **REQUIRED** | Default base for V2 BB hosted scripts |
| `activeclinic.neuniversity.org` | ActiveClinic product | `2308239` | **REQUIRED** | Default base for V2 AC hosted scripts |
| `neuniversity.org` | Platform hub | `1992434` | **REQUIRED** | `v8-hosted-auth-qa-*`, `v8-qa-readiness-p42-hosted.js`; homepage version QA docs |
| `www.neuniversity.org` | Hub www alias (`redirectTargetOrigin` → apex) | `2308499` | **POTENTIALLY UNUSED** | No V2/V8 script defaults; separate sticky PID |

Sticky: 5/5 identical PID per host. All four: `deploymentCode=moovex-platform-v8-testing`, `gitSha=e5bd58adc7cf`.

### 2.2 V7 testing (`pronline.org`)

| Hostname | Role | PID | Class | QA evidence |
|----------|------|-----|-------|-------------|
| `blessboard.pronline.org` | BlessBoard V7 | `107171` | **REQUIRED** | Hard-coded `V7_BB` in most `v2-bb-*-hosted.js` + shared media scripts |
| `activeclinic.pronline.org` | ActiveClinic V7 | `798264` | **REQUIRED** | `V7_AC` / isolation in shared-media + several AC hosted scripts |
| `pronline.org` | Platform hub | `522765` | **POTENTIALLY UNUSED** *(for BB+AC)* | Not referenced by current V2 script defaults; may still matter for V7 hub QA |
| `www.pronline.org` | Hub www alias → apex | `1535403` | **POTENTIALLY UNUSED** | No current V2 script use; separate sticky PID |
| `getproapp.pronline.org` | GetPro testing | `1535714` | **POTENTIALLY UNUSED** *(for BB+AC)* | Canonical GetPro testing host — **not** BB+AC; retiring breaks GetPro testing |
| `netraz.pronline.org` | Netraz / NGO testing | `1536024` | **POTENTIALLY UNUSED** *(for BB+AC)* | Canonical Netraz testing host — **not** BB+AC |

Sticky: 5/5 identical PID per host. All six: `deploymentCode=moovex-platform-testing`, `gitSha=03a89106e2fe`.

**Important:** Older V7 SHA ≠ unused. Treat V7 BB+AC as **required** until QA lead explicitly ends V7 isolation checks.

### 2.3 Registry aliases with no warm worker (DNS)

| Hostname | Probe | Class |
|----------|-------|-------|
| `getpro.pronline.org` | `ENOTFOUND` | **UNKNOWN** / not live — no PID to retire |
| `moovex.pronline.org` | `ENOTFOUND` | **UNKNOWN** / not live — no PID to retire |

### 2.4 Production and other account surfaces

| Hostname | `/healthz` | Class | Notes |
|----------|------------|-------|-------|
| `blessboard.com`, `www.blessboard.com` | 200 `moovex-platform-production` SHA `03a89106e2fe` | **PRODUCTION — DO NOT TOUCH** | Runtime gated 404 |
| `activeclinic.org`, `www.activeclinic.org` | 200 same | **PRODUCTION — DO NOT TOUCH** | Runtime gated 404 |
| `getproapp.org`, `www.getproapp.org` | 503 edge HTML | **PRODUCTION — DO NOT TOUCH** | May still bind workers; investigate separately |
| `netraz.org`, `www.netraz.org` | 503 | **PRODUCTION — DO NOT TOUCH** | Same |
| `moovex.org`, `www.moovex.org` | 404 “Page not found” | **UNKNOWN** / corporate — **do not touch** without inventory |
| `blessboard.org`, `www.blessboard.org` | TLS alert / error | **UNKNOWN** (legacy path in ops docs) | hPanel first |
| `funsong.org` | 503 | **UNKNOWN** | Out of BB+AC scope |

Production Node PID count: **NOT MEASURED** (by design).

---

## 3. What current BB+AC QA actually needs

### 3.1 Primary V2.0 / V8 product surfaces

- `https://blessboard.neuniversity.org`
- `https://activeclinic.neuniversity.org`

### 3.2 V7 isolation still wired into V2 scripts

Examples (non-exhaustive): `v2-bb-*-hosted.js`, `v2-shared-media-*-hosted.js`, `v2-ac-doctor-image-hosted.js`, `v2-ac-service-card-edit-hosted.js` compare or health-check:

- `https://blessboard.pronline.org`
- `https://activeclinic.pronline.org` (sometimes mislabeled `PROD` in script env names — still the **V7 testing** host)

### 3.3 V8 hub (keep)

- `https://neuniversity.org` — auth readiness / homepage version gates

### 3.4 Not required for BB+AC

- `www.neuniversity.org`, `www.pronline.org`
- `getproapp.pronline.org`, `netraz.pronline.org` (other products)
- Production TLDs (never retire for NPROC relief in this ticket)

---

## 4. Deployment identities (do not conflate)

| Surface | Application deployment code | Platform line | DB identity (shared testing) | Media write ns (docs) |
|---------|----------------------------|---------------|------------------------------|------------------------|
| V8 hosts | `moovex-platform-v8-testing` | `v8` | `moovex-platform-v7` / `testing` | `testing-v8/` |
| V7 hosts | `moovex-platform-testing` | `v7` | same DB identity | `testing/` |
| Production BB/AC | `moovex-platform-production` | production | production DB | production |

Merging V7+V8 workers or secrets is **out of scope and forbidden** by isolation policy. This audit only considers **fewer warm hostnames**.

---

## 5. Estimated worker savings (Node PIDs only)

Assumptions: Hostinger eventually stops idle per-vhost workers after traffic ceases; one sticky PID ≈ one warm Node worker today. **NPROC impact unmeasured.**

| Package | Hosts proposed | Est. PID savings | Preconditions |
|---------|----------------|------------------|---------------|
| **A — Safe www aliases** | `www.neuniversity.org`, `www.pronline.org` | **~2** | DNS/panel redirect to apex **without** Node binding; QA OK with apex-only bookmarks |
| **B — Non-BB/AC testing products** | `getproapp.pronline.org`, `netraz.pronline.org` | **~2** | GetPro + Netraz owners confirm no near-term hosted testing |
| **C — V7 hub** | `pronline.org` | **~1** | No V7 hub landing QA; optional after A+B |
| **D — V8 hub** | `neuniversity.org` | **~1** | **High risk** — breaks hub scripts/docs; only if QA moves all checks to product hosts |
| **Keep floor** | V8 BB+AC + V7 BB+AC (+ preferably V8 apex) | — | **4–5** workers remain for BB+AC |

| Scenario | Remaining testing Node PIDs (approx.) | Savings vs 10 |
|----------|----------------------------------------|---------------|
| Status quo | 10 | 0 |
| A only | ~8 | ~2 |
| A + B | ~6 | ~4 |
| A + B + C (keep V8 hub + BB/AC both lines) | ~5 | ~5 |
| A + B + C + D (BB/AC both lines only) | ~4 | ~6 |

**Do not claim:** PID savings = Max Processes graph drop, or improved throughput.

Pool side-effect (separate from NPROC): fewer workers ⇒ fewer PG pools (default max **5** each). Informative only.

---

## 6. Proposed retirement sequence (approval-gated)

**Nothing below is authorized by this document.**

### Phase 0 — Operator baselines (before any change)

1. hPanel → Resource Usage: screenshot Max Processes (6h/24h) avg + any red shading.  
2. Snapshots: top PID/CMD list (note `node` / `lsnode` count).  
3. Websites / Node.js apps: list every app + attached domains for account `u549637099`.  
4. Re-capture testing PID matrix via `/__platform/runtime` (script or manual).  
5. Optional SSH (read-only): `ps -u $USER -o pid,ppid,rss,etime,cmd | head -200`.

### Phase 1 — Package A (lowest risk)

1. Confirm no bookmarks/monitors depend on `www.*` Node responses.  
2. With approval: panel redirect or DNS-only www → apex; **unbind www from Node** (prefer redirect at edge).  
3. Wait Hostinger idle window (docs: processes stop after idle — duration **NOT MEASURED** here; plan **≥60 minutes** quiet).  
4. Re-probe: `www.*` should not return a distinct Node PID (or should not hit Node). Apex + product hosts unchanged.  
5. Compare hPanel Max Processes same window length.

### Phase 2 — Package B (product-owner gate)

1. Written OK from GetPro and Netraz owners (or explicit “no hosted testing this quarter”).  
2. Unbind/park `getproapp.pronline.org` and `netraz.pronline.org` from the V7 Node app **or** stop traffic so workers can idle out.  
3. Re-probe PID matrix; confirm V7 BB+AC + hubs (if kept) still healthy.  
4. Do **not** delete DNS zones without rollback plan.

### Phase 3 — Package C (optional)

1. QA lead confirms V7 hub unused.  
2. Unbind `pronline.org` hub from Node **or** redirect to a static/maintenance page outside Node — only if that still meets ops needs.  
3. Prefer keeping V7 BB+AC bindings intact.

### Phase 4 — Package D (discouraged while hub scripts exist)

1. Update all scripts/docs off `neuniversity.org` hub first.  
2. Only then consider unbinding apex Node.  
3. Prefer **keep** apex until hub QA is retired in code/docs.

### Explicit non-sequence

- Do not retire V8 BB/AC or V7 BB/AC for NPROC relief while V2 isolation scripts remain.  
- Do not touch production TLDs.  
- Do not kill PIDs manually as a “cleanup.”  
- Do not merge V7/V8 apps to chase one PID (see consolidation plan — multi-domain ≠ one worker).

---

## 7. Dependencies and risks

| Dependency / risk | Note |
|-------------------|------|
| Per-hostname `lsnode` spawn | Unbinding a host is the realistic savings path; Topology A already failed to share PIDs |
| Idle stop delay | Workers may stay warm after last hit; verify after quiet window |
| GetPro / Netraz | Package B is BB+AC-NPROC-favorable but product-hostile if those teams still test |
| V7 isolation scripts | Retiring V7 BB/AC would break many V2 hosted scripts — **not** proposed |
| www bookmarks | Users hitting www may get redirect; ensure SSL/redirect loop-free |
| MEDIA_PUBLIC_BASE_URL | Often points at BB host; unrelated to www retirement |
| Production 503 hosts | May still consume processes — **UNKNOWN**; hPanel inventory required; still **DO NOT TOUCH** here |
| False NPROC win | Cutting 2–4 Node PIDs may be invisible on a 113 average if other processes dominate |

---

## 8. Verification (after any approved change)

| Check | Pass criteria |
|-------|---------------|
| V8 BB `/healthz` | 200, `moovex-platform-v8-testing`, expected SHA |
| V8 AC `/healthz` | Same family |
| V8 apex `/healthz` (if kept) | Same family |
| V7 BB + V7 AC `/healthz` | 200, `moovex-platform-testing`, expected SHA |
| PID matrix | Retired hosts absent or non-Node; kept hosts sticky PIDs still distinct as today |
| Sample V2 script | One BB + one AC hosted smoke still PASS |
| V7 isolation healthz in script | Still 200 if script still calls V7 |
| Production BB/AC `/healthz` | Unchanged 200 `moovex-platform-production` |
| hPanel Max Processes | Record before/after; **do not claim success** without graph movement |

---

## 9. Rollback

1. Re-attach domains to the prior Node Web App in hPanel (V8 → `neuniversity.org` tree; V7 → `pronline.org` tree).  
2. Restore DNS/SSL if changed.  
3. Issue traffic to re-warm workers; confirm `/healthz` + runtime PID present.  
4. Re-run one BB + one AC hosted smoke.  
5. Confirm production `/healthz` untouched.  
6. Document whether NPROC/PID returned to baseline.

No application code rollback required for pure hostname unbind/redirect.

---

## 10. Manual verification procedure (missing SSH / hPanel)

Use when agent session lacks panel/SSH (current state).

### 10.1 PID matrix (anyone with HTTPS)

```bash
# Prefer node if curl missing; example with curl:
for h in \
  blessboard.neuniversity.org activeclinic.neuniversity.org neuniversity.org www.neuniversity.org \
  blessboard.pronline.org activeclinic.pronline.org pronline.org www.pronline.org \
  getproapp.pronline.org netraz.pronline.org
do
  echo "==== $h"
  curl -sS -m 20 "https://$h/healthz" | head -c 400; echo
  curl -sS -m 20 "https://$h/__platform/runtime" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);console.log({pid:j.pid,deploymentCode:j.deploymentCode,gitSha:j.gitSha,cwd:j.mediaPersistence&&j.mediaPersistence.cwd})}catch(e){console.log(d.slice(0,200))}})'
done
```

Sticky check: hit each host 5×; PID must not flip within host; hosts must not share PIDs today.

### 10.2 hPanel (operator)

1. Login → **Resource Usage** → Max Processes (note avg/peak, timezone GMT+0).  
2. **Snapshots** → export/list CMD containing `node` / `lsnode`.  
3. **Websites** / Node.js → list apps, domains, status (Running/Stopped).  
4. Identify leftovers: `blessboard.org`, `funsong.org`, GetPro/Netraz production, parked sites.  
5. Store screenshots in ops ticket (not secrets).

### 10.3 SSH (if authorized later)

```bash
ps -u "$USER" -o pid,ppid,rss,etime,cmd | sort -n
# Optional: count node/lsnode
ps -u "$USER" -o cmd | grep -E 'node|lsnode' | grep -v grep | wc -l
```

Read-only. Do not `kill`.

### 10.4 Idle experiment (coordinated)

1. Close all QA browsers.  
2. Stop monitors hitting testing hosts if possible.  
3. Wait ≥60 minutes.  
4. hPanel snapshot + re-probe PID matrix **without** waking retired candidates first.  
5. Then probe required BB+AC hosts only.

---

## 11. Approvals required before hosting changes

| Approver | Scope |
|----------|-------|
| Hosting owner | Any domain unbind, redirect, Web App stop/delete |
| QA lead | Confirm BB+AC required set; approve Package C/D |
| GetPro / Netraz owners | Package B |
| **None for this investigation** | No changes performed |

Production remains **out of scope**.

---

## 12. Explicit non-actions (this task)

| Action | Status |
|--------|--------|
| Disable / unbind / delete applications or domains | **Not done** |
| Restart / kill processes | **Not done** |
| Deploy / config / DB / code change | **Not done** |
| Production changes | **Not done** |
| Claim Topology A PID merge | **Not claimed** (prior plan: unverified / contradicted) |

---

## 13. Findings classification

| Finding | Class |
|---------|--------|
| 10 sticky testing Node PIDs (4 V8 + 6 V7) | **CONFIRMED** (this probe) |
| Current BB+AC QA requires V8 BB+AC | **CONFIRMED** |
| Current V2 scripts still require V7 BB+AC for isolation | **CONFIRMED** |
| V8 apex used by hub/readiness QA | **CONFIRMED** |
| `www.*` hubs are retirement candidates | **LIKELY** / propose-only |
| GetPro/Netraz testing hosts unused by BB+AC | **CONFIRMED** for BB+AC; **not** proof those products are idle |
| Older V7 SHA ⇒ safe to retire V7 BB+AC | **NOT SUPPORTED** |
| Account NPROC composition / 113 baseline re-measure | **NOT MEASURED** (no hPanel/SSH) |
| Retiring hosts ⇒ proven NPROC drop | **NOT SUPPORTED** as a claim yet |

---

## Verdict (restated)

**`V2_01_UNUSED_HOST_AUDIT_COMPLETE`**

- **Required warm hosts for current BB+AC QA:** V8 BB, V8 AC, V8 apex (`neuniversity.org`), V7 BB, V7 AC.  
- **Best propose-only cuts:** `www.neuniversity.org`, `www.pronline.org`, then GetPro/Netraz testing hosts with product-owner approval (~**2–4** Node PID savings).  
- **Production / unknown TLDs:** inventory only — **DO NOT TOUCH**.  
- **NPROC baseline:** document operator hPanel/SSH procedure; this session could not establish account-wide process composition.  
- **Next step:** request explicit approval for Package A (www unbind/redirect) before any hosting change.
