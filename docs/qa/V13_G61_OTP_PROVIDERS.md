# V13 G61 — OTP provider interfaces

`src/platform/otp/otpProviders.js` already selects `inactive`, testing `fake`, or a provider-neutral `interface`. Unnamed vendors such as Twilio stay `provider_not_selected`. The interface does not load a network client. A production signal turns `fake` into the inactive provider. A missing provider returns `delivery_not_activated`.

No SMS or email vendor was selected. No credential was added. No message was sent. Zambia destination checking remains inside the existing interface adapter and was not given a new carrier schema.

```
EMAIL_OTP_PROVIDER_INTERFACE=CONFIGURATION_PENDING
SMS_OTP_PROVIDER_INTERFACE=CONFIGURATION_PENDING
TESTING_OTP=FAIL_CLOSED
PRODUCTION_OTP_DELIVERY=NOT_ACTIVATED
```
