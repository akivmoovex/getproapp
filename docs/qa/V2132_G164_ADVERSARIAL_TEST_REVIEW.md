# G164 adversarial review

Reviewed the tests added or extended in this cycle.

| Question | Patient search | Phone duplicate | Member directory |
| --- | --- | --- | --- |
| Could it pass without saving? | No. The patient number is read from the created page and must match `AC-`. | No. SQL count is 1 for that number. | No. The created page must show the stamp and a `CH-` id before search. |
| Could it pass for the wrong person? | The last name and number are unique to the stamp. A missing number must not show the new number. | The find list must contain the number and last name. | Search uses the stamp. A nonsense query must not show the email. |
| Could it pass without a session? | Logout is followed by `/app/patients`, which must be the login URL, and the number must be absent. | The search runs while signed in, after a create that only a signed-in admin can finish. | Logout must send the next member form to login and the form count must be 0. |
| Could a forbidden write succeed? | Logout does not post a patient. | Count after search is still 1. | Logout is a POST to `/hq/logout` only. |
| Could a stale CSRF pass? | Logout is a GET `/logout`. | No CSRF change. | A token captured before create returned 403 in a probe. The passing test reads the token from the current shell. |
| Could a mock bypass the app? | No. The browser uses the local app and the disposable database. | The count uses the authorized client against that database. | No. |

Selectors are role names, field names, and existing data attributes (`data-ac-patient-number`, `data-ac-find-matches`, `data-bb-hq-logout`). No fixed sleep was added.

Screenshots from failed probes stay in local test-results and are not committed. They show synthetic names only. No production integration flag was turned on.

The member test does not claim that page 1 of an 81-member directory shows the newest row. Search is the assertion, which matches last-name ordering.

Remaining weak spots, left open on purpose:

- Consultation signing can still pass nowhere because it is not in this browser file.
- A stocked dispense is not proven by the pharmacy denial.
- AC-05 checks GET denial. There is no POST mutation route on that path in `platformAdminRoutes.js`.
