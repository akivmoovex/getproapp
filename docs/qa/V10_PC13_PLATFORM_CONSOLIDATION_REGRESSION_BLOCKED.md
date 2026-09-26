# V10 PC13 — Final Technical Verification — **BLOCKED**

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_PC13_PLATFORM_CONSOLIDATION_REGRESSION` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Verdict** | **`V10_PLATFORM_CONSOLIDATION_REGRESSION_BLOCKED`** |
| **Required marker** | `V10_PLATFORM_CONSOLIDATION_REGRESSION_PASS` — **not awarded** |
| **Features added** | **NONE** |
| **Consolidation “fix while auditing”** | **NONE** |
| **Deploy / production** | **NOT TOUCHED** |

---

## 1. Prerequisite gate

User requires **PC01–PC12 PASS**.

| Item | Status |
|------|--------|
| PC01–PC09 | **PASS** (evidence under `docs/qa/V10_PC01`…`PC09`) |
| PC10 publication | **BLOCKED** |
| PC11 CMS | **BLOCKED** (needs PC10) |
| PC12 hygiene | **BLOCKED** (needs PC11) |

Therefore **`V10_PLATFORM_CONSOLIDATION_REGRESSION_PASS` cannot be declared.**

A **read-only verification snapshot** was still executed to quantify current architecture and regressions (below). No production code was changed to chase failures.

---

## 2. Metrics — before / after

### Platform → product hard-requires (`src/platform/**/*.js`)

| Metric | PC01 baseline | PC03 | Now (recalc) |
|--------|---------------|------|--------------|
| Unique files with product `require` | **40** | **33** | **32** |
| Allowlist entries (PC03 guard) | — | 33 | **32** (testing-reset inverted in PC08) |
| Require edges (file×match) | — | — | **175** |

Direction improved (40 → 32). Remaining are Class **E** composition/legacy bridges (documented in PC03).

### Finder `* 2.*` junk

| Metric | Prior notes | Now (recalc) |
|--------|-------------|--------------|
| Count | ~197 untracked (PC01) / ~543 audit backlog estimate | **768** files (`src` 209, `tests` 168, `docs` 115, `views` 106, …) |

**Worse / uncleansed** — PC12 never ran. Duplication noise **not** reduced.

### Hotspot LOC (intentional remaining twins)

| Hotspot | PC01 | Now |
|---------|------|-----|
| BB website editor routes | 1821 | **1727** (−94, PC07) |
| AC website editor routes | 1613 | **1544** (−69, PC07) |
| BB church publish service | 1401 | **1401** (PC10 blocked) |
| Platform publicationService | 375 | **375** |
| BB contentAdminRoutes | 3378 | **3378** (PC11 blocked) |
| AC website CMS routes | 2286 | **2286** |

---

## 3. Verification snapshot (automated)

Broad practical suite (`/tmp/pc13-snapshot.log`):

| Metric | Value |
|--------|-------|
| Tests | **378** |
| Pass | **372** |
| Fail | **6** |

### Covered areas (green in snapshot)

| # | Area | Result |
|---|------|--------|
| 1–4 | Platform→product guard, schema ownership, editor HTTP, media, ops UI | PASS |
| 5–9 | Registration/verification contracts (PC02), phone, session security, validation | PASS |
| 10–11 | RBAC matrices + tenant scope / forged-tenant | PASS |
| 12–15 | Shared website editor, drafts/preview matrix, governance, authz entry | PASS |
| 16–19 | Shared lifecycle draft/publish/restore, phase3/4 version/restore, section mgmt | PASS* |
| 20–22 | HQ/branch shared website, public URL hardening, clinic autonomy | PASS |
| 23–24 | AC Batch 2 shell/queues + Batch 3 ACN27 rooms | PASS |
| 25–26 | Migration ownership (PC06), Hostinger/media folders | PASS |

\*Shared engine publish/restore green; **BB classic church publish** red (below).

### Failures (documented separately — not consolidation-fixed this pass)

| Suite | Failures | Classification |
|-------|----------|----------------|
| `blessboard-church-website-publish` | 3 | **P1** publish/public-path baseline debt (entitlement count `9≠8`, public **301**) — blocks PC10 |
| `blessboard-website-draft-review-publish` | ≥1 (3 subtests in suite) | **P1** BB HQ publish/governance path — blocks PC10 |

Unrelated / known drifts **not re-failed in this snapshot** but still open elsewhere: `v2-shared-media-upload-parity` UI string/cache-bust; AC pass6 CDN vs local path asserts; some wave editor 301s.

---

## 4. Remaining intentional duplication

- BB vs AC **product catalogues**, themes, shells, Stitch compositions  
- BB `churchWebsitePublishService` vs platform `publicationService` (until PC10)  
- Classic CMS stacks: `contentAdminRoutes` vs `activeClinicWebsiteCmsRoutes` (until PC11)  
- BB operational `media_assets` vs platform `website_media` (PC08 boundary)  
- Hybrid `ac-table gp-ops-table` (PC09 on-touch)  
- Class E platform→product composition roots  

---

## 5. Remaining architectural debt

| Debt | Priority |
|------|----------|
| PC10 publication convergence blocked | **P0** (gate for PC11–13 PASS) |
| BB publish suite failures / missing `WEBSITE_PUBLISH_PARITY_PASS` | **P0/P1** |
| Missing named baselines: multi-site governance, AC workflow, formal tenant/RBAC PASS markers | **P1** |
| PC11 CMS convergence blocked | **P1** |
| PC12 Finder junk (768) + no clean checkpoint | **P2** |
| Remaining 32 platform→product Class E files | **P2** |
| V10_CLEAN_CHECKPOINT_CREATED still absent | **P2** |

---

## 6. Verdict

```text
V10_PLATFORM_CONSOLIDATION_REGRESSION_BLOCKED
```

Re-run PC13 for `V10_PLATFORM_CONSOLIDATION_REGRESSION_PASS` only after **PC10–PC12 PASS** and the BB publish baseline failures are resolved or formally rebaselined.
