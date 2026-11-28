# V2134 G332 security and regression

Database: `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432`  
Hosted database writes: none  
Migration applied: no

## Isolated results

| Suite | Run 1 | Run 2 |
| --- | --- | --- |
| `npm run test:v13:contract` | 693/693 | 693/693 |
| `.v13-isolated-pg/g79-run.cjs` HTTP | 41/41 | 41/41 |
| `npm run test:v13:otp-security` | 15/15 | 15/15 |
| ActiveClinic platform browser | 36/36 | 36/36 |
| BlessBoard platform browser | 23/23 | 23/23 |
| ActiveClinic recovery OTP browser | 9/9 | 9/9 |
| BlessBoard member-login OTP browser | 10/10 | 10/10 |
| `tests/v13/unit/g332-activeclinic-login-otp.test.js` | 6/6 | 6/6 |

The G332 unit file is included in the contract count. Failures were not suppressed. Every listed suite exited 0.

## Properties covered

- Staff and patient login OTP stay off unless the isolated observer flag is set, including when `NODE_ENV=production`.
- The password check happens before a challenge. The session is created after one accepted code.
- A tampered or expired pending cookie is rejected.
- A challenge sealed for one organization is not completed for another.
- Replay and a concurrent second completion allow one success.
- A provider that does not accept delivery does not open a session.
- Existing recovery OTP still rejects a wrong code, an expired code, the wrong clinic, the wrong account, and a missing observer.
- Public booking admission stays closed in the HTTP suite. Staff appointment creation and clinical permission cases inside that suite and the ActiveClinic browser suite passed.
- Website section save and publish remain in the ActiveClinic browser suite and passed.

## Not claimed

No hosted write case was run. No real email was sent. No mobile viewport was launched. The new staff and patient code forms do not yet have their own browser spec.
