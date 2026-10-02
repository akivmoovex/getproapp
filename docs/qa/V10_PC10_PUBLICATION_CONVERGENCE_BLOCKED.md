# V10 PC10 — Website Publishing Convergence — **BLOCKED**

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_PC10_PUBLICATION_CONVERGENCE` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Risk** | **HIGH** |
| **Verdict** | **`PLATFORM_PUBLICATION_CONVERGENCE_BLOCKED`** |
| **Code changes** | **NONE** (gate stop — no convergence work started) |
| **Deploy / production** | **NOT TOUCHED** |

Backlog gates: [`docs/v2.03/V2_03_PLATFORM_CONSOLIDATION_BACKLOG.md`](../v2.03/V2_03_PLATFORM_CONSOLIDATION_BACKLOG.md) § Implementation gates (PC10/PC11).

---

## 1. Instruction honored

User + backlog require: if any high-risk prerequisite is absent → **STOP and report BLOCKED**.

No platform publication engine merge, adapter rewrite, feature switch, or path deletion was performed.

---

## 2. Prerequisite checklist

| Gate | Status | Evidence |
|------|--------|----------|
| PC01–PC09 PASS | **PASS** | `docs/qa/V10_PC01` … `V10_PC09_*.md` |
| `PLATFORM_CONSOLIDATION_CHARACTERIZATION_PASS` (PC02) | **PASS** | `V10_PC02_…` |
| `V10_CLEAN_CHECKPOINT_CREATED` | **ABSENT** | PC01: “NOT YET — docs dirt + Finder junk remain” |
| `TENANT_ISOLATION_TESTS_PASS` | **ABSENT as named baseline** | No QA doc declares this marker. Suite sample: `v8-shared-rbac-tenant-isolation` **green** in prereq run — still lacks formal baseline PASS artifact. |
| `RBAC_PERMISSION_MATRIX_PASS` | **ABSENT as named baseline** | No QA doc declares this marker. Suite sample: `v7-website-rbac` + V8 RBAC permission matrices **green** — still lacks formal baseline PASS artifact. |
| `WEBSITE_PUBLISH_PARITY_PASS` | **ABSENT / FAILING** | Marker not declared. Publish suites **red** (below). |
| `BB_MULTI_SITE_GOVERNANCE_BASELINE_PASS` | **ABSENT** | Marker not declared anywhere under `docs/qa`. HQ/branch shared suite green does **not** substitute for a named multi-site governance baseline. |
| `AC_WEBSITE_WORKFLOW_BASELINE_PASS` | **ABSENT** | Marker not declared. Clinic autonomy suite green does **not** substitute for a named AC submit/unpublish/workflow baseline. |

**Blocking absences:** clean checkpoint + named publish parity + BB multi-site governance baseline + AC website workflow baseline (and formal tenant/RBAC baseline markers).

---

## 3. Current publish path inventory (read-only)

| Path | LOC (approx) | Role today |
|------|--------------|------------|
| `src/blessboard/services/churchWebsitePublishService.js` | ~1401 | BB church publish/unpublish + readiness; registered as BB lifecycle |
| `src/platform/website/publicationService.js` | ~375 | Shared engine publish/unpublish/restore used by AC (+ some BB restore) |
| `src/blessboard/services/websiteDraftPublishService.js` | — | Classic CMS draft publish / submit-for-approval → calls church publish |
| AC routes | — | `publishWebsiteDraft`, `unpublish`, `submit`, edit-session via `publicationService` / submissionService |
| Lifecycle registry | — | BB → `publishChurchWebsite`; AC → `publicationService.publishWebsiteDraft` |

Divergent depth confirmed (PC01/PC02). Convergence is **not** ready until parity baselines are green and documented.

---

## 4. Prerequisite suite sample (2026-09-27)

```text
tests/v8-shared-rbac-tenant-isolation.test.js          PASS (in sample)
tests/v7-website-rbac.test.js                          PASS
tests/v7-shared-website-governance.test.js             PASS
tests/v7-shared-website-authorization-entrypoint.test.js PASS
tests/v2-01-shared-hq-branch-website.test.js           PASS
tests/v7-clinic-website-autonomy-acceptance.test.js    PASS
tests/phase4-publish-website.test.js                   PASS
tests/v7-shared-website-editor.test.js                 PASS
tests/blessboard-church-website-publish.test.js        FAIL (3 subtests)
tests/blessboard-website-draft-review-publish.test.js  FAIL (≥1 publish path)
```

Aggregate sample: **95 tests · 89 pass · 6 fail**.

Observed BB publish failures (examples):

- Default shell entitlement assertions (`9 !== 8`)
- Public path after publish returns **301** vs expected **200**
- HQ publish path assertions failing (`forbidden` / false≠true in prior PC07 broad run; still failing draft-review publish here)

These prevent claiming `WEBSITE_PUBLISH_PARITY_PASS`.

---

## 5. What must be completed before PC10 may start

1. Create / declare formal baseline docs with exact markers:
   - `TENANT_ISOLATION_TESTS_PASS`
   - `RBAC_PERMISSION_MATRIX_PASS`
   - `WEBSITE_PUBLISH_PARITY_PASS`
   - `BB_MULTI_SITE_GOVERNANCE_BASELINE_PASS`
   - `AC_WEBSITE_WORKFLOW_BASELINE_PASS`
2. Repair or rebaseline failing BB church / draft-review publish suites until green under an agreed contract.
3. Prefer `V10_CLEAN_CHECKPOINT_CREATED` (or explicitly waive with owner approval recorded in backlog).
4. Only then: platform generic engine + BB/AC governance adapters, temporary compatibility switch, exhaustive suites, `PLATFORM_PUBLICATION_CONVERGENCE_PASS`.

---

## 6. Verdict

```text
PLATFORM_PUBLICATION_CONVERGENCE_BLOCKED
```

**No old/new path, governance hooks, permission tests, parity results, or rollback mechanism** — work did not start. Resume only after the checklist in §5 is satisfied.
