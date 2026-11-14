# Shared platform isolation

BlessBoard and ActiveClinic share the OTP engine, the session cookie helper, and the CSRF check. They do not share clinical permissions through that engine.

Each workflow carries `blessboard` or `activeclinic` and an action such as `auth.login` or `admin.role_change`. None of the actions is an `activeclinic.patient.*` or `blessboard.*` permission key. `activeclinic.public_booking` is not registered. Portal activation stays independent of booking.

The OTP modules do not query `activeclinic.patients` or BlessBoard member tables. A challenge is bound to `productCode`, `organizationId`, and `accountId`. Verification with another organization returns `cross_tenant` on the same store.

Patient login still calls `validateCsrf` before `issueAuthenticatedSessionCookie`. The OTP gate source has no CSRF skip. While activation is blocked, the gate allows the existing session path. That is the held mode, not a second login.

BlessBoard role assignment still rejects a church-scoped platform administrator before a query. OTP does not replace that check.
