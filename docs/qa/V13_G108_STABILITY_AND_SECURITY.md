# V13 G108 stability and security

The second HTTP run matched the first: 34 executed, 30 passed, 4 failed, 0 skipped. The second BlessBoard run matched the first: 23 executed, 19 passed, 4 failed. The second ActiveClinic run matched the first: 20 passed.

The repeated failures are the same four HTTP gates and the same four browser blockers. No new skip appeared. Public booking stayed disabled. `BLESSBOARD_MEDIA_UPLOADS_ENABLED` stayed unset. Production OTP stayed disabled. CSRF, RBAC, and tenant isolation were not weakened.

Security repairs in this phase:

- Empty media images no longer use `src=""`, which requested the current document and replaced the CSRF cookie.
- Church B’s administrator does not see Church A’s directory enquiry.
- A javascript section URL is rejected and the stored heading remains the previous value.
- A replayed member invitation is rejected.
- Cross-product website themes stay rejected.

The appointment transaction lock and `platform.otp_challenges` were not added.
