# GetPro Platform Backlog

Canonical product backlog for cross-product deferred work. ActiveClinic visual backlog remains in `docs/activeclinic/stitch/ACTIVECLINIC_V7_VISUAL_BACKLOG.md`.

## Location governance

### AC-LOCATION-01 — Approve user-added cities/towns

Future Platform Admin capability:

- list user-created locations
- filter by country
- inspect normalized/canonical names
- approve
- merge duplicates
- rename/correct
- reject/archive
- preserve clinics already using the location
- audit who created/approved it

POST-V1. Must not block registration.

### AC-LOCATION-02 — Southern Africa administrative subdivisions

Add first-class province/state/region dropdown data for supported Southern African countries.

At minimum investigate:

- Angola
- Botswana
- Eswatini
- Lesotho
- Malawi
- Mozambique
- Namibia
- South Africa
- Zambia
- Zimbabwe

Store:

- country
- subdivision code if available
- canonical name
- display name
- subdivision type
- active status

Registration should choose dropdown data where supported and free text otherwise.

POST-V1 unless shared subdivision infrastructure is already nearly available.

## Website engine

### AC-WEBSITE-01 — Consolidate legacy website content projections

Track remaining shared-engine / legacy CMS projection debt across ActiveClinic and BlessBoard where tenant website content still flows through parallel paths (legacy inline fields, structured drafts, platform.website_content). Goal: one authoritative projection per surface without breaking tenant publish flows.

POST-V1. Do not block Platform 02 deployment.

Complementary (do not start during active V2.03 batch implementation): full BB/AC platform consolidation epic — see **Platform consolidation** below and `docs/v2.03/V2_03_PLATFORM_CONSOLIDATION_BACKLOG.md`.

## ActiveClinic V2.03 post-MVP gaps (NOT V2.03 QA blockers)

Frozen QA candidate: `b8c18c3ded9892aa318ae6e029600aa34ff4941b`. See `docs/qa/V2_03_QA_RELEASE_HANDOFF.md` and `docs/v2.03/ACTIVECLINIC_BATCH3_OPEN_DECISIONS.md`.

### AC-V203-ACN18 — Clinical document private binaries

- Private clinical object storage (not website/CMS/CDN media)
- Attachment upload/download with audit
- E-sign, DICOM/HL7, advanced versioning

Gap marker today: `BINARY_ATTACHMENT_DEFERRED_PRIVATE_STORAGE_REQUIRED`.

### AC-V203-ACP05 — Visit summary PDF & release evolution

- Patient-safe PDF / private storage
- Re-release / versioning
- Stronger booking↔encounter linkage
- Automatic patient instructions from chart
- Patient-view audit stream
- ACN18 → patient release bridge

Gap marker today: `VISIT_SUMMARY_PDF_DEFERRED_PRIVATE_STORAGE_REQUIRED`.

### AC-V203-ACN27 — Rooms operational depth

- Occupancy / current-use engine
- IoT
- Equipment inventory
- Room scheduling
- Bed management

### AC-V203-PHI-STORE — Private PHI object storage (architecture)

Future **platform / ActiveClinic** private PHI storage workstream for clinical documents, visit-summary PDFs, and related binaries.

- Must be private, tenant-scoped, audited
- **Must not** reuse website media, CMS media, public CDN, or BlessBoard media paths for clinical PHI
- Coordinates ACN18 binary gap + AC-P05 PDF gap without mixing product CMS engines

POST-V2.03. Documentation/backlog only during V2.03 QA freeze.

## Platform consolidation

### EPIC — V10 BB/AC Platform Consolidation

**Status:** **`COMPLETE_WITH_P2_P3_DEBT`** (PC25 · 2026-09-27). **Next activity: V2.03 QA** after pre-live PL chain. No further major consolidation epic required.

- **Authoritative detail:** [`docs/v2.03/V2_03_PLATFORM_CONSOLIDATION_BACKLOG.md`](./v2.03/V2_03_PLATFORM_CONSOLIDATION_BACKLOG.md)
- **Handoff:** [`docs/qa/V10_PC25_RESIDUAL_BACKLOG_HANDOFF.md`](./qa/V10_PC25_RESIDUAL_BACKLOG_HANDOFF.md)
- **Checkpoint:** [`docs/qa/V10_PC24_FINAL_CLEAN_CHECKPOINT.md`](./qa/V10_PC24_FINAL_CLEAN_CHECKPOINT.md) (`QA_HANDOFF_READY: YES`)
- **Pre-live PL09:** [`docs/qa/V10_PL09_FRESH_DB_BOOTSTRAP.md`](./qa/V10_PL09_FRESH_DB_BOOTSTRAP.md) — `V10_FRESH_DB_BOOTSTRAP_PASS` · **`QA_RESET_AUTHORIZED: YES`**
- **Pre-live PL10:** [`docs/qa/V10_PL10_QA_CANONICAL_RESET.md`](./qa/V10_PL10_QA_CANONICAL_RESET.md) — **`V10_QA_CANONICAL_RESET_PASS`** (testing/QA only; production untouched)
- **Pre-live PL11:** [`docs/qa/V10_PL11_FRESH_QA_V203_REGRESSION.md`](./qa/V10_PL11_FRESH_QA_V203_REGRESSION.md) — **`V10_FRESH_QA_V203_PASS_WITH_P2_GAPS`** (P0/P1 **0**)
- **Pre-live PL12:** [`docs/qa/V10_PL12_PRODUCTION_RESET_GATE.md`](./qa/V10_PL12_PRODUCTION_RESET_GATE.md) — **`V10_PRODUCTION_RESET_BLOCKED`** (read-only; no prod reset)
- **Pre-live PL14:** [`docs/qa/V10_PL14_CANONICAL_PLATFORM_CLOSURE.md`](./qa/V10_PL14_CANONICAL_PLATFORM_CLOSURE.md) — **`CANONICAL_READY_WITH_RESIDUAL_DEBT`** · next: **V2.03 QA / RELEASE HANDOFF**
- **Principle:** Platform owns mechanisms; products own domain semantics (`product → platform`)
- **Completed:** registration · verification · phone · email · media SoT · editor shared kit · publication orchestrator · CMS helpers · architecture guardrails · cross-product zero · Finder proven-safe cleanup
- **Open:** P0 **0** · P1 **0** · P2 **5** · P3 **5** (optional/on-touch only — Class-E on-touch lifts, editor/CMS/publish shim retirement, gp-ops/phone shims, stitch Finder dirs, test-contract pins)
- **Not consolidation debt:** BB/AC navigation/theme/domain, product RBAC catalogues, tenant topology, product URLs/shells
- **Guardrail (permanent):** do not place new generic cross-product infrastructure under `src/activeclinic/` or `src/blessboard/` merely because that product needs it first; new `src/platform` → product requires must go through contracts/registration or the documented Class-E allowlist

Related evidence (not duplicated here):

- [`docs/v2.03/PLATFORM_SHARED_FOUNDATION.md`](./v2.03/PLATFORM_SHARED_FOUNDATION.md)
- [`docs/v2.03/PLATFORM_REUSE_AUDIT.md`](./v2.03/PLATFORM_REUSE_AUDIT.md)
