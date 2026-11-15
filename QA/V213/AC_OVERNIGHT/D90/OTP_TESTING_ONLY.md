# OTP testing only

`isFixedOtpPermitted` returns false when `NODE_ENV` is `production`, even if the fixed-code flag is set. `createOtpService` throws `otp_delivery_activation_forbidden` when the provider has `deliveryActivated` set.

No SMS or email was sent. The testing code is not a production bypass. Production OTP stays excluded.
