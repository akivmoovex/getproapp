# Provider readiness

No provider is approved or activated.

| Adapter | State |
|---|---|
| Default | `inactive`, `deliveryActivated: false`, `contactsNetwork: false` |
| Fake | Returned only for a verified testing identity. It does not open a network client |
| Email | `GETPRO_OTP_EMAIL_PROVIDER` is unset. Named vendors such as Sendgrid are in the unapproved set |
| SMS | `GETPRO_OTP_SMS_GATEWAY` is unset. Twilio and the other named gateways return `provider_not_selected` |
| Zambia destination | The SMS interface accepts only `+260` followed by nine digits, and only after a provider is selected |

`createOtpService` refuses a provider object that sets `deliveryActivated: true`.

Approval still required before any provider work:

1. Choose an email vendor and an SMS vendor. Do not treat the interface name as a selection.
2. Confirm the Zambia route and the `+260` format with that vendor.
3. Put credentials outside the repository.
4. Keep `deliveryActivated` false until the migration and the release check both exist.
5. Prove a failed dispatch does not create a session. The current inactive dispatch returns `delivery_not_activated`.

This stage did not send email or SMS.
