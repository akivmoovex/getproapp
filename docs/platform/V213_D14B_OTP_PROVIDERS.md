# V13 D14B — OTP email and SMS providers

Status: adapters are implemented. No paid provider is selected. No real message is sent.

BlessBoard and ActiveClinic keep the single OTP engine from D14A. Delivery is a provider argument, not a second engine.

## Configuration

| Variable | Meaning |
|---|---|
| `GETPRO_OTP_PROVIDER` | `inactive` (default), `fake` (verified testing only), or `interface` |
| `GETPRO_OTP_EMAIL_PROVIDER` | `interface`, or unset. A commercial name is refused |
| `GETPRO_OTP_SMS_GATEWAY` | `interface`, or unset. A commercial name is refused |
| `GETPRO_OTP_ALLOW_FIXED_CODE` | Required with the rest of the D14A testing identity before `fake` is used |

API keys may exist in the process environment for a future adapter. This build does not read them into provider objects, audit events, or log lines.

`GETPRO_OTP_PROVIDER=fake` in production fails startup with `otp_test_config_forbidden`. The fake adapter also refuses the call when the testing identity is incomplete.

## Adapters

| Adapter | Behaviour |
|---|---|
| Inactive | Default. Reports `delivery_not_activated`. Does not call a transport |
| Fake | Accepts only `1234` under the verified testing identity. No network. No HTTP route |
| Email interface | Calls an injected transport. Without one, reports `provider_not_configured` |
| SMS interface | Same, and only for a Zambia `+260` E.164 number |

Commercial names, including Twilio, Infobip, Africa's Talking, Zamtel, MTN, Airtel, SES, SendGrid, Mailgun, Postmark, and SMTP, return `provider_not_selected`. No SDK is loaded.

## Delivery behaviour

- Timeout and unavailable responses retry up to three attempts.
- A rejection is not retried.
- Each provider and channel is capped at 30 attempts an hour.
- The message is `Your verification code is <code>. It expires in 5 minutes.`
- The message has no church name, member data, patient data, or clinical text.
- Audit rows record provider name, channel, reason, and attempt count. They omit the code, the destination, the message, and credentials.
- A failed delivery does not complete a session.

## Zambia SMS

National numbers such as `0977123456` normalize through the shared phone service to `+260977123456`. A leading trunk zero is not stored. Numbers that are not Zambia `+260` with a 9-digit national number are rejected before any adapter runs. International numbers parsed as another country are rejected even when the form defaults to Zambia.

A future Zambia gateway still has to decide sender-ID registration, on-net versus off-net routes, and character encoding. Those choices are not made here.

## Monitoring

Watch `otp.delivery` audit events:

| Reason | Meaning |
|---|---|
| `delivery_not_activated` | Default inactive provider |
| `fake_accepted` | Testing fake provider accepted the fixed code |
| `fake_forbidden` | Fake provider saw a production or unverified identity |
| `provider_not_selected` | Config named a gateway that is not approved |
| `provider_not_configured` | Interface selected without an injected transport |
| `timeout` | Transport timed out after the retry budget |
| `provider_rate_limited` | Provider cap reached |
| `zambia_destination_required` | SMS destination was not `+260` |
| `accepted` | Injected transport reported success |

## Remaining decisions

No commercial email or SMS provider has been approved. Do not set a live gateway until privacy review covers the message template, credential storage, Zambia sender ID, and delivery retention. There is no bypass endpoint and no production path that returns the OTP.
