# V2134 G334 OTP provider integration

STATUS=LOCAL_MOCK_PASS  
LIVE_EMAIL_SENT=NO

`src/platform/email/resendOtpTransport.js` already called Resend for one BlessBoard hosted-QA approval path. A normal ActiveClinic or BlessBoard catalog send stopped before the network because that path only accepts `qa-blessboard@pronline.org` after the QA identity probe.

The catalog path now sends when all of these are true:

- `GETPRO_OTP_EMAIL_DELIVERY=owner-approved`
- `GETPRO_OTP_ACTIVATION=ACTIVE`
- the process is not production
- the product domain is listed in `GETPRO_RESEND_VERIFIED_DOMAINS`
- `RESEND_API_KEY` is present
- the pepper is at least 32 characters and is not the session secret
- the purpose is `login` or `password_recovery`

ActiveClinic uses `security@notify.activeclinic.org`. BlessBoard uses `security@notify.blessboard.com`. The API result is acceptance only. The transport sets `delivered: false`. A repeated idempotency key does not call the network again. A missing flag, a production process, a missing key, an unverified domain, HTTP 401, 422, 429, 503, and a timeout all fail closed. SMS dispatch stays failed. `deliveryActivated` stays false, so the service still refuses a provider that marks itself permanently activated.

`tests/v13/unit/g334-resend-provider-mock.test.js` passed 4/4 against a mock `fetch`. No live request was made.

## Owner requirements before any mailbox test

1. Verify `notify.activeclinic.org` and `notify.blessboard.com` in Resend, then set `GETPRO_RESEND_VERIFIED_DOMAINS` to those exact domains.
2. Set `RESEND_API_KEY` in the secret store. Do not commit it.
3. Set a pepper of at least 32 characters that is not `SESSION_SECRET`.
4. Choose one approved recipient and confirm the mailbox.
5. Set `GETPRO_OTP_EMAIL_DELIVERY=owner-approved` only for that test process.
6. Apply reviewed migration `048` on the target database before hosted OTP.
7. Treat an API id as acceptance, then confirm the mailbox before calling RT-07 a pass.

Hosted testing remains `NODE_ENV=production`. That value blocks this path even if the flag is copied onto the host.
