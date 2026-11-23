# V13 G88 release readiness

RELEASE_READY=NO

QA_CANDIDATE_READY=NO

The G88 run improved the isolated suite and left mandatory failures in place.

## Can be treated as verified on the disposable database

- AC-REG-01, AC-AUTH-04, and AC-REC-03 over both HTTP and the browser
- AC-REC-02 and AC-WEB-09 over HTTP only
- BB-24 and the media-disabled assertion over HTTP
- Safe suite 526 passed, 0 failed, 2 skipped

## Release blockers

- AC-WEB-08 section is not on the public page
- AC-WEB-09 draft preview for the existing clinic stays on `ac.default`
- AC-REC-02 browser check-in on the existing clinic returns the generic error page
- BlessBoard public sermon, event, and announcement pages stay on the unpublished-website setup page
- BB-06 activation, INV-01 conflict, and BB-AUTH-04 OTP capture
- BlessBoard browser invitation and OTP journeys have no retained plaintext secrets
- D16 clinic registration does not return a facility and administrator
- Appointment slot lock and staff overlap remain unimplemented
- `platform.otp_challenges` remains absent by contract

No deployment was performed. Hosted QA and production were not migrated.
