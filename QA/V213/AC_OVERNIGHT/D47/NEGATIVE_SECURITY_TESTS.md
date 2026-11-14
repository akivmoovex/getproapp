# Negative security tests

`tests/v13/unit/d47-patient-portal.test.js` and `tests/v13/contract/d47-patient-portal-contract.test.js` cover the new checks. They use an in-memory query double. They are not a stored-row pass.

| Case | Result |
|---|---|
| Reset with no clinic | `invalid_input`, no query |
| Reset token stored for another clinic | `token_invalid`, one select, no password write |
| One-time consume matches nothing | `token_already_used`, no identity update |
| Phone registration with a non-UUID clinic | `invalid_input`, no patient query |
| Registration page | Still has no session issuance, and still has the three distinct outcome sentences |

D24 and D38 portal tests were run with these and passed.
