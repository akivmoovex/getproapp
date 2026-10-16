# V2.10 Overnight Fix Tracker

## 2026-10-17

- Branch: V10
- Starting SHA: `62bfaee5ebd6d137c8fbf38c8c88e46a781d74a5`
- Supplied defect prompt: none
- Focused About/release-note QA: PASS (44/44)
- Confirmed defects fixed: none
- Database/deployment activity: none
- Status: `NEXT_PROMPT_REQUIRED`

## V210-P01 — 2026-10-17

- Bug: `V208-REG-01` Add Section refreshes without creating a section.
- Root cause: no confirmed defect in the shared Add Section path.
- BB/AC: `VERIFIED_PASS` for shared registry, endpoint wiring, draft-only response, persistence/security contracts covered by focused tests.
- Focused result: 24/25 passed; one unrelated stale asset-version assertion failed in `v2-01-shared-section-management.test.js`.
- Code fix: none.
- Status: `NEEDS_SCOPE` for unrelated test maintenance; no product change made.

## V210-P02 — 2026-10-17

- Bug: `V208-REG-03` editor black/empty screen.
- Root cause: no confirmed initialization, template-local, JavaScript, or authorization defect.
- BB/AC desktop and mobile editor initialization: `VERIFIED_PASS`.
- Focused result: 20/20 passed.
- Code fix: none.
- Status: `VERIFIED_PASS`.

## V210-P06 — 2026-10-17

- Bug: `BB209-03` church administrators cannot add new members.
- Root cause: no confirmed route/service/RBAC defect; the existing member registration and verification paths are present.
- Create/list/search/RBAC: not fully verified because the focused suite hit an unrelated existing schema privacy assertion (`date_of_birth`) and three PostgreSQL-dependent tests were skipped.
- Code fix: none; no unverified change made.
- Status: `BLOCKED` pending a clean, appropriately scoped member-creation test environment.

## V210-P07 — 2026-10-17

- Bugs: `BB209-10`, `BB-05` service names, days, and times missing publicly.
- Root cause: no confirmed omission; HQ service-time editing, draft/publication, branch inheritance/override, hidden mode, public rendering, and mobile hooks are covered and passing.
- HQ: `VERIFIED_PASS`.
- Branch: inherit/override/hidden behavior `VERIFIED_PASS`.
- Publish/public anonymous view: `VERIFIED_PASS`.
- Focused result: 61/61 passed.
- Code fix: none.
- Status: `VERIFIED_PASS`.

## V210-P04 — 2026-10-17

- Bug: `AC-NEW-07` patient self-registration approval queue.
- Root cause: no defect confirmed; current workflow intentionally creates/links an active patient portal identity, not a pending clinic-approval record.
- Staff queue: no supported patient self-registration approval queue exists.
- Patient linkage: existing phone/name match and staff registration workflows pass with clinic scoping and duplicate controls.
- Focused result: 17/17 passed.
- Code fix: none.
- Status: `NEEDS_SCOPE` — approval policy is a new requirement and was not invented.

## V210-P05 — 2026-10-17

- Bug: `AC-NEW-02` nurse triage has no accessible patient-vitals workflow.
- Root cause: no confirmed defect; existing clinical encounter vitals workflow is permissioned by `activeclinic.triage.record`, which the nurse role has.
- Vitals workflow: `VERIFIED_PASS` at `/app/clinical/encounter/:encounterId/vitals`.
- Role access: nurse dashboard/clinical access and triage permission verified.
- Data persistence/security: immutable observations, staff identity, timestamps, facility and tenant scope verified.
- Focused result: 42/42 passed.
- Code fix: none.
- Status: `VERIFIED_PASS`.

## V210-P03 — 2026-10-17

- Bugs: `AC-NEW-05`, `AC-NEW-06` patient activation and existing-profile access.
- Root cause: no confirmed defect; existing phone + name match activation already links the clinic patient atomically after identity checks.
- Portal entry: `/clinics/:clinicKey/patient/register` and `/patient/login` present.
- Duplicate protection: existing identity, linked patient, ambiguous match, and cross-clinic checks covered.
- Tenant isolation: verified.
- Focused result: 22/22 passed; isolated test data only.
- Code fix: none.
- Status: `VERIFIED_PASS`.
