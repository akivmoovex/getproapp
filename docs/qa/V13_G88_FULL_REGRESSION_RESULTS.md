# V13 G88 full regression results

G82 counts are preserved here and are not added to the G88 counts.

| Suite | G82 | G88 |
| --- | --- | --- |
| Safe | 526 passed, 0 failed, 2 skipped | 526 passed, 0 failed, 2 skipped |
| HTTP | 34 executed, 16 passed, 18 failed, 0 skipped | 34 executed, 20 passed, 14 failed, 0 skipped |
| Playwright | 43 executed, 17 passed, 26 failed, 0 skipped | 43 executed, 19 passed, 24 failed, 0 skipped |

Safe log: `.v13-isolated-pg/g88-safe.log`. HTTP log: `.v13-isolated-pg/g88-http2.log`. Playwright logs: `.v13-isolated-pg/g88-ac-full.log` and `.v13-isolated-pg/g88-bb-full.log`.

Preflight: `getpro_v13_e2e_g78d2301`, port 55432, migrations 043 and 044 present, `public_booking_enabled` 0.

## Audit

| Control | G88 result |
| --- | --- |
| Tenant and facility isolation | Other-clinic vitals GET is 403. Receptionist denials for lab, pharmacy, billing, documents, and the practitioner worklist passed in the browser |
| Church isolation | BB-24 stores the enquiry on the resolved church. Public content for an unpublished site stays on the setup page |
| CSRF | Missing member CSRF still returns 403 over HTTP. Reset and vitals routes still require the token |
| OTP | `platform.otp_challenges` is absent. D14C and D16 OTP stay failed by contract |
| Appointment concurrency | Slot lock and staff overlap stay unimplemented |
| Dispensing | G04 HTTP passed |
| Clinical note integrity | G05 HTTP passed. No amendment path was added |
| Public booking | Disabled. The browser disabled-state test passed. The HTTP copy assertion still fails for an unpublished clinic |
| Media | 403 `media_uploads_disabled` is the passing HTTP assertion |
| Migrations | 043 and 044 remain on the disposable database only |

Syntax of the edited source files was checked with `node --check`. The release stays blocked.
