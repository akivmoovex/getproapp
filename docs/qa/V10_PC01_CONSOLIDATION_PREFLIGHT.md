# V10 PC01 — Platform Consolidation Preflight

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_PC01_CONSOLIDATION_PREFLIGHT` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **HEAD** | `c8983ff7791cd64c915840c79616992f6ea62bbd` |
| **origin/V10** | `b8c18c3ded9892aa318ae6e029600aa34ff4941b` |
| **Ahead / behind** | **1 / 0** (docs-only tip: `docs: freeze V2.03 QA release handoff`) |
| **Application candidate (frozen)** | `b8c18c3ded9892aa318ae6e029600aa34ff4941b` (`V2_03_FINAL_RELEASE_GATE_PASS`) |
| **Verdict** | **`V10_PC01_CONSOLIDATION_PREFLIGHT_PASS`** |
| **Safe to continue (characterization)** | **YES** |
| **Architecture refactor / PC01 implementation** | **NOT STARTED** — still gated |
| **Production / deploy** | **NOT TOUCHED** |

---

## 1. Purpose

Establish a safe consolidation baseline before any platform→product dependency inversion or infrastructure extraction.

This preflight:

- verified branch / freeze / Batch reconciliation
- recalculated platform→product import inventory
- inventoried known consolidation targets
- ran focused BB/AC/platform baseline tests
- **did not** modify production application code
- **did not** deploy

---

## 2. STOP-gate checks

| Gate | Result | Evidence |
|------|--------|----------|
| Unresolved merge conflicts | **CLEAR** | No `MERGE_HEAD` / rebase; conflict count 0 |
| Batch 1/2/3 reconciled | **YES** | `V2_03_QA_RELEASE_HANDOFF.md`, `V2_03_RELEASE_FREEZE.md`, `V2_03_FINAL_RELEASE_GATE_PASS` on app SHA `b8c18c3d…`; Batch 3 ACN27/ACN18/AC-P05 implemented + reconciled |
| Conflicting implementation edits in worktree | **CLEAR for app code** | Modified tracked files are **docs only**; no non-junk dirty `src/` / `views/` / `public/` / `db/` / `tests/` / `package*` from this preflight |
| Unexplained P0/P1 baseline failures | **NONE** | Core suite 100/100 PASS; secondary UI-string contract failures classified below |

### Worktree classification (at preflight)

| Class | Items |
|-------|--------|
| **Committed tip (ahead of origin)** | Docs freeze handoff only (`c8983ff7`) |
| **Modified tracked (uncommitted)** | `docs/qa/V2_03_BATCH2_ENGINEERING_FREEZE.md`, `docs/v2.03/PLATFORM_REUSE_AUDIT.md`, `docs/v2.03/PLATFORM_SHARED_FOUNDATION.md` — documentation only |
| **Untracked consolidation backlog** | `docs/v2.03/V2_03_PLATFORM_CONSOLIDATION_BACKLOG.md` |
| **Unrelated junk** | ~197 Finder `* 2.*` untracked; V2.01 QA refs/`_tmp_*` scripts |
| **Application implementation dirtiness** | **None** (non-junk) |

Dirty docs and Finder junk must **not** be mixed into consolidation implementation commits. They do **not** block characterization planning.

---

## 3. Documents read

| Document | Role |
|----------|------|
| `docs/v2.03/V2_03_PLATFORM_CONSOLIDATION_BACKLOG.md` | Epic + PLATFORM-CONSOLIDATION-00…12 |
| `docs/v2.03/PLATFORM_SHARED_FOUNDATION.md` | Shared jobs/history/list/timeline/gp-ops |
| `docs/v2.03/PLATFORM_REUSE_AUDIT.md` | Batch 1 A/B/C reuse classification |
| `docs/qa/V2_03_QA_RELEASE_HANDOFF.md` | Batch 1/2/3 release identity |
| `docs/qa/V2_03_RELEASE_FREEZE.md` | Frozen app candidate + final gate PASS |
| `docs/qa/V2_03_NEW_SCREENS_FINAL_RECONCILIATION.md` | ACN27/ACN18/AC-P05 reconciliation PASS |
| `docs/BACKLOG.md` | Canonical index pointer |

---

## 4. Platform → product dependency inventory (recalculated)

**Method:** walk `src/platform/**/*.js` excluding Finder `* 2.*`; match `require(...blessboard/|.../church/|...activeclinic/)`.

| Target | Unique platform files |
|--------|------------------------|
| → `src/blessboard/` | **37** |
| → `src/church/` | **4** |
| → `src/activeclinic/` | **15** |
| **Unique files with any product require** | **40** |

**Audit baseline update:**

| Marker | Value |
|--------|--------|
| Prior audit (`AUDIT_BASELINE_2026_09_26`) | ~38 |
| **Recalculated (`AUDIT_BASELINE_2026_09_27_PC01`)** | **40** |

Do not treat either number as permanent. Recalculate again before PLATFORM-CONSOLIDATION-01 implementation.

### Highest-coupling files (illustrative)

- `src/platform/http/v5FoundationServer.js` — BB+church+AC
- `src/platform/http/platformAdminRoutes.js` — BB+AC
- `src/platform/services/getPlatformAdminSettingsView.js` — BB+church+AC (includes AC email delivery)
- `src/platform/website/*` section/add-section/governance/publish bridges
- `src/platform/registration/index.js`, `onboarding/adapters.js`, `rbac/sharedRbacFacade.js` — intentional adapter seams (still hard-require today)

Adapter registration modules (`registration/index.js`, `onboarding/adapters.js`, `sharedRbacFacade.js`) are **in scope** for dependency inversion even though they are the intended seam pattern — they still hard-require product packages at call/load time.

---

## 5. Consolidation target inventory

| Target | Paths | LOC (approx) | Status |
|--------|-------|--------------|--------|
| Registration drafts | `churchRegistrationDraft.js` ↔ `clinicRegistrationDraft.js` | 97 / 97 | Present — exact twins |
| Verification wrappers | `blessBoardSharedVerification.js` ↔ `activeClinicSharedVerification.js` | 75 / 75 | Present |
| Phone field | Platform/BB shims → `views/activeclinic/partials/phone-field.ejs` + `public/activeclinic/ac-phone-field.{js,css}` | 10 + 171 + 216 + 255 | Ownership inverted (confirmed) |
| Email transport | `activeClinicEmailDelivery.js`; consumed by platform `getPlatformAdminSettingsView.js` (+ AC services) | 478 | AC-owned transport |
| Website editor HTTP | `blessboardWebsiteEditorRoutes.js` ↔ `activeClinicWebsiteRoutes.js` | 1821 / 1613 | Structural twins |
| Media | `src/platform/website/mediaService.js` (+ product routes/pickers) | 976 | Platform service present |
| Publishing | `churchWebsitePublishService.js` ↔ `platform/website/publicationService.js` | 1401 / 375 | Divergent depth |
| Classic CMS | `contentAdminRoutes.js` ↔ `activeClinicWebsiteCmsRoutes.js` | 3378 / 2286 | Parallel stacks |

---

## 6. Baseline test results

### Suite A — consolidation core (required)

```text
node --test --test-concurrency=1 \
  tests/v2-03-platform-shared-foundation.test.js \
  tests/v7-bb-ac-phone-parity.test.js \
  tests/v7-shared-phone-identity.test.js \
  tests/v8-shared-verification.test.js \
  tests/v8-shared-validation.test.js \
  tests/v8-shared-session-security.test.js \
  tests/v8-shared-rbac-tenant-isolation.test.js \
  tests/v7-shared-website-authorization-entrypoint.test.js \
  tests/v7-shared-registration-country-selection.test.js
```

| Metric | Result |
|--------|--------|
| tests | **100** |
| pass | **100** |
| fail | **0** |
| duration | ~22.6s |

### Suite B — website editor / media contracts (secondary)

```text
node --test --test-concurrency=1 \
  tests/v7-shared-website-editor.test.js \
  tests/v2-shared-media-upload-parity.test.js \
  tests/shared-website-editor-wave1.test.js
```

| Metric | Result |
|--------|--------|
| tests | **16** |
| pass | **13** |
| fail | **3** |

**Functional matrix inside Suite B:** `v7-shared-website-editor` BB+AC enter/save/preview/publish/version/public — **PASS**.

### Known pre-existing / explained failures (Suite B)

| Test | Failure class | Notes |
|------|---------------|-------|
| `shared-website-editor-wave1` — shared Stitch chrome expects `>Publish<` | **UI_STRING_CONTRACT_DRIFT** | AC draft HTML no longer matches exact `>Publish<` regex; not an auth/tenant isolation failure |
| `v2-shared-media-upload-parity` — `Choose from Content Library` | **UI_STRING_CONTRACT_DRIFT** | Inline editor copy diverged from outdated assertion |
| `v2-shared-media-upload-parity` — `website-inline-edit.css?v=v2-media-parity-1` | **CACHE_BUST_CONTRACT_DRIFT** | Shell asset version stamp no longer matches frozen test expectation |

These are **not** unexplained P0/P1 security or tenant-isolation failures. They should be refreshed during PLATFORM-CONSOLIDATION-00 characterization, not treated as blockers for planning.

---

## 7. Implementation gates (unchanged)

Before any consolidation item changes production code:

```text
V2_03_BATCH_IMPLEMENTATION_RECONCILED          # satisfied at app SHA b8c18c3d…
V10_CLEAN_CHECKPOINT_CREATED                   # NOT YET — docs dirt + Finder junk remain
PLATFORM_CONSOLIDATION_CHARACTERIZATION_PASS   # NOT YET — PLATFORM-CONSOLIDATION-00
```

**Allowed next step:** PLATFORM-CONSOLIDATION-00 characterization / contract tests (documentation + tests only; no architecture extraction).

**Not allowed yet:** PLATFORM-CONSOLIDATION-01 dependency inversion or production refactors.

---

## 8. Verdict

```text
V10_PC01_CONSOLIDATION_PREFLIGHT_PASS
```

| Question | Answer |
|----------|--------|
| Safe to continue characterization? | **YES** |
| Safe to start architecture extraction? | **NO** (await clean checkpoint + characterization pass) |
| Source / migrations / package changed by this preflight? | **NO** |
| Deploy / production touched? | **NO** |

### Cross-references

- [`docs/v2.03/V2_03_PLATFORM_CONSOLIDATION_BACKLOG.md`](../v2.03/V2_03_PLATFORM_CONSOLIDATION_BACKLOG.md)
- [`docs/v2.03/PLATFORM_SHARED_FOUNDATION.md`](../v2.03/PLATFORM_SHARED_FOUNDATION.md)
- [`docs/v2.03/PLATFORM_REUSE_AUDIT.md`](../v2.03/PLATFORM_REUSE_AUDIT.md)
- [`docs/qa/V2_03_QA_RELEASE_HANDOFF.md`](./V2_03_QA_RELEASE_HANDOFF.md)
- [`docs/qa/V2_03_RELEASE_FREEZE.md`](./V2_03_RELEASE_FREEZE.md)
