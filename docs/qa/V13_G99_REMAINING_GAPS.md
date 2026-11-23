# V13 G99 remaining gaps

1. `platform.otp_challenges` is not authorized. D14C and D16 platform OTP stay failed until an approved migration exists.
2. Appointment slot capacity lock is not implemented. D25 slot stays `APT-01-03_NOT_IMPLEMENTED`.
3. Staff overlap is still outside the appointment transaction. D25 overlap stays `BLOCKED_APPROVAL_REQUIRED`.
4. AC-WEB-08 browser does not show the new section heading on the public page.
5. AC-WEB-09 browser preview on the existing clinic stays `ac.default`.
6. BlessBoard browser public pages still use the original unpublished church, so sermon, event, and announcement markers are absent.
7. BlessBoard browser invitation and OTP scenarios stop because plaintext secrets were not retained.
8. The homepage section editor is at `/hq/content/pages/home`. Saving a heading there is still not visible in the browser test.

Do not close these by enabling booking, media uploads, or the OTP challenge table.
