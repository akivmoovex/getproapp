# V2.03 — Platform Reuse Audit (ActiveClinic Batch 1)

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_PLATFORM_REUSE_PASS` |
| **Date** | 2026-09-26 |
| **Branch** | `V10` |
| **Scope** | Deduplicate technical infrastructure introduced/consumed by ActiveClinic Batch 1 vs BlessBoard / platform |
| **Constraint** | No new features; no clinical/pastoral domain generalization; no behavior regressions |
| **Verdict** | **`V2_03_PLATFORM_REUSE_PASS`** |

---

## 1. Purpose

Audit Batch 1 ActiveClinic code against existing BlessBoard and platform primitives. Classify duplication, move **A** items into platform, share **B** items via adapters/config where safe, leave **C** product-specific.

---

## 2. Classification matrix

| Area | Finding | Class | Action |
|------|---------|-------|--------|
| RBAC | AC uses `activeClinicAuthorizationService` + platform product gates; BB uses church RBAC | **B** | Keep product permission keys; shared platform RBAC helpers already reused |
| Tenant scope | `rejectForgedTenantIdentifiers` used on AC jobs/ops | **A** (done earlier) | Already platform; no Batch1 reimplementation |
| Branch / facility scope | AC facility vs BB branch are different domain scopes | **C** | Keep product asserts |
| Audit | Both call `recordAuditEventSafe` | **A** (done earlier) | Catalogue keys product-owned |
| Status history | Platform `statusHistory` existed; AC transitions were inline | **B** | AC appointments + reception now use `assertStatusTransition` |
| Notifications | Platform channel registry; AC Batch1 does not duplicate | **B** | No change |
| Consent / preferences | Platform prefs vs AC clinical consent ledger | **C** | Clinical consent stays AC |
| Search / filter / pagination | Platform `listQuery`; church re-exports | **A** | Added `clampLimit`; AC already uses `parseListQuery` on ops/patient screens |
| Media | Shared media stack; no Batch1 duplicate store | **B** | No change |
| Forms / validation | Platform validation + product schemas | **B** | No change |
| Modals / tables / cards | `gp-ops-*` partials + CSS; AC shell consumes | **B** | Already shared UI shells |
| Imports / exports | Duplicate CSV parse/escape in church vs platform jobs | **A** | Church CSV primitives → platform `dataJobFileValidation` |
| Activity timelines | Platform timeline composer; AC appointment detail uses `gp-ops-timeline` | **B** | No change |
| Task / worklist | Clinical follow-up / queue worklists | **C** | Domain-specific |
| Money (minor units) | AC `formatMoney` + ops catalogue helper | **A** | Lifted to `src/platform/money/formatMoney.js`; AC re-exports |
| Money (BB reports) | Church major-unit `formatMoney` in report helpers | **C** | Different unit model — not unified |
| Data-job adapters | AC had adapters; BB lacked platform adapter wiring | **B** | Added `bb.member_import` adapter (preview/template; commit stays church review) |

---

## 3. Refactors applied

### A — moved to platform

| Item | Before | After |
|------|--------|-------|
| CSV parse / normalize / escape / rowsToCsv | Duplicated in `src/church/memberImportCsv.js` | Platform `dataJobFileValidation` owns primitives; church re-exports + keeps aliases/classification |
| Minor-unit money format/parse | `src/activeclinic/services/formatMoney.js` + local ops `formatMoneyMinor` | `src/platform/money/formatMoney.js`; AC path re-exports; ops uses shared `formatMoneyMinor` |
| Limit clamp helper | Inline in `parseListQuery` only | Exported `clampLimit` on `listQuery` (used by `parseListQuery`) |

### B — shared via adapter / config (safe)

| Item | Change |
|------|--------|
| AC appointment transitions | `assertStatusTransition(..., ALLOWED_TRANSITIONS)` |
| AC reception queue transitions | Same platform helper with queue map |
| BB data-job adapter | `src/blessboard/services/blessboardDataJobAdapters.js` registered from `v5FoundationServer` — preview + CSV template; commit remains church review workflow |

### C — left product-specific (justified)

- Appointment / queue / clinical follow-up status vocabularies and tables
- AC clinical consent ledger and pastoral membership semantics
- AC billing invoices, cashier, statutory receipt rules
- BB member import commit/review/reverse (identity matching, admin flags)
- Church report `formatMoney` (major units, not minor)
- High billing list limits (200–500) beyond ops page-size clamps
- Facility vs branch domain models

---

## 4. Files consolidated / created

### Shared modules created

- `src/platform/money/formatMoney.js`
- `src/blessboard/services/blessboardDataJobAdapters.js`
- `docs/v2.03/PLATFORM_REUSE_AUDIT.md` (this file)

### Files updated (consolidation)

- `src/platform/jobs/dataJobFileValidation.js` — `stripFormulaInjection`, `escapeCsvCell`, `rowsToCsv`; trailing-row trim parity
- `src/church/memberImportCsv.js` — thin BB mapping layer over platform CSV
- `src/activeclinic/services/formatMoney.js` — re-export platform
- `src/activeclinic/services/activeClinicOpsCatalogueService.js` — shared `formatMoneyMinor`
- `src/activeclinic/services/activeClinicAppointmentService.js` — platform transition assert
- `src/activeclinic/services/activeClinicReceptionService.js` — platform transition assert
- `src/platform/http/listQuery.js` — `clampLimit`
- `src/platform/http/v5FoundationServer.js` — register BB data-job adapters

### AC adapters (existing + unchanged contract)

- `ac.setup_catalogue` (import)
- AC export entity keys registered in `activeClinicDataJobAdapters.js`

### BB adapters (new)

- `bb.member_import` — import preview + export template; commit deferred to church routes

---

## 5. Duplication removed

- Full RFC4180 CSV parser + formula-safe escape duplicated between church member import and platform data jobs
- Duplicate minor-unit money formatting between AC billing helper and ops catalogue
- Inline status-transition membership checks in AC appointment/reception (now shared assert helper)

---

## 6. Remaining justified duplication

| Item | Why kept |
|------|----------|
| Product RBAC permission keys / authorize wrappers | Different roles and surfaces |
| Facility vs branch scope helpers | Different org graphs |
| Clinical vs pastoral consent | Domain semantics |
| Church member import commit service | Review workflow + identity matching not a generic job commit |
| Church major-unit money formatters in reports | Different money model |
| Billing/pharmacy custom limit clamps | Operational batch sizes ≠ UI page size |

---

## 7. Test plan executed

- BlessBoard: `tests/church-member-import.test.js` (+ related BB/platform foundation coverage as available)
- ActiveClinic Batch 1a suite: config, patient/reception, appointments, clinical, billing, management-data
- Platform shared foundation test for data-job adapters

---

## 8. Final marker

**`V2_03_PLATFORM_REUSE_PASS`**
