# V10 PC22 — Residual P2 Architecture Audit

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_RESIDUAL_P2_ARCHITECTURE_AUDIT` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisites** | PC17–PC21 PASS |
| **Mode** | **READ-ONLY** (no code refactor) |
| **Deploy / production DB** | **NOT TOUCHED** |
| **Verdict** | **`V10_RESIDUAL_P2_ARCHITECTURE_AUDIT_COMPLETE`** |

Current scanner (evidence):

```text
platformAllowlistSize: 30   (was 32 at PC15 / 31 post-PC18 / 30 post-PC19)
crossAllowlistSize:    0
BB→AC: 0 | AC→BB: 0 | AC→church: 0
Finder * 2.* files:    0
Finder * 2/* 3 dirs:   3 (stitch design-reference only)
```

---

## Classification legend

| Label | Meaning |
|-------|---------|
| **REQUIRED_COMPOSITION** | Platform edge must know products exist (mount/admin/bridge); not accidental coupling |
| **INTENTIONAL_PRODUCT_CODE** | Domain catalogues, workflows, themes — correctly product-owned |
| **SAFE_P2_FUTURE_REFACTOR** | Optional debt; only when consumers/parity proven; not blocking |
| **P3_ON_TOUCH** | Clean only when already editing that surface |
| **OBSOLETE_SHIM_CANDIDATE** | Thin re-export / legacy URL; remove only after zero callers |
| **ACTUAL_ARCHITECTURE_PROBLEM** | Direction/isolation/security defect |

---

## 1. Platform→product Class-E composition roots (**30**)

**Evidence:** `scripts/architecture/dependencyDirectionAllowlists.js` + require scan of each allowlisted file.

| Bucket (approx) | Count | Examples | Class |
|-----------------|------:|----------|-------|
| Runtime composition roots | 2 | `v5FoundationServer`, `moovexPlatformRuntimeServer` | **REQUIRED_COMPOSITION** |
| Platform-admin / support surfaces | ~11 | `platformAdminRoutes`, team/recovery/entitlements, website admin | **REQUIRED_COMPOSITION** |
| Website lifecycle / governance admin | ~4 | `lifecycleService`, `governanceVersionPreview`, `websiteSettingsHttp` | **REQUIRED_COMPOSITION** |
| BB engine bridge / barrel | 3 | `blessboardBridge`, backfill, `website-engine/index` | **REQUIRED_COMPOSITION** (BB dual-writer) |
| Registration preview / recovery | 2 | `registrationSlugPreview` (BB branch URL), `provisioningRecovery` | **REQUIRED_COMPOSITION** / **SAFE_P2_FUTURE_REFACTOR** (preview could thin further on-touch) |
| Host apex config | 1 | `host.js` → `church/blessBoardEnv` domains | **REQUIRED_COMPOSITION** (BB apex semantics stay in church) |
| Misc composition | rest | billing plan mapping, auth transfer, release-notes authz | **REQUIRED_COMPOSITION** |

**No ACTUAL_ARCHITECTURE_PROBLEM** in Class E today — scanner green; allowlist is the documented floor.

### Would shrinking Class E improve dependency safety?

**No — not as a bulk “reduce 30→N” program.**

- Product↔product isolation is already **zero** (PC18–PC19). Class E is **platform → product composition**, which the architecture **allows** for mounts/admin/bridges.
- Moving those requires into product packages does **not** remove the need for a composition edge that knows both products exist; it only relocates wiring.
- Safety improved when a file **stopped needing** product requires after a real ownership lift (e.g. `allocateUniqueOrganizationKey`, `applicationBuildInfo`). That pattern is **on-touch / evidence-driven**, not LOC-driven.

**Evidence-based task:** Keep Class E allowlist; shrink **only** when a specific file’s product requires become unused after a mechanism lift — not a dedicated “reduce Class E count” project.

---

## 2. Remaining website-editor duplicated mechanisms

**Evidence:** PC07 kit exists; route hotspots still large (`blessboardWebsiteEditorRoutes` **1727** LOC, `activeClinicWebsiteRoutes` **1544** LOC — PC13/PC14 metrics).

| Residual | Class |
|----------|-------|
| Large product editor route files (URL/auth/chrome/product field ops) | **INTENTIONAL_PRODUCT_CODE** |
| Shared HTTP utils / media upload / draft helpers already platform | done (PC07) |
| Further extraction of product-shaped handlers into platform | **SAFE_P2_FUTURE_REFACTOR** only if truly generic + tested; **do not** chase LOC |

**No ACTUAL_ARCHITECTURE_PROBLEM.**

---

## 3. Remaining classic CMS duplicated mechanisms

**Evidence:** PC11 PASS — shared folder HTTP + ordered-list draft; dual storage retained.

| Residual | Class |
|----------|-------|
| BB relational `public_*` + structured drafts vs AC JSON CMS keys | **INTENTIONAL_PRODUCT_CODE** |
| Product catalogues / templates / entity routes | **INTENTIONAL_PRODUCT_CODE** |
| Classic CMS route files not deleted (consumers remain) | **SAFE_P2_FUTURE_REFACTOR** / retirement only with parity proof |
| Library assembly calling shared `libraryModel` with product copy | **INTENTIONAL_PRODUCT_CODE** |

**No ACTUAL_ARCHITECTURE_PROBLEM.**

---

## 4. Publish compatibility shims

**Evidence:** PC10 / PC10C / reconciliation shim table; `publicationOrchestrator` + governance adapters; routes still call product services.

| Residual | Class |
|----------|-------|
| `churchWebsitePublishService` + direct route calls | **REQUIRED_COMPOSITION** / compatibility (**SAFE_P2_FUTURE_REFACTOR**: thin route→adapter hop) |
| AC `publicationService` / `submissionService` direct route use | same |
| BB CMS + engine dual publish / `blessboardBridge` projections | **REQUIRED_COMPOSITION** until classic CMS retirement proof |
| Engine projection `23514` soft-savepoint residual | **P3_ON_TOUCH** (logged warning; publish mint green) |
| BB vs AC submit workflows | **INTENTIONAL_PRODUCT_CODE** |

**No ACTUAL_ARCHITECTURE_PROBLEM.**

---

## 5. CMS compatibility shims

**Evidence:** PC11 — adapters + classic services retained deliberately.

| Residual | Class |
|----------|-------|
| `blessboardClassicCmsAdapter` / `activeClinicCmsAdapter` | **REQUIRED_COMPOSITION** (boundary) |
| Classic services/routes not deleted | **SAFE_P2_FUTURE_REFACTOR** after retirement proof |
| Dual media: BB `media_assets` vs platform `website_media` | **INTENTIONAL_PRODUCT_CODE** (PC08 SoT) |

**No ACTUAL_ARCHITECTURE_PROBLEM.**

---

## 6. Phone legacy URL shims

**Evidence:** PC05 — platform SoT `views/platform/partials/phone-field.ejs`, `/platform/phone-field.{js,css}`; AC `ac-phone-field.*` full-content shims; product normalizers wrap `phoneNumberService`.

| Residual | Class |
|----------|-------|
| `public/activeclinic/ac-phone-field.js/.css` legacy URLs | **OBSOLETE_SHIM_CANDIDATE** / **P3_ON_TOUCH** (remove when no shells/tests hit legacy URL) |
| Product `normalizeBlessBoardPhone` / `normalizeActiveClinicContact` wrappers | **INTENTIONAL_PRODUCT_CODE** (thin adapters over platform) |
| DOM hooks `data-ac-phone-field` | **INTENTIONAL_PRODUCT_CODE** / **P3_ON_TOUCH** |

**No ACTUAL_ARCHITECTURE_PROBLEM.**

---

## 7. gp-ops hybrid adoption

**Evidence:** PC09 PASS; `PLATFORM_OPS_UI_OWNERSHIP.md`; hybrid `ac-table gp-ops-table` in AC list/queue views; BB does not mount gp-ops until deliberate token bridge.

| Residual | Class |
|----------|-------|
| Hybrid `ac-table gp-ops-table` during AC transition | **P3_ON_TOUCH** |
| BB Sacred Modernity not forced onto gp-ops | **INTENTIONAL_PRODUCT_CODE** |
| Wholesale ops chrome rewrite | **Out of scope** (forbidden by on-touch rule) |

**No ACTUAL_ARCHITECTURE_PROBLEM.**

---

## 8. Cross-product dependencies

**Evidence:** PC18–PC19; `CROSS_PRODUCT_REQUIRE_ALLOWLIST = []`; scanner ok.

| Residual | Class |
|----------|-------|
| Runtime BB↔AC / AC→church implementation requires | **None** |
| BB → `src/church` | **INTENTIONAL_PRODUCT_CODE** (same family) |
| Platform Class E product requires | **REQUIRED_COMPOSITION** (see §1) |
| Test harness cross-imports | Out of runtime gate scope |

**No ACTUAL_ARCHITECTURE_PROBLEM.**

---

## 9. Finder residuals

**Evidence:** PC20–PC21; disk scan.

| Residual | Class |
|----------|-------|
| Content-differing `* 2.*` files | **0** (cleaned) |
| Stitch dirs `01-public-home-desktop 2`, `…-mobile 2`, `…-mobile 3` | **P3_ON_TOUCH** / design-reference retention — **not** runtime debt |

**No ACTUAL_ARCHITECTURE_PROBLEM.**

---

## Closed since PC14 reconciliation (for debt accuracy)

| Former P2 item | Status |
|----------------|--------|
| AC→BB `organizationKey` | **Closed** (PC18) |
| AC→church `blessBoardEnv` mode gate | **Closed** (PC19) |
| 127 Finder content-diff files | **Closed** (PC20–PC21) |
| Class E 32→30 | Shrunk only via real lifts, not bulk move |

---

## Evidence-based remaining tasks (only)

1. **Do not run a Class-E count-reduction program** — composition roots are required; shrink on-touch when a file’s product requires become unused (**REQUIRED_COMPOSITION** policy).
2. **Publish/CMS retirement** — only after classic-CMS / dual-writer parity proof: optional route→adapter thinning; then consider deleting classic exports (**SAFE_P2_FUTURE_REFACTOR**).
3. **Phone legacy `/activeclinic/ac-phone-field.*` URLs** — remove when caller audit is empty (**OBSOLETE_SHIM_CANDIDATE** / **P3_ON_TOUCH**).
4. **gp-ops hybrid classes** — convert remaining `ac-table gp-ops-table` only when editing those AC lists (**P3_ON_TOUCH**).
5. **Stitch Finder dirs (3)** — triage/delete only if design-reference policy allows (**P3_ON_TOUCH**).
6. **Thin re-exports** (`blessboard/services/organizationKey.js`, church `blessBoardEnv` mode re-exports) — keep until import graph fully points at platform (**OBSOLETE_SHIM_CANDIDATE**).

**Not remaining architecture problems:** product editor/CMS LOC, catalogues, themes, BB vs AC submit, operational vs website media, Class E existence.

**Priority after PC24 (execution rule):** V2.03 QA over further architecture cleanup.

---

## Marker

```text
V10_RESIDUAL_P2_ARCHITECTURE_AUDIT_COMPLETE

Class-E bulk reduction: does NOT improve dependency safety; only relocates composition
ACTUAL_ARCHITECTURE_PROBLEM: none found in audited residuals
Cross-product runtime: 0
Finder files: 0 (3 stitch dirs remain)
```
