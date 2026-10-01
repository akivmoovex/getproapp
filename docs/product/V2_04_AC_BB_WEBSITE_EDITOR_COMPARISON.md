# V2.04 ActiveClinic vs BlessBoard — Website Editor Comparison

**Mode:** READ-ONLY (no application code changes).  
**Date:** 2026-10-02  
**Scope:** Website management / website editing only. Non-website modules excluded.  
**Do not treat product-specific content as a parity gap** merely because the other product does not need it.  
**Preserve** separate BB and AC design tokens / branding.

---

## Sources

- `docs/product/ACTIVECLINIC_FEATURE_CATALOG.md` (Website module)
- `docs/product/BLESSBOARD_FEATURE_CATALOG.md` (Website module)
- `docs/product/PLATFORM_FEATURE_CATALOG.md` (WE / Media / Publishing / Version)
- `docs/qa/ACTIVECLINIC_WEBSITE_EDITOR_FEATURE_INVENTORY.md`
- `docs/qa/V2_01_ACTIVECLINIC_EDITOR_UX_REFERENCE.md` (§D gap matrix)
- `docs/qa/V2_01_SHARED_EDITOR_ARCHITECTURE_AUDIT.md`
- `docs/qa/V2_01_BB_INLINE_EDITOR_PARITY_QA.md`
- `docs/qa/V2_01_SHARED_EDITOR_TOOLBAR_PARITY_QA.md`
- `docs/qa/V2_04_AC_WEBSITE_PLATFORM_REUSE_AUDIT.md`
- `docs/blessboard/BLESSBOARD_WEBSITE_ENGINE_MIGRATION.md`
- `docs/qa/V2_04_RECENT_BUG_FIX_AUDIT.md` (BB-REG-WEB-01, AC-REG-WEB-01, AC-WEB-EDITOR-01, dirty-state)

---

## Status legend

| Column | Values |
|--------|--------|
| **AC_STATUS / BB_STATUS** | `FULL` · `PARTIAL` · `NO` |
| **PLATFORM_STATUS** | `SHARED` (one platform implementation) · `PRODUCT_SPECIFIC` (correctly different) · `DUPLICATED` (same concern implemented twice; consolidate) · `NONE` |
| **TEST_STATUS** | `STRONG` · `PARTIAL` · `WEAK` · `MISSING` · `N/A` |
| **RECOMMENDED_HOME** | `PLATFORM` · `AC` · `BB` |

---

## Normalized feature matrix (40)

| # | FEATURE | AC_STATUS | BB_STATUS | PLATFORM_STATUS | AC_IMPLEMENTATION | BB_IMPLEMENTATION | TEST_STATUS | UX_DIFFERENCE | RECOMMENDED_HOME | ACTION |
|--:|---------|-----------|-----------|-----------------|-------------------|-------------------|-------------|---------------|------------------|--------|
| 1 | Entry into editor | FULL | FULL | SHARED | `/clinics/:key?website_edit=1&website_mode=draft` + WE01 chrome | `/c/:org…?website_edit=1&website_mode=draft` (+ branch paths) + same WE01 | STRONG | Paths/keys differ; shell shared | PLATFORM | Keep shared chrome; product path adapters only |
| 2 | Post-registration editor routing | FULL | FULL | SHARED | Success CTA → public edit path (AC-REG-WEB-01) | Success CTA → public edit path (BB-REG-WEB-01) | STRONG | Labels differ; destination pattern shared | PLATFORM | Keep `buildPublicWebsiteEditPath` |
| 3 | Desktop viewport | FULL | FULL | SHARED | Toolbar `data-website-viewport=desktop` | Same shared toolbar | PARTIAL | None material | PLATFORM | Assert click/switch once in shared suite |
| 4 | Tablet viewport | FULL | FULL | SHARED | Toolbar tablet width class | Same | PARTIAL | None material | PLATFORM | Same as desktop |
| 5 | Mobile viewport | FULL | FULL | SHARED | Toolbar mobile width class | Same | PARTIAL | None material | PLATFORM | Same as desktop |
| 6 | Responsive preview | FULL | FULL | SHARED | CSS canvas width simulation (not UA) | Same | PARTIAL | Neither has true device emulation | PLATFORM | Document as preview widths; no UA claim |
| 7 | Inline editing | FULL | PARTIAL | SHARED | Pencils on public fields; dotted content keys | Same dialogs; some surfaces still structured-only / bridge lag | PARTIAL | BB public pencil coverage historically lagged AC | PLATFORM | Close BB inline coverage gaps to AC pattern |
| 8 | Structured editing | FULL | FULL | PRODUCT_SPECIFIC | Catalogue doctors/services; FAQ collection editor | Leadership/ministries/events/sermons structured editors | PARTIAL | Different domains by design | AC / BB | Keep product adapters; share dialog patterns only |
| 9 | Edit-mode controls | FULL | FULL | SHARED | Page rail, More menu, exit session, dirty leave | Same WE01 controls via BB chrome attach | STRONG | Destination lists product-specific | PLATFORM | Keep; thin product `moreItems` |
| 10 | Save draft | FULL | FULL | SHARED | Field Save → `contentService.saveWebsiteDraft`; never auto-publish | Same + BB overlay/bridge dual-write nuance | STRONG | BB overlays may lag engine count until bridged | PLATFORM | Prefer engine SoT; shrink overlay dual-path |
| 11 | Draft mode | FULL | FULL | SHARED | `website_mode=draft` resolution | Same | STRONG | None material | PLATFORM | Keep |
| 12 | Unpublished changes indicator/count | FULL | FULL | SHARED | Pending pill + panel; Change Manager key diffs | Same; pending `Math.max` parity verified | STRONG | Labels productized | PLATFORM | Keep Change Manager |
| 13 | Preview | FULL | FULL | SHARED | `website_mode=draft` + preview banner | Same + branch draft preview URL | STRONG | Branch preview is BB scope rule | PLATFORM | Keep; BB branch adapter for scope |
| 14 | Publish | FULL | FULL | SHARED | Confirm → `publicationService` (+ makePublic) | Same engine + optional review/overlay apply | STRONG | BB may require review / branch scope | PLATFORM | Shared confirm UX; product policy adapters |
| 15 | Unpublish | FULL | FULL | SHARED | More → unpublish; content preserved | Product status + `unpublishWebsite` | PARTIAL | AC HTTP coverage lighter | PLATFORM | Strengthen shared unpublish tests |
| 16 | Sections management | FULL | FULL | SHARED | Section actions + hub Sections/Pages CMS | Section registry + `page_sections` projection | PARTIAL | Storage not fully unified | PLATFORM | Unify section storage; keep page registries product-specific |
| 17 | Layers / structure navigation | NO | NO | NONE | Hub “Layers” = Sections CMS alias only | No z-order Layers panel | MISSING | Neither has visual layers tree | PLATFORM | Do not invent Stitch studio Layers; use Sections |
| 18 | Media library | FULL | FULL | SHARED | `/app/settings/website/media` + editor library | Shared media + HQ/BA media surfaces | STRONG | Hub routes differ | PLATFORM | Keep singular upload engine |
| 19 | Image upload | FULL | FULL | SHARED | Inline dialog ≤5MB | Same shared dialog | STRONG | Residual BB object-payload `invalid_url` edge | PLATFORM | Finish universal image payload contract |
| 20 | Image replace | FULL | FULL | SHARED | Library/upload replace in dialog | Same | STRONG | Coverage varies by BB surface | PLATFORM | Same as #19 |
| 21 | Image remove | FULL | FULL | SHARED | Remove in image dialog | Same | STRONG | — | PLATFORM | Keep |
| 22 | Existing-media reuse | FULL | FULL | SHARED | Pick from Image Library | Same | STRONG | — | PLATFORM | Keep |
| 23 | Version history | FULL | FULL | SHARED | Versions list + historical preview | Same engines; BB also has legacy publication versions | STRONG | BB dual version history stores = consolidation debt | PLATFORM | Prefer platform versions as SoT |
| 24 | Restore-as-new | FULL | FULL | SHARED | Restore → new draft only | Product restore then engine restore bridge | STRONG | BB bridge path extra | PLATFORM | Keep restore-as-draft semantics |
| 25 | Public-site editing context | FULL | FULL | SHARED | Edit on live public clinic pages | Edit on public church/branch pages | STRONG | Page sets differ | PLATFORM | Shared shell; product page registry |
| 26 | Website Management Hub | FULL | FULL | PRODUCT_SPECIFIC | `/app/settings/website` management-only (AC-WEB-EDITOR-01) | `/hq/website` (+ branch website entry) | STRONG | Labels/tiles differ; BB multi-site | AC / BB | Keep hubs; do not embed WE01 canvas in hub |
| 27 | Edit Website CTA | FULL | FULL | SHARED | Hub + post-reg → canonical edit URL | Hub + post-reg + public entry chrome | STRONG | Same helper family | PLATFORM | Keep shared URL builders |
| 28 | Website status display | FULL | FULL | SHARED | Draft/Published + unpublished count metrics | Same presentation model | STRONG | Copy differs | PLATFORM | Keep `websiteManagementPresentation` |
| 29 | Services editing | FULL | NO | PRODUCT_SPECIFIC | Public catalogue services CRUD/visibility | N/A (church offerings differ) | STRONG | Not a BB gap | AC | Stay AC-only |
| 30 | Staff / leadership / practitioner editing | FULL | FULL | PRODUCT_SPECIFIC | Doctors via catalogue + affordances | Leadership structured / public leadership | PARTIAL | Domains must not merge | AC / BB | Share card/presentation contracts only |
| 31 | Contact information editing | FULL | FULL | SHARED | Inline contact keys + hub settings | Inline + HQ/BA settings inheritance | PARTIAL | Field vocab converging | PLATFORM | Canonical contact field vocabulary |
| 32 | Location / address editing | FULL | FULL | SHARED | Location/contact overlays on public site | Same pattern + branch settings | PARTIAL | — | PLATFORM | Canonical location keys |
| 33 | Working-hours editing | FULL | PARTIAL | PRODUCT_SPECIFIC | Domain-backed hours sections / catalogue | Service-times via settings inheritance | PARTIAL | Clinic hours ≠ church service times | AC / BB | Separate domain; shared hours *presentation* component |
| 34 | Events / sermons / ministry content editing | NO | FULL | PRODUCT_SPECIFIC | N/A for clinic mini-site | Events/sermons/ministries CMS + public pages | STRONG | Not an AC gap | BB | Stay BB-only |
| 35 | Mobile editing usability | FULL | FULL | SHARED | Bottom nav, sheet editor, keyboard inset; residual overflow | Toolbar parity ≥44px; 390px edit verified | PARTIAL | AC residual public-chrome overflow | PLATFORM | Shared mobile CSS; product overflow cleanup |
| 36 | Error / empty states | FULL | FULL | SHARED | Offline/suspended, save failure, empty unpublished | Publish diagnostics; auth denies | PARTIAL | BB diagnostics historically stronger | PLATFORM | Shared error codes + copy |
| 37 | Authorization | FULL | FULL | SHARED | `website.view/edit/publish` + clinic org | Same keys + church/branch scope | STRONG | Scope adapters differ | PLATFORM | Shared permissions; product scope hooks |
| 38 | Tenant isolation | FULL | FULL | SHARED | Same-clinic org; cross-tenant deny | Org + branch website scope | STRONG | BB multi-site rules product-specific | PLATFORM | Shared deny paths; BB scope adapter |
| 39 | Regression coverage | FULL | PARTIAL | DUPLICATED | Dedicated AC editor inventory + wave suites | BB parity/lifecycle suites; less editor-matrix inventory | PARTIAL | AC denser editor feature→test map | PLATFORM | One shared editor regression matrix + product adapters |
| 40 | User guidance / affordances | FULL | PARTIAL | DUPLICATED | Operational affordances → catalogue; hub next-step copy | Entry chrome Manage/Preview/Edit; less catalogue-style deep-links | PARTIAL | AC guides ops entities off-canvas | PLATFORM | Shared “edit elsewhere” affordance pattern |

**NORMALIZED_EDITOR_FEATURES = 40**

---

## Classification notes

### Shared editing infrastructure (do not rebuild)

WE01 editor shell, inline text/image dialogs, Change Manager (pending count / unpublished panel / field history), draft/preview/publish/unpublish/version/restore engines, media upload engine, permission keys, URL helpers, presentation model.

### Product-specific website content (not parity gaps)

| Concern | Owner | Why separate |
|---------|-------|--------------|
| Doctors / services catalogue | AC | Clinical ops-backed public catalogue |
| FAQ collection editor | AC | Clinic home content pattern |
| Leadership / ministries / events / sermons / giving entities | BB | Church content domains |
| HQ + branch multi-site websites | BB | Multi-campus product rule |
| Publish review / change-submission | BB (policy) | Church governance; AC submit exists but policy-light |
| Design tokens / branding | Both | Preserve `[data-product]` identities |

### Duplicated implementations that should move to platform

| Duplication | Evidence | Target |
|-------------|----------|--------|
| BB overlay drafts + engine drafts | Migration / reuse audit | Engine SoT; overlays derived or removed |
| BB legacy `website_publication_versions` + platform versions | Migration doc | Platform versions SoT |
| Parallel hub presentation wiring | AC hub vs BB HQ hub | Already partly shared via `websiteManagementPresentation`; finish |
| Product chrome attach duplication | `attachActiveClinicWebsiteChrome` vs `attachWebsiteAdminChrome` | Shared chrome builder + thin product options |
| Separate editor regression inventories | AC inventory 64 vs BB scattered suites | Shared matrix + product rows |

---

## Grouped findings

### A. AC FEATURES BB SHOULD GAIN

| ID | Feature | Priority | Rationale |
|----|---------|----------|-----------|
| A1 | Complete public inline pencil coverage (text/image) on all editable BB surfaces | **P1** | Architecture audit: BB SHARED WITH GAPS; AC pattern is the target |
| A2 | Shared universal image payload contract (string URL + object shape) | **P1** | BB residual `invalid_url` on object payload; AC path stronger |
| A3 | Hub = management-only (no fake editor/studio canvas) | **P1** | AC-WEB-EDITOR-01 closed; BB hubs should keep same role clarity |
| A4 | Shared editor regression matrix (viewport, draft, media, restore) | **P1** | AC inventory denser; BB coverage uneven |
| A5 | Shared “edit elsewhere” operational affordance pattern | **P2** | AC catalogue deep-links; BB structured editors need same guidance UX |
| A6 | Mobile overflow cleanup using shared WE CSS | **P2** | Toolbar parity done; residual product chrome overflow |

**Not listed as BB gaps:** AC doctors/services catalogue, FAQ collection, clinic hours domain (product-specific).

### B. BB FEATURES AC SHOULD GAIN

| ID | Feature | Priority | Rationale |
|----|---------|----------|-----------|
| B1 | Mature submit-for-review UX when publish policy requires it | **P1** | BB review path mature; AC submit PARTIAL |
| B2 | Publish / save error diagnostics parity | **P1** | BB diagnostics historically stronger; share codes |
| B3 | Clear public entry chrome labels (Manage / Preview / Edit) | **P2** | BB entry chrome verified; keep AC equivalent consistency |
| B4 | Multi-site website scope UX | **P2** | BB-only product need; **do not force** onto AC single-clinic model |

**Not listed as AC gaps:** Events/sermons/ministries CMS, HQ/branch dual websites (product-specific).

### C. ALREADY SHARED PLATFORM FEATURES

Entry chrome stack · viewport toggles · inline dialogs · draft/preview/publish/unpublish · unpublished Change Manager · media engine · version/restore · field history · website permissions · tenant deny helpers · URL builders · presentation model · asset/theme tokens (product-skinned).

### D. DUPLICATED FEATURES TO CONSOLIDATE

1. BB overlay + engine draft dual-write  
2. BB legacy publication versions vs platform versions  
3. Parallel chrome attach modules (thin remaining product options)  
4. Parallel editor test inventories  
5. Section storage (`page_sections` vs engine section keys) toward one SoT  

### E. PRODUCT-SPECIFIC FEATURES THAT SHOULD STAY SEPARATE

- AC: services/doctors catalogue, FAQ collection, clinic-specific sections, single-org clinic website  
- BB: leadership/ministries/events/sermons/giving entities, HQ/branch multi-site, publish review governance  
- Both: visual branding / design tokens (`[data-product]`)

### F. TEST COVERAGE GAPS

| Gap | Severity | Action |
|-----|----------|--------|
| Viewport toggle behavioral click tests (shared) | P2 | One shared suite for desktop/tablet/mobile switch |
| BB inline coverage matrix vs AC inventory | P1 | Port AC feature→test map to BB surfaces |
| Unpublish HTTP depth (AC lighter) | P1 | Shared unpublish positive/negative |
| Image object-payload contract | P1 | Shared media dialog contract tests |
| Submit-for-approval AC path | P1 | Policy-on AC HTTP + UI |
| True Layers panel | N/A | Out of scope — do not invent |
| True UA device emulation | N/A | Out of scope — document preview-only |

---

## Priority roll-up (A + B actionable items)

| Priority | Count | Items |
|----------|------:|-------|
| **P0** | **0** | No workflow/security blockers found for shared editor entry/authz after REG-WEB + hub fixes |
| **P1** | **7** | A1, A2, A3, A4, B1, B2 + unpublish/image test gaps (F) |
| **P2** | **4** | A5, A6, B3, B4 (B4 optional / product-gated) |

---

## Advantage / gap counts (methodology)

| Metric | Definition | Count |
|--------|------------|------:|
| **AC_ONLY_ADVANTAGES** | Normalized features where AC is ahead on shared UX or AC-only website ops (not counting BB-only church content as an AC miss) | **7** |
| **BB_ONLY_ADVANTAGES** | Normalized features where BB is ahead on shared UX or BB-only website ops (not counting AC catalogue as a BB miss) | **5** |
| **SHARED_PLATFORM** | Features with PLATFORM_STATUS=`SHARED` | **28** |
| **DUPLICATED_TO_CONSOLIDATE** | Distinct duplication themes in §D | **5** |
| **BB_PARITY_GAPS** | Actionable A-group items (BB should gain from AC/shared) | **6** |
| **AC_PARITY_GAPS** | Actionable B-group items (AC should gain from BB/shared) | **4** |

**AC_ONLY_ADVANTAGES detail:** #7 inline completeness, #16 sections hub CMS depth, #26 hub management-only clarity, #29 services catalogue, #30 practitioner catalogue, #39 regression density, #40 guidance affordances.  

**BB_ONLY_ADVANTAGES detail:** #14 review/governance maturity, #34 events/sermons/ministry content, multi-site scope (under #25/#26/#38), structured leadership CMS (#30 BB side), branch website admin entry (#26 BB side).

---

## Footer

```
NORMALIZED_EDITOR_FEATURES=40
AC_ONLY_ADVANTAGES=7
BB_ONLY_ADVANTAGES=5
SHARED_PLATFORM=28
DUPLICATED_TO_CONSOLIDATE=5
BB_PARITY_GAPS=6
AC_PARITY_GAPS=4
P0=0
P1=7
P2=4
FINAL=AC_BB_WEBSITE_EDITOR_COMPARISON_COMPLETE
```
