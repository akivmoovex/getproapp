# Test defect detection

| Defect | Test that fails |
|---|---|
| Consent grant queries before rejecting a forged organization | Forged consent tenant |
| Facility lookup drops `organization_id` from the parameters | Facility parameters |
| Staff overlap returns no collision while an appointment row exists | Staff collision |
| A missing availability table hides an appointment collision | Staff collision |
| Registration queries with no organization, a short password, or a bad phone | Portal registration |
| The password is copied onto the registration error | Portal registration |
| `inpatient` starts an encounter | Encounter type |
| A document read returns another patient’s `body_text` | Document body |
| A missing document becomes a successful document | Document body |
| Payment opens a connection when the product row is absent | Payment denial |
| The payment note is copied into the denial | Payment denial |
| ActiveClinic CSRF accepts another cookie name or a mismatched body | CSRF pair |
| OTP verifies at `expiresAt`, or the public object contains the code | OTP boundary |

The 56 source-contract cases counted in D55 are still in the tree. A passing source comparison still does not prove a stored row. Live AC-05, a second stored tenant, and the payment duplicate key are not in this file.
