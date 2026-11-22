# V13 G66 laboratory completion

The G64 engine is unchanged in its rule: a result is abnormal or critical only when the caller supplies an applicable approved rule. No numeric threshold was added.

`previewReferenceRule` returns `persisted: false` and `044_not_applied`. A preview without `alreadyApproved: true` returns `not_approved` and does not treat the submission as an approved threshold. The page `/app/diagnostics/laboratory/reference-rules` uses the signed-in organisation and selected facility. It requires laboratory view and the laboratory department. It does not query `laboratory_reference_rules`.

`retainLaboratoryInterpretation` still keeps the previous interpretation unless reassessment is explicitly authorized. Critical acknowledgement remains the existing clinical-alert path.

Tests added in the safe suite assert the not-queued query helper and the unapproved preview. `tests/v13/integration/g66-reference-rules.integration.test.js` calls `runGated` and skips as `NOT_RUN` without database-write authorization. An authorized run checks that the preview did not persist and then requires both migration tables. It throws `MIGRATION_PENDING` while 043 or 044 is absent. That file was not executed. The Playwright case `G66 reference rule preview is not saved` calls `hold()` before navigation and was not executed.

Status: engine `IMPLEMENTED_UNVERIFIED`. Stored configuration `MIGRATION_PENDING`. `CLINICAL_THRESHOLDS=NOT_CONFIGURED`.
