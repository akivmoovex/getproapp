# V10 PC10B — Publish Characterization Baselines

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_PC10B_PUBLISH_BASELINES` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Code / DB / deploy** | Tests + this evidence only — **no publish consolidation, no prod** |
| **Prerequisite** | PC10A triage complete |
| **Verdict** | **`PC10B_PUBLISH_BASELINES_COMPLETE`** |

---

## Suites

| File | Role |
|------|------|
| `tests/v10-pc10b-bb-publish-baselines.test.js` | BB tenant isolation, RBAC, multi-site governance, publish parity |
| `tests/v10-pc10b-ac-website-workflow-baseline.test.js` | AC workflow + platform authz contract + AC tenant isolation |

Intended contracts (not weakened):

- Capability roles: `organisation_administrator` / `branch_administrator` (not legacy chrome aliases).
- Page count: `PUBLIC_PAGE_KEYS.length`.
- Apex `/c/:org` → **301** primary-branch redirect.
- Restore must publish a **new** current version (service docstring).

---

## Run (2026-09-27)

```text
node --test \
  tests/v10-pc10b-bb-publish-baselines.test.js \
  tests/v10-pc10b-ac-website-workflow-baseline.test.js

# tests 20
# pass 19
# fail 1
```

Sole failure: BB restore claims `ok` but leaves prior current version id in place (no new published version row).

---

## Baseline markers

### TENANT_ISOLATION_BASELINE — **PASS**

```text
TENANT_ISOLATION_BASELINE
```

- BB: cross-tenant HTTP deny, forged org/church/branch body deny, branch scope deny, service `cross_org`.
- AC: `tenant_mismatch` / foreign instance deny on publish & unpublish; review policy isolation sample.

### RBAC_PERMISSION_MATRIX_BASELINE — **PASS**

```text
RBAC_PERMISSION_MATRIX_BASELINE
```

- Platform permission keys: editor cannot publish/restore; admin grants can.
- BB catalogue: `website_editor` edit-only; HQ / `website_publisher` may publish; HTTP 403 vs non-403.
- AC: publish/unpublish/restore forbidden without grants; allowed with `PLATFORM_ADMIN_PERMISSIONS`.

### WEBSITE_PUBLISH_PARITY_BASELINE — **FAIL**

```text
WEBSITE_PUBLISH_PARITY_BASELINE
```

| Area | Result |
|------|--------|
| Default page shell = `PUBLIC_PAGE_KEYS.length` | PASS |
| HQ `publishChurchWebsite` + unpublish + path-public 301 | PASS |
| HQ draft→published (`organisation_administrator`) | PASS |
| Restore → **new** current version id | **FAIL** |

**Failure (reproduced):** `restoreAndPublishCurrentVersion` returns `ok: true` / `publication.ok: true` but `getCurrentPublishedVersion` remains the pre-restore current id (prior B). Intended: new published version distinct from A and B.

### BB_MULTI_SITE_GOVERNANCE_BASELINE — **PASS**

```text
BB_MULTI_SITE_GOVERNANCE_BASELINE
```

- Capability matrix for HQ / branch_administrator (trusted vs submit vs forbidden).
- Branch submit-for-approval with intended role vocabulary.
- Branch trusted publish when `trustedActive` forced.

### AC_WEBSITE_WORKFLOW_BASELINE — **PASS**

```text
AC_WEBSITE_WORKFLOW_BASELINE
```

- Authorized / unauthorized publication.
- Draft→published + version growth.
- Submit workflow (draft not auto-promoted).
- Unpublish workflow.
- Restore live creates a new version.
- Clinic isolation + `REVIEW_BEFORE_PUBLISH` gate.

---

## PC10C blockers

1. **P0/P1 — BB restore version identity:** `restoreAndPublishCurrentVersion` must create a new published version (or stop returning `ok` when it does not). Blocks `WEBSITE_PUBLISH_PARITY_BASELINE` → cannot claim `WEBSITE_PUBLISH_PARITY_PASS`.
2. **Still required before consolidation (from PC10/PC10A):** formal `*_PASS` promotion after parity green; legacy suite drift (`church_hq_admin` / `branch_admin` aliases; hard-coded pageCount 8) remains outside these new baselines but still red in older suites.
3. **Do not start platform publication convergence** until parity baseline is green (or explicitly waived).

---

## Verdict block

```text
PC10B_PUBLISH_BASELINES_COMPLETE

TENANT_ISOLATION_BASELINE: PASS
RBAC_PERMISSION_MATRIX_BASELINE: PASS
WEBSITE_PUBLISH_PARITY_BASELINE: FAIL
BB_MULTI_SITE_GOVERNANCE_BASELINE: PASS
AC_WEBSITE_WORKFLOW_BASELINE: PASS

PC10C_BLOCKERS:
- BB restoreAndPublishCurrentVersion does not mint a new current version (ok:true no-op on version id)
- WEBSITE_PUBLISH_PARITY_PASS still blocked
- Legacy PC10A suite contract drifts remain (out of PC10B scope; not fixed here)
```
