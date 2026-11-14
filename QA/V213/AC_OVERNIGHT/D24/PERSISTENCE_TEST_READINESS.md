# Persistence test readiness

`PERSISTENCE_EVIDENCE=NOT_RUN`. No patient row was inserted.

Prepared and not executed:

- `tests/v13/integration/d24-patient-portal.integration.test.js`. `runGated` returns before the body unless both write flags are set and the connection string passes the disposable-database guard. The body only submits an empty registration and expects `invalid_input`. It does not insert a patient or prove a linked identity.
- `tests/e2e/v13/v13-ac-platform-qa.spec.js` already contains a held patient register and login journey. D24 adds a held wrong-clinic registration. Both throw `NOT_RUN` until browser authorization, both write flags, and a local disposable `E2E_DATABASE_URL` are present.

What a later authorized run still has to show before PAT-01-01 can pass:

1. A staff-created patient in clinic A with no portal identity.
2. Portal registration with that patient's phone and name.
3. The same patient row now pointing at the new platform identity, and no second patient row.
4. The same registration against clinic B denied.
5. An expired token and a second use of a consumed activation denied, with the account count unchanged.

The current booking token is not single-use. A later run cannot treat two successful `verifyBookingAccessToken` reads as a passed replay test.
