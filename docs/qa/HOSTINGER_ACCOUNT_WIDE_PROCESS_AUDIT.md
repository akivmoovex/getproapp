# Hostinger Account-Wide Process Audit

**Task:** `HOSTINGER_ACCOUNT_WIDE_PROCESS_AUDIT`  
**Date:** 2026-09-25  
**Plan:** Hostinger Cloud Startup  
**Account NPROC ceiling:** **200** (account-wide)  
**Reported average:** ~**113**/200 (operator-reported; **not re-read** from hPanel in this session)  
**Account home (testing runtime):** `/home/u549637099`  
**Mode:** Investigation only — **no** hosting changes, restarts, process kills, or production modifications  

**Prior work (not repeated):**  
- [`V2_01_HOSTINGER_PROCESS_AUDIT.md`](./V2_01_HOSTINGER_PROCESS_AUDIT.md) — NPROC definition; per-hostname Node PID model; V8 jobs off; pool log mismatch  
- [`V2_01_HOSTINGER_WORKER_CONSOLIDATION_PLAN.md`](./V2_01_HOSTINGER_WORKER_CONSOLIDATION_PLAN.md) — Topology A unverified; app can share worker, Hostinger does not  
- [`V2_01_HOSTINGER_UNUSED_HOST_AUDIT.md`](./V2_01_HOSTINGER_UNUSED_HOST_AUDIT.md) — Package A–D retirement candidates  
- [`V2_01_HOSTINGER_PACKAGE_A_QA.md`](./V2_01_HOSTINGER_PACKAGE_A_QA.md) — Package A **BLOCKED** (no hPanel); Express www redirect ≠ worker retirement  

**Verdict:** `ACCOUNT_PROCESS_AUDIT_INCOMPLETE`

---

## Executive summary

Public HTTPS probes inventory **Moovex/GetPro-related surfaces** on Hostinger-like edge IPs and measure **10 sticky testing Node PIDs** (4 V8 + 6 V7). Production BlessBoard/ActiveClinic answer `/healthz` as `moovex-platform-production` but **PIDs are gated** (runtime 404). Several TLDs return **503** or TLS failure — worker presence **unknown** without hPanel/`ps`.

**Confirmed bottleneck (carried forward + re-confirmed):** account-wide NPROC is dominated by **how many long-lived OS processes exist**, especially **one LiteSpeed/`lsnode` Node PID per attached hostname**, not by a few QA editors. V2.01 already proved this on testing; this audit extends the **website map** and states what remains unmeasured for the full ~113 average.

**Cannot complete** full account process distribution: **no SSH**, **no hPanel**, therefore no account-wide `ps`, no CPU/RAM/defunct inventory, no NPROC avg/peak under activity scenarios, and no authoritative list of all nine Websites slots.

**`netra.org` is not this Hostinger account** (Google frontend IPs; WordPress “New England Trail Rider Association”). Likely meant **`netraz.org`**.

---

## 1. Access and measurement capability

| Method | Result |
|--------|--------|
| Public `/healthz` | Available where app exposes it |
| Testing `/__platform/runtime` (PID, cwd, deploy) | Available on V7/V8 testing hosts |
| Production `/__platform/runtime` | **404** by design — production PIDs **not measurable** publicly |
| Authorized SSH to `u549637099` | **Unavailable** (no Hostinger account keys in this environment) |
| hPanel Websites / Resource Usage / Snapshots | **Unavailable** |
| Account-wide process list, idle vs active, defunct, CPU/RAM | **NOT AVAILABLE** |
| Controlled concurrent-user NPROC experiment | **NOT AVAILABLE** (needs panel graphs + coordinated idle) |

**Do not infer** unmeasured PHP/cron/mail/production Node counts.

---

## 2. Nine-website hypothesis vs observed surfaces

Operator statement: **nine websites**, including named TLDs plus **two unidentified**.

| # | Candidate apex | On Hostinger-like DNS? | Live signal (2026-09-25) | Likely Website slot? |
|---|----------------|------------------------|---------------------------|----------------------|
| 1 | `blessboard.com` | Yes (`77.37.*` / `93.127.*`) | 200 production Node | **Yes** |
| 2 | `activeclinic.org` | Yes | 200 production Node | **Yes** |
| 3 | `pronline.org` | Yes | 200 V7 testing Node | **Yes** |
| 4 | `neuniversity.org` | Yes | 200 V8 testing Node | **Yes** |
| 5 | `moovex.org` | Yes | 200 HTML, `X-Powered-By: Express`, no Moovex `/healthz` | **Yes** (separate Express app) |
| 6 | `netraz.org` | Yes | **503** hCDN (no upstream RT) | **Yes** (slot may exist; worker down/missing) |
| 7 | `getproapp.org` | Yes | **503** hCDN | **Likely** “unidentified” #1 |
| 8 | `funsong.org` | DNS `82.29.183.132`, **LiteSpeed 503** | Different IP family than BB/AC | **Verify in hPanel** — may be slot #8 or external |
| 9 | `blessboard.org` | DNS `2.57.91.91`, **TLS alert** | Ops docs cite `domains/blessboard.org/nodejs` | **Verify in hPanel** — may be slot #9 / legacy |

**Not account:** `netra.org` / `www.netra.org` → Google IPs, nginx, unrelated WordPress. Exclude from NPROC accounting for this plan.

**Authoritative nine-site list:** still requires hPanel → Websites. Candidates above are evidence-based, not a panel export.

---

## 3. Website / subdomain inventory (measured)

### 3.1 Production product TLDs (DO NOT TOUCH)

| Hostname | App type | Deploy / env | gitSha | Jobs | Node PID | Notes |
|----------|----------|--------------|--------|------|----------|-------|
| `blessboard.com` | Node Moovex platform | `moovex-platform-production` / production | `03a89106e2fe` | Not exposed on healthz here | **NOT AVAILABLE** | Upstream RT present |
| `www.blessboard.com` | same | same | same | — | **NOT AVAILABLE** | May be separate vhost worker (unknown) |
| `activeclinic.org` | Node Moovex | same | same | — | **NOT AVAILABLE** | |
| `www.activeclinic.org` | same | same | same | — | **NOT AVAILABLE** | |

Production runtime diagnostics gated → **cannot** count production Node workers from outside.

### 3.2 V8 testing tree — cwd `…/domains/neuniversity.org/hbuilds/versions/01a0d83b-…/nodejs`

| Hostname | Role | Deploy | gitSha | Jobs | Sticky PID |
|----------|------|--------|--------|------|------------|
| `blessboard.neuniversity.org` | BB product | `moovex-platform-v8-testing` | `e5bd58adc7cf` | `false` | `2018658` |
| `activeclinic.neuniversity.org` | AC product | same | same | `false` | `2308239` |
| `neuniversity.org` | QA hub | same | same | `false` | `1992434` |
| `www.neuniversity.org` | Hub www (Express 301 → apex) | same | same | `false` | `2308499` |

**V8 unique Node PIDs measured: 4** (re-confirmed sticky).

### 3.3 V7 testing tree — cwd `…/domains/pronline.org/hbuilds/versions/01a0bf10-…/nodejs`

| Hostname | Role | Deploy | gitSha | Sticky PID |
|----------|------|--------|--------|------------|
| `blessboard.pronline.org` | BB V7 (still used by V2 isolation scripts) | `moovex-platform-testing` | `03a89106e2fe` | `107171` |
| `activeclinic.pronline.org` | AC V7 | same | same | `798264` |
| `pronline.org` | QA hub | same | same | `522765` |
| `www.pronline.org` | Hub www (301 → apex) | same | same | `1535403` |
| `getproapp.pronline.org` | GetPro testing | same | same | `1535714` |
| `netraz.pronline.org` | Netraz testing | same | same | `1536024` |

**V7 unique Node PIDs measured: 6**.  
**Do not assume older SHA ⇒ unused** — V2 hosted scripts still hit V7 BB/AC.

DNS NXDOMAIN (no worker): `getpro.pronline.org`, `moovex.pronline.org`.

### 3.4 Other apex candidates

| Hostname | Signal | Process implication |
|----------|--------|---------------------|
| `moovex.org`, `www.moovex.org` | 200 corporate HTML; `Express`; `/healthz` = “Page not found” | **Likely separate Express/Node app** when warm; PID **NOT AVAILABLE** publicly |
| `netraz.org`, `www.netraz.org` | 503 hCDN, no upstream RT | Edge up; **Node upstream not proven**; may still reserve Website slot / idle leftovers — **UNKNOWN** process count |
| `getproapp.org`, `www.getproapp.org` | 503 hCDN | Same as netraz production |
| `funsong.org`, `www.funsong.org` | 503 LiteSpeed | Confirm ownership in hPanel; process count **UNKNOWN** |
| `blessboard.org`, `www.blessboard.org` | TLS internal error | Legacy path in ops docs; live app **not proven**; **UNKNOWN** |

### 3.5 Measured testing Node total (this session)

| Bucket | Count |
|--------|-------|
| Distinct sticky testing Node PIDs | **10** |
| Production Moovex Node PIDs | **NOT AVAILABLE** (≥1 expected; www may multiply) |
| `moovex.org` Express PIDs | **NOT AVAILABLE** |
| PHP / cron / mail / panel helpers / defunct | **NOT AVAILABLE** |
| Sum vs ~113 NPROC average | **Gap** — 10 measured testing Node PIDs explain only a **fraction**; remainder unmeasured |

---

## 4. Activity / load scenarios

| Scenario | NPROC avg/peak | Notes |
|----------|----------------|-------|
| Minimal activity (browsers closed, idle) | **NOT MEASURED** | Needs hPanel + quiet window |
| Normal traffic | **NOT MEASURED** | |
| Active BB+AC editing | **NOT MEASURED** (process metric) | App activity ≠ NPROC root cause (V2.01) |
| Controlled concurrent users | **NOT RUN** as NPROC test | No uncontrolled load tests |

**Light concurrency smoke only (not a load test):** 3 parallel V8 requests (BB healthz, AC healthz, BB login) → all **200**, wall ~664 ms. Does **not** establish NPROC behavior.

Operator-reported ~**113** average remains the only account-wide figure; peak **NOT AVAILABLE** here.

---

## 5. Confirmed bottlenecks and unnecessary-process candidates

### 5.1 Confirmed (evidence-based)

| Finding | Layer | Evidence |
|---------|-------|----------|
| NPROC is account-wide OS process ceiling (200) | Hostinger metric | Prior audit + Hostinger docs |
| One sticky Node PID per hostname on shared testing trees | Hostinger/LiteSpeed | 10 PIDs re-probed this session |
| Multi-domain Web App ≠ one OS worker | Hostinger | Same cwd, different PIDs |
| V8 app jobs not multiplying processes | Application | `jobsEnabled: false` |
| QA user count is not primary NPROC driver | Interpretation | Long-lived workers dominate baseline |

### 5.2 Likely unnecessary / duplicate (propose only — do not delete)

| Candidate | Why | Risk if removed |
|-----------|-----|-----------------|
| `www.neuniversity.org` worker | Duplicate of apex; Package A | Bookmarks to www |
| `www.pronline.org` worker | Same | Same |
| `getproapp.pronline.org` / `netraz.pronline.org` workers | Not required for current BB+AC QA | Breaks GetPro/Netraz testing |
| V7 hub `pronline.org` | Optional for BB+AC product QA | Breaks V7 hub landing |
| 503 production GetPro/Netraz slots | May be idle Website/app leftovers | Confirm owners; **do not disable production** blindly |
| Legacy `blessboard.org` tree | Historical V5 path; TLS broken | Confirm unused in hPanel first |
| `funsong.org` | 503; unclear product | Confirm account membership |

**Keep for current BB+AC QA:** V8 BB+AC (+ preferably V8 apex), V7 BB+AC for isolation scripts.  
**Production BB/AC:** **DO NOT TOUCH**.

### 5.3 Not confirmed as unnecessary

| Item | Reason |
|------|--------|
| Entire V7 testing line | Still required for isolation; older SHA ≠ unused |
| Production BB/AC www hosts | May be required for SEO/certs; PID cost unknown |
| `moovex.org` Express | Live corporate site |
| “Defunct” processes | **Not observed** (no `ps`) |

---

## 6. Data gaps (why verdict is INCOMPLETE)

1. Full hPanel **Websites** list (exact nine) and Node vs PHP vs Builder mapping.  
2. Account-wide `ps` / snapshots (node, lsnode, php, cron, mail, defunct).  
3. Production Node PID count (www vs apex).  
4. Whether 503 sites still hold warm/idle workers.  
5. NPROC average/peak screenshots matching “113”.  
6. Idle vs editing vs multi-user NPROC deltas.  
7. CPU/RAM per process.  
8. Confirmation that `funsong.org` / `blessboard.org` are on this Cloud Startup account.

---

## 7. Prioritized optimization plan (no changes in this task)

Distinguish layers. **Approval required** before any Hostinger change. Prefer measurement after each step.

| Priority | Action | Layer | Expected effect | Depends on |
|----------|--------|-------|-----------------|------------|
| **P0** | Operator: hPanel snapshot + Websites export + Max Processes graph | Hostinger ops | Completes audit → can re-verdict COMPLETE | Panel access |
| **P0** | SSH read-only `ps` (if authorized) | Hostinger ops | Exact process composition | SSH key |
| **P1** | Package A: edge redirect + **unbind** www hubs from Node ([Package A QA](./V2_01_HOSTINGER_PACKAGE_A_QA.md)) | Hostinger | Up to **~2** testing Node PIDs | hPanel; already documented |
| **P2** | Product-owner gate: unbind GetPro/Netraz **testing** hosts if unused | Hostinger | Up to **~2** PIDs | Owners |
| **P3** | Inventory 503 TLDs (`getproapp.org`, `netraz.org`, `funsong.org`) — stop/park **only if** confirmed unused non-production | Hostinger | Unknown | Panel + owners |
| **P3** | Resolve `blessboard.org` TLS / legacy Node tree | Hostinger | Unknown | Panel |
| **P4** | Ask Hostinger support whether multi-domain Node can share one `lsnode` PID on Cloud Startup | Hostinger | May close consolidation myth | Support ticket |
| **Avoid as NPROC fix** | Raise `GETPRO_PG_POOL_MAX`; enable V8 jobs; kill random PIDs; delete production sites | App / reckless ops | Wrong resource or outage | — |
| **App follow-ups** (non-blocking) | Align pool log default; optional stable `processBootAt` on testing runtime | Application | Diagnostics only | Separate ticket |

**Do not claim** PID savings = NPROC drop until hPanel before/after graphs agree.

---

## 8. Concise Hostinger support request

Use if panel/SSH still unavailable to the engineering agent, or to clarify process model:

> **Subject:** Cloud Startup — Max Processes (NPROC) composition and Node.js multi-domain workers  
>  
> Account username: `u549637099` (confirm). Plan: Cloud Startup, Max Processes **200**, Resource Usage average ~**113**.  
>  
> We observe LiteSpeed/`lsnode` starting a **separate Node PID per hostname** even when several hostnames share one Node Web App / release directory (verified on testing domains under `neuniversity.org` and `pronline.org`).  
>  
> Please confirm:  
> 1) Is one Node process per vhost/hostname expected on this plan?  
> 2) Is there a supported way for multiple domains on one Node Web App to share a **single** Node PID?  
> 3) Can you provide (or enable us to export) a current process snapshot grouped by CMD for our account during a quiet window?  
>  
> We are **not** requesting production changes—only clarification and inventory guidance.

---

## 9. Operator checklist to finish this audit

- [ ] hPanel → Websites: list all **9** (name, type Node/PHP/Builder, domains attached, status).  
- [ ] hPanel → Resource Usage: Max Processes 6h/24h screenshot (avg + peak/red).  
- [ ] Snapshots: top processes by CMD during idle and during BB+AC edit.  
- [ ] SSH (optional): `ps -u $USER -o pid,ppid,rss,etime,cmd`.  
- [ ] For each 503/TLS-failed apex: Running vs Stopped Web App?  
- [ ] Re-probe testing PID matrix after any approved Package A change.  
- [ ] Update this doc and flip verdict to **`ACCOUNT_PROCESS_AUDIT_COMPLETE`** when §6 gaps are closed.

---

## 10. Explicit non-actions (this task)

| Action | Status |
|--------|--------|
| Delete / disable websites | **Not done** |
| Unbind domains / Package A apply | **Not done** |
| Restart / kill processes | **Not done** |
| Production modifications | **Not done** |
| Uncontrolled load tests | **Not done** |
| Invented process counts | **Not done** |

---

## Verdict

**`ACCOUNT_PROCESS_AUDIT_INCOMPLETE`**

**Completed:** account-oriented **public inventory** of named TLDs/subdomains; re-confirmed **10** testing Node PIDs; clarified **`netra.org` ≠ account**; mapped likely nine-site candidates; restated confirmed Hostinger per-hostname worker bottleneck; prioritized optimization plan + support blurb.

**Incomplete:** account-wide process composition vs ~113 NPROC, production/other-app PIDs, CPU/RAM/defunct, activity-scenario NPROC, and authoritative Websites list — all blocked on **missing Hostinger SSH/hPanel access**.
