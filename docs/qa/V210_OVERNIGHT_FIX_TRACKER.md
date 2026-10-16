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

## V210-P13 — 2026-10-17

- Bugs: `BB209-11`, `BB-06` announcement image disappearance after save/publish.
- Image save/publish: `VERIFIED_PASS` through existing media attachment and announcement services.
- Audience: church/branch/member/public targeting and cross-tenant isolation verified.
- RBAC: authorized management and unauthorized access paths verified.
- Focused result: 74/74 passed with small fixtures.
- Code fix: none.
- Status: `VERIFIED_PASS`.

## V210-P12 — 2026-10-17

- Bug: `BB209-07` invitation role selector appears restricted.
- Root cause: no confirmed UI/backend inconsistency; approved catalogue roles and invitation actor gates are aligned.
- Role matrix: verified without permission widening.
- Invitations: creation, reuse, branch placement, activation-path contracts, CSRF, unauthorized access, and tenant scope passed.
- Focused result: 33/33 passed with mock delivery.
- Code fix: none.
- Status: `VERIFIED_PASS`.

## V210-P11 — 2026-10-17

- Shared audit: BB/AC draft, preview, publish, version history, restore, public resolution, and tenant isolation were inspected.
- Shared defects: none confirmed.
- Product-specific defects: none confirmed.
- Focused result: 44/45 passed; one existing moderation fixture failed with `church_scope_required`.
- Code fix: none; no duplicate prior fix or unverified change made.
- Status: `BLOCKED` by the unrelated existing fixture failure.

## V210-P10 — 2026-10-17

- Bug: `AC-HIST-07` guest appointment and patient identity linking.
- Guest booking: `VERIFIED_PASS`; requests remain clinic-scoped and pending until confirmation.
- Patient linkage: verified guest-token registration, verified-phone claim, and existing-patient staff linking.
- Duplicates: no auto-linking; duplicate and cross-clinic protections pass.
- Focused result: 28/28 passed; no reminders or payments sent.
- Code fix: none.
- Status: `VERIFIED_PASS`.

## V210-P08 — 2026-10-17

- Bug: `BB209-01` public church website displays an old image after replacement/publish.
- Root cause: not confirmed; the focused image suite failed on an existing markup assertion (`data-bb-kind="image"`), before proving persistence, snapshot, resolver, or cache failure.
- Draft/preview/publish/public: not verified to completion.
- Code fix: none; no unverified media or historical-version change made.
- Status: `BLOCKED` by the existing focused test failure.

## V210-P09 — 2026-10-17

- Bug: `BB-03` multiple saved website edits may not publish together.
- Root cause: no confirmed publication defect; supported behavior is bulk publication of all scoped drafts in one snapshot transaction.
- Multi-section publish: `VERIFIED_PASS`, including failure rollback.
- Versions: immutable history and restore-as-new `VERIFIED_PASS`.
- Isolation: branch/church scope `VERIFIED_PASS`.
- Focused result: 29/29 passed.
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
