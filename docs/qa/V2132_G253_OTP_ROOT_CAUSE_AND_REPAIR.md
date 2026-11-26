# V2132 G253 OTP root-cause and repair

See also `docs/qa/V2134_G272_OTP_ROOT_CAUSE.md` and G272–G280 tip work.

## Chain verified

Issue → persist (disposable PG) → deliver (Resend transport when configured; deliveryActivated remains false) → verifyChallenge (no session) → completeProtectedAction once.

## Source repairs already on tip

- Recovery eligible-identity → OTP challenge → `/forgot-password/otp-verify` → completion
- Non-production `GETPRO_OTP_ACTIVATION=ACTIVE`
- Hosted-QA recipient allowlist fail-closed
- Cross-worker context rate isolation

## Not done this cycle

- Schema apply / migration 048
- Real email send
- Production activation
