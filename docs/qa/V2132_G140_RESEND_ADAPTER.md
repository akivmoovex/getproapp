# V2.13.2 G140 — Resend email adapter

Resend delivers email only. Challenge generation, persistence, expiry, and verification stay in the existing OTP service. If `platform.otp_challenges` is absent, production activation stays `BLOCKED`. The in-memory store remains the unit-test store and is not a production persistence replacement.

## Components

| File | Role |
| --- | --- |
| `src/platform/email/resendEmailAdapter.js` | HTTPS POST to `https://api.resend.com/emails` with native fetch |
| `src/platform/email/resendSenderCatalog.js` | Product sender identities and the verified-domain gate |
| `src/platform/email/resendOtpTransport.js` | OTP email transport. It does not store a challenge |
| `src/platform/email/transactionalTemplates.js` | Verification, activation, recovery, and delivery-error copy |
| `src/platform/otp/otpProviders.js` | Selects `resend` through the existing provider interface |
| `src/blessboard/services/passwordResetEmailDelivery.js` | BlessBoard recovery uses the shared adapter |
| `src/activeclinic/services/activeClinicEmailDelivery.js` | ActiveClinic mail uses the shared adapter |

No `resend` npm package is loaded.

## Send rules

- `GETPRO_OTP_PROVIDER=resend` sets the email provider to `resend` when that name is empty.
- BlessBoard, ActiveClinic, and PROnline resolve to their catalog senders. `platform` and `shared` use the PROnline sender. NEUniversity returns `not_configured`. An unknown product returns `unknown_product`.
- A catalog domain sends only when it is listed in `GETPRO_RESEND_VERIFIED_DOMAINS`. Otherwise the result is `domain_not_verified` and fetch is not called.
- A missing `RESEND_API_KEY` returns `missing_api_key` and does not fetch.
- An invalid recipient returns `invalid_recipient` and does not fetch.
- HTTP 401 and 403 are `authentication_failed` and are not retried.
- HTTP 429 is `rate_limited`. HTTP 408 and 5xx are `provider_unavailable`.
- The OTP transport allows three attempts. After that budget, a retryable failure is `retry_exhausted` and is not retried again by the OTP policy.
- Existing transactional callers keep one attempt unless they pass `maxAttempts`. Their 429 and 503 results stay `rate_limited` and `provider_unavailable`.
- The same idempotency key on one transport is `duplicate_suppressed` and does not fetch again. The key is the OTP attempt id, not the code.
- Logs record a masked recipient, status, and provider code. They do not record the API key, the OTP, or the provider body.
- Templates name the product and the message purpose. They do not include a diagnosis, an encounter, or a patient record.

## What stays disabled

Production `resolveOtpActivation` stays `BLOCKED` when a Resend key and a verified domain are present. The fake provider still resolves to inactive in production. Migration `048` was not created and was not applied. No real email was sent.
