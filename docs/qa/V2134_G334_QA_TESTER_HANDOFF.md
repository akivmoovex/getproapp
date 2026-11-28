# V2134 G334 tester handoff

HOSTED_SHA=9d87d73a7957b24b4da79dfbd9160649c0116dea  
ENVIRONMENT=testing  
LIVE_EMAIL_SENT=NO

Christine's hosted checkout has not changed. The local OTP and website work is not on that checkout. A push to `origin/V13` would deploy it, so this handoff does not ask for a push.

## Retest on the current hosted SHA

These can be retested now because they are already on `9d87d73a7957`:

1. RT-03. Open public booking. Expect the disabled state. Do not turn booking on.
2. RT-08. Use forgot password. Expect no SMS and no message that says an SMS was sent.
3. RT-30 and RT-32. Staff create a chart, the patient activates with the matching phone, then signs in to that clinic only.
4. RT-31. Register with a phone that has no chart. Expect no matching record and no new chart.
5. RT-28 and RT-29. Add a text section and an image section, save the draft, confirm the public page is unchanged, then publish and reload.
6. RT-44. Save vitals, correct one value, and confirm the earlier value remains.
7. RT-56 to RT-60. Move one laboratory request from collection to a verified result, and one radiology request through Open, In Progress, and All.
8. RT-64. Print the SOAP note, prescription, vitals, laboratory order and result, radiology report, and referral from the chart pages.

## Do not retest as a pass yet

RT-07. The hosted site still will not send a mailbox OTP. A testing code is not this row. Wait for a separate approval that names the sender domain, one recipient, and the pepper, then confirm the message arrives before entering the code.

## Local evidence that is not hosted acceptance

Staff OTP 8/8 twice, patient OTP 7/7 twice, recovery OTP 9/9 twice, member OTP 10/10 twice, ActiveClinic browser 36/36 twice, BlessBoard browser 23/23 twice. All of that used synthetic local accounts on the isolated database.
