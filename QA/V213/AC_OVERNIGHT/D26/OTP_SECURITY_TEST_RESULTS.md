# OTP security test results

Safe suite started `2026-11-14T23:32:41+0200` and finished `2026-11-14T23:32:44+0200`. Exit 0. Database URLs were unset. Write flags and the browser flag were `0`.

| Result | Count |
|---|---|
| Tests | 217 |
| Passed | 217 |
| Failed | 0 |

New D26 tests inside that run: 6 unit and 3 contract. They used `otp-d26@example.com` and the synthetic Zambia number `0977000333`. No message was sent.

Confirmed in memory only:

- `1234` verifies when the testing deployment, database identity, deployment code, and `GETPRO_OTP_ALLOW_FIXED_CODE=1` all agree.
- The same code is rejected when `NODE_ENV` is `production`, and startup throws `otp_test_config_forbidden` if the fixed-code flag is set there.
- A second memory store cannot verify the first store's challenge.
- Replay, wrong purpose, and another organization are denied.
- The fifth wrong code exhausts the challenge. Audit JSON contains neither code.
- `0977000333` becomes `+260977000333`. A non-Zambia number is rejected.
- A Twilio-named SMS adapter returns `provider_not_selected` and does not contact a network.
- Blocked activation allows the existing login path and does not mark the OTP session complete.

None of these results is production readiness. The platform OTP integration file was not executed.
