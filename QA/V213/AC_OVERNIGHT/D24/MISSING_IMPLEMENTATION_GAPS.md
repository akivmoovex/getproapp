# Missing implementation gaps

No product change was made. These gaps stay open.

| Case | Gap |
|---|---|
| PAT-01-01 | Phone match and guest-token linking exist. The V2.12 pass artifact is still missing. This stage did not store a patient or a portal identity |
| PAT-01-02 | Organization scope is enforced in the phone query and in `linkGuestBookingToPatient`. It was not executed against a database |
| PAT-01-03 | Expired and revoked guest tokens are denied. A valid token can be read again. There is no single-use activation consume that prevents a second account |
| ID-01-02 | Duplicate policy blocks an exact identifier and does not auto-merge. Merge permission remains unassigned. No review workflow was executed |
| ID-01-03 | Phone match proceeds without a national ID. An approved alternate-identifier rule for a patient who has neither phone nor national ID was not found |
| OTP-01 and OTP-02 | Production OTP stays blocked. Patient login still reaches session issuance when activation is blocked. No provider was turned on |
| Registration enumeration | The register page uses different text for an existing phone, no patient, and several patients. Login uses one failure message |

Public booking remains independent of portal activation. `/activate/:token` remains the staff route.
