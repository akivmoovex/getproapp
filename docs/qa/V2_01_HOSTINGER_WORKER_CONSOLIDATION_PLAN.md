# V2.01 Hostinger Worker Consolidation Plan

**Task:** `V2_01_HOSTINGER_WORKER_CONSOLIDATION`  
**Date:** 2026-09-25  
**Branch:** `V8`  
**Deployment in focus:** `moovex-platform-v8-testing`  
**Account home (runtime probe):** `/home/u549637099`  
**Priority:** P0  
**Mode:** Investigation only — no deploy, restart, process kill, hosting change, or production modification  

**Prerequisite:** [`V2_01_HOSTINGER_PROCESS_AUDIT.md`](./V2_01_HOSTINGER_PROCESS_AUDIT.md)  
**Account Max Processes:** NPROC **200** (account-wide); graph average ~**113** (operator-reported; not re-measured here)

---

## Verdict

**`V2_01_WORKER_CONSOLIDATION_UNVERIFIED`**

| Layer | Finding |
|-------|---------|
| Application (BB+AC on one Node process) | **Feasible and already designed** — hostname product selection, host-only cookies, V8 apex allowlist, shared testing DB identity |
| Hostinger “Topology A” (multi-domain → one OS worker) | **Not demonstrated** — V8 already shares one build tree / deployment code, yet live probes still show **one sticky PID per hostname** |
| Documented Hostinger control to force one PID for N domains | **Not found** in official Node.js Web App docs; LiteSpeed/`lsnode` evidence and live probes imply **per-vhost spawn** |
| Ops path: fewer warm hostnames (retire/unbind unused) | **Feasible to propose** for worker-count reduction **without** claiming PID merge — still requires operator approval + before/after PID matrix |

Consolidation that **actually reduces Node PIDs** is therefore **unverified** until Hostinger support / hPanel experiment proves a binding that collapses PIDs. Do **not** equate “domains attached to one Web App” with “one worker.”

---

## Executive summary

V8 testing already runs as **one application identity** (`moovex-platform-v8-testing`) from **one release tree** under `domains/neuniversity.org/hbuilds/versions/…/nodejs`. That is **shared codebase / shared deploy**, not a **shared OS process**.

Re-probed 2026-09-25: **4 distinct sticky Node PIDs** for the four V8 hostnames; **6** for V7 `*.pronline.org` testing — **10** testing Node workers before production and other account processes.

Hostinger documents on-demand Node processes that stop when idle, and allows Method-2 subdomains “as part of” a Node website, but does **not** document a guarantee that multiple hostnames share one `lsnode` PID. LiteSpeed documentation describes on-demand `lsnode` spawn and idle-process accumulation under one account UID — consistent with the observed per-hostname PID matrix.

Application isolation for BB+AC on a **hypothetical** single worker is acceptable (host-only cookies; product from `Host`; deployment cookie names; media write namespace `testing-v8`). Remaining shared-worker risks are operational (blast radius, CPU/RAM, one pool, absolute `MEDIA_PUBLIC_BASE_URL` origin skew), not automatic cross-domain session leakage.

---

## Phase 1 — V8 inventory

### 1.1 Hostnames, products, deployment

| Hostname | Product / role | Profile | Cookie (runtime profile) | Observed PID (2026-09-25) | gitSha |
|----------|----------------|---------|--------------------------|---------------------------|--------|
| `blessboard.neuniversity.org` | BlessBoard | `moovex-platform-v8-testing` | `moovex_platform_v8_testing_sid` / `_csrf` | `2018658` | `e5bd58adc7cf` |
| `activeclinic.neuniversity.org` | ActiveClinic | same | same names (host-only) | `2308239` | `e5bd58adc7cf` |
| `neuniversity.org` | Platform hub | same | same | `1992434` | `e5bd58adc7cf` |
| `www.neuniversity.org` | Hub alias (redirect target in registry) | same | same | `2308499` | `e5bd58adc7cf` |

**Sticky check:** 5 sequential hits per BB/AC host → same PID each; parallel mix → still two distinct PIDs (never merged).

### 1.2 Shared vs not shared

| Dimension | V8 state | Shared OS process? |
|-----------|----------|--------------------|
| Deployment code | `moovex-platform-v8-testing` | N/A (config) |
| Build tree / cwd | `/home/u549637099/domains/neuniversity.org/hbuilds/versions/01a0d83b-…/nodejs` (all four) | **No** — same tree, different PIDs |
| `PLATFORM_DEPLOYMENT_CODE` / DB identity | `moovex-platform-v7` / `testing` | N/A |
| `SESSION_SECRET` | Present (value not read) | Per Hostinger app env — shared across V8 hosts if one Web App |
| Media root | `/home/u549637099/moovex-media` (durable); write ns `testing-v8` | Shared FS; **not** shared process |
| Jobs | Disabled (`jobsEnabled: false` on profile; prior audit) | N/A |
| PostgreSQL pool | One pool **per PID**; default max **5** | **No** — 4 × ~5 potential clients |

### 1.3 Startup / Hostinger mapping (evidence-backed)

| Item | Evidence |
|------|----------|
| Entry | LiteSpeed `lsnode.js` (`/usr/local/lsws/fcgi-bin/lsnode.js`) — prior ops / env-conflict docs |
| App start (repo) | `npm start` → `node index.js` → `server.js` |
| hPanel app name | Intended: `moovex-platform-v8-testing` — **not re-verified** without hPanel |
| Domain → app | All four under `domains/neuniversity.org/…` tree ⇒ bound to the **neuniversity.org** Node release, not V7 `pronline.org` |
| Startup file | Panel entry file / `server.js` — exact panel field **NOT AVAILABLE** without hPanel |

### 1.4 Distinction (critical)

- **Shared codebase / shared Web App / shared release directory** = yes (observed).  
- **Shared OS Node worker (one PID)** = **no** (observed).

---

## Phase 2 — Hostinger / LiteSpeed process model

### 2.1 What official docs support

| Source | Relevant claim | Implication |
|--------|----------------|-------------|
| [Hostinger Node.js overview](https://docs.hostinger.com/node.js/overview) | Process starts on demand; stops after idle period | Idle hostnames may drop workers; traffic reawakens them (cold start) |
| [Creating a Node.js app](https://docs.hostinger.com/node.js/creating-an-app) | One Web App per deploy flow; artifacts under `~/domains/{domain}/hbuilds/…`; plan Web App quota | Domains map to website slots; no “single PID for N hosts” API documented |
| [Add Node.js website FAQ](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/) | Existing domain must be removed before re-adding as Node site | Domain ↔ website binding is exclusive at create time |
| [Subdomains Method 2](https://www.hostinger.com/support/1583405-how-to-create-and-delete-subdomains-in-hostinger/) | Subdomain can be “part of” an existing Node.js website (subfolder under site) | Panel **allows** multi-host under one site; **does not** state one process |
| LiteSpeed CloudLinux TS ([lsnode accumulation](https://docs.litespeedtech.com/lsws/cp/cpanel/ts-cloudlinux/)) | `lsnode` spawned on demand; idle processes accumulate; NPROC/`execve` failures | Matches account-wide process pressure; cleanup is host-admin level |

### 2.2 Options assessed

| Option | Description | Supported by docs? | Evidence it reduces PIDs? | SSH / hPanel / support needs |
|--------|-------------|--------------------|---------------------------|------------------------------|
| **A. Multi-domain on one Web App** | Attach BB+AC (+hub) to one Node app | **Yes** (ops intent + Method 2 / Domains UI in prior V8 runbooks) | **No** — already the live V8 topology; **4 PIDs** | hPanel Domains; PID probe after change |
| **B. Method-2 subdomains sharing site directory** | Create `blessboard` / `activeclinic` under apex site | **Yes** (subdomain guide) | **Unverified** — may still create vhost → lsnode | hPanel; may disrupt SSL/DNS; **do not try without approval** |
| **C. Reverse proxy / shared listener** | One long-lived Node; LiteSpeed proxies all Hosts | Typical on **VPS**; **not** documented for managed Web Apps | **Unverified** on this plan | Likely **VPS** or Hostinger support; shared hosting may forbid custom proxy |
| **D. Parked / redirect unused hosts** | DNS or panel redirect; unbind from Node | **Yes** (DNS/redirects) | **Likely** fewer warm workers if hosts never hit Node | DNS + hPanel; no app code required |
| **E. Retire V7 testing hosts** | Remove/unbind unused `*.pronline.org` workers | Ops decision | **Likely** (observed 6 V7 PIDs) | Approval impact assessment; approvals |
| **F. Plan upgrade / raise NPROC** | Buy headroom | Hostinger plan change | Does **not** fix sprawl | Billing approval |

### 2.3 Feasibility conclusion (hosting)

**Do not assume** multi-domain attachment collapses workers. Live counterexample already exists on V8. Any claim of PID consolidation requires a controlled experiment (see Phase 6) and preferably written confirmation from Hostinger support for this plan.

---

## Phase 3 — Application isolation audit (BB+AC shared worker)

Assumption under test: **one** Node process receives requests for both `blessboard.neuniversity.org` and `activeclinic.neuniversity.org` with correct `Host`.

| Concern | Behavior | Shared-worker safe? |
|---------|----------|---------------------|
| Product routing | `productSelection=hostname` → `canonicalHostRegistry` productKey | **Yes** |
| Wrong host / cross line | Apex allowlist; `PLATFORM_HOST_NOT_IN_DEPLOYMENT` / line mismatch → **421** | **Yes** |
| Session cookies | Profile names `moovex_platform_v8_testing_sid`; **host-only** (no `Domain=`) via `buildHostOnlyCookieOptions` | **Yes** — browser will not send BB cookie to AC host |
| CSRF cookies | Profile `moovex_platform_v8_testing_csrf`; same host-only pattern | **Yes** for cross-host; same-name on different hosts is OK |
| Auth / sessions | DB sessions scoped with `deployment_code`; `deployment_mismatch` on load | **Yes** vs V7; BB↔AC still separated by host-only cookies + product gates |
| Tenant isolation | Product + org/tenant resolution from host/path (existing platform model) | **Yes** if product middleware remains host-driven (do not weaken) |
| DB identity | Shared testing DB `moovex-platform-v7` / `testing` (intentional) | Same as today with 4 workers |
| Media writes | Namespace `testing-v8/`; durable root outside `hbuilds` | **Yes** for FS isolation from V7 `testing/` |
| Media public URLs | Env `MEDIA_PUBLIC_BASE_URL` present; fallback CDN base is **BlessBoard** V8 host | **Caution** — absolute env pointing at one product origin can skew AC absolute media URLs; prefer mount-relative `/media` or request-host presentation |
| Public routes | Hostname selects BB vs AC shells | **Yes** |
| Health / runtime | `/healthz`, testing `/__platform/runtime` | **Yes**; post-change PID matrix must show collapse |
| Startup init | Advisory lock for heavy bootstrap | **Yes**; fewer workers ⇒ fewer pools, still one bootstrap winner |
| Security weakening | None proposed | **Do not** set parent-domain cookies or shared `Domain=.neuniversity.org` |

**Conclusion:** Application-layer BB+AC co-tenancy on one worker is **acceptable** without security weakening, provided cookies stay host-only and media absolute bases are reviewed. That does **not** by itself make Hostinger run one PID.

---

## Phase 4 — Domain / application classification

### 4.1 Observed testing Node workers

| Line | Hosts (warm when probed) | PIDs | Deployment | Classification |
|------|--------------------------|------|------------|----------------|
| V8 | BB, AC, apex, www | 4 | `moovex-platform-v8-testing` | **Actively needed:** BB + AC. **Optional / QA hub:** apex + www |
| V7 | BB, AC, apex, www, getproapp, netraz | 6 | `moovex-platform-testing` | **Actively needed:** BB + AC for V7 regression. **Historical / lower priority:** getproapp, netraz, hub hosts unless QA still uses them |

### 4.2 Production / other (public HTTP only)

| Host | `/healthz` | Notes |
|------|------------|-------|
| `blessboard.com`, `www.blessboard.com` | 200 `moovex-platform-production` | **Production-dependent** — do not touch |
| `activeclinic.org`, `www.activeclinic.org` | 200 same | **Production-dependent** |
| `getproapp.org`, `www.getproapp.org` | 503 edge | Unknown worker state; **production-dependent / investigate separately** |
| `netraz.org`, `www.netraz.org` | 503 | Same |
| `moovex.org`, `www.moovex.org` | 404 HTML | Unknown |
| `blessboard.org` | connection/error | Legacy path in ops docs (`domains/blessboard.org/nodejs`) — **historical / unknown** without hPanel |
| `funsong.org` | 503 | Unknown |
| `getpro.pronline.org`, `moovex.pronline.org` | DNS NXDOMAIN | Not live |

Production `/__platform/runtime` correctly gated (404) — **production PIDs not measured**.

### 4.3 Retirement **candidates** (propose only — do not disable)

| Candidate | Why | Risk if removed |
|-----------|-----|-----------------|
| `www.neuniversity.org` Node binding | Duplicate hub PID; registry already redirects conceptually | Breaks www if used as bookmark |
| `neuniversity.org` hub Node binding | Extra PID if QA only uses BB/AC product hosts | Breaks hub landing / platform QA |
| `getproapp.pronline.org`, `netraz.pronline.org` | Extra V7 PIDs; may be transitional | Breaks product-specific V7 QA |
| `www.pronline.org` / `pronline.org` | Hub PIDs | Same as V8 hub |
| Legacy `blessboard.org` Node app | Historical V5 path | Confirm unused in hPanel first |

**Do not** retire V8 BB/AC or production TLDs as part of this investigation.

---

## Phase 5 — Reduction estimates and risks

### 5.1 Counts (separate carefully)

| Metric | Value | Notes |
|--------|-------|-------|
| Observed V8 Node PIDs | **4** | This probe |
| Observed V7 testing Node PIDs | **6** | This probe |
| Observed testing Node total | **10** | Not full account NPROC |
| Account NPROC average | ~**113**/200 | Operator / prior audit — **not** re-read from hPanel |
| Unmeasured processes | **Unknown** | PHP, cron, mail, production Node, idle leftovers |
| Pool budget (V8 alone, default max 5) | up to **~20** clients | 4 × 5; separate from NPROC |

### 5.2 Proposed options (savings = Node workers only)

| Option | Proposed V8 workers | Estimated V8 PID savings | Requires Hostinger PID proof? | NPROC impact |
|--------|---------------------|--------------------------|-------------------------------|--------------|
| Status quo | 4 | 0 | — | — |
| Unbind www + apex (keep BB+AC) | 2 | **~2** | No (traffic/unbind) | Possible; unmeasured |
| True single PID for all V8 hosts | 1 | **~3** | **Yes — currently unverified** | Possible; unmeasured |
| Also cut 2–4 unused V7 hosts | V7 6→2–4 | **~2–4** | Ops confirm unused | Possible; unmeasured |
| Merge V7+V8 into one worker | 1 total testing | Large | **Not recommended** — breaks env/cookie/line isolation | High risk |

**Do not** claim: worker reduction ⇒ measured NPROC drop, or improved throughput.

### 5.3 Risk matrix (if a shared worker were achieved)

| Risk | Severity | Note |
|------|----------|------|
| Shared failure blast radius | High | One crash/503 affects all attached hosts |
| CPU / memory | Medium | One process handles BB+AC load; may increase latency under parallel QA |
| Restarts | Medium | One restart cycles all hosts; cold start amplifies |
| PG pool | Medium-positive | Fewer pools ⇒ fewer connections; single pool may saturate under concurrency |
| Isolation | Low (app) / High (ops mistake) | App OK if host-only cookies kept; mis-set `Domain=` would be severe |
| Latency | Medium | Queueing in one event loop vs parallel workers |
| False confidence | High | Multi-domain Web App **already** ≠ one PID |

---

## Phase 6 — Supported implementation plan (if/when approved)

**Gate:** No step below is authorized by this document. Investigation only.

### 6.1 Preferred safe sequence

1. **Measure baseline (operator)**  
   - hPanel Resource Usage snapshot (PID/CMD).  
   - Record V8/V7 PID matrix via `/__platform/runtime` (testing only).  
   - Note Max Processes average/peak.

2. **Ask Hostinger support (before topology experiments)**  
   - On Business/Cloud Node Web Apps: can multiple domains share **one** `lsnode`/Node PID?  
   - If yes: exact hPanel steps (alias vs Method-2 subdomain vs custom proxy).  
   - If no: confirm intended model is one process context per hostname/vhost.

3. **Low-risk reduction first (no PID-merge claim)**  
   - Identify unused hosts (Phase 4).  
   - With approval: DNS redirect or unbind www/hub / unused V7 product hosts.  
   - Re-probe PIDs after idle window (Hostinger may take time to stop processes).

4. **Optional PID-collapse experiment (only with support answer + approval)**  
   - Change **one** non-critical binding (e.g. www → same vhost config support recommends).  
   - Re-probe: expect **same PID** on two hostnames, sticky across ≥5 hits.  
   - If PIDs remain distinct → mark **NOT_SUPPORTED** for this plan and stop.

5. **Application changes** (only if experiment proves one PID **or** media/base issues found)  
   - Prefer relative `/media` or request-host media presentation over a single absolute `MEDIA_PUBLIC_BASE_URL` product origin.  
   - Do **not** change cookie `Domain`, CSRF, or tenant gates for consolidation.  
   - Optional: document Hostinger constraint in ops runbook (multi-domain ≠ one worker).

6. **Tenant/session test plan (post any change)**  
   - Login BB V8; confirm cookie host-only; AC V8 does not receive session.  
   - Login AC V8 independently.  
   - CSRF POST on each product.  
   - Publish/media smoke on both.  
   - V7 `*.pronline.org` unchanged SHA/PID isolation.  
   - Production `/healthz` unchanged.

7. **Rollback**  
   - Re-attach domains / undo redirects in hPanel.  
   - Redeploy prior Web App binding.  
   - Confirm PID matrix and `/healthz` for BB+AC V8 + V7.

8. **Before/after measurements**  
   - Node PID counts (testing runtime).  
   - hPanel Max Processes avg/peak (same window length).  
   - `/healthz` latency warm/cold.  
   - Supabase connection count if available.  
   - Explicitly record: “PID savings ≠ proven NPROC savings” until graph confirms.

### 6.2 Approvals required

| Approval | Why |
|----------|-----|
| Hosting owner | Any domain unbind, Method-2 change, or support ticket |
| Product/QA lead | Retiring hub or V7 secondary hosts |
| Security (if cookie/media env changes) | Absolute media base / cookie attributes |
| **No** production changes without separate ticket | Production TLDs out of scope |

### 6.3 Explicit non-actions (this task and plan default)

| Action | Status |
|--------|--------|
| Deploy / restart / kill processes | **Not done / not authorized** |
| hPanel topology change | **Not done** |
| Merge V7 and V8 secrets or workers | **Forbidden** by isolation policy |
| Raise `GETPRO_PG_POOL_MAX` as NPROC fix | **Wrong resource** |
| Enable V8 jobs | **Forbidden** |

---

## Findings classification

| Finding | Class |
|---------|-------|
| V8 shares build tree + deployment code across 4 hosts | **CONFIRMED** |
| V8 still has 4 sticky Node PIDs (1 per hostname) | **CONFIRMED** |
| App can route BB+AC safely on one process (host-only cookies, hostname product) | **CONFIRMED** (code + tests) |
| Hostinger multi-domain Web App ⇒ one PID | **NOT SUPPORTED by live evidence**; docs silent |
| Documented managed-hosting reverse-proxy single listener | **NOT FOUND** |
| Hostname retirement reduces warm workers | **LIKELY** / unverified magnitude |
| Worker cut equals NPROC cut or better throughput | **NOT SUPPORTED** as a claim |
| Exact account process composition beyond testing Node | **NOT MEASURED** |

---

## Recommended next ticket (ops, not this investigation)

1. Hostinger support question + hPanel snapshot (Phase 6.1–6.2).  
2. If support says PID merge is impossible: close consolidation as **`V2_01_WORKER_CONSOLIDATION_NOT_SUPPORTED`** and pursue **hostname unbind / V7 idle retirement / plan capacity** instead.  
3. If support provides a working binding: run the PID-collapse experiment; only then implement.

---

## Verdict (restated)

**`V2_01_WORKER_CONSOLIDATION_UNVERIFIED`**

- Application sharing: ready.  
- Hostinger process collapse: **not evidenced** and **not documented**; current multi-domain V8 already fails to share PIDs.  
- Safe interim direction: inventory-driven **hostname retirement / unbind** of non-essential warm hosts, with measured PID and NPROC before/after — without claiming Topology A works at the OS-process layer.
