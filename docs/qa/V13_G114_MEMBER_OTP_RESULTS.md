# V13 G114 member OTP

BB-AUTH-04 passes in both full BlessBoard Playwright runs.

Recovery uses `blessboard.phone_otp_verifications` and the in-process test provider. The recovery page does not render the code and has no `data-bb-test-otp` marker. The browser then reads `/__platform/qa/blessboard-member-otp-delivery` for that verification id.

The route returns 404 unless diagnostics are allowed, 403 unless `DEPLOYMENT_ENV` is `testing` and the deployment code is `moovex-platform-testing`, and 404 unless the provider is `test`. `BLESSBOARD_OTP_EXPOSE_TEST_CODE` stays unset. The correct code is accepted once. A later wrong code shows “Recovery unsuccessful.” The new password then signs in to the member dashboard.

This does not satisfy D14C or D16. Those tests still require `platform.otp_challenges`.
