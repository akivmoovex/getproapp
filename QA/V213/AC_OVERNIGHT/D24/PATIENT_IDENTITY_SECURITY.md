# Patient identity security

In-process checks used a query double. No database connection was opened.

| Boundary | Existing behavior | This run |
|---|---|---|
| Staff profile without a portal | `requiresPortal` is false | Confirmed in process |
| Phone | Zambia `977000333` normalizes to `+260…`. `123` is rejected | Confirmed in process |
| National ID | Phone match does not take a national ID. Exact `national_id` duplicate policy returns `BLOCK` and does not auto-merge | Policy confirmed. No stored patient |
| Duplicate portal phone | `identity_already_exists` before a patient update | Confirmed in process |
| Duplicate patient rows | `ambiguous_patient_match` | Confirmed in process |
| Already linked patient | `patient_already_linked` | Confirmed in process |
| Name mismatch | `no_patient_match` with `name_mismatch` | Confirmed in process |
| Other organization | The patient query is scoped. Another organization returns `no_patient_match`. A guest booking in another organization returns `invalid_guest_token` before the booking update | Confirmed in process |
| Expired or revoked guest token | Denied before `last_used_at` is written | Confirmed in process |
| Unknown guest token | `token_invalid` | Confirmed in process |
| Valid token read twice | Both reads succeed. The row is not revoked | Replay consumption is absent |
| Login enumeration | One failure message | Present in the route |
| Registration enumeration | Distinct messages for an existing phone, no patient, and several patients | Present in the route. Not changed |
| Session after registration | Redirect to login. No session cookie in the register handler | Confirmed from the route |
| OTP | Production override stays `BLOCKED` | Confirmed. Provider not activated |

The registration page tells a visitor whether a phone already has an account. The login page does not. That difference is recorded and was not altered.
