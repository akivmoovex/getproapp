# Strengthened tests

Nine cases were added in `tests/v13/unit/d57-behavioral-strengthening.test.js`. No existing test file was rewritten, and no product file was changed. Each case calls the current function.

| Case | What it calls | What a failure means |
|---|---|---|
| Forged consent tenant | `grantPatientConsent` | A client organization id that disagrees with the trusted id is not rejected before a query |
| Facility parameters | `findByIdAndOrganization` | The read no longer binds both the facility id and the organization, or a database error is swallowed |
| Staff collision | `findStaffCollision` | An overlapping appointment is ignored, or a missing block table hides that appointment |
| Portal registration | `registerPatientWithPhoneMatch` | A missing clinic, a short password, or a bad phone reaches a query, or the password is copied into the result |
| Encounter type | `startEncounter` | `inpatient` is accepted or the database is opened before the type check |
| Document body | `getClinicalDocument` | Another patient’s narrative is returned, the owner’s narrative is dropped, or a missing row becomes a success |
| Payment denial | `recordPayment` | A clinic without the product opens a connection, or the note or idempotency key is copied into the denial |
| CSRF pair | `validateCsrf` | A BlessBoard cookie, a different body token, or an empty body is accepted for the ActiveClinic cookie name |
| OTP boundary | `createOtpService` | A code still verifies at the exact expiry instant, a used code is not `replay`, or the public result contains `1234` |

These are in-process results. They do not store a row.
