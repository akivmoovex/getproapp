# V2.13.2 G186 OTP session security

Verification is not authentication. `verifyChallenge` returns `sessionComplete: false`. `evaluateOtpSessionGate` calls `completeProtectedAction` and allows the session only when that call returns `sessionComplete: true`. A second completion returns false. A wrong code, an expired code, a consumed code, and a database failure do not set a cookie through `issueAuthenticatedSessionCookie`.

Production activation stays `BLOCKED` even when the override is `ACTIVE`. While activation is blocked, `holdIfOtpRequired` returns null and the existing login path continues. That is the current disabled state, not a new bypass.

| Flow | Workflow | While OTP is blocked |
| --- | --- | --- |
| BlessBoard HQ, branch, church, unified, and member login | `blessboard.*_login` | Existing session path |
| BlessBoard password recovery | `blessboard.forgot_password` | Existing recovery path. No OTP message |
| BlessBoard member activation | `blessboard.member_activation` | Existing invitation path |
| BlessBoard role change | `blessboard.role_permission_change` | Existing role assignment |
| ActiveClinic staff and administrator login | `activeclinic.staff_login`, `activeclinic.clinic_administrator_login` | Existing staff session |
| ActiveClinic patient login | `activeclinic.patient_login` | Existing portal session |
| ActiveClinic staff and patient recovery | `activeclinic.forgot_password`, `activeclinic.patient_forgot_password` | Delivery remains unavailable |
| ActiveClinic patient portal activation | `activeclinic.patient_portal_activation` | Not public booking |
| ActiveClinic role and patient-account changes | `activeclinic.staff_role_change`, `activeclinic.patient_account_action` | Existing authorization path |

When a test sets activation to `ACTIVE` and passes one shared service, the gate issues a challenge, rejects a wrong code with no session, accepts one correct code, and rejects the replay. The correct code still has to match the product, organization, account, and purpose. Pre-auth responses stay `{ ok: true, status: "accepted" }` so an unknown account is not revealed. No provider was activated.
