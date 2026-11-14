# Portal activation review

Runtime files changed:

- `src/activeclinic/services/activeClinicPatientPortalRegistrationService.js`
- `src/activeclinic/http/activeClinicPatientPortalRoutes.js`

Registration still does not start a session. Public appointment booking was not edited. `/activate/:token` was not turned into the patient portal.

These G2 and G3 cases are prepared and were not executed:

| Case | Gate | Expected evidence |
|---|---|---|
| AC-05 live denial | Authenticated browser or HTTP | A signed-in user without `platform_administrator` receives 403 on `GET /admin/settings/test-database`, and the database is unchanged |
| Cross-clinic guest token | Disposable database | A token for organization A, posted to organization B's register route, stores no identity |
| Second activation | Disposable database | A booking that already has a portal identity rejects a second phone and stores one identity |
| Same-identity replay | Disposable database | Calling the link again does not insert a second owner |
| Phone-match claim | Disposable database | Two concurrent matches leave one `platform_identity_id` |

`PAT-01-01` stays not run. No patient row was stored in this stage.
