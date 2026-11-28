# V2134 G331 security regression

Executed on the isolated database except for the hosted booking GETs. No hosted POST was sent.

| Control | Evidence this session |
| --- | --- |
| Public booking closed | Unit decision matrix. HTTP AC-PUB-01 GET, POST, JSON submit, procedure submit, and patient-cookie submit return 403. Request count unchanged. Hosted GET on two clinics returns 403 |
| Clinic flag cannot open booking | Unit test with the flag true and the platform value unset stays closed. Service create calls make zero queries |
| Production deployment stays closed | Unit test with production deployment signals returns closed even when the value is `enabled` |
| Unknown clinic | Local and hosted GET return 404 and no wizard |
| Staff scheduling | `createAppointment` is outside the admission module. D25 overlap test passed inside both HTTP runs. ActiveClinic browser still creates one staff appointment and rejects the overlapping second |
| OTP replay and expiry | ActiveClinic and BlessBoard OTP browsers reject expired codes and allow one completion |
| OTP rate limit | BlessBoard OTP browser keeps the session closed when the limit is hit |
| Cross-clinic OTP | ActiveClinic browser rejects the wrong clinic, product, and account. BlessBoard browser rejects cross-tenant verification |
| Session before OTP | Both OTP suites assert the session stays closed until the code is accepted |
| CSRF | BlessBoard browser BB-MEM-02 passed in the platform run: a missing token is rejected |
| Tenant and role denial | ActiveClinic browser includes receptionist denials for clinical, pharmacy, laboratory, and billing routes, plus a foreign-clinic refusal |
| Patient identity | Portal activation and PAT-01 passed in the ActiveClinic browser run. Unmatched public registration remains a refusal |
| Financial posting | Not enabled. No payment was posted |
| Schema | No migration file was added. Hosted `schemaCompatible=true` is the existing V7 check |
| Secrets in logs | OTP tests use the observer fixture. No Resend key was present to leak |

Ambiguous OTP bindings fail closed. A missing observer challenge does not sign the user in.
