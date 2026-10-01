# V2.04 — Person / Member / Patient Foundation Consolidation Gate

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_PERSON_MEMBER_PATIENT_FOUNDATION_GATE` |
| **Branch** | `V4` |
| **Date** | 2026-09-30 |
| **Mode** | Read-only architecture + regression audit (defect fix only: permission catalogue key) |
| **Verdict** | See footer |

---

## Verification checklist (1–18)

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | Platform does not depend directly on BB or AC | **PASS** (new modules) | `src/platform/person/**` and `src/platform/requestApproval/**` have **zero** product `require`s. Architecture suite (`npm run test:architecture`) **7/7 pass**. Pre-existing Class E composition bridges (e.g. `v5FoundationServer`) unchanged and allowlisted — not introduced by this foundation. |
| 2 | BB/AC avoidable duplicate person infrastructure | **PASS** | Shared `platform.persons` + product adapters; no second person table in BB/AC. Product records remain `members` / `patients`. |
| 3 | Shared phone normalization used | **PASS** | `normalizePersonPhone` → `platform/services/phoneNumberService`. Staff person workflow uses it. AC ACN10 registration retains product contact normalizer for compatibility; duplicate scoring uses shared engine. |
| 4 | Shared duplicate engine where intended | **PASS** | `activeClinicPatientDuplicateService` delegates to `evaluatePersonDuplicates` / `ACTIVECLINIC_DUPLICATE_POLICY`. BB staff adapter uses product duplicate policy + shared workflow match. |
| 5 | Shared RBAC used | **PASS** | BB catalogue permissions / AC `authorizeStaffPermission`; aliases map `patients.*` → `activeclinic.patient.*`. No Pastor/Secretary hard-codes. |
| 6 | Shared audit used | **PASS** | `recordSharedPlatformAudit` / catalogue keys for person workflow, member/patient domain, attendance corrections, approval decisions. |
| 7 | Staff Member/Patient common orchestration | **PASS** | Both use `runStaffManagedPersonWorkflow` + product `staffManagedWorkflow` adapters. |
| 8 | Church membership BB-specific | **PASS** | `blessboard.members`, Church ID, membership statuses stay in BB. |
| 9 | Patient relationship AC-specific | **PASS** | `activeclinic.patients`, Patient Number, HCO/facility stay in AC. |
| 10 | Clinical data AC-specific / out of platform person | **PASS** | Clinical fields rejected on staff patient demographic paths (`CLINICAL_FORBIDDEN_FIELDS`). |
| 11 | Church attendance BB-specific | **PASS** | Session attendance under `blessboard.attendance_*`; not in platform person. |
| 12 | Membership ≠ portal | **PASS** | `members.status` vs `portal_access_status` (`not_activated`/`active`/`blocked`). |
| 13 | Patient record ≠ portal | **PASS** | Staff create leaves portal `none`; identity linkage separate from patient row. |
| 14 | ACN10/11 not regressed | **PASS** | `activeclinic-patient-foundation` + `activeclinic-batch1a-patient-reception` **31/31 pass** after permission-key fix. Domain façade reuses register/update/duplicate/consent. |
| 15 | Existing BB not regressed | **PASS** | `blessboard-attendance` + `blessboard-participation` **pass** (attendance table assertion updated for additive session tables). |
| 16 | Tenant isolation intact | **PASS** | Focused isolation assertions in V2.04 suites + `v8-shared-rbac-tenant-isolation` **pass**. |
| 17 | No production configuration changed | **PASS** | No `.env*` / deploy / production config files in V2.04 change set. |
| 18 | No final UI before Stitch | **PASS** | No new EJS/views/public Stitch screens for member/patient/attendance/request in this foundation work. |

**Gate defect remediated (not a feature):** `members.church_id.manage` violated `permissions_key_parts_match` and broke local foundation DB bootstrap. Renamed to `members.manage_church_id` (action `manage_church_id`).

---

## FILES_CHANGED

### Modified
- `src/platform/contracts/productRuntimeRegistry.js`
- `src/platform/audit/sharedAuditCatalog.js`
- `src/blessboard/bootstrap/registerBlessBoardPlatformContracts.js`
- `src/blessboard/repositories/memberIdentityRepository.js`
- `src/activeclinic/bootstrap/registerActiveClinicPlatformContracts.js`
- `src/activeclinic/services/activeClinicPatientDuplicateService.js`
- `tests/blessboard-attendance.test.js` (additive session tables)

### Added (representative)
- `src/platform/person/**`
- `src/platform/requestApproval/**`
- `src/blessboard/services/memberDomainConstants.js`
- `src/blessboard/services/blessBoardMemberDomainService.js`
- `src/blessboard/services/blessBoardStaffMemberWorkflowAdapter.js`
- `src/blessboard/services/blessBoardMemberDuplicateService.js`
- `src/blessboard/services/attendance/**`
- `src/blessboard/services/joinRequest/**`
- `src/activeclinic/services/patientDomainConstants.js`
- `src/activeclinic/services/activeClinicPatientDomainService.js`
- `src/activeclinic/services/activeClinicStaffPatientWorkflowAdapter.js`
- Architecture reports under `docs/architecture/V2_04_*.md`

---

## MIGRATIONS_ADDED

| Migration | Purpose |
|-----------|---------|
| `db/migrations/platform/046_person_foundation.sql` | `persons`, links, addresses, related contacts |
| `db/migrations/platform/047_approval_request_foundation.sql` | Approval requests + decision history |
| `db/migrations/blessboard/119_member_number_church_id.sql` | Church ID / `member_number` |
| `db/migrations/blessboard/120_member_domain_v204.sql` | Membership/portal statuses, profile, RBAC |
| `db/migrations/blessboard/121_attendance_session_domain_v204.sql` | Session attendance foundation |
| `db/migrations/blessboard/122_department_join_request_v204.sql` | Department pending join alignment |

All additive. **Not applied to production** in this gate.

---

## TEST_FILES

### V2.04 foundation
- `tests/v2-04-person-foundation-phase1.test.js`
- `tests/v2-04-person-duplicate-engine.test.js`
- `tests/v2-04-staff-person-workflow.test.js`
- `tests/v2-04-bb-member-domain.test.js`
- `tests/v2-04-ac-patient-domain.test.js`
- `tests/v2-04-bb-attendance-domain.test.js`
- `tests/v2-04-request-approval.test.js`

### Auth / RBAC / architecture
- `tests/v2-02-platform-rbac-foundation.test.js`
- `tests/v8-shared-rbac-tenant-isolation.test.js`
- `npm run test:architecture` (PC03/PC15)

### Regression
- `tests/activeclinic-patient-foundation.test.js` (ACN10 identity)
- `tests/activeclinic-batch1a-patient-reception.test.js` (ACN10–13)
- `tests/blessboard-attendance.test.js`
- `tests/blessboard-participation.test.js`

---

## TEST_CASES / PASS / FAIL / SKIP

| Bundle | PASS | FAIL | SKIP |
|--------|------|------|------|
| V2.04 foundation + RBAC/tenant | **133** | **0** | **0** |
| ACN10/11 + BB attendance/participation | **31** | **0** | **0** |
| Architecture direction | **7** | **0** | **0** |
| **Total (gate run)** | **171** | **0** | **0** |

---

## KNOWN_GAPS

1. Staff open-policy ministry join via legacy `participationService` can still auto-activate; V2.04 approval-linked path is the new PENDING-request adapter (coexistence documented in Phase 7).
2. AC registration path still uses product phone normalizer for ACN10 compatibility (shared engine consumes normalized values).
3. Session attendance domain is backend-only; aggregate `attendance_events` reporting UI unchanged.
4. Offline attendance sync intentionally unimplemented (boundary only).
5. Pre-existing Class E platform→product composition bridges remain outside person/requestApproval modules.

---

## STITCH_DEPENDENCIES

| Surface | Status |
|---------|--------|
| BB member final screens | **Deferred** — no Stitch UI in this foundation |
| AC staff Add Patient final screens | **Deferred** |
| BB attendance check-in Stitch | **Deferred** |
| Ministry/department join approval UI | **Deferred** |

Foundation is ready for Stitch-driven UI binding; **no invented final screens**.

---

## DEFERRED_ITEMS

- Final Stitch member / patient / attendance / join UIs
- Offline attendance sync/reconciliation
- Production migration apply / deploy
- Full replacement of legacy church QR attendance stack
- Merging aggregate headcount events into session check-ins
- Automatic visitor → membership conversion (explicitly forbidden)

---

## PRODUCTION_STATUS

| Item | Status |
|------|--------|
| Production deploy | **Not performed** |
| Production DB migrations | **Not applied** |
| Production env / secrets | **Unchanged** |
| Force-push / history rewrite | **Not performed** |

---

## Session reports reviewed

- `docs/architecture/V2_04_PERSON_MEMBER_PATIENT_AUDIT.md`
- `docs/architecture/V2_04_PERSON_FOUNDATION_PHASE1.md`
- `docs/architecture/V2_04_DUPLICATE_ENGINE_REPORT.md`
- `docs/architecture/V2_04_STAFF_PERSON_WORKFLOW_REPORT.md`
- `docs/architecture/V2_04_BB_MEMBER_DOMAIN_REPORT.md`
- `docs/architecture/V2_04_AC_PATIENT_DOMAIN_REPORT.md`
- `docs/architecture/V2_04_BB_ATTENDANCE_REPORT.md`
- `docs/architecture/V2_04_REQUEST_APPROVAL_REPORT.md`

---

V2_04_PERSON_MEMBER_PATIENT_FOUNDATION_READY_FOR_STITCH
