# V2134 G335 tester handoff

The testing hosts will move only if the G335 push deploys. Email OTP is still not live.

## Safe to retest after the new SHA is healthy

1. Public booking stays unavailable.
2. Forgot password does not send an SMS and does not say that it did.
3. Staff-created patient activation, then sign-in to that same clinic.
4. A phone with no chart shows no matching record and creates no chart.
5. A new text section and a new image section stay private until publish.
6. A saved vital can be corrected, and the original value remains.
7. One laboratory request can be received, resulted, and verified. Counters match the stored rows.
8. One radiology request appears in Open, In Progress, and All at the matching stages.
9. SOAP, prescription, vitals, laboratory, radiology, and referral pages print for that chart.

## Still blocked

Email OTP. There is no approved recipient, no Resend key in the reviewed configuration, and SPF for `pronline.org` authorizes Hostinger rather than Resend. A DKIM record exists at `resend._domainkey.pronline.org`. That is not a completed mailbox test. Do not enter a testing code and mark RT-07 passed.

Do not enable public booking, SMS, or Community Benefits posting.
