# V2.12 PB-01 Integration QA

Initial V12 HEAD: `67fc576f9dd7769be2933463de5dca8994bc5f7e`

The verified PB-01 candidate was integrated into the V12 worktree without modifying the pre-existing Phase 3G files or screenshot.

Integrated files:

- `public/activeclinic/ac-a11y.js`
- `tests/activeclinic-pb01-browser-regression.test.js`

The fix uses `event.submitter`, preserves its `name/value` as hidden state, and defers disabling the control until after native form serialization. This preserves the patient wizard's `step=review` and `step=confirm` values while retaining the loading/double-submit guard.

QA evidence from the isolated candidate image:

- `step=review` captured in the POST.
- Review page reached.
- `step=confirm` captured in the POST.
- Synthetic patient registration completed with patient number `AC-2026-000001`.
- Focused PB-01 browser regression: 1/1 pass.

`git diff --check` and Node syntax checks pass for the integrated files. The real V12 application worktree was not rebuilt or committed in this step. Existing unrelated V12 changes remain untouched and are not included in the PB-01 patch.

Final verification evidence:

- Four viewport runs (1440x900, 768x1024, 390x844, 360x800) each reached Review and completed patient registration with no horizontal overflow.
- Read-only SQL against `activeclinic.patients` found the four synthetic records with patient numbers `AC-2026-000003` through `AC-2026-000006`, all owned by the seeded ActiveClinic organization and healthcare organization.
- Patient foundation plus portal regressions: 17/17 pass.
- Patient registration RBAC regression: 12/12 pass.
- External Google Fonts requests still fail under the intentionally isolated network; workflow functionality passed.

No database reset or production access was used.
