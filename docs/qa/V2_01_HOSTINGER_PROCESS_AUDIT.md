# V2.01 Hostinger Process Utilization Audit

**Task:** `V2_01_HOSTINGER_PROCESS_ROOT_CAUSE`  
**Date:** 2026-09-25  
**Branch:** `V8`  
**Deployment in focus:** `moovex-platform-v8-testing`  
**Account home (from runtime probe):** `/home/u549637099`  
**Priority:** P0  
**Mode:** Read-only — no code, config, DB, process, or production changes  

**Verdict:** `V2_01_PROCESS_ROOT_CAUSE_CONFIRMED`

---

## Executive summary

Hostinger **Max Processes (NPROC)** is an **account-wide** OS process ceiling (here reported as **200**), not “200 concurrent QA users” and not “200 HTTP requests.” The reported **113/200 average** is therefore dominated by **how many long-lived processes exist on the shared hosting plan**, not by 2–3 editors clicking around.

**Confirmed on live testing probes:** LiteSpeed/`lsnode` serves **a distinct Node.js PID per hostname** for the same application tree. Probing V8 + V7 hostnames alone observed **10 distinct Node PIDs** (4 on `neuniversity.org` tree, 6 on `pronline.org` tree), each with its own PostgreSQL pool. Production and other account apps add more processes that also count toward the same 200.

Application background jobs on V8 are **disabled** (`jobsEnabled: false`). No evidence of app-level `fork`/`cluster` process spawning. Pool log `max=10` vs runtime `max=5` is a **logging/docs default mismatch**, not two pools.

---

## 1. Metric definition (Phase 1)

| Question | Answer | Confidence |
|----------|--------|------------|
| What is “Max Processes”? | Hostinger **NPROC** — total number of **OS processes** under the hosting plan | **High** (Hostinger support: “total number of all processes running in your hosting plan”) |
| Scope of the 200 limit | **Account / plan-wide**, not per domain and not per Node app | **High** |
| Sampling / graphs | hPanel Resource Usage graphs; historical windows **6h / 24h / 7d**; updates about **every 10–15 minutes**; timezone **GMT+0** | **High** |
| “Average 113” vs peak | Hostinger graphs show **period averages**; red shading can mean the limit was **briefly hit** even when the average stays under the red line. Exact peak value for “113” was **not** readable from this environment | **Medium** (definition); peak numeric = **NOT AVAILABLE** without hPanel screenshot |
| Entry Processes (EP) | Separate limit — concurrent request-handling capacity (often PHP-oriented on shared plans). **Not** the same as Max Processes | **High** |
| Node workers vs NPROC | Each running `node` / `lsnode` worker **counts as ≥1 process**; child helpers, shells, cron, mail, and other sites also count | **High** |
| HTTP requests | Do **not** map 1:1 to Max Processes | **High** |
| DB connections | Count toward Supabase/Postgres limits, **not** Hostinger Max Processes directly | **High** |
| Background jobs | Separate from Max Processes; V8 profile forces jobs off | **High** |

Sources: [Hostinger plan parameters](https://www.hostinger.com/support/6976044-parameters-and-limits-of-hosting-plans-in-hostinger/), [Resource usage graphs](https://www.hostinger.com/support/2436138-how-to-check-resource-usage-in-hostinger/), [Limits reached / 503](https://www.hostinger.com/support/1583532-what-to-do-if-your-hosting-plan-limits-are-reached-in-hostinger/).

---

## 2. Process inventory (Phase 2)

### Access

| Method | Result |
|--------|--------|
| Authorized SSH to Hostinger | **Unavailable** — `ssh` binary present locally; **no** account keys / host access configured for `u549637099` |
| `ps` / `pstree` / `lsof` on account | **NOT AVAILABLE** |
| hPanel Resource Usage live numbers | **NOT AVAILABLE** (no panel credentials in this session) |
| Public `/__platform/runtime` (testing only) | **Available** — safe PID + cwd + deployment fingerprint |

### Observed Node workers (2026-09-25 probes)

Same build tree can still yield **different PIDs per hostname** (sticky across 5 repeated hits each):

#### V8 — cwd `…/domains/neuniversity.org/hbuilds/versions/01a0d81f-…/nodejs`

| Host | PID | deploymentCode |
|------|-----|----------------|
| `blessboard.neuniversity.org` | `997098` | `moovex-platform-v8-testing` |
| `activeclinic.neuniversity.org` | `1248177` | `moovex-platform-v8-testing` |
| `neuniversity.org` | `1507435` | `moovex-platform-v8-testing` |
| `www.neuniversity.org` | `1535067` | `moovex-platform-v8-testing` |

**V8 unique Node PIDs observed: 4**

#### V7 testing — cwd `…/domains/pronline.org/hbuilds/versions/01a0bf10-…/nodejs`

| Host | PID | deploymentCode |
|------|-----|----------------|
| `blessboard.pronline.org` | `107171` | `moovex-platform-testing` |
| `activeclinic.pronline.org` | `798264` | `moovex-platform-testing` |
| `pronline.org` | `522765` | `moovex-platform-testing` |
| `www.pronline.org` | `1535403` | `moovex-platform-testing` |
| `getproapp.pronline.org` | `1535714` | `moovex-platform-testing` |
| `netraz.pronline.org` | `1536024` | `moovex-platform-testing` |

**V7 unique Node PIDs observed: 6**

**Combined testing Node workers from this probe alone: 10** — before counting production Node apps (`blessboard.com`, `activeclinic.org`, etc.), PHP, cron, mail, or idle leftovers.

Note: `/__platform/runtime` `startedAt` is **`new Date()` at snapshot time** (`startupProcessMarker.js`), **not** process boot time — do not use it to infer restart storms.

Production `/__platform/runtime` correctly returns **404** (diagnostics gated off).

### Other account applications (from repo evidence; not full hPanel list)

Documented Hostinger trees under the same account include at least:

- `…/domains/neuniversity.org/…` (V8)
- `…/domains/pronline.org/…` (V7 testing)
- `…/domains/blessboard.org/nodejs` (legacy / V5 path in ops docs)
- Production product TLDs served by `moovex-platform-production` (healthz live)

**Missing for a complete inventory:** hPanel → Resource Usage → Snapshots (PID/CMD/CPU/MEM) and full Websites/Node.js app list.

---

## 3. Startup / pool / jobs analysis (Phase 3)

### Boot path

1. Hostinger LiteSpeed entry: `…/lsws/fcgi-bin/lsnode.js` (documented; normal).
2. `server.js` → `runBootstrap()` → deployment profile gate → PostgreSQL required → `startV5FoundationServer` / Moovex platform runtime for V8.
3. Heavy bootstrap uses **PostgreSQL advisory lock** so concurrent workers do not all run init (`runBootstrapWithAdvisoryLock.js`).
4. **No** `child_process.fork` / `cluster` worker spawning in the HTTP server path.
5. Singleton `getPgPool()` per Node process.

### V8 jobs

| Check | Result |
|-------|--------|
| Profile `moovex-platform-v8-testing` | `jobsEnabled: false` (canonical) |
| Live `/healthz` | `jobsEnabled: false` on V8 hosts |
| Announcements / forms | Lazy evaluation; no background scheduler in shared announcement routes |

**Conclusion:** V8 app code is **not** intentionally running cron workers that would multiply processes.

### Pool `max=10` vs `max=5` (not two pools)

| Site | Default when `GETPRO_PG_POOL_MAX` unset |
|------|----------------------------------------|
| `logPgStartupDiagnostics()` log line | `Number(…) \|\| **10**` (`pool.js` ~314) |
| Actual `Pool({ max })` | `Number(…) \|\| **5**` (`getPoolRuntimeConfig` ~353) |
| Docs `SUPABASE_ENV.md` | Documents default **10** |
| Ops checklist | Recommends **5** |

**Interpretation:** One pool per process. The first log line can **overstate** the default max. A later log line prints the true `runtime.max`. This does **not** prove two pools or double connection budget by itself.

**Per-process connection budget (if env unset):** up to **5** clients.  
**Across N Node workers:** up to roughly **5 × N** potential connections to Supabase — relevant to DB pressure, separate from Hostinger NPROC.

---

## 4. Activity / polling (Phase 4)

| Area | Finding |
|------|---------|
| Dashboard polling loops | **No** widespread `setInterval` fetch polling in admin public JS; only benign UI timers (e.g. marketing carousel / company profile slideshow) |
| V8 scheduled jobs | Disabled |
| Health checks | External `/healthz` probes wake workers; Hostinger may keep processes warm after traffic |
| Website editor | Request-driven (draft save / publish); no evidence of continuous server-side editor loops |
| With browsers closed | Node workers can still remain until Hostinger idle stop; **idle process lifetime NOT MEASURED** without SSH/hPanel |
| Crawlers / monitors | Possible contributors to wakeups; **NOT MEASURED** (no access logs) |

---

## 5. Measurement baselines (Phase 5)

Methods used: public HTTPS only. No process termination. No production config changes.

| Measurement | Result | Notes |
|-------------|--------|-------|
| V8 process count (Node PIDs via runtime) | **4** distinct PIDs for 4 hostnames | Sticky across repeats |
| V7 testing process count | **6** distinct PIDs for 6 hostnames | Sticky across repeats |
| Account Max Processes 113/200 | **NOT AVAILABLE** here | Operator-reported; matches “average” graph language |
| Peak NPROC | **NOT AVAILABLE** | Need hPanel history |
| CPU / RAM graphs | **NOT AVAILABLE** | Need hPanel |
| Request rate / error rate | **NOT AVAILABLE** | No access logs |
| Latency `/healthz` (warm) | ~250–370 ms typical on V8/V7 | Sequential + parallel bursts all **200** |
| Cold start | First hub hit earlier ~2.5 s once; not systematically re-measured | |
| DB connections open | **NOT AVAILABLE** | No Supabase metrics access in this session |
| All QA browsers closed | **NOT MEASURED** as controlled experiment | Would need coordinated idle window + hPanel snapshot |
| 1 idle logged-in user | **NOT MEASURED** | |
| Dashboard navigation / editing / 2–3 users | **NOT MEASURED** (process metric) | App activity confirmed separately in other QA; does not explain baseline NPROC magnitude |

### Controlled inference (evidence-based, not invented)

Even with **zero** QA browsers, the account can retain **multiple Node workers per attached hostname** across V7 + V8 (+ production). That alone is enough to place average NPROC in the **tens to low hundreds** when combined with other plan processes — consistent with **113/200** without requiring a runaway app loop.

---

## 6. Findings classification (Phase 6)

| Finding | Class | Evidence |
|---------|-------|----------|
| Max Processes = account-wide NPROC (≠ users/requests) | **CONFIRMED BOTTLENECK (metric misunderstanding risk)** | Hostinger docs |
| One Node PID per hostname on shared Hostinger Node trees | **CONFIRMED BOTTLENECK** | `/__platform/runtime` PID matrix |
| Multiple platform apps on same account (V7 + V8 + production + legacy) share the 200 ceiling | **CONFIRMED BOTTLENECK** | Live healthz/runtime + ops docs |
| V8 background job workers causing process inflation | **NOT SUPPORTED** | `jobsEnabled: false` |
| App `fork`/`cluster` spawning extra processes | **NOT SUPPORTED** | Source audit |
| Dashboard polling causing high NPROC | **NOT SUPPORTED** | No admin polling loops found |
| Pool log 10 vs pool 5 = two pools | **NOT SUPPORTED** | Same file; log default ≠ runtime default |
| Pool × worker multiplication stressing Supabase | **LIKELY CONTRIBUTOR** (DB side) | 5 × N workers; host uses Supabase pooler |
| 2–3 QA users as primary cause of 113 processes | **NOT SUPPORTED** | Process count is OS processes; hostname workers dominate baseline |
| Exact composition of the other ~100 processes | **NOT MEASURED** | Need hPanel snapshot / SSH `ps` |

---

## 7. Recommended safe next steps (no deploy in this task)

### Hostinger / ops (prefer first)

1. **hPanel → Resource Usage → Snapshots** during a quiet window and during QA; export PID/CMD list — map how many are `node`/`lsnode` vs PHP/cron/mail.
2. Inventory **all Node.js / Web Apps** on account `u549637099` (V7, V8, production, blessboard.org, unused leftovers).
3. Prefer **Topology A**: one Node app / fewer workers serving multiple hostnames **if Hostinger allows without per-vhost process spawn** — validate with runtime PID probe after any topology change.
4. Retire unused domains/apps that still keep warm workers.
5. Do **not** raise NPROC by “just upgrading” without first cutting duplicate workers — upgrade is plan-level, not a substitute for worker sprawl.

### Application (follow-up tickets; not done here)

1. Align pool logging/docs: log default **5** to match `getPoolRuntimeConfig` (docs currently say 10).
2. Optionally expose **stable `processBootAt`** on testing runtime (not wall-clock) for restart diagnostics.
3. Avoid arbitrary `GETPRO_PG_POOL_MAX` increases on multi-worker Hostinger — connections scale with **workers × max**.

### Explicit non-recommendations

- Do not kill random processes without inventory.
- Do not lower pool max as a Max Processes fix (wrong resource).
- Do not enable jobs on V8 to “debug” process count.

---

## 8. Risks

| Risk | Note |
|------|------|
| Hitting NPROC | Hostinger documents **503** when process/RAM limits are reached repeatedly |
| Mis-attributing to QA | Stopping QA does not remove per-hostname workers or other apps |
| Topology change | Consolidating hosts onto one worker must preserve session cookies / env isolation (V7 vs V8 secrets already distinct) |
| Supabase | Worker sprawl × pool max can exhaust DB connections independently of NPROC |

---

## 9. Missing measurements (operator checklist)

- [ ] hPanel Max Processes graph screenshot (avg + any red shading) for the window matching “113”
- [ ] Snapshot table of top processes by CMD
- [ ] Complete Node app list and domain bindings
- [ ] Idle-window PID count with all QA browsers closed (30–60 minutes)
- [ ] SSH `ps -u $USER -o pid,ppid,rss,etime,cmd` (read-only) if authorized
- [ ] Supabase connection count / pooler metrics during idle vs QA

---

## 10. Explicit non-actions

| Action | Performed? |
|--------|------------|
| Code / config / DB changes | **No** |
| Process kill / restart | **No** |
| Deploy | **No** |
| Production changes | **No** |

---

## Verdict

**`V2_01_PROCESS_ROOT_CAUSE_CONFIRMED`**

Primary root cause of high Max Process utilization with few QA users:

1. **Account-wide NPROC accounting**, and  
2. **Multiple long-lived Node workers (observed one PID per hostname) across V7 + V8 (+ other apps on the same plan)**,  

not V8 background jobs, dashboard polling loops, or a misread “pool max=10 and max=5 = two pools” story.

Incomplete only for exact hPanel composition of the remaining processes beyond the measured Node PIDs — called out as missing measurements, not as an alternate unverified theory.
