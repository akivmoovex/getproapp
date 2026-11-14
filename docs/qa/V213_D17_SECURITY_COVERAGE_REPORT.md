# V2.13 D17 security coverage

## Repair

`POST /app/select-organization` in `src/activeclinic/http/activeClinicAppRoutes.js` issued a new session cookie without `otpWorkflow`. The login and `/login/select-organization` paths already passed `activeclinic.staff_login`. The app switch now passes the same workflow, organisation id, and account id. While production activation stays `BLOCKED`, the gate still allows the existing session. When activation is later turned on, this path cannot skip OTP.

The password-change refresh in `activeClinicAuthRoutes.js` remains untagged. It refreshes a session that has already authenticated, and the scanner allows only that call.

## Executed negatives

- Production OTP rejects `1234` and a fake provider. Testing accepts `1234` only for the verified testing identity. An `ACTIVE` override on a production signal stays `BLOCKED`.
- A login verification cannot complete password recovery.
- A second worker with a new in-memory service cannot verify the first worker's challenge. That demonstrates the restart gap. It is not a distributed store.
- CSRF missing and foreign tokens fail on a real Express form. The matching cookie and body token succeed.
- Cashier organisation scope, receptionist without a facility, organisation admin at facility scope, and a staff id from another organisation are denied before an assignment insert.
- Directory enquiries keep the route's church id.
- Visible homepage text uses `<%= _value %>`. Attribute values go through `_escAttr`.

## Still blocked

AC-05 live lower-privilege denial, INV-01 first login, authenticated cross-tenant browser sessions, OTP database persistence, and production OTP activation. In-process denials do not close AC-05.
