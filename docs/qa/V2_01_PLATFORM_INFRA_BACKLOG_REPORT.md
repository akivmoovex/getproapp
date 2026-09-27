# V2.01 Platform Infrastructure Backlog Report

**Task:** `V2_01_PLATFORM_INFRA_BACKLOG_REVIEW`  
**Date:** 2026-09-26  
**Branch:** `V8`  
**Mode:** **AUDIT ONLY** — no Hostinger mutations, no `.htaccess`/DNS/hPanel/bindings changes, no production deploy or migrations  
**Production:** **READ-ONLY**  
**Input:** `docs/qa/V2_01_MASTER_BACKLOG_AUDIT.md`  
**Related:** Hostinger process / unused-host / Package A / worker consolidation QA · `V8_HOSTINGER_TESTING_ENV.md` · `V5_BACKUP_RECOVERY_REQUIREMENTS.md` · `V5_MONITORING_REQUIREMENTS.md`

---

## Verdict

**`INFRA_BACKLOG_REVIEW_COMPLETE`**

Live probes on tip **`a901751a2c3a`** reconfirm: V8 testing and production deployment identities are healthy and schema-gated **OK**; account NPROC risk is still driven by **10 sticky testing Node PIDs** (4 V8 + 6 V7), with Package A **blocked on owner hPanel**; production backup/restore remains **UNKNOWN** (requirements-only); no production mutations performed. Express www→apex **301** does **not** eliminate www Node PIDs.

---

## 1. Executive inventory (live 2026-09-26)

### 1.1 Deployment identities

| Surface | deploymentCode | environment | gitSha (prefix) | Cookie / notes |
| --- | --- | --- | --- | --- |
| Local / `origin/V8` | — | — | `a901751a2c3a` | Match |
| V8 BB `blessboard.neuniversity.org` | `moovex-platform-v8-testing` | testing | `a901751a2c3a` | `moovex_platform_v8_testing_sid` · jobs **off** |
| V8 AC `activeclinic.neuniversity.org` | same | testing | same | same cookie name (host-only) |
| V8 hub `neuniversity.org` | same | testing | same | |
| V8 hub `www.neuniversity.org` | same | testing | same | **Distinct sticky PID** (see §7) |
| V7 BB `blessboard.pronline.org` | `moovex-platform-testing` | testing | `03a89106e2fe` | Keep for V7 isolation QA |
| V7 AC + hub + www + GetPro + Netraz `*.pronline.org` | `moovex-platform-testing` | testing | `03a89106e2fe` | 6 sticky PIDs |
| Production BB `blessboard.com` / `www.blessboard.com` | `moovex-platform-production` | production | `03a89106e2fe` | Runtime probe **404** (by design) |
| Production AC `activeclinic.org` | `moovex-platform-production` | production | `03a89106e2fe` | Runtime **404** |

**Stale doc note:** `docs/platform/V8_HOSTINGER_TESTING_ENV.md` still headlines historical **503 / BUG-002**. Live V8 hosts are healthy — treat that heading as **HISTORICAL**; prefer this report + master audit for current status.

### 1.2 Database identities (read-only)

| Field | V8 testing (runtime) | Production (`/healthz`) |
| --- | --- | --- |
| Expected identity key | `moovex-platform-v7` | `moovex-platform-v7` |
| Expected DB environment | `testing` | `production` |
| Provider fingerprint | Supabase pooler host `aws-0-eu-central-1.pooler.supabase.com` · DB name `postgres` · port `5432` | Same identity key / production env (no connection string exposed) |
| Source | `DATABASE_URL` from **host** env (`dbUrlSourceKind=host`) | Host panel env (documented policy) |
| `schemaCompatible` | **true** (`code=ok`, missing `[]`) | **true** (0 failed capability checks) |
| Jobs | `jobsEnabled=false` | Not advertised the same way; do not enable casually |

**No secrets or full `DATABASE_URL` values are recorded here.**

### 1.3 Pending migrations (read-only)

| Check | Evidence | Status |
| --- | --- | --- |
| Hosted capability gate | All listed `/healthz` schema checks **OK** on V8 + prod | No **capability** gap for V7-required surfaces |
| Last documented testing apply | `V8_TESTING_MIGRATION_EXECUTION.md` → platform **039–042**, BB **110–112** (`V8_TESTING_MIGRATIONS_PASS`) | Applied on testing (2026-09-21 wave) |
| Later git file `blessboard/113_sermon_thumbnail_image_url.sql` | Present on `V8` tip (`8a65c0c7`) | **Ledger apply status UNKNOWN** without operator `db:status` / migrate dry-run on testing |
| Duplicate `* 2.sql` files under `activeclinic/` | Present in tree | Hygiene debt — not a hosted capability fail |
| Production migrations | Prod `schemaCompatible=true` | **Do not apply** from this review; any pending beyond capability gate = **UNKNOWN** until owner runs status against production project |

**Actual blocker for certainty:** agent must not run migrate against production; testing ledger for **113+** needs owner/agent with approved `.env.testing.local` migrate **status** only.

### 1.4 Production backup / restore

| Classification | Detail |
| --- | --- |
| Requirements | `docs/operations/V5_BACKUP_RECOVERY_REQUIREMENTS.md` — **DOCUMENTED ONLY** |
| Hosted restore test evidence | **UNKNOWN** — no ticket snapshot/PITR/restore notes attached to this pass |
| Ownership | **EXTERNAL RESPONSIBILITY** (Supabase) + operator recording |

**Do not claim backups are verified.**

### 1.5 Env / secret-management gaps

| Gap | Severity | Evidence |
| --- | --- | --- |
| Production must use **panel env only** (no committed `.env`) | Policy OK | `CONFIG_AND_DEPLOYMENT.md` |
| V7 vs V8 need **distinct** `SESSION_SECRET` | P1 if violated | `V8_HOSTINGER_TESTING_ENV.md` — **not re-verified** (secret values never read) |
| Agent has `.env.testing.local` locally; **no Hostinger SSH keys** | Access | SSH dir lacks Hostinger account keys; Package A blocked |
| hPanel Web App env inventory | **NOT AVAILABLE** | No panel credentials |
| SMTP / transactional email transport | P2 product | `V8-001` — infra gap for delivery, not identity |

### 1.6 Deploy / rollback documentation

| Topic | Status |
| --- | --- |
| V8 Hostinger mechanism | Git-linked Node app on branch `V8` (`V8_HOSTED_DEPLOYMENT_REPORT.md`) — **no in-repo Hostinger CLI** |
| Rollback app SHA | Redeploy/restart prior known-good `origin/V8` SHA via hPanel; V7 `*.pronline.org` left alone |
| DB rollback | Follow migrate runbooks; production apply needs explicit approval + backup evidence |
| V5 cutover rollback docs | Exist; not a substitute for current V8→prod promotion checklist |

### 1.7–1.8 Hostinger NPROC + duplicate workers (re-measured)

**Account NPROC ceiling:** **200** (prior Hostinger support / audits).  
**Account average ~113/200:** operator-reported historically — **NOT re-read** from hPanel this session → **do not claim current savings**.

**Live sticky Node PID matrix (testing only):**

| Line | Host | PID | deployment |
| --- | --- | ---: | --- |
| V8 | `blessboard.neuniversity.org` | 4067872 | v8-testing |
| V8 | `activeclinic.neuniversity.org` | 4068011 | v8-testing |
| V8 | `neuniversity.org` | 215189 | v8-testing |
| V8 | `www.neuniversity.org` | 215361 | v8-testing |
| V7 | `blessboard.pronline.org` | 3979153 | testing |
| V7 | `activeclinic.pronline.org` | 215610 | testing |
| V7 | `pronline.org` | 1553960 | testing |
| V7 | `www.pronline.org` | 215891 | testing |
| V7 | `getproapp.pronline.org` | 508868 | testing |
| V7 | `netraz.pronline.org` | 216264 | testing |

**UNIQUE testing Node PIDs = 10** (same count as 2026-09-25 audits; PIDs rotated after redeploys — expected).

Sticky check: `www.neuniversity.org` / apex / BB — **same PID across sequential hits**.

**www→apex:** HTTP **301** (`www.neuniversity.org` → `https://neuniversity.org/`, same for pronline). **Express/app redirect does not retire the www worker** — www retains its own sticky PID.

**Production PIDs:** **NOT MEASURABLE** (`/__platform/runtime` → **404**).

**Release tree:** `mediaPersistence.cwd` under `…/hbuilds/versions/01a0db28-…/nodejs` · `cwdEphemeral=true` (hbuilds) — media correctly outside tree.

### 1.9 Website bindings (current)

| Keep warm (BB+AC QA) | Role |
| --- | --- |
| `blessboard.neuniversity.org` | V8 BB QA |
| `activeclinic.neuniversity.org` | V8 AC QA |
| `neuniversity.org` | V8 hub |
| `blessboard.pronline.org` / `activeclinic.pronline.org` | V7 isolation / regression |

| Retirement **candidates** (propose only) | Est. PID if unbound |
| --- | --- |
| `www.neuniversity.org`, `www.pronline.org` (**HOST-PKG-A**) | ~2 |
| `getproapp.pronline.org`, `netraz.pronline.org` (**HOST-PKG-B**, owner gate) | ~2 more |

**Production TLDs:** do **not** touch for NPROC relief.

### 1.10 Media / CDN safeguards

| Check | Result |
| --- | --- |
| Durable root | `/home/u549637099/moovex-media` · configured · writable · outside release tree |
| Write namespace (V8) | `testing-v8` (`/healthz` + object URLs) |
| Read V7 keys from V8 | Confirmed: `/media/testing/platform/...` **200** from V8 BB host |
| V8 object sample | `/media/testing-v8/...` **200** |
| Directory listing `/media/` | **503**/empty — not a delivery failure |
| Mirroring | `mirroringDisabled=true`; non-canonical shadow path noted under pronline (do not enable casually) |
| Policy | `V8_SHARED_WEBSITE_LIFECYCLE.md` — no cross-namespace delete |

### 1.11 Monitoring / health / logging

| Signal | Status |
| --- | --- |
| `/healthz` | Live on testing + production |
| Testing `/__platform/runtime` | PID + media + DB fingerprint (safe fields) |
| Production runtime | Gated **404** |
| Structured publish diagnostics | App-side PASS historically; **Hostinger log tail incomplete** without SSH/hPanel |
| External APM (Datadog/Sentry/etc.) | Requirements-only (`V5_MONITORING_REQUIREMENTS.md`) — **not** claimed implemented |
| Account NPROC graph | **Owner hPanel only** |

---

## 2. Open infra items (reconciled)

| ID | Severity | Evidence | Actual blocker | Recommended action | Access required | Rollback plan |
| --- | --- | --- | --- | --- | --- | --- |
| **HOST-PKG-A** | **P0** | www hosts still sticky PIDs **215361** / **215891**; app 301 already present; Package A QA **BLOCKED** | No hPanel/SSH to unbind www from Node | hPanel: redirect www→apex **and unbind** www from Node Web App; re-probe PID matrix; **no** NPROC claim without before/after graph | **Owner / Hostinger hPanel** | Re-attach www to Node Web App; revert panel redirect if needed |
| **HOST-CONSOL** | **P0** | Same build ≠ same PID; Topology A **UNVERIFIED** | Hostinger does not document guaranteed multi-host one-PID; no SSH experiment | Prefer fewer warm hosts; ask Hostinger support whether multi-domain can share one `lsnode` PID; do **not** equate “one Web App” with “one worker” | **Owner + Hostinger support** | Leave per-vhost spawn; no merge attempt on production |
| **HOST-PKG-B** | P1 | GetPro/Netraz testing PIDs still warm | Product-owner approval | Retire only with owner OK + QA confirmation | Owner + QA lead | Re-bind hosts if those teams still need them |
| **HOST-NPROC-BASELINE** | P1 | Ceiling 200 known; avg ~113 **stale/operator** | No hPanel this session | Snapshot Resource Usage (6h/24h/7d) before/after Package A | **Owner hPanel** | N/A (measurement) |
| **HOST-ACCT-PS** | P1 | `ACCOUNT_PROCESS_AUDIT_INCOMPLETE` | No SSH `ps`/`pstree` | Authorized SSH or Hostinger support process dump under `u549637099` | **Owner SSH or support** | N/A |
| **DB-LEDGER-113** | P2 | File `113_sermon_thumbnail…` on tip; capability gate OK; ledger unknown | No migrate-status run in this audit | `npm run db:migrate:testing` **status/dry** only; apply only if pending + approved | Testing migrate credentials | Do not apply to production from this item |
| **DB-DUP-SQL-FILES** | P3 | `activeclinic/* 2.sql` duplicates in tree | Hygiene | Triage/remove duplicate files in a docs/hygiene PR | Dev (V8 testing) | Git revert |
| **BACKUP-PROD-VERIFY** | **P0** (release gate) | Requirements DOCUMENTED ONLY; restore **UNKNOWN** | No snapshot/PITR/restore ticket evidence | Record Supabase backup/PITR enabled; restore drill to non-prod clone; attach ticket IDs | **Owner + Supabase** | Keep prior snapshot IDs; do not purge until window ends |
| **SECRET-SESSION-SPLIT** | P1 | Distinct V7/V8 `SESSION_SECRET` required; values not inspected | Cannot verify without panel | Owner confirms distinct secrets in hPanel for V7 vs V8 apps | Owner hPanel | Rotate if collision found (session invalidate) |
| **SMTP-V8-001** | P2 | Canonical V8 backlog | Transport not configured for live mail | Configure transactional adapter on testing first | Owner secrets + ops | Disable adapter; keep capture path |
| **MONITOR-LOGS** | P2 | Publish diagnostics log verification incomplete | No SSH/hPanel logs | Owner tail Hostinger app logs by `requestId` | Owner | N/A |
| **MONITOR-EXT** | P3 | V5 monitoring requirements only | No approved external stack | Optional later; keep `/healthz` + log-first | Product/ops approval | Disable integrations |
| **DOC-V8-ENV-STALE** | P3 | `V8_HOSTINGER_TESTING_ENV.md` still says 503 | Doc drift | Update status to healthy / point to this report | Dev docs on V8 | Git revert |
| **TEST-DEBT-ISO** | P3 | Master audit / known test debt | Combined-suite DB interference | Per-suite DB isolation (app/test infra) | Dev | Revert test harness |
| **MEDIA-SHADOW-PATH** | P3 | Runtime notes non-canonical `…/pronline.org/moovex-media` | Confusion risk | Keep mirroring disabled; document canonical root only | Ops awareness | N/A if unused |

**Not reopened as infra defects:** V8 Phase-0 host 503 (historical); Express www redirect “missing” (exists; insufficient alone); media directory 503 on `/media/` listing (objects **200**).

---

## 3. Access matrix — what owner / Hostinger must supply

| Measurement / action | Available here? | Who |
| --- | --- | --- |
| Public `/healthz` | Yes | Agent |
| Testing `/__platform/runtime` PID matrix | Yes | Agent |
| Production PID / `ps` | **No** (runtime 404) | Owner SSH or support |
| Account NPROC graph avg/peak | **No** | **Owner hPanel** |
| Full Web Apps / domain bindings list | **No** | **Owner hPanel** |
| Unbind www from Node | **No** | **Owner hPanel** (Package A) |
| DNS / SSL / `.htaccess` | **Forbidden this task** | Owner only if approved |
| Hostinger support “one PID multi-domain?” | **No** | **Owner + support** |
| Supabase backup/PITR + restore drill | **No** | **Owner** |
| `db:status` / pending ledger beyond healthz | Not run this pass | Agent/owner with testing migrate env (**not** production) |
| Application log tail | **No** | Owner hPanel/SSH |

---

## 4. Separate action lists

### A. Safe V8 testing changes (no Hostinger panel; no production)

1. Docs: mark `V8_HOSTINGER_TESTING_ENV.md` 503 headline **historical**; link this report.  
2. Optional: testing-only `db:migrate:testing` **status** for BB **113+** (apply only if pending + authorized).  
3. Triage duplicate `* 2.sql` migration filenames.  
4. Continue app deploys to `moovex-platform-v8-testing` via existing git-linked flow; confirm `/healthz` SHA.  
5. Keep media writes under `testing-v8/`; do not enable mirroring to shadow roots.  
6. Test-debt isolation work (**TEST-DEBT-ISO**) when scheduled.  
7. **Do not** change `.htaccess`, DNS, bindings, or kill PIDs from the app repo.

### B. Owner / Hostinger actions

1. **HOST-PKG-A:** Unbind `www.neuniversity.org` and `www.pronline.org` from Node; keep/confirm panel redirect to apex; re-measure sticky PIDs (expect www **no** Node PID or non-Node response).  
2. Capture hPanel **NPROC** screenshots before/after — only then claim process relief.  
3. Decide **HOST-PKG-B** with GetPro/Netraz owners.  
4. Ask Hostinger whether multi-hostname can share one `lsnode` worker (**HOST-CONSOL**).  
5. Confirm distinct **SESSION_SECRET** (and cookie isolation already coded) across V7 testing / V8 testing / production apps.  
6. Provide SSH or log access if log verification / `ps` inventory required.  
7. Record Supabase backup/PITR evidence + non-prod restore drill (**BACKUP-PROD-VERIFY**).

### C. Production approval prerequisites (before any prod promote)

1. Explicit production change approval (not this ticket).  
2. **BACKUP-PROD-VERIFY** ticket evidence (snapshot/PITR + restore drill notes).  
3. Production `/healthz` identity remains `moovex-platform-production` / `production` / `moovex-platform-v7`.  
4. Pending production migrations listed via approved status tool — **apply only with runbook**.  
5. Rollback: prior production app SHA + DB restore point recorded **before** cutover.  
6. NPROC headroom evidenced if adding hosts/workers.  
7. No Package A/B experiments on production TLDs.  
8. SMTP (**V8-001**) and catalogue-login policy (**V8-003**) decided if declared go-live blockers by product (not infra-apply alone).

---

## 5. Hard rules observed this review

| Rule | Observed |
| --- | --- |
| Express redirect ≠ Node PID retirement | **Confirmed** (301 + distinct www PIDs) |
| No `.htaccess` / DNS / hPanel / production mutations | **None performed** |
| No invented account-wide NPROC savings | **None claimed** |
| No production migrations | **None applied** |
| No secrets / connection strings in report | **Only host fingerprints + public paths already in prior QA** |

---

## 6. Production untouched confirmation

| Check | Result |
| --- | --- |
| `blessboard.com` `/healthz` | `03a89106e2fe` · `moovex-platform-production` |
| `activeclinic.org` `/healthz` | same SHA / production |
| Runtime / bindings / DNS / deploy | **Not modified** |

---

## FINAL VERDICT (repeat)

**`INFRA_BACKLOG_REVIEW_COMPLETE`**
