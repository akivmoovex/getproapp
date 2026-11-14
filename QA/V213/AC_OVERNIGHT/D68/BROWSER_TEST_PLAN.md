# Browser test plan

The spec is `tests/e2e/v13/v13-ac-platform-qa.spec.js`. It was not executed.

| Journey | After the hold | Pass condition |
|---|---|---|
| Administrator login | `E2E_AC_ADMIN_EMAIL` and password | Leaves `/login` and does not ask for a one-time code |
| Staff login | staff email and password | Reaches the staff home |
| Patient activation | portal fields from the run | Password is set and the session is the patient |
| Same slot | the stored slot `2026-12-01T09:00:00.000Z` to `09:30:00.000Z` | The second booking is rejected. This is not a capacity number |
| Receptionist billing | billing route | Application denial. Not AC-05 |
| AC-05 | `E2E_AC05_LOWER_EMAIL` after a real session | Both test-database URLs return 403 and hide `Test Database Management` |
| Wrong clinic | `E2E_AC_OTHER_CLINIC_KEY` | Registration does not land on clinic A |

A 303 to `/login` fails the AC-05 journey. The config must not be loaded until `E2E_DATABASE_URL` is already a guarded local URL.
