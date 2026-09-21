# V8 Hosted End-to-End QA Report (PROMPT 26)

**Verdict:** `V8_HOSTED_QA_WITH_OPEN_DEFECTS`  
**Branch:** `V8` only  
**Recorded:** 2026-09-21  
**Target deployment:** `moovex-platform-v8-testing` (neuniversity hosts only)  
**Testing DB:** `moovex-platform-v7` / `testing`

### Explicit non-actions

| Action | Performed? |
|--------|------------|
| Create / modify customer or V7 QA tenant data | **No** |
| Provision new disposable V8 tenants or credentials | **No** (not authorized; none pre-provisioned) |
| Hosted write submissions / membership / form publish | **No** — **BLOCKED** |
| Apply migrations / restart / deploy application code | **No** |
| Modify V7 code, deployments, or production | **No** |
| Activate or send real notifications | **No** |
| Authenticated SH / BB / AC admin screen visual QA | **Not claimed** (no authorized login) |

---

## 1. SHA and environment (Step 1)

| Role | Value | Notes |
|------|-------|-------|
| **Approved application SHA (PROMPT 25)** | `bee21fed8e877d5dcd8c21144b68d54564cfd22c` | Feature baseline for V8 Version 2.0 package |
| **Live hosted `/healthz` gitSha (this pass)** | `9c04d882b6ae` | Docs commit auto-deployed after PROMPT 25; **application line still = tip of `origin/V8`** |
| **This documentation commit** | (recorded after report) | May advance `origin/V8` beyond both; **record separately from app SHA** |
| **V8 deploymentCode** | `moovex-platform-v8-testing` | All three neuniversity hosts |
| **expectedIdentityKey** | `moovex-platform-v7` | Shared testing DB |
| **schemaCompatible** | `true` | All three V8 hosts |
| **Migration tips** | platform **042** · BlessBoard **112** · ActiveClinic **035** | Confirmed via `platform.schema_migrations` |
| **V7 hosted SHA** | `03a89106e2fe` | Unchanged on pronline hosts |

### Live health matrix

| Host | `/healthz` | gitSha | deploymentCode | schemaCompatible |
|------|------------|--------|----------------|------------------|
| `https://neuniversity.org` | 200 ok | `9c04d882b6ae` | `moovex-platform-v8-testing` | true |
| `https://blessboard.neuniversity.org` | 200 ok | `9c04d882b6ae` | `moovex-platform-v8-testing` | true |
| `https://activeclinic.neuniversity.org` | 200 ok | `9c04d882b6ae` | `moovex-platform-v8-testing` | true |
| `https://blessboard.pronline.org` (V7) | 200 ok | `03a89106e2fe` | `moovex-platform-testing` | true |
| `https://activeclinic.pronline.org` (V7) | 200 ok | `03a89106e2fe` | `moovex-platform-testing` | true |

### Disposable V8 QA tenant / credential gate

| Check | Result |
|-------|--------|
| `platform.domains` rows with hostname `%neuniversity%` | **0** |
| Pre-authorized disposable V8 church tenant hostnames | **None** |
| Pre-authorized V8 staff/member passwords in env | **None** |
| `ac-hqa-*` orgs in shared testing DB | Present, `test_cleanup_eligible=true`, but **0 custom domains**; leftover shared fixtures — **not used for write QA** |
| `bb-hqa-*` orgs | **None** |

**Decision:** All **hosted write** flows and authenticated screen visual claims are **BLOCKED**. Read-only public probes and V7 regression proceeded.

---

## 2. Twelve user flows — results

Legend: **PASS** = hosted persistence + auth/isolation verified · **PARTIAL** = meaningful read-only evidence only · **BLOCKED** = missing authorized disposable V8 tenants/credentials · **FAIL** = defect with repro · **NOT_APPLICABLE** = out of scope for product surface.

| # | Flow | Result | Hosted route(s) tested | Desktop / Mobile | Tenant | Persistence | Auth / isolation |
|---|------|--------|------------------------|------------------|--------|-------------|------------------|
| 01 | Form create → draft → preview → publish → share | **BLOCKED** | `/hq/forms` → **401** `Sign-in is required.` | Not visual (auth) | n/a | Not tested | Gate observed (401) |
| 02 | Public form validation → submit → confirm | **BLOCKED** | No published disposable form URL on V8 | — | n/a | Not tested | — |
| 03 | Submission list → review → status | **BLOCKED** | Auth required | — | n/a | Not tested | — |
| 04 | Tenant admin / RBAC / org isolation | **BLOCKED** | `/hq/*`, `/branch-admin/*` → **401** | — | n/a | Not tested | Unauthenticated denied |
| 05 | Four-step membership application + confirm | **BLOCKED** | Product-hub `/register` **timeout**; no church hostname | — | n/a | Not tested | — |
| 06 | Review → follow-up → approval → member create | **BLOCKED** | Auth required | — | n/a | Not tested | — |
| 07 | Member management + branch transfers | **BLOCKED** | `/branch-admin/members` → **401** | — | n/a | Not tested | — |
| 08 | Visitor registration + consent follow-up | **BLOCKED** | No tenant host | — | n/a | Not tested | — |
| 09 | Event / ministry registration | **BLOCKED** | No tenant host | — | n/a | Not tested | — |
| 10 | Shared announcement create → preview → publish / schedule | **BLOCKED** | Auth required | — | n/a | Not tested | Notifications not triggered |
| 11 | BB HQ/branch announcement management | **BLOCKED** | `/branch-admin/announcements` → **401** | — | n/a | Not tested | — |
| 12 | Public announcement list + detail | **BLOCKED** | Hub `/announcements` → **503** (foundation; see §4); no tenant list | Hub only | n/a | Not tested | — |

**Summary counts:** PASS **0** · PARTIAL **0** (flows) · FAIL **0** (flow-level) · BLOCKED **12**  

Open defects outside flow table: product-hub `/register` hang (**DEFECT**, §6).

---

## 3. Screen visual verification

**Do not claim Stitch screen IDs unless actually rendered at the required viewport.**

| Metric | Count |
|--------|------:|
| Approved package screens (SH/BB/AN × D/M) | **84** |
| Screens **visually verified on hosted V8** at specified viewport | **8** surfaces (below) — **not** mapped 1:1 to all 84 Stitch IDs |
| Screens **not** visually verified (auth / missing tenant / not opened) | **76+** Stitch IDs (all SH01–SH15, BB01–BB22 admin/member paths, AN01–AN05 admin, BB19–BB22 tenant public announcements, etc.) |

### Surfaces actually rendered and inspected

| Surface | Desktop 1440 | Mobile 390 | Notes |
|---------|--------------|------------|-------|
| Apex hub `neuniversity.org/` | Yes (a11y snapshot) | — | V2.0 BB + AC links only |
| BB product home | Yes + screenshot | Yes (mobile nav) | Marketing home; not a church tenant site |
| AC `/clinics` directory | Yes + screenshot | Observed narrow layout | Directory→clinic links present |
| Julflona clinic doctors | — | Yes + screenshot | Profiles + images load |
| Julflona clinic services | Yes (snapshot) | — | Sample services listed |
| AC booking form GET (`…/book`) | HTTP + form markers | — | Form/CSRF/phone present; **no submit** |
| BB `/login` | HTTP 200 | — | Sign-in page |
| BB `/register-church` | HTTP 200 | — | Platform church registration (not member `/register`) |

**Automated tests run against hosted V8:** **0** (no authorized hosted credential suite invoked this pass).

---

## 4. Announcements foundation 503 (Step 4 note)

| Probe | Result |
|-------|--------|
| `GET https://blessboard.neuniversity.org/announcements` | **503** |
| Body | Plain text: `This page is not yet available in BlessBoard V5.` |
| Interpretation | **Expected foundation / product-hub gating** when there is **no church tenant hostname** — **not** a Hostinger edge failure and **not** a tenant BB21–BB22 result |
| Tenant public announcements | **Not testable** — `neuniversity` domain count **0** |
| Notifications | Not activated |

**Classification:** Expected routing on product hub · **separate from** tenant announcement PASS/FAIL (those remain **BLOCKED**).

---

## 5. Existing QA defect regression (Step 5) — read-only

| Item | Result | Evidence |
|------|--------|----------|
| AC booking / inquiry **form render** | **PARTIAL** (GET only) | `…/clinics/ac-hqa-mua74664fb66/book` and `…/julflona-clinic/book` → **200**, `<form>`, CSRF, phone fields |
| AC booking / inquiry **submission** | **BLOCKED** | No authorized disposable write identity; will not mutate shared fixtures |
| AC clinic services | **PARTIAL** | Julflona `/services` 200 with published sample listings |
| AC doctor profiles + images | **PARTIAL** | Doctors page 200; `dr-julflona-mwansa.jpg` / `dr-julflona-banda.jpg` → **200** `image/jpeg` |
| Directory → clinic navigation | **PARTIAL** | Canonical `/clinics` **200** with clinic cards; `/directory` → **404** (expected alternate path) |
| Shared phone identity conflict | **BLOCKED** | Requires write/submit |
| Existing BB/AC website media | **PARTIAL** | Brand logo, Julflona hero, doctor JPGs → **200** on V8 CDN host; V7 same objects **200** |

Frozen clinic booking gate observed: `…/ac-hqa-freeze-d45431/book` → **403** (expected freeze behavior; not treated as booking defect).

---

## 6. Public routing — product-hub `/register` (Step 6)

| Question | Finding |
|----------|---------|
| Intended **platform** church registration | `GET /register-church` on BlessBoard product host → **200** (works) |
| Intended **member** registration | `GET /register` on an **authoritative church tenant hostname** (host → church + primary branch); never client-supplied church IDs |
| Should product-hub `/register` redirect or render? | Should **fail closed quickly** (foundation home or controlled 503/404), same class as other non-tenant tenant routes — **not hang** |
| Does timeout reproduce? | **Yes** — `https://blessboard.neuniversity.org/register` **timed out** (~8–12s client read timeout; no HTTP status) |
| Affects actual BB/AC registration? | **BB member registration:** cannot verify without tenant host (**BLOCKED**). **AC registration / booking:** **not affected** by this hub path. Platform church signup via `/register-church` still responds. |

**Classification:** **DEFECT** (product-hub hang) · severity **Medium** (UX / ops noise; not proven to break tenant member registration)  
**Reproduction:** `curl -m 12 -i https://blessboard.neuniversity.org/register` → client timeout.  
**Contrast:** `curl -m 12 -i https://blessboard.neuniversity.org/register-church` → **200**.

---

## 7. V7 compatibility (Step 7) — read-only

| Check | Result |
|-------|--------|
| Hosted SHA unchanged | **Yes** — `03a89106e2fe` on BB + AC pronline |
| Health + schemaCompatible | **true** both hosts |
| Public church / clinic routes | `/` and AC `/clinics` → **200** |
| Existing public media | Brand logo + doctor JPG → **200** on V7 media host |
| Auth behavior | Not write-tested; V7 not modified |

No V7 write QA performed.

---

## 8. Media persistence summary

| Asset | V8 | V7 |
|-------|----|----|
| `…/blessboard/brand/blessboard-small-church-logo.png` | 200 PNG | 200 PNG |
| `…/activeclinic/clinic/julflona-hero.jpg` | 200 JPEG | (served via shared testing media) |
| `…/activeclinic/doctors/dr-julflona-*.jpg` | 200 JPEG | 200 JPEG |
| New uploads this pass | **Not performed** (write blocked) |

---

## 9. Remaining release blockers

1. **Provision pre-authorized disposable V8 QA tenants** on neuniversity (BlessBoard church hostname(s) + ActiveClinic disposable org with known staff/patient credentials) — **without** mutating long-lived demo / V7 fixtures.  
2. Re-run **all 12 write flows** with persistence + org-scope evidence.  
3. Visually verify remaining **authenticated** SH/BB/AN screens at **1440** and **390**.  
4. Fix or harden **product-hub `/register` hang** (fail closed; do not timeout).  
5. Complete tenant-host **BB21–BB22** public announcement checks (do not use hub 503 as tenant result).

---

## 10. Evidence index

| Artifact | Location / note |
|----------|-----------------|
| Read-only probe JSON | `/tmp/v8-e2e-qa/readonly-checks.json` (local agent workspace) |
| Screenshots | `v8-e2e-bb-home-1440.png`, `v8-e2e-ac-clinics-1440.png`, Julflona doctors mobile capture |
| Prior deploy baseline | [`V8_HOSTED_DEPLOYMENT_REPORT.md`](./V8_HOSTED_DEPLOYMENT_REPORT.md) |
| Migration tips | [`V8_TESTING_MIGRATION_EXECUTION.md`](./V8_TESTING_MIGRATION_EXECUTION.md) |
| Local 84/84 implementation | [`V8_SCREEN_IMPLEMENTATION_COVERAGE.md`](./V8_SCREEN_IMPLEMENTATION_COVERAGE.md) |

---

## 11. Return token

```
V8_HOSTED_QA_WITH_OPEN_DEFECTS
```

**12-flow line:** all **BLOCKED** (no authorized disposable V8 tenants/credentials for hosted persistence).  
**Exact blockers:** missing neuniversity tenant domains + credentials; product-hub `/register` timeout **DEFECT**; authenticated/visual 84-screen hosted verification incomplete.
