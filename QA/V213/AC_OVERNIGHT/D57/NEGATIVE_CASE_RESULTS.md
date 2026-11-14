# Negative case results

| Case | Negative input | Result |
|---|---|---|
| Consent | Body organization differs from the trusted organization | `forged_tenant`, and the query count stays 0 |
| Facility | The organization parameter is the other clinic | The function returns null. The SQL parameters are the facility id and that other organization |
| Appointment | A staff id with an existing appointment row | `{ kind: "appointment", id: "appt-1" }` |
| Portal | Empty organization, password `too-short`, phone `12` | `invalid_input`, `weak_password`, `invalid_input` |
| Encounter | Type `inpatient` | `invalid_input` and no encounter |
| Document | The row’s patient is not the caller | `not_found`. The narrative is absent from the result |
| Payment | Product query returns no row | `access_denied`. `connect` is not called |
| CSRF | Other token, empty body, or the token stored under the BlessBoard cookie name | `false` |
| OTP | Exact expiry instant, a second use, and purpose `password_recovery` | `expired`, `replay`, `wrong_purpose` |

The document owner’s own read returns the narrative. The OTP one millisecond before expiry returns `verified`. Those are the matching positive cases. No unimplemented feature was given a successful mock.
