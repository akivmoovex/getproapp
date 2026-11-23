# V13 G81 remaining failures

The latest full Playwright suites are the source of these counts. A journey is not listed as passed because a page rendered.

## ActiveClinic — 5 failed of 20

Log `.v13-isolated-pg/g80-ac8.log`, confirmed still failing in `.v13-isolated-pg/g80-ac9.log`.

| ID | What the run showed | Root cause seen |
| --- | --- | --- |
| AC-AUTH-04 | Replay `POST /reset-password/:token` did not return within 90 seconds after “Password Reset Successful”. | The consumed-token request does not complete. `maxRedirects: 0` and a 15 second request timeout were present in the spec and the failure still reported the 90 second test timeout. CSRF was not removed. |
| AC-REG-01 | The second registration reached “Please fix the following”. The denial text matched four elements, so `toBeVisible` failed strict mode. | The mismatch denial is rendered. The assertion did not use `.first()`. That locator change was made after ac9 and was not rerun, so this remains a failure. |
| AC-WEB-08 | A new clinic was created and the draft preview loaded. The body did not contain the new section heading. | The saved section did not appear on the draft public page. |
| AC-WEB-09 | The mint theme control was already “Applied to draft” and disabled, so `click` waited until timeout. A later spec treats that disabled state as already selected. That change was not rerun. | The theme was already on the draft. The test still clicked a disabled button. |
| AC-REC-03 | “Start encounter” was on the page four times (strict mode) in ac8. In ac9, Create patient did not reveal `[data-ac-patient-number='1']`. | Patient creation through the wizard did not finish on a record page, so vitals were not saved or read back. |

## BlessBoard — 21 failed of 23

Independent run `.v13-isolated-pg/g80-bb2.log`. Passed: BB-05 and D14C. The earlier serial run stopped after BB-01 and did not execute the other 22; those are not passes.

| ID | What the run showed |
| --- | --- |
| BB-01 create and edit | Signed-in website hub has no `a[href*='/pages/']`. Click timed out. |
| BB-02 upload/publish and public view | Expected upload or public announcement controls were not visible. |
| BB-03 event | Expected event control was not visible. |
| BB-04 sermon | Expected sermon control was not visible. |
| BB-06 activation and login | `E2E_BB_MEMBER_INVITE_TOKEN` was not available. Plaintext invite tokens were not recovered. None were invented. |
| BB-24 contact and inbox | Public contact or inbox control was not visible. |
| INV-01 accept and sign-in | `E2E_BB_STAFF_INVITE_TOKEN` was not available. |
| BB-AUTH-04 | `E2E_BB_MEMBER_OTP` was not available. The OTP challenge table was not added. |
| BB-MEM-01 | Expected member-form control was not visible. |
| BB-MEM-02 | CSRF assertion did not match the expected status. The check was not weakened to force a pass. |
| BB-REG-07 | Duplicate-phone registration did not land on the expected URL. |
| BB-ANN-01 | Public announcement marker was not visible. |
| BB-WEB-08 | `bb.community` matched two elements (strict mode). |
| BB-WEB-09 | The draft sermon title was on the page twice (strict mode). The sermon was not proven private on the public page. |
| BB-WEB-10 | The draft event title was on the page twice (strict mode). |
| BB-ANN-02 | The attachment region was on the page twice (strict mode). This run did not prove the disabled-upload response or a synthetic upload. The media-upload flag stayed unset. |

## HTTP suite

The G79 HTTP run was not executed again. Its last recorded result remains 16 passed and 18 failed. Those failures are still open: section settings 404, reception “Patient created” copy, public booking copy, D16 registration without a facility, absent `platform.otp_challenges`, unimplemented appointment slot lock, staff overlap outside the transaction, public sermon/event/announcement markers, member activation ownership, staff invite conflict, and the media-upload test expecting 200 while the product correctly returns 403 `media_uploads_disabled`.

Not changed, by decision: no `048_otp_challenges.sql`, no slot lock, no in-transaction overlap check, no public booking default, no media-upload flag, no production provider keys.

## Isolation after the runs

`current_database()` was `getpro_v13_e2e_g78d2301`, `inet_server_port()` was 55432, identity environment was `testing`, and clinics with public booking enabled were 0.
