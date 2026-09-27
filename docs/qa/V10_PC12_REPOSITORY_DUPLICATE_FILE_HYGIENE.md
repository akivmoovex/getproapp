# V10 PC12 — Repository Duplicate File Hygiene

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_PC12_REPOSITORY_DUPLICATE_FILE_HYGIENE` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisites** | `PLATFORM_CMS_CONVERGENCE_PASS` (PC11) |
| **Architecture changes** | **NONE** (hygiene-only) |
| **Deploy / production** | **NOT TOUCHED** |
| **Canonical migrations** | **NOT REMOVED** |
| **Verdict** | **`REPOSITORY_DUPLICATE_FILE_HYGIENE_PASS`** |

Supersedes: `docs/qa/V10_PC12_REPOSITORY_HYGIENE_BLOCKED.md` (was blocked on PC11).

Inventory artifacts:

- `docs/qa/references/v10-pc12-hygiene/removed-identical.txt` (641)
- `docs/qa/references/v10-pc12-hygiene/retained-content-differs.txt` (127)
- `docs/qa/references/v10-pc12-hygiene/retained-dirs-content-differs.txt` (3)

---

## 1. Method

1. Inventory Finder-style names: `* 2.*`, `* 3.*`, `* 4.*`, `* copy.*`, `* Copy.*` (exclude `.git` / `node_modules`).
2. Resolve canonical by stripping the space-suffix before the extension.
3. SHA-256 compare to canonical.
4. Delete **only** when **all** hold:
   - canonical counterpart exists
   - byte-identical (duplicate/junk)
   - no code import/reference to the junk path
   - not deployment-required under the junk name
   - not unique content
   - not migration-history sensitive as an applied/discovery filename  
     (`db/scripts/lib/migrator.js` already excludes `* 2.sql` from discovery; identical `* 2.sql` junk only deleted when canonical numbered migration remains)
5. Retain content-differing copies and non-identical stitch directories for a later triage (diff/merge), not silent delete.

---

## 2. Candidates

| Class | Count |
|-------|------:|
| File candidates matching Finder pattern | **768** |
| Byte-identical to canonical | **641** |
| Content differs from canonical | **127** |
| Directory candidates (`* 2` / `* 3`) | **4** initially |

Canonical counterpart existed for **every** file candidate (0 missing).

---

## 3. Removed

| Item | Count | Reason |
|------|------:|--------|
| Byte-identical `* 2.*` / `* 3.*` / `* copy.*` files | **641** | Canonical exists; SHA match; no require/import of junk path; migrator ignores `* 2.sql` |
| Empty dir `views/platform/release-notes/partials 2` | **1** | Empty junk; canonical `partials/` exists |

Including **34** identical `db/migrations/**/* 2.sql` and **1** identical `db/seeds/* 2.sql` — **canonical migration/seed files retained**; only Finder copies removed. Zero `* 2.sql` remain under `db/migrations/`.

Top-level breakdown of removed files: `src` 146 · `tests` 141 · `docs` 113 · `views` 83 · `public` 55 · `scripts` 54 · `db` 49.

---

## 4. Retained (and why)

### Files — content differs (127)

Canonical exists but SHA differs → **not proven duplicate/junk**. Retained:

| Area | Count |
|------|------:|
| `src/` | 63 |
| `tests/` | 27 |
| `views/` | 23 |
| `public/` | 9 |
| `scripts/` | 3 |
| `docs/` | 2 |

Examples: `src/platform/website/publicationService 2.js`, `src/blessboard/http/blessboardWebsiteEditorRoutes 2.js`, field-agent `* 2.js` forks, QA screenshot `* 2.png` under docs/tests references.

**Do not delete these in PC12** — they need separate diff/merge triage (see also historical `docs/DUPLICATE_FILES_TRIAGE.md`).

### Directories — content differs (3)

| Path | Reason |
|------|--------|
| `design-reference/.../01-public-home-desktop 2` | HTML/MD differ; canonical has extra PNG |
| `design-reference/.../01-public-home-mobile 2` | HTML/PNG differ |
| `design-reference/.../01-public-home-mobile 3` | HTML/PNG differ |

Documented as excluded stitch duplicates in `docs/blessboard-stitch-screen-inventory.md` — retained pending design-reference cleanup.

### Never removed

- Any **canonical** numbered migration (`NNN_name.sql` without Finder suffix)
- Applied migration history / `platform.schema_migrations` rows
- Content-differing forks that might hold unique edits

---

## 5. Verification

| Check | Result |
|-------|--------|
| Migration discovery | **205** migrations · **9** seeds · **0** junk filenames in discovery |
| Module load (platform website/engine, BB/AC bootstraps, PC10/PC11 helpers, migrator) | **9 / 9 OK** |
| `tests/v8-migration-contract.test.js` | **PASS** |
| `tests/v10-pc11-cms-convergence.test.js` | **PASS** |
| `tests/v10-pc10-publication-convergence.test.js` | **PASS** |
| `tests/v10-pc08-platform-media-consolidation.test.js` | **PASS** |
| `tests/v7-shared-media-folders.test.js` | **PASS** |
| `tests/v10-pc07-shared-website-editor-http.test.js` | **PASS** |
| Aggregate sample | **66 / 66 PASS** |

Note (unrelated to PC12 deletes): `tests/church-database-identity.test.js` still has a **pre-existing** hardcoded expect of `124_church_growth_scheduled_job_safety.sql` while `db/postgres` and `latestChurchSchemaMigration()` already surface `127_…`. No `db/postgres` Finder duplicates were touched.

---

## 6. Verdict

```text
REPOSITORY_DUPLICATE_FILE_HYGIENE_PASS

Candidates: 768 files (+ 4 dirs)
Removed: 641 identical files + 1 empty dir
Retained: 127 content-differing files + 3 stitch dirs
Canonical migrations: untouched
Deploy: NOT TOUCHED
Architecture: NOT CHANGED
```
