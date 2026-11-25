# V2.13.2 G136 — reviewed checkpoint

Branch `V13`. Base SHA `49763ea34233b0d5948c3f148e913f8bab1635f5`. Source commit `d222ccc294ca835597effe57e74a4f696d1d9b99`. After `git push origin V13`, `origin/V13` matched that SHA. This documentation commit is separate. `main` was not modified. Nothing was deployed.

The overall QA suite is not green.

## Review

The staged diff kept staff review of `phone_country` and `phone_national`, and the portal match uses that same national number and clinic country. `registerPatientWithPhoneMatch` still has no `INSERT INTO activeclinic.patients`. An existing identity is rejected before a patient link. Unknown public registration still says the form does not create a patient record.

Vitals correction still inserts a new `activeclinic.vital_sign_observations` row with `corrects_observation_id`. The service does not update or delete the original row. The HTTP and browser assertions reject a second correction of the same id and reject the other clinic.

`safeSectionLink` rejects `javascript:`, `data:`, `vbscript:`, and protocol-relative addresses. Section and block saves return `invalid_url`. The public home template does not emit those schemes. Section images go through the existing owned-image hydration. `BLESSBOARD_MEDIA_UPLOADS_ENABLED` was not changed and is deleted from the HTTP runner environment. Binary upload is not claimed.

About pages and `VERSION_BASE` / `PRODUCT_VERSION` remain 2.13.2. Historical 2.13 and 2.13.1 catalog entries were not rewritten. `tests/v213-version-initialization.test.js` now expects the current constants to be 2.13.2.

## Checks before the source commit

Syntax check of the changed JavaScript files passed.

Database-free suite, including the version file that had still expected 2.13.1: 557 tests, 555 passed, 0 failed, 2 skipped. The two skips are the PostgreSQL identity checks when no database is configured.

HTTP 31 passed / 3 failed and Playwright 45 passed / 0 failed are the G135 runs already recorded in `docs/qa/V2132_G134_PATIENT_AND_VITALS_RESULTS.md` and `docs/qa/V2132_G135_WEBSITE_PUBLICATION_RESULTS.md`. They were not repeated as a new G136 suite. The three HTTP failures remain D14C, D16 platform OTP, and D25 slot.

## Excluded

Left untracked: `bb-lifecycle.log`, `docs/qa/V2131_GAP_G08_FINAL_REPORT.md`. Local database files, browser traces, and `.v13-isolated-pg/` were not staged.
