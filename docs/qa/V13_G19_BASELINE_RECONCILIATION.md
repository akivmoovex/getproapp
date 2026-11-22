# V13 G19 — baseline reconciliation

Local HEAD and `origin/V13` are `97a4f5a81cacfb0e290c24d039878f5d4ba7f13b`. `main` is `44eafec486a18aeef2777bbcc9683e43f68ebe0d`. The only uncommitted file before this phase was `docs/qa/V2131_GAP_G08_FINAL_REPORT.md`.

G18 pushed two commits: `ccb5859f` (functional gaps and hardening) and `97a4f5a8` (QA handoff). Those commits are present. G01–G17 reports are in `docs/qa/` and match the source checked below.

## Source checks, not filenames

| Claim | Source evidence | Class |
| --- | --- | --- |
| Version 2.13.1 | `PRODUCT_VERSION_V8` in `applicationBuildInfo.js` | IMPLEMENTED |
| No automatic patient merge | `merge_deferred` in `activeClinicPatientService.js` | IMPLEMENTED |
| Second open visit blocked | `duplicate_active_encounter` | IMPLEMENTED |
| Signed notes immutable | `cannot_edit_signed` | IMPLEMENTED |
| Lab priority limited to stored values | `storedDiagnosticUrgency` | IMPLEMENTED |
| Pharmacy row only for a same-org catalogue item | `pharmacy_prescriptions` insert after catalogue lookup | PARTIAL |
| Migration 043 not applied and not routed | File exists. No HTTP file imports the service. No `DELETE` | MIGRATION_PENDING |
| Production OTP refused | `test_provider_forbidden_in_production` | IMPLEMENTED |
| Media uploads off | `default_disabled` | PARTIAL |
| Appointment version check | `STALE_VERSION` in `activeClinicAppointmentService.js` | IMPLEMENTED |
| Public booking stays off in V13 fixtures | `publicBookingEnabled: false` | IMPLEMENTED |
| HTTP and browser | Gated files exist and were not executed | UNVERIFIED |

The healthcare brief PDF is still absent, so its extra requirements stay unscored. Nothing above is end-to-end verified.

Safe tests on this HEAD: 467 passed, 0 failed, 0 skipped.
