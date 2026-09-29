# V2.04 Website Platformization — Overnight Architecture QA (Step 7)

| Field | Value |
|---|---|
| **VERSION** | 2.04 Overnight Step 7 |
| **MODE** | **READ-ONLY** final architecture QA |
| **BRANCH** | V4 |
| **DATE** | 2026-09-30 |
| **SCOPE** | Verify Steps 1–5 reduced duplication without illegal cross-product coupling |
| **APPLICATION_CODE_CHANGED** | **NO** |
| **WORKTREE_INTEGRITY** | **PASS** (docs-only deltas from Step 6 remain uncommitted; no app mutations this step) |

---

## Architecture under test

```
BB DOMAIN ─→ BB ADAPTER ─┐
                         ├→ PLATFORM PRESENTATION
AC DOMAIN ─→ AC ADAPTER ─┘
                                 ↓
                        SHARED COMPONENTS
                                 ↓
                         SHARED EDITOR (WE01)
```

Evidence sources (no rediscovery of full platform):

- `docs/design/PLATFORM_WEBSITE_PRESENTATION_MODEL.md`
- `docs/qa/V2_04_AC_WEBSITE_PLATFORM_REUSE_AUDIT.md`
- `src/platform/website/presentation/*`
- `views/platform/website/components/*`
- `src/activeclinic/website/activeClinicWebsitePresentationAdapter.js`
- `websiteMediaEditingContract.js` / `platformAdminWebsiteConsoleContract.js`
- `npm run test:architecture` + focused V2.04 website tests

---

## Step 1–5 delivery checklist

| Step | Artifact | Gate |
|---|---|---|
| 1 | Presentation contracts / vocabulary | **PASS** (`PHASE` + audit inventory 18/42/175/25) |
| 2 | 18 shared components + token bridge | **PASS** (`SHARED_COMPONENT_COUNT=18`, shareability 74%→89%) |
| 3 | AC presentation adapter (unwired) | **PASS** (`wiredToPublicRender: false`) |
| 4 | Shared media + UIE consolidation | **PASS** (`SHARED_UPLOAD_ENGINE_COUNT=1`) |
| 5 | Platform Admin website console | **PASS** (governance contract) |

Public render / editor mutation remain **unwired** for presentation library (by design overnight).

---

## Coupling scan results

### Presentation / shared components (must be product-free)

| Surface | Product requires | Result |
|---|---|---|
| `src/platform/website/presentation/**` | AC or BB | **0** |
| `views/platform/website/components/**` | AC or BB | **0** |

### Cross-product product→product

| Direction | Edges in `src/activeclinic` ↔ `src/blessboard` | Result |
|---|---|---|
| AC → BB | **0** | **PASS** |
| BB → AC | **0** | **PASS** |
| AC website → BB | **0** | **PASS** |
| BB website → AC | **0** | **PASS** |

### Platform website → product domain (Class E composition debt)

Counted unique `require(...)` edges under `src/platform/website/*.js` (excluding `* 2.js` duplicates):

| Metric | Count | Notes |
|---|---:|---|
| **PLATFORM_TO_AC_DOMAIN_COUPLING** | **5** | `governanceVersionPreview.js` (4) + `platformAdminWebsitesService.js` (1 availability) |
| **PLATFORM_TO_BB_DOMAIN_COUPLING** | **12** | `governanceVersionPreview.js` (6) + `platformAdminWebsitesService.js` (4) + `lifecycleService.js` (1) + `websiteSettingsHttp.js` (1) |

All of these files appear on `PLATFORM_PRODUCT_REQUIRE_ALLOWLIST` in `scripts/architecture/dependencyDirectionAllowlists.js` (Class E).  
`npm run test:architecture` → **PASS** (zero unexplained edges).

**Overnight Steps 1–5 did not add presentation-layer product imports.** Remaining platform→product edges are pre-existing governance / lifecycle / version-preview bridges — **reported, not fixed in Step 7**.

---

## Engine singularity

| Engine | Count | Evidence |
|---|---:|---|
| **SHARED_EDITOR_ENGINE_COUNT** | **1** | Active: `public/platform/website-inline-edit.js` (loaded by BB + AC public shells). Legacy `public/blessboard/v5/website-inline-edit.js` exists on disk but is **not** referenced from views. |
| **SHARED_UPLOAD_ENGINE_COUNT** | **1** | Website: `mediaService.registerWebsiteMedia` → `platform.website_media`. BB operational `media_assets` remains product-specific (documented Step 4). |
| Shared image editor | **1** | `GpUniversalImageEditor` via WE01 + `website-media-field.js` |
| Duplicate presentation libraries | **0** | Single `views/platform/website/components` registry |

---

## Shareability metrics (post Steps 1–5)

| Metric | Pre-overnight audit | Post Steps 1–5 | Notes |
|---|---|---|---|
| **FIELDS_SHAREABLE_AT_PLATFORM** | **35%** | **35%** | Class A vocabulary + Class B component mapping landed; Class C (175) untouched — opportunity % unchanged |
| **COMPONENTS_SHAREABLE_AT_PLATFORM** | **74%** | **89%** | 17/19 audited patterns have shared presentation coverage (`COMPONENT_SHAREABILITY_AFTER`) |
| **EDITOR_LOGIC_SHAREABLE_AT_PLATFORM** | **~85%** | **~85%** | Still one WE01; residual product chrome / Class B replace-only slots |
| **LIFECYCLE_LOGIC_SHAREABLE_AT_PLATFORM** | **~70%** | **~70%** | Overnight did not migrate BB dual-path lifecycle |

**Duplication reduced primarily in components (74%→89%)** without merging domains.

---

## Theme isolation

| Check | Result |
|---|---|
| Shared component CSS uses `--gp-website-*` only | **PASS** |
| Token bridge scopes BB (`body.bb-*`) vs AC (`body.ac-*`) separately | **PASS** |
| `findThemeTokenLeaks` on component CSS (BB + AC) | **0** |
| **RAW_PRODUCT_COLORS_IN_SHARED_COMPONENTS** | **0** (no `#6C5CE7` / `#006068` / product hex in component CSS) |
| **UNDEFINED_THEME_TOKENS** | **0** (all `PLATFORM_THEME_TOKENS` present in bridge) |

---

## Domain boundaries

| Forbidden merge | `assertDomainBoundary` |
|---|---|
| doctor ↔ pastor_leader | **ok: false** |
| clinical_service ↔ ministry | **ok: false** |

AC adapter emits `sourceDomain: doctor | clinical_service`; no pastor/ministry merge.

---

## Platform Admin

Governance console remains **control-only** (no embedded WE01 / UIE / second publish engine in PA templates). Customer hubs stay `/app/settings/website` (AC) and `/hq/website` (BB).

---

## Regression tests run (Step 7)

| Suite | Result |
|---|---|
| `npm run test:architecture` | **PASS** (7) |
| `tests/v2-04-platform-website-presentation.test.js` | **PASS** |
| `tests/v2-04-shared-website-components.test.js` | **PASS** |
| `tests/v2-04-ac-website-presentation-adapter.test.js` | **PASS** |
| `tests/v2-04-shared-website-media-hardening.test.js` | **PASS** |
| `tests/v2-04-platform-admin-website-console.test.js` | **PASS** |
| `tests/v2-02-universal-image-editor-coverage.test.js` | **PASS** |
| Combined focused | **63 pass / 0 fail** |

| Gate | Value |
|---|---|
| **BB_REGRESSION** | **PASS** (templates unwired; theme bridge isolated; architecture clean) |
| **AC_REGRESSION** | **PASS** (adapter unwired; public templates unchanged by presentation library) |
| **TESTS** | **PASS** |

---

## Findings (reported; not fixed)

1. **Class E platform→product requires remain** (5 AC + 12 BB edges in `src/platform/website`). Allowlisted; composition debt for governance/lifecycle/version preview — future work to push behind product adapters if desired.
2. **Legacy BB `website-inline-edit.js` file still on disk** (unused by views) — cosmetic duplicate file, not a second active engine.
3. **Field shareability still ~35%** — overnight did not migrate Class C product fields (correct by design).
4. **Lifecycle shareability still ~70%** — BB dual-path untouched (correct by overnight scope).
5. **Presentation library still opt-in** (`wiredToPublicRender: false`) — Stitch implementation steps own wiring.

No Step 7 blocker: no new AC↔BB coupling, no presentation→domain coupling, engines singular, theme clean, tests green.

---

## Final response block

```
STEP=7
PLATFORM_TO_AC_DOMAIN_COUPLING=5
PLATFORM_TO_BB_DOMAIN_COUPLING=12
AC_TO_BB_COUPLING=0
BB_TO_AC_COUPLING=0

SHARED_EDITOR_ENGINE_COUNT=1
SHARED_UPLOAD_ENGINE_COUNT=1

FIELDS_SHAREABLE_AT_PLATFORM=35%
COMPONENTS_SHAREABLE_AT_PLATFORM=89%
EDITOR_LOGIC_SHAREABLE_AT_PLATFORM=85%
LIFECYCLE_LOGIC_SHAREABLE_AT_PLATFORM=70%

UNDEFINED_THEME_TOKENS=0
RAW_PRODUCT_COLORS_IN_SHARED_COMPONENTS=0

BB_REGRESSION=PASS
AC_REGRESSION=PASS
TESTS=PASS

APPLICATION_CODE_CHANGED=NO
WORKTREE_INTEGRITY=PASS

FINAL=PASS
```
