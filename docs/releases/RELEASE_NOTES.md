# GetPro Unified Platform — Release Notes (Canonical)

**Center route (after deploy):** `/release-notes` on the testing QA hub  
**Catalog source of truth (runtime):** `src/platform/release-notes/releaseNotesCatalog.js`  
**Branch:** `V8`  
**Last audit:** 2026-09-26  
**Rule:** Evidence only — no invented PASS / RELEASED. Incomplete history → `UNVERIFIED` or `DOCUMENTATION PENDING`.

Related existing packets are **not deleted**. This file is the index + structured summary.

**Hosted routes (V8 testing):**

| URL | Role |
|-----|------|
| `https://neuniversity.org/release-notes` | Shared hub (all products) |
| `https://blessboard.neuniversity.org/release-notes` | BlessBoard + Shared default filter |
| `https://activeclinic.neuniversity.org/release-notes` | ActiveClinic + Shared default filter |

---

## Status taxonomy

| Status | Meaning |
|--------|---------|
| PLANNED | Designed / planned; not shipped as product behavior |
| IN DEVELOPMENT | Work in progress |
| IMPLEMENTED | Code present in repository |
| LOCAL QA PASS | Automated/manual local verification recorded |
| HOSTED QA PASS | Hosted testing verification recorded |
| QA BLOCKED | Cannot complete QA (dependency / access / defect) |
| NOT TESTED | No verification recorded yet |
| RELEASED | Explicit production release evidence (rare; do not infer) |
| UNVERIFIED | Evidence incomplete or ambiguous |
| DOCUMENTATION PENDING | Historical packet missing |

---

## Implemented URLs (application)

| Path | Purpose |
|------|---------|
| `/release-notes` | Overview + filters |
| `/release-notes/:version` | Version details (`1.0` … `2.01`) |
| `/release-notes/:version/bugs` | Bugs & regression |
| `/release-notes/:version/qa` | QA checklist |
| `/release-notes/:version/share` | Public sanitized share summary |
| `/release-notes/:version/print` | Print / Save-as-PDF layout (`window.print`) |

**Audience**

- **Public sanitized** (default): feature/bug summaries; QA evidence paths withheld.
- **Internal:** requires `RELEASE_NOTES_INTERNAL_TOKEN` via `?internal_token=` or `X-Release-Notes-Internal-Token`. Without the token, internal evidence stays closed.
- **Production `DEPLOYMENT_ENV`:** center refused (`not_found`).

**Stitch UI:** DOCUMENTATION PENDING — no Release Notes Center project in Stitch inventory (2026-09-25). Functional UI ships with GetPro tokens; visual parity pending approved Stitch screens.

**Hosted shareable URL:** Not claimed until `/release-notes` returns 200 on the deployed testing hub matching the intended SHA.

---

## Version 1.0

### Summary

ActiveClinic V1.0 release-candidate closure on V7 testing (2026-08-26). BlessBoard mapping to product label “1.0” is incomplete (V5 foundation-era docs).

### Release date

2026-08-26 (AC RC closure date). BlessBoard 1.0 date: not established in a unified packet.

### Products

ActiveClinic, BlessBoard (partial), Shared GetPro Platform.

### New features / improvements

| ID | Name | Implementation | QA | Notes |
|----|------|----------------|----|-------|
| F-1.0-AC-01 | ActiveClinic V1.0 RC | IMPLEMENTED | HOSTED QA PASS | `ACTIVECLINIC_V1_RELEASE_CANDIDATE_APPROVED` |
| F-1.0-BB-01 | BlessBoard V5→1.0 mapping | DOCUMENTATION PENDING | UNVERIFIED | No unified BB 1.0 matrix |

### Bug fixes

None catalogued in a dedicated 1.0 unified bug register (DOCUMENTATION PENDING for BB).

### Known issues / pending

- Unified BB+AC 1.0 packet missing.
- Do not treat AC RC approval as production deployment proof.

### QA verification

AC: HOSTED QA PASS (RC). BB: DOCUMENTATION PENDING. Joint full release PASS: not claimed.

### Deployment status

TESTING RC on `moovex-platform-testing`. Production promotion was an explicit later operator step.

### Acceptance criteria

- AC 21-screen FIX_REQUIRED reconciliation closed or APPROVED_PRODUCT_DIFFERENCE.
- Hosted SHA matches RC candidate.
- Production untouched during RC closure.

### Sources

- `docs/activeclinic/release/ACTIVECLINIC_V1_RELEASE_CANDIDATE_CLOSURE.md`
- `docs/release/V5_RELEASE_VERSIONING.md`

---

## Version 1.1

### Summary

**DOCUMENTATION PENDING.** No dedicated Version 1.1 release packet under `docs/releases/` or `docs/qa/`.

### Release date

Not established.

### Features / bugs / QA

| ID | Name | Status |
|----|------|--------|
| F-1.1-GAP-01 | Historical inventory | DOCUMENTATION PENDING / UNVERIFIED |

### Deployment status

UNVERIFIED — do not infer production deployment.

---

## Version 1.2

### Summary

**DOCUMENTATION PENDING.** Related website morning QA packs exist but are not a certified 1.2 release note.

### Release date

Not established.

### Features / bugs / QA

| ID | Name | Status |
|----|------|--------|
| F-1.2-GAP-01 | Historical inventory | DOCUMENTATION PENDING / UNVERIFIED |

### Related (not a release note)

- `docs/platform/V1_WEBSITE_MORNING_QA_PACK.md`

---

## Version 1.3

### Summary

V7 QA line labeled product Version 1.3 (About `versionBase` 1.03). Sep 2026 QA packs + BB/AC hosted closure. Joint freeze **BLOCKED** by BlessBoard draft-hydration Major.

### Release date

2026-09-20 (freeze / closure notes).

### Products

BlessBoard, ActiveClinic, Shared GetPro Platform.

### New features / improvements

| ID | Name | Implementation | QA |
|----|------|----------------|----|
| F-1.3-AC-01 | AC hosted closure workflows | IMPLEMENTED | HOSTED QA PASS (`V1_3_AC_HOSTED_CLOSURE_PASS`) |
| F-1.3-SHARED-01 | Governance + phone identity | IMPLEMENTED | HOSTED QA PASS |
| F-1.3-AC-02 | AC reliability pack (Sep 5) | IMPLEMENTED | HOSTED QA PASS (documented items) |

### Bug fixes / defects

| ID | Severity | Product | Status |
|----|----------|---------|--------|
| BUG-1.3-BB-HYDRATION | Major | BlessBoard | **OPEN** — freeze blocker |
| BUG-1.3-EMPTY-BODY | Minor | Shared | Mitigated (NULL body); residual certification incomplete |

### Known issues

- BB `data-draft=0` under `website_mode=draft` after save/reload.
- Recovery email delivery configuration pending on testing (config debt).

### QA verification

- AC hosted closure PASS; BB hosted closure FAIL; `V1_3_QA_FREEZE_BLOCKED`.
- **Not** a full release PASS.

### Deployment status

TESTING `moovex-platform-testing` (pronline.org). Production SHA remained distinct / untouched in freeze notes.

### Sources

- `docs/qa/V1_3_BB_QA_RELEASE_NOTES.md`
- `docs/qa/V1_3_AC_QA_RELEASE_NOTES.md`
- `docs/releases/V7_QA_RELEASE_NOTES_2026-09-05.md`

---

## Version 2.0

### Summary

V8 platform line (neuniversity.org) as Version 2.0 development/testing. Shared forms, membership, announcements, booking, media across V8 prompts. QA hub restricted to BB+AC V2.0. About later moved to **2.01** — hub marketing copy may still say “2.0”.

### Release date

2026-09-20 (hub V2-only PASS recorded).

### Products

BlessBoard, ActiveClinic, Shared GetPro Platform.

### New features / improvements (selected)

| ID | Name | Implementation | QA |
|----|------|----------------|----|
| F-2.0-HUB-01 | V8 QA homepage V2.0 only | IMPLEMENTED | HOSTED QA PASS |
| F-2.0-FORMS-01 | Shared forms SH01–SH15 | IMPLEMENTED (some mobile PARTIAL) | UNVERIFIED as aggregate release |
| F-2.0-BB-MEM-01 | BB membership BB01–BB18 | IMPLEMENTED (some PARTIAL) | UNVERIFIED as aggregate |
| F-2.0-AC-BOOK-01 | AC directory/services/booking surfaces | IMPLEMENTED | UNVERIFIED as aggregate |

### Bugs

| ID | Severity | Notes |
|----|----------|-------|
| BUG-2.0-002-503 | Critical | Shared deployment 503 class — see V8_BUG_002 / P0 root-cause docs; re-verify before PASS claims |

### Known issues / pending

- Baseline PARTIAL Stitch parity rows.
- Some migrations created but not applied at baseline time.
- No single “2.0 RELEASED to production” certificate in-repo.

### QA verification

Hub: `V8_QA_HOMEPAGE_V2_ONLY_PASS`. Feature set: mixed — **not** a single full release PASS.

### Deployment status

TESTING `moovex-platform-v8-testing`. Production isolation preserved in V8 docs.

### Sources

- `docs/releases/V8_QA_HOMEPAGE_VERSION_2_ONLY.md`
- `docs/releases/V8_IMPLEMENTATION_BASELINE.md`
- `docs/releases/V8_HOSTED_END_TO_END_QA_REPORT.md`
- Additional `docs/releases/V8_*` prompt reports

---

## Version 2.01

### Summary

V8 tip labeled product Version **2.01**. Shared website editor for BlessBoard + ActiveClinic (Change Manager, inline edit, image payload/placement, Universal Image Editor, sections, themes, HQ/branch cards). Final integrated hosted QA **66/66 PASS**; P2 gap closure **48/48 PASS**. Hostinger infra investigations remain separate. **Not** a production RELEASED certificate.

### Release date

2026-09-26 (shared editor final / P2 closure). Earlier 2.01 baseline / diagnostics / CM foundation dates from 2026-09-25.

### Products

BlessBoard, ActiveClinic, Shared GetPro Platform, Infrastructure.

### New features / improvements

| ID | Name | Implementation | QA | Notes |
|----|------|----------------|----|-------|
| F-2.01-ABOUT-01 | About Version 2.01 | IMPLEMENTED | HOSTED QA PASS | `V2_01_RELEASE_BASELINE_PASS` |
| F-2.01-ROBOTS-01 | robots.txt (SEO discovery) | IMPLEMENTED | UNVERIFIED / NOT TESTED hosted recheck | No dedicated V2.01 robots ticket; longer-standing capability |
| F-2.01-PUB-DIAG-01 | Publish diagnostics (real codes + request ID) | IMPLEMENTED | HOSTED QA PASS | Hostinger **log** verification incomplete |
| F-2.01-CM-FOUND-01 | Change Manager foundation | IMPLEMENTED | HOSTED QA PASS | |
| F-2.01-CM-TOOLBAR-01 | Toolbar + unpublished counter | IMPLEMENTED | HOSTED QA PASS | |
| F-2.01-CM-REMIND-01 | Publishing reminders | IMPLEMENTED | HOSTED QA PASS | |
| F-2.01-CM-PANEL-01 | Unpublished Changes Panel | IMPLEMENTED | HOSTED QA PASS | |
| F-2.01-CM-HIST-01 | Field history & restore | IMPLEMENTED | HOSTED QA PASS | P2 restore closure |
| F-2.01-CM-STITCH-01 | Stitch ~390px parity (CM / framing) | IMPLEMENTED | HOSTED QA PASS | |
| F-2.01-BB-INLINE-01 | BlessBoard inline WE01 parity | IMPLEMENTED | HOSTED QA PASS | BB-specific |
| F-2.01-IMG-PAYLOAD-01 | Shared image object payload | IMPLEMENTED | HOSTED QA PASS | |
| F-2.01-IMG-PLACE-01 | Shared image placement | IMPLEMENTED | HOSTED QA PASS | |
| F-2.01-IMG-EDITOR-01 | Universal Image Editor | IMPLEMENTED | HOSTED QA PASS | P2 upload/crop closure |
| F-2.01-SECTION-01 | Shared section management | IMPLEMENTED | HOSTED QA PASS | |
| F-2.01-THEME-INFRA-01 | Theme infrastructure | IMPLEMENTED | HOSTED QA PASS | |
| F-2.01-THEME-GALLERY-01 | Theme gallery | IMPLEMENTED | HOSTED QA PASS | |
| F-2.01-THEME-EXTRA-01 | First additional themes | IMPLEMENTED | HOSTED QA PASS | `bb.contemporary-fellowship`, `ac.family-wellness-mint` only |
| F-2.01-HQ-BRANCH-01 | HQ/branch website cards | IMPLEMENTED | HOSTED QA PASS | AC single clinic; no facility websites |
| F-2.01-EDITOR-FINAL-01 | Final integrated editor QA | IMPLEMENTED | HOSTED QA PASS | **66/66** hosted |
| F-2.01-P2-GAPS-01 | P2 gap closure | IMPLEMENTED | HOSTED QA PASS | **48/48** hosted |
| F-2.01-LIMITS-01 | Supported vs unsupported surfaces | IMPLEMENTED | HOSTED QA PASS | Stitch-only / NOT SUPPORTED explicit |
| F-2.01-INFRA-AUDIT-01 | Hostinger process audit | IMPLEMENTED (doc) | UNVERIFIED | Infra, not app feature |
| F-2.01-INFRA-CONSOL-01 | Worker consolidation plan | PLANNED | UNVERIFIED | Topology A not demonstrated |
| F-2.01-INFRA-PKGA-01 | Package A www retirement | PLANNED | QA BLOCKED | No hPanel in agent session |
| F-2.01-RNC-01 | Release Notes Center | IMPLEMENTED | HOSTED QA PASS | Hub + BB + AC `/release-notes` |

### Shared platform (BB + AC)

- Website Change Manager (toolbar, unpublished panel, history/restore, reminders)
- Universal Image Editor + object payload + placement metadata
- Section management on supported pages
- Theme registry, gallery, draft select / preview / publish / rollback
- Choose Website card list (HQ/branch for BB; single clinic for AC)
- Draft → preview → publish isolation; cross-product theme/media rejection

### BlessBoard-specific

- Inline WE01 public edit parity
- HQ + authorized branch website cards; Change Website when multi-site
- Theme: BlessBoard Classic + Contemporary Fellowship

### ActiveClinic-specific

- Inline clinic website editor (same shared chrome)
- Exactly one clinic website card — **no facility websites**
- Theme: ActiveClinic Classic + Family Wellness Mint
- No Change Website menu (single site)

### Supported features and limitations

**Supported (hosted-verified):** shared WE01 edit shell; text/image draft/preview/publish; theme gallery + first additional themes; HQ/branch website cards (BB); AC single-clinic selector; auth/cross-product isolation.

**NOT SUPPORTED / Stitch-only (do not claim available):**

- AC facility public websites / HQ→facility inheritance
- Network-wide / emergency publish
- Remaining Stitch theme packs beyond the two shipped CSS packs
- Palette / theme customizer
- Permanent three-column HQ/branch studio (cards only)

### Publishing diagnostics (required detail)

- Real engine / public codes instead of incorrect `lookup_error` remapping (BB).
- Safe request ID + diagnostics in UI/JSON; secrets not exposed.
- Successful reported BB multi-item publishing test on disposable V8 QA tenants.
- Successful reported AC publishing test.
- Incomplete Hostinger log verification for original Sep 24 incident.
- Remaining uncertainty around the original intermittent publishing failure (not claimed fixed as an engine bug).

### Bug fixes / defects

| ID | Severity | Status |
|----|----------|--------|
| BUG-2.01-LOOKUP-REMAP | High | Diagnostics HOSTED QA PASS; original intermittent uncertainty remains; Hostinger logs incomplete |
| BUG-2.01-PKG-A | Medium | BLOCKED pending operator hPanel |

### Known issues / pending

- Package A + PID consolidation proof.
- Original intermittent publish failure not reproduced.
- Remaining Stitch themes / palette / studio not implemented.

### QA verification

Shared website editor **HOSTED QA PASS** (final **66/66**; P2 **48/48**). Infra Package A still BLOCKED. **Not** a production RELEASED claim. See `/release-notes/2.01/qa`.

### Deployment status

TESTING target `moovex-platform-v8-testing`. Production untouched in V2.01 task docs. **Do not promote.**

### Acceptance criteria

- About shows 2.01 on BB+AC V8 testing after baseline deploy.
- Publish failures no longer remapped to incorrect `lookup_error`.
- Shared editor features evidence-backed without claiming unsupported Stitch-only surfaces.
- Hostinger infra tracked separately from application functionality.

### Sources

- `docs/releases/V2_01_RELEASE_BASELINE.md`
- `docs/qa/V2_01_PUBLISH_ERROR_DIAGNOSTICS_QA.md`
- `docs/qa/V2_01_PUBLISH_LOOKUP_ROOT_CAUSE.md`
- `docs/qa/V2_01_CHANGE_MANAGER_FOUNDATION_QA.md`
- `docs/qa/V2_01_TOOLBAR_REMINDERS_QA.md`
- `docs/qa/V2_01_UNPUBLISHED_CHANGES_QA.md`
- `docs/qa/V2_01_FIELD_HISTORY_RESTORE_QA.md`
- `docs/qa/V2_01_BB_INLINE_EDITOR_PARITY_QA.md`
- `docs/qa/V2_01_SHARED_IMAGE_PAYLOAD_QA.md`
- `docs/qa/V2_01_SHARED_IMAGE_PLACEMENT_QA.md`
- `docs/qa/V2_01_UNIVERSAL_IMAGE_EDITOR_QA.md`
- `docs/qa/V2_01_SHARED_SECTION_MANAGEMENT_QA.md`
- `docs/qa/V2_01_SHARED_THEME_INFRA_QA.md`
- `docs/qa/V2_01_SHARED_THEME_GALLERY_QA.md`
- `docs/qa/V2_01_FIRST_ADDITIONAL_THEMES_QA.md`
- `docs/qa/V2_01_SHARED_HQ_BRANCH_WEBSITE_QA.md`
- `docs/qa/V2_01_SHARED_WEBSITE_EDITOR_FINAL_QA.md`
- `docs/qa/V2_01_SHARED_EDITOR_P2_GAP_CLOSURE_QA.md`
- `docs/qa/V2_01_HOSTINGER_PROCESS_AUDIT.md`
- `docs/qa/V2_01_HOSTINGER_WORKER_CONSOLIDATION_PLAN.md`
- `docs/qa/V2_01_HOSTINGER_PACKAGE_A_QA.md`
- `docs/qa/V2_01_RELEASE_NOTES_CENTER_QA.md`

---

## Historical documentation gaps

1. No unified Version **1.0** BB+AC packet.
2. No Version **1.1** release packet.
3. No certified Version **1.2** release packet.
4. Stitch **Release Notes Center** screens unavailable.
5. No dedicated V2.01 **robots.txt** change ticket (capability is older).
6. No production **RELEASED** certificate for 2.0 / 2.01 in-repo.

---

## QA persistence note

Interactive checklist results in the UI are **catalog-backed** (repository evidence). Persistent operator-editable QA tracking would need approved storage/migration — **not added** in this task. Do not rely on browser-only state as system of record.
