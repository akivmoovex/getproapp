# V2.10 ActiveClinic Sanity

Date: 2026-10-17  
Branch: V10

## Result

The bounded ActiveClinic sanity batch ran 98 tests: 97 passed, 1 failed, and 0 skipped.

Passing coverage included clinic/facility registration, patient registration and duplicate protection, portal/security contracts, booking/linkage, appointments, diagnostics/RBAC, website CMS/hardening, password-recovery delivery contracts, and registration idempotency.

The single failure was `tests/activeclinic-clinic-registration-review-lifecycle.test.js`, subtest “12 duplicate and reapplication rules remain intact”. The fixture submission omitted the required `city` field and received `invalid_input`; this is a stale/incomplete test fixture failure, not a confirmed product defect. The same run also reported an unavailable `activeclinic.clinic_registration_applications` relation in the review-lifecycle environment, so that database-backed workflow is not fully validated.

## Coverage limitations

- No production data, real patient data, external messages, or runtime changes were used.
- Desktop 1440px and mobile 390px browser coverage was not run in this bounded CLI batch.
- Full public image/services/doctors rendering and complete draft/preview/publish/restore browser flow were not established.
- Laboratory/radiology result persistence and some clinic-registration review paths require a complete isolated ActiveClinic schema.

## Release blockers

ActiveClinic sanity is blocked pending correction of the stale city fixture and a complete isolated ActiveClinic registration schema, followed by bounded reruns. Browser viewport coverage also remains outstanding.
