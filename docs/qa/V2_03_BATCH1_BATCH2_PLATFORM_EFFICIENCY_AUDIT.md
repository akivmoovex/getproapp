# V2.03 Batch 1 + Batch 2 — Platform Efficiency & Collision Audit

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_BATCH1_BATCH2_PLATFORM_EFFICIENCY_AUDIT` |
| **Date** | 2026-09-26 |
| **Mode** | **READ-ONLY** architecture audit — no application code changes |
| **Branch** | `V10` |
| **HEAD** | `40107164c00c838ac81a311a7a0da1d4d6616ba2` |
| **Reconciliation baseline** | `f54f8213cebbf594931fd8de240e65483bdccc0f` |
| **Production touched** | **NO** |
| **Verdict** | `V2_03_EFFICIENCY_GOOD_CONTINUE_BATCH2` |

---

## Status note (inventory vs prompt framing)

The prompt lists AC-B2-06…10 as “remaining.” On current `HEAD`, those screens **are already implemented** (Stitch markers, `ac-ops-queue` packs, dedicated tests). This audit therefore:

1. Maps **as-built** Batch 1 + Batch 2 architecture.  
2. Evaluates duplication / collision after `f54f8213`.  
3. Treats “efficiency for B2-06…10” as **what was reused / what residual debt remains** for polish and Batch 3 — not as a gate to start those screens.

---

## BASELINE

| Item | Value |
|------|--------|
| Branch | `V10` |
| HEAD | `40107164c00c…` |
| Working tree | Dirty relative to HEAD (shared-regression / RBAC audit artifacts uncommitted — **not modified by this audit**) |
| `origin/V10` | `80291225…` (hosted tip; Batch 1/2 not on origin) |
| Canonical reconciliation | `V2_03_SHARED_INFRA_RECONCILIATION_PASS` @ `f54f8213` |
| Auth tokens | `public/activeclinic/ac-app-tokens.css` |
| Staff shell | B2 chrome + B1 nav/permissions |
| Desktop / mobile chrome | 256 / 56 ; 56 / 64 bottom |
| Asset version (working tree) | `v2-03-b2-shared-reg-01` (drifted from reconciled `v2-03-shared-01` — process debt) |
| gp-ops | `public/platform/gp-ops-shared.css` + `views/platform/partials/gp-ops-*` |
| Production | Untouched |

Approximate CSS size:

| File | Lines |
|------|------:|
| `ac-app.css` | 4045 |
| `ac-app-tokens.css` | 95 |
| `ac-tokens.css` | 256 |
| `gp-ops-shared.css` | 359 |

---

## 1. Architecture map (four layers)

### A. PLATFORM SHARED (product-neutral)

```
src/platform/http/listQuery.js
src/platform/money/formatMoney.js
src/platform/history/statusHistory.js
src/platform/timeline/activityTimeline.js
src/platform/jobs/*                    (adapters, validation, service, artifacts)
src/platform/notifications/*
src/platform/consent/*
src/platform/rbac/sharedTenantScope.js # rejectForgedTenantIdentifiers
src/platform/rbac/sharedAuthzDecision.js
public/platform/gp-ops-shared.css
views/platform/partials/gp-ops-card.ejs
views/platform/partials/gp-ops-empty-state.ejs
views/platform/partials/gp-ops-filter-bar.ejs
views/platform/partials/gp-ops-pagination.ejs
views/platform/partials/gp-ops-status-badge.ejs
views/platform/partials/gp-ops-status-tabs.ejs
views/platform/partials/gp-ops-table.ejs
views/platform/partials/gp-ops-timeline.ejs
views/platform/partials/phone-field.ejs
views/platform/partials/shared-verification-form.ejs
```

### B. ACTIVECLINIC SHARED (staff product; not BB)

```
public/activeclinic/ac-app-tokens.css
public/activeclinic/ac-app.css              # shell + shared controls + screen packs
public/activeclinic/ac-tokens.css           # public/portal + legacy semantic
views/activeclinic/layouts/app-shell.ejs
views/activeclinic/partials/sidebar.ejs
views/activeclinic/partials/staff-mobile-bottom-nav.ejs
views/activeclinic/partials/staff-shell-ops-tools.ejs
public/activeclinic/ac-shell-nav.js
src/activeclinic/services/buildActiveClinicShellViewModel.js
src/activeclinic/services/activeClinicNavigation.js
src/activeclinic/http/loadActiveClinicAuth.js
src/activeclinic/http/activeClinicPermissionMiddleware.js
src/activeclinic/services/activeClinicAuthorizationService.js
src/activeclinic/services/activeClinicModuleAvailability.js
src/activeclinic/services/activeClinicDepartmentService.js  # dept gate for modules
src/activeclinic/services/formatMoney.js                    # thin re-export → platform
# Emergent composition pattern (B2 ops screens):
#   .ac-ops-queue* in ac-app.css + gp-ops partials in EJS
```

### C. DOMAIN SHARED

```
# Clinical
src/activeclinic/services/activeClinicClinicalService.js
src/activeclinic/services/loadActiveClinicClinicalScreens.js
src/activeclinic/http/activeClinicClinicalRoutes.js
views/activeclinic/app/consultation-workspace-content.ejs
views/activeclinic/app/clinical-*-content.ejs

# Pharmacy
src/activeclinic/services/activeClinicPharmacyService.js
src/activeclinic/services/activeClinicPharmacyOpsService.js
src/activeclinic/services/loadActiveClinicPharmacyScreens.js
src/activeclinic/http/activeClinicPharmacyRoutes.js

# Diagnostics
src/activeclinic/services/activeClinicDiagnosticsService.js
src/activeclinic/services/loadActiveClinicDiagnosticsScreens.js
src/activeclinic/http/activeClinicDiagnosticsRoutes.js

# Billing / cashier
src/activeclinic/services/activeClinicBillingService.js
src/activeclinic/services/activeClinicFinanceAuthz.js
src/activeclinic/http/activeClinicBillingRoutes.js
src/activeclinic/http/activeClinicCashierRoutes.js

# Facilities / departments
src/activeclinic/services/facilityService.js
src/activeclinic/services/loadActiveClinicFacilityScreens.js
src/activeclinic/services/loadActiveClinicDepartmentsSettingsScreen.js
src/activeclinic/http/activeClinicFacilityRoutes.js
src/activeclinic/http/activeClinicSettingsRoutes.js  # departments

# Patients / appointments / reception
src/activeclinic/services/activeClinicPatientService.js
src/activeclinic/services/loadActiveClinicPatientScreens.js
src/activeclinic/services/activeClinicAppointmentService.js
src/activeclinic/services/loadActiveClinicAppointmentScreens.js
src/activeclinic/services/activeClinicReceptionService.js
```

### D. SCREEN SPECIFIC

```
views/activeclinic/app/*-content.ejs          # per-route markup
public/activeclinic/ac-app.css                # .ac-*-b2 / .ac-batch1a* packs
tests/activeclinic-batch1a-*.js
tests/activeclinic-batch2-*.js
```

---

## 2. Cross-batch duplication audit

| ID | CATEGORY | FILES | B1 | B2 | PLATFORM EQ | TYPE | SEV | OWNER | BENEFIT | BEFORE B2-06? |
|----|----------|-------|----|----|-------------|------|-----|-------|---------|---------------|
| DUP-01 | Table chrome | `ac-app.css` `.ac-table*`; `gp-ops-shared.css` `.gp-ops-table*`; many EJS with **both** classes | Legacy tables | Hybrid `ac-table gp-ops-table` on queues | `gp-ops-table` | NEAR DUPLICATE | P2 | KEEP AS-IS → gradual gp-ops | MEDIUM | **NO** (already shipping) |
| DUP-02 | KPI cards | `.ac-stat-card*` vs `gp-ops-card` | Dashboard/billing KPIs | Same `.ac-stat-card` on B2 dash/billing/facilities | `gp-ops-card` | NEAR DUPLICATE | P2 | ACTIVECLINIC SHARED or KEEP | MEDIUM | NO |
| DUP-03 | Filters | `.ac-filter-bar*` vs `gp-ops-filter-bar` | Services/practitioners/patients B1 styles | B2 queues use gp-ops filter | `gp-ops-filter-bar` | NEAR DUPLICATE | P2 | KEEP AS-IS (migrate on touch) | MEDIUM | NO |
| DUP-04 | Badges | `.ac-badge*` vs `gp-ops-status-badge` | Widespread | B2 prefers gp-ops status badge; some `.ac-badge` remain | `gp-ops-status-badge` | NEAR DUPLICATE | P2 | KEEP AS-IS | LOW | NO |
| DUP-05 | Desktop↔mobile list swap | Repeated `@media` hide/show per screen | billing-account, clinical, facilities | `ac-ops-queue__desktop/mobile`, patients/appts packs | Partial in gp-ops table responsive | SAME CONCEPT | P2 | ACTIVECLINIC SHARED (`ac-ops-queue` already) | HIGH for Batch3 | NO |
| DUP-06 | Ops queue header/card | `.ac-ops-queue*` used by pharmacy, diagnostics, billing, facilities | — | Shared mid-B2 extraction | gp-ops filter/tabs/table | INTENTIONAL shared AC | — | ACTIVECLINIC SHARED | HIGH | N/A (done) |
| DUP-07 | Patients screen | ACN10 + AC-B2-02 | Functional directory | Stitch chrome on same route | gp-ops pagination/badge | INTENTIONAL dual markers | — | KEEP AS-IS | — | — |
| DUP-08 | Appointment detail | ACN08 + AC-B2-05 | Engine + actions | Stitch chrome + timeline | gp-ops timeline/badge | INTENTIONAL | — | KEEP AS-IS | — | — |
| DUP-09 | Clinical encounter | ACN14–16 + AC-B2-06 | Clinical service/routes | Presentation pack `--b2` | gp-ops badge only | SAME CONCEPT DIFFERENT LAYER | P3 | DOMAIN SHARED | LOW | NO |
| DUP-10 | Billing | ACN21–23 + AC-B2-09 | Billing/cashier engines | Workspace Stitch chrome | money platform | SAME CONCEPT DIFFERENT LAYER | P3 | DOMAIN SHARED | LOW | NO |
| DUP-11 | Money formatting | `services/formatMoney.js` → platform | Used by billing/cashier | Same | `platform/money` | EXACT (thin wrap) | P3 | PLATFORM (already) | — | NO |
| DUP-12 | List query | `listQuery` in patients/ops catalogue/practitioners | Partial | Patients B2 loader uses parseListQuery | `platform/http/listQuery` | NEAR — uneven adoption | P2 | PLATFORM standardize on touch | MEDIUM | NO |
| DUP-13 | Facility/tenant scope | Many services call `rejectForged` / org+facility filters | Middleware + services | Same middleware | `sharedTenantScope` | INTENTIONAL layered | — | KEEP AS-IS | — | NO |
| DUP-14 | Hardcoded slate hex | `ac-app.css` ~6× `#0F172A` remnants | — | Pre-token B2 residue | tokens file | NEAR / debt | P3 | SCREEN/CSS cleanup later | LOW | NO |
| DUP-15 | BB vs gp-ops DS | `blessboard/v5/design-system.css` vs gp-ops | BB violet system | AC ops | Conceptual parallel | SAME CONCEPT DIFFERENT PRODUCT | P3 | PLATFORM long-term optional | LOW | NO |

**Counts:** Exact useful dupes to force-merge now: **0 P0 / 0 P1**. Intentional dual markers and dual primitives: **documented P2/P3 debt**.

---

## 3. Platform reuse audit

| PLATFORM COMPONENT | CURRENT AC USAGE | OTHER AC DUPLICATE | SAFE TO STANDARDIZE? | BENEFIT | RISK |
|--------------------|------------------|--------------------|----------------------|---------|------|
| `gp-ops-*` CSS/partials | Staff shell + B2 lists/queues | `.ac-table/filter/badge/stat-card` coexist | Yes **on screen touch** only | MEDIUM | MEDIUM if big-bang |
| `listQuery` | Patients, ops catalogue, practitioners | Ad-hoc query parsing elsewhere | Yes gradually | MEDIUM | LOW |
| `formatMoney` | Via AC wrapper | Church HQ has separate formatter (BB) | AC already standardized | HIGH (done) | LOW |
| `statusHistory` | Appointments, reception | Clinical may use domain history | Domain-aware; don’t force all | MEDIUM | MEDIUM |
| `activityTimeline` | Appointment detail (gp-ops-timeline) | Clinical timeline local | Prefer gp-ops timeline where UI matches | MEDIUM | LOW |
| `jobs` / CSV validation | Data centre + member import | — | Already shared | HIGH | LOW |
| `rejectForgedTenantIdentifiers` | Permission middleware + services | — | Already shared | HIGH | LOW |
| Notifications / consent | Foundation; AC consent service uses forged check | Don’t put clinical consent UX in platform | No clinical move | — | — |

**Do not** move SOAP/clinical, pharmacy dispense, diagnostics modality, or facility healthcare types into platform.

---

## 4. BlessBoard / cross-product opportunities

| CURRENT LOCATION | WHY PRODUCT-NEUTRAL | BB EQUIVALENT | DUPLICATION | FUTURE OWNER |
|------------------|---------------------|---------------|-------------|--------------|
| `gp-ops-*` | Structural list/ops chrome | `bb-ds-table`, `bb-ds-badge`, `bb-ds-empty`, pagination | Parallel DS | Keep **both** until deliberate unification; BB must override `--gp-ops-*` if mounted |
| `listQuery` | Generic pagination/search | Platform admin + BB lists partially | Partial | PLATFORM |
| `formatMoney` | Currency minor units | BB church analytics local | Mild | PLATFORM optional BB adopt |
| `statusHistory` / timeline | Generic status streams | BB pastoral/ops history patterns differ | Conceptual | PLATFORM |
| Jobs / CSV | Already used by BB adapters | BB member import | Shared | PLATFORM (done) |
| Drawers/modals | gp-ops lacks full modal; AC drawers in `ac-app.css` | `bb-ds-drawer` / modal | Parallel | Do **not** merge healthcare drawers into platform |

**No moves recommended now.** BB must not load AC staff CSS.

---

## 5. Remaining collision audit (post-`f54f8213`)

| FILE | B1 | B2 | CANONICAL | STATUS | WHY |
|------|----|----|-----------|--------|-----|
| `ac-app-tokens.css` | ODS palette | Same family | **ac-app-tokens** | RESOLVED | Single staff brand file |
| `ac-tokens.css` | Public/portal | Comment pointer | Public `--acp-*` | RESOLVED | Staff overrides via load order |
| `gp-ops-shared.css` | Defaults | Consumed + B2 visual retune | Structural + product overrides | PARTIALLY RESOLVED | Defaults vs AC overrides; brand must stay in tokens |
| `ac-app.css` | B1 packs + shell | B2 packs + ops-queue | Shared file, sectional | PARTIALLY RESOLVED | Monolith remains; no dual `:root` brand |
| `app-shell.ejs` | — | B2 shell | Shared | RESOLVED | |
| sidebar / bottom nav / ops tools | Nav keys B1 | Structure B2 | Shared | RESOLVED | |
| `buildActiveClinicShellViewModel.js` | Nav/modules | Asset version bumps | Shared | PARTIALLY RESOLVED | Version string thrash (`shared-01` → `b2-parity` → `b2-shared-reg`) |
| Patients route | ACN10 | AC-B2-02 markers | Dual markers one route | RESOLVED | |
| Appointment detail | ACN08 | AC-B2-05 | Dual markers | RESOLVED | |
| Clinical | ACN14–16 | AC-B2-06 pack | Functional + presentation | RESOLVED | |
| Billing | ACN21–23 | AC-B2-09 pack | Functional + presentation | RESOLVED | |
| Tables/filters/badges dual | Legacy AC | gp-ops hybrid | Debt | FUTURE COLLISION RISK | Drift if both evolved independently |
| Hosted vs local SHA | — | — | — | ACTIVE (release) | Not an in-repo code collision; deploy lag |

**No ACTIVE in-repo B1/B2 token/shell ownership collision** blocking further screen work.

---

## 6. CSS efficiency audit

| Metric | Observation |
|--------|-------------|
| Total `ac-app.css` | ~4045 lines; ~57 `@media` blocks |
| Screen packs | Distinct B1A / ACN / B2 sections (~2629–end) |
| Shared shell/controls | Top ~1.8k lines (approx) |
| Duplicate concepts | table/badge/filter/stat-card dual with gp-ops |
| Hardcoded brand | ~17× `#2563eb` leftovers; ~6× `#0F172A` slate residue |
| `ac-ops-queue` | ~20 selector hits — **successful mid-batch AC shared extraction** |
| gp-ops | 359 lines; sufficient for filter/tabs/table/badge/empty/pagination |

**Pre-B2-06 cleanup?** Screens already shipped. Further extraction only worth it for Batch 3 or when touching a pack:

1. Prefer extending **`.ac-ops-queue`** (AC shared) over new per-screen desktop/mobile pairs.  
2. Do **not** split `ac-app.css` solely for size.  
3. Optional low-risk: replace remaining `#0F172A` with token vars when next editing those rules.

---

## 7. Backend efficiency audit

| FILES | DUPLICATION | EXISTING ABSTRACTION | SHARE? | WHY | RISK |
|-------|-------------|----------------------|--------|-----|------|
| `loadActiveClinic*Screens.js` × many | Parallel loader shape | Pattern only | Light conventions; no mega-loader | Domain VMs differ | HIGH if forced |
| List parsing | Uneven `listQuery` adoption | `platform/http/listQuery` | Yes on touch | Less drift | LOW |
| Facility/org scoping | Repeated in services | Auth + `rejectForged` | Keep layered | Domain SQL differs | HIGH if over-abstract |
| Permission checks | Middleware + service asserts | Permission middleware | Keep both | Defense in depth | — |
| Money | Thin AC re-export | Platform | Done | — | — |
| Status history | Appointments/reception use platform | `statusHistory` | Extend carefully | Clinical states differ | MEDIUM |
| Pharmacy vs diagnostics loaders | Similar queue VM + filters | Could share private helper | Optional DOMAIN | Modality/dept differ | MEDIUM |

**Do not** invent a single “list everything” AC service.

---

## 8. AC-B2-06…10 efficiency (as-built + residual)

### AC-B2-06 Clinical Encounter — **IMPLEMENTED**

| | |
|--|--|
| EXISTING FUNCTIONALITY | ACN14–16 clinical service, routes, draft/complete |
| VIEW | `consultation-workspace-content.ejs` + `--b2` CSS |
| PLATFORM | gp-ops status badge |
| AC SHARED | Staff shell, buttons, panels |
| DOMAIN | Clinical loader/service |
| NEW CODE REQUIRED (then) | Presentation pack + tests |
| MUST NOT DUPLICATE | Clinical engine / RBAC |
| COLLISION FILES | `ac-app.css` clinical section; clinical routes |
| REUSE | **HIGH** |
| NEW BACKEND / DB / SHARED INFRA | NO / NO / NO |

### AC-B2-07 Pharmacy — **IMPLEMENTED**

| | |
|--|--|
| REUSE | Pharmacy routes/services + **`ac-ops-queue`** + gp-ops filter/tabs/table |
| NEW CODE | Queue/dashboard EJS chrome |
| COLLISION RISK | **LOW** |
| REUSE LEVEL | **VERY HIGH** |
| NEW BACKEND/DB/SHARED | NO / NO / NO (ops-queue already extracted) |

### AC-B2-08 Diagnostics — **IMPLEMENTED**

| | |
|--|--|
| REUSE | Diagnostics service + dept middleware + ops-queue + gp-ops |
| NEW CODE | Hub/lab/rad presentation |
| COLLISION RISK | **LOW** (dept gates preserved) |
| REUSE LEVEL | **VERY HIGH** |
| NEW BACKEND/DB/SHARED | NO / NO / NO |

### AC-B2-09 Billing — **IMPLEMENTED**

| | |
|--|--|
| REUSE | Billing/cashier engines + SoD + ops-queue/KPI cards |
| NEW CODE | Workspace Stitch chrome |
| COLLISION RISK | **LOW** |
| REUSE LEVEL | **HIGH** |
| NEW BACKEND/DB/SHARED | NO / NO / NO |

### AC-B2-10 Departments & Facilities — **IMPLEMENTED**

| | |
|--|--|
| REUSE | Facility + department services; composed IA; gp-ops filter/table; ops-queue |
| NEW CODE | Combined presentation; documented Stitch gaps |
| COLLISION RISK | **LOW** |
| REUSE LEVEL | **HIGH** |
| NEW BACKEND/DB/SHARED | NO / NO / NO |

---

## 9. Operations workspace pattern

**Verdict: `C. ACTIVECLINIC_OPERATIONS_WRAPPER_WORTHWHILE`** (already partially realized as `.ac-ops-queue`)

Evidence:

- Pharmacy, diagnostics, billing invoices, facilities/departments share: header/kicker, KPI or metrics, gp-ops filter/status-tabs, desktop table + mobile cards, badges, empty.
- gp-ops already covers primitives; **composition** (header + dual chrome + card actions) lived in AC CSS as `ac-ops-queue` mid-Batch 2 — correct layer (not platform).
- Dashboard/patients/appointments are cousins but not identical (calendar, patient directory filters).

**Not A:** gp-ops alone doesn’t encode ops header/KPI/card-action composition.  
**Not B alone:** small gp-ops extensions (e.g. status-tabs — already added) help, but wrapper stays AC.  
**Not D:** would have re-copied media-query pairs four more times.

---

## 10. Clinical workspace pattern

**Verdict: `SMALL_AC_CLINICAL_SHARED_LAYER_WORTHWHILE`** (patient/encounter banner only; not platform)

Evidence:

- Encounter banner / patient identity / meta already concentrated under `.ac-clinical-encounter__*` and older `.ac-clinical-banner`.
- Appointment detail and patient profile share “patient context + status + actions” conceptually but layouts differ.
- Pharmacy dispense / diagnostic result are workflow-specific — don’t force into one clinical chrome.

Recommend later (Batch 3+): optional `ac-patient-context` partial for banner only — **not** before further B2 work.

---

## 11. Dead / obsolete / superseded

| ITEM | WHY POSSIBLY OBSOLETE | REFS | SAFE REMOVE LATER |
|------|----------------------|------|-------------------|
| Dual ODS patient Stitch IDs as primary | Replaced by AC-B2-02 markers | Kept as reference attrs | NO (refs intentional) |
| Teal active-nav rules | Fixed to primary in parity | May linger as comments/vars `--ac-teal` | UNCERTAIN — teal still token for walk-in etc. |
| `#0F172A` hardcodes in `ac-app.css` | Token reconciliation | ~6 hits | YES when touching those rules |
| Pre-gp-ops-only filter markup on B2 queues | Migrated to gp-ops | B1 screens still use `ac-filter-bar` | NO broad delete |
| Duplicate “` 2.*`” untracked doc/migration clones in git status | macOS copy artifacts | Untracked | YES (cleanup ops; not this audit) |

---

## 12. Collision risk matrix

| AREA | BATCH 1 | BATCH 2 | PLATFORM | RISK | ACTION |
|------|---------|---------|----------|------|--------|
| tokens | ODS | same file | — | NONE | Keep `ac-app-tokens` |
| shell | nav/perms | chrome | — | NONE | Shared |
| navigation | catalogue | structure | — | LOW | Shared VM |
| patients | ACN10 | B2-02 | gp-ops page | NONE | Dual markers |
| appointments | ACN06–09 | B2-04/05 | timeline | NONE | Dual markers |
| clinical | ACN14–16 | B2-06 | badge | LOW | Domain + pack |
| pharmacy | engine | B2-07 | gp-ops | LOW | ops-queue |
| diagnostics | engine | B2-08 | gp-ops | LOW | dept + ops-queue |
| billing | ACN21–23 | B2-09 | money | LOW | SoD preserved |
| facilities | catalogue | B2-10 | gp-ops | LOW | composed IA |
| departments | settings | B2-10 | gp-ops | LOW | manage perm |
| tables | `.ac-table` | hybrid | gp-ops | MEDIUM | Migrate on touch |
| filters | `.ac-filter-bar` | gp-ops | gp-ops | MEDIUM | Migrate on touch |
| badges | `.ac-badge` | gp-ops | gp-ops | MEDIUM | Migrate on touch |
| KPI cards | `.ac-stat-card` | same | gp-ops-card | MEDIUM | Optional later |
| mobile nav | — | B2 bottom | — | NONE | Frozen 64px |
| RBAC | catalogue | same | forged IDs | NONE | Do not weaken |
| tenant/facility | services | same | sharedTenantScope | NONE | |
| asset version | bumps | bumps | — | MEDIUM | Prefer shared-NN policy |
| hosted SHA | — | lag | — | HIGH (release) | Push/deploy outside code |

---

## 13. Minimum optimization plan

### DO BEFORE B2-06

**None required** — AC-B2-06…10 already implemented; no P0/P1 duplication blocks.

### DO DURING EACH SCREEN (Batch 3 / future touch)

1. Prefer **`ac-ops-queue` + gp-ops partials** for list/queue workspaces.  
2. Use **`parseListQuery` / `buildListPageResult`** when editing loaders.  
3. Prefer **`gp-ops-status-badge` / filter / tabs** over new `.ac-badge` / `.ac-filter-bar` variants.  
4. Keep domain engines; presentation-only Stitch packs.  
5. Never invent Stitch-demo fields without schema.

### DO AFTER BATCH 2

1. Gradual retirement of unused `.ac-filter-bar` on screens already on gp-ops.  
2. Optional map `.ac-stat-card` → `gp-ops-card` on 2–3 dashboards only.  
3. Replace residual `#0F172A` with tokens.  
4. Stabilize `SHELL_ASSET_VERSION` policy (`v2-03-shared-NN` vs feature stamps).  
5. Consider tiny `ac-patient-context` partial if Batch 3 adds more clinical surfaces.

### DO NOT DO

1. Split/rewrite entire `ac-app.css`.  
2. Force BlessBoard onto gp-ops without BB token overrides.  
3. Move clinical/pharmacy/diagnostics semantics into `src/platform`.  
4. Big-bang delete of `.ac-table` / `.ac-badge`.  
5. Merge facilities + departments backends for Stitch IA.  
6. Weaken RBAC/SoD for visual parity.

---

## 14. Test / security impact (for future extractions)

| Proposed optimization | Protecting tests |
|----------------------|------------------|
| gp-ops / ops-queue CSS only | `activeclinic-batch2-shell`, operational-queues, billing, facilities, visual parity notes |
| listQuery adoption | patients workspace, ops catalogue, platform foundation |
| Patient context partial | clinical-encounter, patient-workspace, RBAC isolation |
| Badge/filter migration | batch2-* UI + RBAC (ensure 403 paths unchanged) |
| Any auth/scope change | **`activeclinic-batch2-rbac-isolation`**, batch1a billing isolation, facilities parity |

Flag: **CSS-only** extractions are low risk if tests assert markers/HTTP status, not selector snapshots. **Do not** extract permission helpers without expanding RBAC isolation coverage.

---

## 15. Final recommendation

Batch 1 functional engines + Batch 2 presentation are reconciled at shell/tokens; mid-batch **`ac-ops-queue`** already reduced queue duplication for B2-07…10. Remaining dual primitives are **intentional P2 debt**, not blockers. No architectural collision requires a pre-flight refactor.

**`V2_03_EFFICIENCY_GOOD_CONTINUE_BATCH2`**
