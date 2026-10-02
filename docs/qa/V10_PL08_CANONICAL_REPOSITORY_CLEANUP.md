# V10 PL08 — Canonical Repository Cleanup

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_CANONICAL_REPOSITORY_CLEANUP` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisites** | PL01–PL07 PASS; PC20–PC21 Finder cleanup |
| **Verdict** | **`V10_CANONICAL_REPOSITORY_CLEANUP_PASS`** |

---

## Evidence inputs

| Source | Used for |
|--------|----------|
| PC20 / PC21 | Finder STALE_FORK set already deleted (127); residual file count **0** |
| PL01 / PL03 | Compat already removed in PL06 (phone shims, Resend re-export, legacy RBAC stub) |
| PL07 | Migration discovery excludes `* 2.sql`; ceiling **205** files; no obsolete migration copies on disk |

---

## Deleted (PL08)

| Item | Proof class | Why safe |
|------|-------------|---------|
| `scripts/local/_tmp_v2_01_*.js` (11) + `_tmp_v2_02_version_release_notes_qa.js` | Stale generated/local QA scratch | Untracked; `_tmp_` prefix; labeled UNRELATED_JUNK / EXCLUDE in V2.03/V10 reconciliations; **no** `package.json` / runtime `require` |
| Empty `src/blessboard/rbac/` | Leftover after PL06 stub delete | Directory empty; no modules remain |

**Count deleted this pass:** **12 files** + **1 empty directory**.

---

## Explicitly retained

| Item | Why |
|------|-----|
| `design-reference/stitch-screens/.../01-public-home-{desktop,mobile} 2` (+ mobile `3`) | Authoritative / design-reference Stitch dirs (PC20–PC25: not Finder runtime forks) |
| Historical QA docs under `docs/qa/V2_01_*` / references | Required historical documentation |
| `src/blessboard/services/organizationKey.js` thin re-export | Still used by older tests; not UNKNOWN delete |
| Hosted QA scripts under `scripts/local/` without `_tmp_` prefix | Intentional operator harnesses |
| Applied migration history / PC06 historical exceptions | Canonical baseline (PL07) |

---

## Already clean (verified; no further delete)

- Finder `* 2.*` / `* 3.*` / `* copy.*` under `src|public|views|tests|db`: **0**
- `db/migrations/**/* 2.sql`: **0** (excluded by migrator anyway)
- PC20 UNKNOWN / UNIQUE_REQUIRED / MIGRATION_SENSITIVE file classes: **0**

---

## Tests

| Suite | Result |
|-------|--------|
| `npm run test:architecture` | **PASS** (7/7) |
| Module load (`registerActiveClinicPlatformContracts` + `registerBlessBoardPlatformContracts`) + `discoverMigrations()===205` | **PASS** |
| `v10-pl08` + `v10-pl07` characterization | **PASS** (14/14) |
| BB smoke (`blessboard-platform-01-registration`, `v7-public-website-url-hardening`) | **PASS** |
| AC smoke (`activeclinic-website-cms`, `v7-bb-ac-phone-parity`) + V8 migration contract | **PASS** (15/15 + 7/7) |
| `activeclinic-mf03-registration` chrome | **FAIL** 2 subtests — **PRE_EXISTING** copy/markup drift (unrelated to `_tmp` deletes) |

---

## Required marker

```text
V10_CANONICAL_REPOSITORY_CLEANUP_PASS

Deleted: 12× scripts/local/_tmp_v2_* scratch + empty blessboard/rbac/
Finder * 2.* files: 0
Stitch design-reference * 2/* 3 dirs: retained
Migration discovery: 205 (no Finder junk)
```
