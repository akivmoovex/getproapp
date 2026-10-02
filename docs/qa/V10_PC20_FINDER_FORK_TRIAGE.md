# V10 PC20 — Finder Fork Triage

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_PC20_FINDER_FORK_TRIAGE` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisite** | PC19 `CROSS_PRODUCT_DEPENDENCY_ZERO_PASS` |
| **Code modified** | **NONE** (read-only classification) |
| **Deletes performed** | **NONE** |
| **Verdict** | **`FINDER_FORK_TRIAGE_COMPLETE`** |

Candidate source: `docs/qa/references/v10-pc12-hygiene/retained-content-differs.txt` (**127** paths).  
Artifacts: `docs/qa/references/v10-pc20-finder-triage/` (`triage.json`, per-class lists).

---

## Method

For each `* 2.*` / `* 3.*` / `* copy.*` candidate:

1. Resolve canonical by stripping the Finder suffix.
2. Confirm canonical exists on disk.
3. Diff bytes → whitespace/BOM-normalized text (or binary).
4. Search runtime/test/template sources for `require` / `include` / `render` of the **fork** path (exclude triage docs that only *mention* duplicates).
5. Flag migration/seed paths.
6. Spot-check git add dates where useful for large abandoned alternates.

**Not counted as consumers:** mentions in `docs/DUPLICATE_FILES_TRIAGE.md`, `docs/FIELD_AGENT_STABILIZATION_MERGE_PR.md`, `docs/qa/V2_01_MASTER_BACKLOG_AUDIT.md`, or PC12 hygiene inventories.

---

## Counts

```text
SAFE_DUPLICATE:       0
STALE_FORK:         127
UNIQUE_REQUIRED:      0
MIGRATION_SENSITIVE:  0
UNKNOWN:              0
SAFE_TO_DELETE_COUNT: 127
```

`SAFE_DUPLICATE = 0` because PC12 already removed byte-identical forks; all remaining 127 still **content-differ** from canonical.

`SAFE_TO_DELETE_COUNT` = SAFE_DUPLICATE + STALE_FORK = **127** (dependency view: no runtime consumer of any fork path; canonical exists).  
**Deletion is deferred** — this prompt does not delete. A later hygiene PC should still spot-check large abandoned alternates before bulk remove.

Repo-wide check: **zero** `require('… 2…')` from non-fork `src/**` files.

---

## Classification notes

| Class | Meaning here |
|-------|----------------|
| **STALE_FORK** (all 127) | Canonical exists; content differs; **no runtime/test require/include/render of the fork**; live tree uses the non-`2` path |
| **SAFE_DUPLICATE** | None left (already cleaned in PC12) |
| **UNIQUE_REQUIRED** | None — initial doc-mention hits were false positives |
| **MIGRATION_SENSITIVE** | None in this retained set |
| **UNKNOWN** | None after consumer proof + screenshot/no-ref resolution |

### STALE_FORK subclasses (for delete planning)

| Subclass | Approx | Guidance |
|----------|-------:|----------|
| Fork ⊆ canonical or ≤5 unique lines | majority | Lowest risk delete |
| Substantial unique line set (>50) abandoned alternate | ~8 JS | Diff-skim once before delete; do not merge silently |
| Playwright `* 2.png` screenshots | 6 | No test refs to `* 2.png` names |
| Docs / `scripts/local` QA forks | few | Docs/local only |

Large abandoned alternates (still **STALE_FORK**, not UNIQUE_REQUIRED):

- `public/blessboard/v5/website-branding 2.js`
- `src/activeclinic/services/activeClinicEmailDelivery 2.js`
- `src/activeclinic/services/activeClinicEmailResendAdapter 2.js`
- `src/activeclinic/services/clinicRegistrationDraft 2.js`
- `src/activeclinic/services/resolveActiveClinicRegistrationAdministrator 2.js`
- `src/blessboard/services/blessBoardLastAdminGuard 2.js`
- `src/blessboard/services/churchRegistrationDraft 2.js`
- `src/platform/rbac/sharedAuthzDecision 2.js`

Field-agent `src/**/* 2.js` cluster (10 files): already documented as remaining duplicates in `docs/DUPLICATE_FILES_TRIAGE.md`; forks `require` **canonical** siblings (no ` 2` in require strings).

---

## Paths

Full path lists: `docs/qa/references/v10-pc20-finder-triage/stale_fork.txt` (127 lines).  
Empty class files: `safe_duplicate.txt`, `unique_required.txt`, `migration_sensitive.txt`, `unknown.txt`.

Retained **directories** from PC12 (`retained-dirs-content-differs.txt`, 3 stitch design-reference dirs) are **out of this file-candidate set** — not re-triaged as `* 2.*` files.

---

## Marker

```text
FINDER_FORK_TRIAGE_COMPLETE

SAFE_DUPLICATE: 0
STALE_FORK: 127
UNIQUE_REQUIRED: 0
MIGRATION_SENSITIVE: 0
UNKNOWN: 0
SAFE_TO_DELETE_COUNT: 127
```
