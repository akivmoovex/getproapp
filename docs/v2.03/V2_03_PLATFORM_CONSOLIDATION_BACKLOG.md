# EPIC — V10 BB/AC Platform Consolidation

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_PLATFORM_CONSOLIDATION_BACKLOG` |
| **Epic** | V10 BB/AC Platform Consolidation |
| **Branch** | `V10` |
| **Status** | **`COMPLETE_WITH_P2_P3_DEBT`** (PC25 handoff 2026-09-27) |
| **Implementation** | Workstreams 00–12 + PC13–PC24 complete; residual P2/P3 only — see PC25 |
| **Audit baseline** | `AUDIT_BASELINE_2026_09_26` (initial); recalculated `AUDIT_BASELINE_2026_09_27_PC01` |
| **Canonical index** | [`docs/BACKLOG.md`](../BACKLOG.md) (Platform Consolidation section) |
| **Evidence** | BB / AC Platform Duplication Audit (2026-09-26); PC01–PC25 under `docs/qa/` |
| **PC01 preflight** | **`V10_PC01_CONSOLIDATION_PREFLIGHT_PASS`** (2026-09-27) |
| **PC02 characterization** | **`PLATFORM_CONSOLIDATION_CHARACTERIZATION_PASS`** — evidence [`docs/qa/V10_PC02_PLATFORM_CONSOLIDATION_CHARACTERIZATION.md`](../qa/V10_PC02_PLATFORM_CONSOLIDATION_CHARACTERIZATION.md) |
| **PC25 handoff** | **`V10_PC25_RESIDUAL_BACKLOG_HANDOFF`** — [`docs/qa/V10_PC25_RESIDUAL_BACKLOG_HANDOFF.md`](../qa/V10_PC25_RESIDUAL_BACKLOG_HANDOFF.md) |
| **Next activity** | **V2.03 QA** — `NEXT_MAJOR_CONSOLIDATION_EPIC_REQUIRED: NO` |

---

## Goal

Reduce duplicated technical infrastructure between BlessBoard and ActiveClinic while preserving product-specific domain behavior, workflows, terminology, permissions, URLs, and visual identity.

Architecture principle:

> Platform owns mechanisms. Products own domain semantics.

Target dependency direction:

```text
BlessBoard ─────► Platform
ActiveClinic ───► Platform
```

Avoid:

```text
Platform ─────► BlessBoard implementation
Platform ─────► ActiveClinic implementation
```

Products should register adapters/contracts with platform infrastructure where product-specific behavior is required.

---

## Audit baseline (`AUDIT_BASELINE_2026_09_26`)

All measurements below are **approximate audit snapshots**. Recalculate before implementation — the repository is actively changing.

| Finding | Baseline |
|---------|----------|
| Significant BB/AC duplication | Present |
| Shared platform already exists | `src/platform/` (substantial) |
| Shared platform/view/public infrastructure | ~95–100k LOC |
| Further shareable common BB/AC infrastructure | ~25–40% of common infra (not of total product LOC) |
| Major rewrite required? | **No** — incremental consolidation recommended |
| Highest duplication concentration | Website/CMS HTTP wrappers; classic CMS; publishing; authentication/identity surfaces; registration wrappers; phone infrastructure |
| Platform common-code readiness | `READY_WITH_REFACTOR` |
| V2.03 duplication risk | Manageable if new shared infrastructure is not placed inside product packages |
| Platform files hard-requiring product packages | ~38 (`AUDIT_BASELINE_2026_09_26`); **recalculated 40** (`AUDIT_BASELINE_2026_09_27_PC01` — recalculate again before IMPLEMENTATION) |

Highest-impact hotspots (audit):

1. Website editor HTTP twins (`blessboardWebsiteEditorRoutes.js` ↔ `activeClinicWebsiteRoutes.js`)
2. Classic CMS dual stacks (BB content-admin / structured drafts ↔ AC `clinicWebsiteCms*`)
3. Publish path fork (`churchWebsitePublishService.js` ↔ `platform/website/publicationService.js` + AC submit/unpublish)
4. Registration draft exact clones
5. Phone asset ownership inversion (BB/platform → AC-owned phone field)
6. RBAC parallel catalogues + facade; schema ownership smells
7. Auth/portal surfaces wrapping shared session
8. Near-duplicate verification wrappers (~96% similarity)
9. Platform god-files with product `require`s
10. Email delivery hosted in AC, consumed by platform

---

## Architecture guardrails (permanent V10)

### ARCH-01 — Dependency Direction

Platform code must not directly depend on BlessBoard or ActiveClinic implementation modules.

Desired:

```text
product → platform
```

Product-specific behavior should enter platform through:

- adapters
- contracts
- registration
- configuration
- callbacks/hooks where appropriate

### ARCH-02 — Mechanism vs Domain

Before implementing a new capability ask:

> Is this a technical mechanism or a product domain concept?

Technical mechanisms should normally be platform-owned.

Domain concepts should normally remain product-owned.

### ARCH-03 — No Cross-Product Infrastructure Ownership

Do not create generic infrastructure under:

```text
src/blessboard/
src/activeclinic/
public/blessboard/
public/activeclinic/
```

merely because that product needs the capability first.

Examples that should first be evaluated for platform ownership:

- phone components
- email transport
- upload infrastructure
- media storage
- pagination engine
- generic table framework
- generic modal framework
- session mechanisms
- generic validation
- audit infrastructure

### ARCH-04 — No Mega Product Conditionals

Avoid platform implementations dominated by:

```js
if (product === 'blessboard') ...
else if (product === 'activeclinic') ...
```

Prefer:

```text
platform mechanism
        +
product adapter/configuration
        +
product composition
```

### ARCH-05 — Preserve Product Identity

Do **NOT** consolidate:

**BlessBoard domain:**

- sermons
- ministries
- giving
- leadership semantics
- pastoral workflows
- church events
- church network/HQ/branch semantics

**ActiveClinic domain:**

- patients
- encounters
- prescriptions
- clinical documents
- laboratory
- radiology
- pharmacy
- clinical workflows
- healthcare billing semantics
- clinical rooms/workflows
- visit-summary/PHI semantics

Shared lower-level infrastructure underneath those modules is allowed.

---

## Decision rule for future Cursor prompts

> Before creating product-local infrastructure, search `src/platform`, `views/platform`, `public/platform`, and the other product for an equivalent capability. If the capability is a generic mechanism, extend platform and use a product adapter. Create product-local code when the requirement represents product domain semantics, product-specific composition, permissions/catalogues, or genuinely product-specific UX.

---

## V2.03 parallel development rule

Current V2.03 Batch 1 / Batch 2 / Batch 3 implementation **MAY continue**.

Do **NOT** begin the large platform-consolidation refactor while Batches 1/2/3 are still modifying the same V10 implementation surface.

However, effective immediately:

> Do not introduce new generic cross-product infrastructure under ActiveClinic or BlessBoard simply because that product needs it first.

Clinical/domain functionality remains AC-owned.

Church/domain functionality remains BB-owned.

Generic mechanisms should be evaluated for platform ownership.

---

## Implementation gates

Before any backlog item changes production code, require:

```text
V2_03_BATCH_IMPLEMENTATION_RECONCILED
V10_CLEAN_CHECKPOINT_CREATED
PLATFORM_CONSOLIDATION_CHARACTERIZATION_PASS
```

For higher-risk publishing/CMS work (`PLATFORM-CONSOLIDATION-10`, `PLATFORM-CONSOLIDATION-11`) additionally require:

```text
TENANT_ISOLATION_TESTS_PASS
RBAC_PERMISSION_MATRIX_PASS
WEBSITE_PUBLISH_PARITY_PASS
BB_MULTI_SITE_GOVERNANCE_BASELINE_PASS
AC_WEBSITE_WORKFLOW_BASELINE_PASS
```

---

## Recommended execution order

```text
V2.03 FEATURE IMPLEMENTATION
            ↓
BATCH RECONCILIATION
            ↓
CLEAN V10 CHECKPOINT
            ↓
PLATFORM-CONSOLIDATION-00
Characterization / contract tests
            ↓
PLATFORM-CONSOLIDATION-01
Dependency inversion
            ↓
PLATFORM-CONSOLIDATION-02..06
Low-risk infrastructure
            ↓
PLATFORM-CONSOLIDATION-07
Website HTTP
            ↓
PLATFORM-CONSOLIDATION-08..09
Media + UI primitives
            ↓
PLATFORM-CONSOLIDATION-10
Publishing
            ↓
PLATFORM-CONSOLIDATION-11
CMS convergence
            ↓
Remove obsolete duplicate paths
```

Repository hygiene (`PLATFORM-CONSOLIDATION-12`) may be scheduled separately and must not obscure architectural diffs.

---

## Workstream index

| ID | Title | Priority | Status | Risk |
|----|-------|----------|--------|------|
| PLATFORM-CONSOLIDATION-00 | Characterization safety net | P0 | **PASS** | — |
| PLATFORM-CONSOLIDATION-01 | Platform dependency inversion | P0 | **PASS** (partial E remain) | Medium |
| PLATFORM-CONSOLIDATION-02 | Registration draft consolidation | P1 | **PASS** | Low |
| PLATFORM-CONSOLIDATION-03 | Verification wrapper consolidation | P1 | **PASS** | Low |
| PLATFORM-CONSOLIDATION-04 | Phone infrastructure ownership | P1 | **PASS** | Low–Med |
| PLATFORM-CONSOLIDATION-05 | Email transport ownership | P1 | **PASS** | Low–Med |
| PLATFORM-CONSOLIDATION-06 | Platform schema ownership cleanup | P1/P2 | **PASS** | Med (process) |
| PLATFORM-CONSOLIDATION-07 | Shared website editor HTTP layer | P2 | **PASS** | Medium |
| PLATFORM-CONSOLIDATION-08 | Media infrastructure consolidation | P2 | **PASS** | Medium |
| PLATFORM-CONSOLIDATION-09 | Shared operations UI primitives | P2 | **PASS** | Low–Med |
| PLATFORM-CONSOLIDATION-10 | Website publishing convergence | P3 | **PASS** (`PLATFORM_PUBLICATION_CONVERGENCE_PASS`) | **HIGH** |
| PLATFORM-CONSOLIDATION-11 | Classic CMS convergence | P3 | **PASS** (`PLATFORM_CMS_CONVERGENCE_PASS`) | **HIGH** |
| PLATFORM-CONSOLIDATION-12 | Repository hygiene (`* 2.*` junk) | P2 | **PASS** (`REPOSITORY_DUPLICATE_FILE_HYGIENE_PASS`) | Low (isolated) |
| — | PC13 final technical verification | — | **PASS** (`V10_PLATFORM_CONSOLIDATION_REGRESSION_PASS`) | — |
| — | PC14 final reconciliation | — | **COMPLETE_WITH_GAPS** (this cycle) | — |
| — | PC15 architecture guardrails | — | **PASS** (`V10_PLATFORM_ARCHITECTURE_GUARDRAILS_PASS`) | — |
| — | PC16 closure audit | — | **COMPLETE** (read-only) | — |
| — | PC17 freeze/package checkpoint | — | **READY** (`V10_CLEAN_CHECKPOINT_CREATED: YES`) | — |
| — | PC18 organization key lift | — | **PASS** (`PLATFORM_ORGANIZATION_KEY_LIFT_PASS`) | — |
| — | PC19 cross-product dependency zero | — | **PASS** (`CROSS_PRODUCT_DEPENDENCY_ZERO_PASS`) | — |
| — | PC20 Finder fork triage | — | **COMPLETE** (`FINDER_FORK_TRIAGE_COMPLETE`) | — |
| — | PC21 safe Finder cleanup | — | **PASS** (`FINDER_RESIDUAL_SAFE_CLEANUP_PASS`) | — |
| — | PC22 residual P2 architecture audit | — | **COMPLETE** (`V10_RESIDUAL_P2_ARCHITECTURE_AUDIT_COMPLETE`) | — |
| — | PC23 V2.03 post-consolidation QA readiness | — | **READY_WITH_P2_GAPS** (`V2_03_POST_CONSOLIDATION_QA_READY_WITH_P2_GAPS`) | — |
| — | PC24 final clean checkpoint | — | **COMPLETE** (`V10_FINAL_CLEAN_CHECKPOINT` · `QA_HANDOFF_READY: YES`) | — |
| — | PC25 residual backlog handoff | — | **COMPLETE** (`COMPLETE_WITH_P2_P3_DEBT`) | — |

---

## Residual debt after epic close (PC25)

**Authority:** [`docs/qa/V10_PC25_RESIDUAL_BACKLOG_HANDOFF.md`](../qa/V10_PC25_RESIDUAL_BACKLOG_HANDOFF.md) · evidence [`docs/qa/V10_PC22_RESIDUAL_P2_ARCHITECTURE_AUDIT.md`](../qa/V10_PC22_RESIDUAL_P2_ARCHITECTURE_AUDIT.md).

### Completed (do not re-open as unfinished consolidation)

Registration consolidation · verification consolidation · phone ownership · email transport · media SoT · website editor shared kit · publication orchestrator/adapters · CMS shared helpers · architecture guardrails · cross-product dependency removal · Finder cleanup to proven-safe limit (`* 2.*` files = 0).

### P2 open (optional / evidence-gated)

| ID | Item |
|----|------|
| R-P2-01 | Class-E composition-root shrink **only** after genuine mechanism lift (no bulk count program) |
| R-P2-02 | Editor route thinning for **truly generic** handlers only |
| R-P2-03 | Classic CMS route/service retirement after parity proof |
| R-P2-04 | Publish/CMS compatibility shim retirement after consumer proof |
| R-P2-05 | Minor test-contract pins (PC23 PRE_EXISTING / TEST_DEBT) |

### P3 open (on-touch / shim)

| ID | Item |
|----|------|
| R-P3-01 | gp-ops hybrid adoption on-touch |
| R-P3-02 | Phone legacy `/activeclinic/ac-phone-field.*` URL retirement |
| R-P3-03 | Thin org-key / deploymentEnv re-export retirement after import-graph proof |
| R-P3-04 | Finder stitch design-reference dirs (`* 2` / `* 3`) — not runtime debt |
| R-P3-05 | Engine projection `23514` soft-savepoint residual (on-touch) |

**Finder UNIQUE_REQUIRED / MIGRATION_SENSITIVE / UNKNOWN runtime forks:** **0** (PC20–PC21).

### Not consolidation debt

BB navigation/theme/domain · AC navigation/theme/clinical domain · product RBAC catalogues · tenant topology semantics · product URLs/shell composition.

```text
P0_OPEN: 0
P1_OPEN: 0
P2_OPEN: 5
P3_OPEN: 5
NEXT_MAJOR_CONSOLIDATION_EPIC_REQUIRED: NO
Recommended next activity: V2.03 QA
```

---

## PLATFORM-CONSOLIDATION-00 — Characterization Safety Net

| Field | Value |
|-------|--------|
| **Priority** | P0 |
| **Status** | **PASS** |
| **Evidence** | `docs/qa/V10_PC02_PLATFORM_CONSOLIDATION_CHARACTERIZATION.md` |

Before consolidating production code, establish characterization/contract tests around existing behavior.

Cover:

- website editor routes
- publishing
- versions
- restore
- registration
- authentication/session behavior
- phone normalization
- verification
- media
- tenant isolation
- RBAC authorization
- product adapter behavior

Required outcome:

```text
PLATFORM_CONSOLIDATION_CHARACTERIZATION_PASS
```

**Status (2026-09-27):** **PASS** — see [`docs/qa/V10_PC02_PLATFORM_CONSOLIDATION_CHARACTERIZATION.md`](../qa/V10_PC02_PLATFORM_CONSOLIDATION_CHARACTERIZATION.md). Suite: `tests/v10-pc02-platform-consolidation-characterization.test.js` (22/22) plus shared BB/AC baselines (126/126 combined).

Purpose: allow infrastructure to be moved without accidentally changing BB or AC behavior.

---

## PLATFORM-CONSOLIDATION-01 — Platform Dependency Inversion

| Field | Value |
|-------|--------|
| **Priority** | P0 |
| **Status** | **PASS** — `PLATFORM_PRODUCT_DEPENDENCY_DIRECTION_PASS` |
| **Implementation** | DONE for A–C seams; **33** class-E allowlisted exceptions remain |
| **Evidence** | [`docs/qa/V10_PC03_PLATFORM_PRODUCT_DEPENDENCY_DIRECTION.md`](../qa/V10_PC03_PLATFORM_PRODUCT_DEPENDENCY_DIRECTION.md) |

Audit and remove platform hard dependencies on product implementation modules.

| Marker | Unique platform→product require files |
|--------|----------------------------------------|
| PC01 baseline | **40** |
| After PC03 | **33** |

Target: `src/platform` must not directly import implementation code from:

```text
src/blessboard
src/church
src/activeclinic
```

Replace appropriate dependencies with:

- adapter registration
- contracts
- product configuration
- callbacks/hooks
- bootstrap dependency injection

**Delivered:** `productRuntimeRegistry` + BB/AC bootstrap registrars + architecture guard test. Remaining exceptions are composition roots / legacy bridges / admin surfaces (documented allowlist). Further shrinks are follow-on extraction, not blockers for this outcome.

Required outcome:

```text
PLATFORM_PRODUCT_DEPENDENCY_DIRECTION_PASS
```

---

## PLATFORM-CONSOLIDATION-02 — Registration Draft Consolidation

| Field | Value |
|-------|--------|
| **Priority** | P1 |
| **Status** | **PASS** — `SHARED_REGISTRATION_DRAFT_PASS` |
| **Evidence** | [`docs/qa/V10_PC04_SHARED_REGISTRATION_VERIFICATION.md`](../qa/V10_PC04_SHARED_REGISTRATION_VERIFICATION.md) |

Current ownership:

```text
platform: src/platform/registration/signedRegistrationDraftCookie.js
BB thin:  src/blessboard/services/churchRegistrationDraft.js   (bb_reg_draft)
AC thin:  src/activeclinic/services/clinicRegistrationDraft.js (ac_reg_draft)
```

Goal met: one parameterized platform registration-draft mechanism; product adapters are cookie-name config only.

Required outcome:

```text
SHARED_REGISTRATION_DRAFT_PASS
```

---

## PLATFORM-CONSOLIDATION-03 — Verification Wrapper Consolidation

| Field | Value |
|-------|--------|
| **Priority** | P1 |
| **Status** | **PASS** — `SHARED_VERIFICATION_INFRA_PASS` |
| **Evidence** | [`docs/qa/V10_PC04_SHARED_REGISTRATION_VERIFICATION.md`](../qa/V10_PC04_SHARED_REGISTRATION_VERIFICATION.md) |

Current ownership:

```text
platform: src/platform/verification/createProductVerificationAdapter.js
          (+ sharedVerificationService.js engine)
BB thin:  src/blessboard/services/blessBoardSharedVerification.js
AC thin:  src/activeclinic/services/activeClinicSharedVerification.js
```

Adapters retain only `productKey` + `subjectKind` (+ branded export names).

Required outcome:

```text
SHARED_VERIFICATION_INFRA_PASS
```

---

## PLATFORM-CONSOLIDATION-04 — Phone Infrastructure Ownership

| Field | Value |
|-------|--------|
| **Priority** | P1 |
| **Status** | **PASS** — `PLATFORM_PHONE_INFRA_PASS` |
| **Evidence** | [`docs/qa/V10_PC05_PLATFORM_PHONE_EMAIL_OWNERSHIP.md`](../qa/V10_PC05_PLATFORM_PHONE_EMAIL_OWNERSHIP.md) |

Ownership:

```text
platform phone component (views/platform/partials/phone-field.ejs
                          + public/platform/phone-field.{js,css})
       ↓
   ┌───┴───┐
   BB      AC  (thin includes + legacy /activeclinic/ac-phone-field.* shims)
```

Required outcome:

```text
PLATFORM_PHONE_INFRA_PASS
```

---

## PLATFORM-CONSOLIDATION-05 — Email Transport Ownership

| Field | Value |
|-------|--------|
| **Priority** | P1 |
| **Status** | **PASS** — `PLATFORM_EMAIL_TRANSPORT_PASS` |
| **Evidence** | [`docs/qa/V10_PC05_PLATFORM_PHONE_EMAIL_OWNERSHIP.md`](../qa/V10_PC05_PLATFORM_PHONE_EMAIL_OWNERSHIP.md) |

Ownership:

```text
src/platform/email/outboundEmailTransport.js
src/platform/email/resendEmailAdapter.js
       ↓
AC product layer (templates, branding, sendActiveClinicEmail)
```

Platform no longer requires `activeClinicEmailDelivery` implementation modules.

Required outcome:

```text
PLATFORM_EMAIL_TRANSPORT_PASS
```

---

## PLATFORM-CONSOLIDATION-06 — Platform Schema Ownership Cleanup

| Field | Value |
|-------|--------|
| **Priority** | P1/P2 |
| **Status** | **PASS** — `PLATFORM_SCHEMA_OWNERSHIP_PASS` |
| **Plan** | [`docs/database/PLATFORM_SCHEMA_OWNERSHIP.md`](../database/PLATFORM_SCHEMA_OWNERSHIP.md) (`PLATFORM_SCHEMA_OWNERSHIP_PLAN`) |
| **Evidence** | [`docs/qa/V10_PC06_PLATFORM_SCHEMA_OWNERSHIP.md`](../qa/V10_PC06_PLATFORM_SCHEMA_OWNERSHIP.md) |
| **Implementation** | Documentation + ownership guard only — **no** applied-migration moves |

Historical exceptions (frozen):

```text
db/migrations/activeclinic/035_platform_contact_inquiries.sql
db/migrations/blessboard/*activeclinic* (077–092, 115, 118) + 093/095 website grants
```

Forward rules:

- New platform-neutral schema → platform migrations
- New BB schema → BB migrations
- New AC schema (including AC RBAC catalogue grants) → AC migrations

Required plan deliverable:

```text
PLATFORM_SCHEMA_OWNERSHIP_PLAN
```

Outcome:

```text
PLATFORM_SCHEMA_OWNERSHIP_PASS
```

---

## PLATFORM-CONSOLIDATION-07 — Shared Website Editor HTTP Layer

| Field | Value |
|-------|--------|
| **Priority** | P2 |
| **Status** | **PASS** |
| **Evidence** | `docs/qa/V10_PC07_SHARED_WEBSITE_EDITOR_HTTP.md` |

Major duplication hotspot:

```text
src/blessboard/http/blessboardWebsiteEditorRoutes.js
src/activeclinic/http/activeClinicWebsiteRoutes.js
```

Audit indicates roughly **~3.4k LOC** of structurally parallel route infrastructure (`AUDIT_BASELINE_2026_09_26`).

Goal: extract common editor HTTP mechanisms into shared platform handlers.

Preserve:

- product URLs
- BB HQ/branch behavior
- AC clinic behavior
- product chrome
- product catalogues
- product permissions
- product-specific workflows

Preferred architecture:

```text
Product Route
     ↓
Platform Handler
     ↓
Product Adapter
```

Required outcome:

```text
SHARED_WEBSITE_EDITOR_HTTP_PASS
```

**Achieved** — see evidence doc (route LOC before/after, shared kit, adapter responsibilities, retained divergences).

---

## PLATFORM-CONSOLIDATION-08 — Media Infrastructure Consolidation

| Field | Value |
|-------|--------|
| **Priority** | P2 |
| **Status** | **PASS** |
| **Evidence** | `docs/qa/V10_PC08_PLATFORM_MEDIA_CONSOLIDATION.md` |
| **Ownership** | `docs/platform/PLATFORM_MEDIA_OWNERSHIP.md` |

Consolidate around existing:

```text
src/platform/media/
src/platform/website/mediaService.js
```

Review remaining:

- BB legacy media paths (`src/blessboard/media/*`) — **retained** as operational church media compatibility
- AC CMS media routes — use platform `mediaService`
- media pickers / upload / replacement / hydration / CDN — platform-owned for website engine

Storage and persistence for **website** media are platform-owned.

Product catalogues and presentation may remain product-specific.

Required outcome:

```text
PLATFORM_MEDIA_CONSOLIDATION_PASS
```

**Achieved** — no bulk migration; Hostinger/CDN preserved; architecture guard enforces ownership.

Related topic backlog (do not merge scopes): [`docs/backlog/V2_MEDIA_BACKLOG.md`](../backlog/V2_MEDIA_BACKLOG.md).

---

## PLATFORM-CONSOLIDATION-09 — Shared Operations UI Primitives

| Field | Value |
|-------|--------|
| **Priority** | P2 |
| **Status** | **PASS** |
| **Evidence** | `docs/qa/V10_PC09_PLATFORM_OPS_UI_PRIMITIVES.md` |
| **Ownership** | `docs/platform/PLATFORM_OPS_UI_OWNERSHIP.md` |

Continue migration toward `gp-ops-*` for generic:

- tables
- filters
- pagination
- badges
- status history
- list controls
- common modal behavior

Do **NOT** unify BB and AC branding.

Keep:

- BB theme
- AC theme
- product-specific navigation
- Stitch-specific screen composition

Migration should be **on-touch** rather than a wholesale visual rewrite.

Required outcome:

```text
PLATFORM_OPS_UI_PRIMITIVES_PASS
```

**Achieved** — fetch helper + on-touch rooms/low-stock adoption; themes remain separate; no Stitch redesign.

See also: [`docs/v2.03/PLATFORM_SHARED_FOUNDATION.md`](./PLATFORM_SHARED_FOUNDATION.md).

---

## PLATFORM-CONSOLIDATION-10 — Website Publishing Convergence

| Field | Value |
|-------|--------|
| **Priority** | P3 |
| **Status** | **PASS** (`PLATFORM_PUBLICATION_CONVERGENCE_PASS`) |
| **Risk** | **HIGH** |
| **Evidence** | `docs/qa/V10_PC10_PLATFORM_PUBLICATION_CONVERGENCE.md` (supersedes blocked doc) |

Audit found divergent publishing paths:

```text
src/blessboard/services/churchWebsitePublishService.js
```

versus:

```text
src/platform/website/publicationService.js
```

and AC submit/unpublish mechanisms.

Goal: move generic publication/version mechanics into platform; keep product governance in adapters.

```text
platform publication engine
          │
     ┌────┴────┐
     │         │
 BB governance AC governance
     │         │
HQ/branch      clinic workflow
```

Must **NOT** begin before:

- characterization tests
- permission matrices
- tenant-isolation tests
- publish parity tests

(and the high-risk gates listed above).

**2026-09-27:** Gate stop — named baselines absent / BB publish suites failing. No convergence code. See blocked evidence.

**2026-09-27 (later):** PC10A–D unblocked; resume delivered platform `publicationOrchestrator` + BB/AC governance adapters. Evidence: `docs/qa/V10_PC10_PLATFORM_PUBLICATION_CONVERGENCE.md`.

Required outcome:

```text
PLATFORM_PUBLICATION_CONVERGENCE_PASS
```

Achieved.

---

## PLATFORM-CONSOLIDATION-11 — Classic CMS Convergence

| Field | Value |
|-------|--------|
| **Priority** | P3 |
| **Status** | **PASS** (`PLATFORM_CMS_CONVERGENCE_PASS`) |
| **Risk** | **HIGH** |
| **Evidence** | `docs/qa/V10_PC11_CMS_CONVERGENCE.md` |

Review overlap between:

```text
BlessBoard contentAdminRoutes / structured drafts
```

and:

```text
ActiveClinic activeClinicWebsiteCmsRoutes / clinicWebsiteCms*
```

Do **NOT** attempt to create one giant product-neutral content catalogue.

Share mechanisms:

- draft persistence
- media
- versions
- publish
- restore
- editor primitives
- validation

Keep:

- BB section catalogue
- AC section catalogue
- product content semantics
- product templates

**2026-09-27:** Gate stop — PC10 is `PLATFORM_PUBLICATION_CONVERGENCE_BLOCKED`. No CMS convergence code.

**2026-09-27 (later):** PC10 PASS unlocked PC11. Evidence: `docs/qa/V10_PC11_CMS_CONVERGENCE.md` → `PLATFORM_CMS_CONVERGENCE_PASS`.

Required outcome (when unblocked):

```text
PLATFORM_CMS_CONVERGENCE_PASS
```

Achieved.

Related: `AC-WEBSITE-01` in [`docs/BACKLOG.md`](../BACKLOG.md) (legacy projection debt — complementary, not a substitute).

---

## PLATFORM-CONSOLIDATION-12 — Repository Hygiene

| Field | Value |
|-------|--------|
| **Priority** | P2 |
| **Status** | **PASS** (`REPOSITORY_DUPLICATE_FILE_HYGIENE_PASS`) |
| **Evidence** | `docs/qa/V10_PC12_REPOSITORY_DUPLICATE_FILE_HYGIENE.md` |

Audit identified approximately **543** Finder `* 2.*` duplicate/noise files (`AUDIT_BASELINE_2026_09_26` — recalculate).

**2026-09-27:** Gate stop under user prerequisite PC11 PASS (PC11 blocked). No inventory/deletes. Backlog still allows **separate** scheduling if owner explicitly waives PC11.

**2026-09-27 (later):** PC11 PASS unlocked PC12. Evidence: `docs/qa/V10_PC12_REPOSITORY_DUPLICATE_FILE_HYGIENE.md` → `REPOSITORY_DUPLICATE_FILE_HYGIENE_PASS` (641 identical junk removed; 127 content-differing retained).

Handle repository hygiene **separately** from architecture refactoring.

Do **NOT** combine hundreds of file deletions with platform extraction commits.

First:

- inventory
- prove they are junk/duplicates
- verify none are referenced
- establish clean baseline

Then perform cleanup in an isolated change.

Required outcome:

```text
REPOSITORY_DUPLICATE_FILE_HYGIENE_PASS
```

Achieved (identical junk removed; content-differing forks retained as accidental debt).

---

## Definition of success

### Dependency architecture

```text
Platform → Product implementation dependencies = 0
```

except explicitly documented bootstrap/contract registration mechanisms that do not make platform depend on product implementation.

### Shared mechanisms

Common technical capabilities have one authoritative implementation where practical.

### Product independence

BB and AC retain independent:

- domain models
- workflows
- permissions/catalogues
- terminology
- navigation
- public URL semantics
- visual identity
- product-specific composition

### Regression safety

Existing BB and AC behavior remains covered by product integration/E2E tests.

---

## Cross-references

| Document | Role |
|----------|------|
| [`docs/BACKLOG.md`](../BACKLOG.md) | Canonical platform backlog index |
| [`docs/v2.03/PLATFORM_SHARED_FOUNDATION.md`](./PLATFORM_SHARED_FOUNDATION.md) | Shared jobs/history/list/timeline/gp-ops foundation |
| [`docs/v2.03/PLATFORM_REUSE_AUDIT.md`](./PLATFORM_REUSE_AUDIT.md) | Batch 1 reuse classification (A/B/C) |
| [`docs/backlog/V2_MEDIA_BACKLOG.md`](../backlog/V2_MEDIA_BACKLOG.md) | Product media capability backlog (separate scope) |
| [`docs/backlog/V2_BB_WEBSITE_EDITOR_BUGS.md`](../backlog/V2_BB_WEBSITE_EDITOR_BUGS.md) | BB editor bug backlog (separate scope) |

Do not duplicate those documents here — this backlog holds actionable consolidation work items and links to evidence.

---

## Status markers

```text
V10_PLATFORM_CONSOLIDATION_BACKLOG_RECORDED
V10_PLATFORM_CONSOLIDATION_EPIC: COMPLETE_WITH_P2_P3_DEBT
IMPLEMENTATION_STARTED: YES
APPLICATION_CODE_CHANGED: YES (PC03–PC21; PC22–PC25 documentation / packaging)
P0_OPEN: 0
P1_OPEN: 0
P2_OPEN: 5
P3_OPEN: 5
NEXT_MAJOR_CONSOLIDATION_EPIC_REQUIRED: NO
Recommended next activity: V2.03 QA
PC25_HANDOFF: docs/qa/V10_PC25_RESIDUAL_BACKLOG_HANDOFF.md
```
