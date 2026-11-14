# Patient portal persistence plan

Persistence was not run.

The synthetic patient in `buildActiveClinicFixturePlan` is Pat Ient, phone `+260977000222`, email `patient-a@v13d19.example`. Staff-created patients still do not require a portal.

When a disposable database is authorized, the cases are:

| Case | Expected stored result |
|---|---|
| Phone match in clinic A with the same first and last name | One portal identity, linked to that patient, then a redirect to login with no session cookie |
| Same phone posted again | `identity_already_exists` and still one identity |
| Guest token from clinic A posted to clinic B | `invalid_guest_token` and no new identity |
| Second phone on a booking that already has a portal owner | `link_conflict` and one owner |
| Same identity linking the same booking again | Success and no second owner row |
| Weak password | `weak_password` and no query |

Public booking lookup may still read a valid token twice. That replay is not portal activation. Do not revoke the booking token to make the portal test pass.

The V2.12 pass sentence is not evidence. `PAT-01-01` stays not run until a row is stored in the disposable database.
