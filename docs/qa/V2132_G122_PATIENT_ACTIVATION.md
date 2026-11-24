# V2.13.2 G122 — existing patient portal activation

AC-FU-PORTAL-01 uses `registerPatientWithPhoneMatch`.

The match is limited to one active patient in the same organization and healthcare organization. The phone is normalized. The submitted first and last names must match the stored names. More than one row is rejected as ambiguous. A patient that already has `platform_identity_id` is rejected. The locked row must still be unlinked. The function does not insert into `activeclinic.patients`.

Failed activation returns a neutral message. It does not disclose another clinic's patient.

This run did not add a bypass when verification data is missing. Production OTP was not activated. Contract coverage is `tests/v13/contract/g122-patient-activation.test.js`.

Hosted activation on activeclinic.pronline.org was not retested. Status: IMPLEMENTED_NOT_E2E_VERIFIED.
