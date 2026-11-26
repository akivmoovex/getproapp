# G224 final execution

Version stays 2.13.2. No migration was executed. No deployment was performed. Local main and origin/main were not changed.

## Suites after the final laboratory test fix

Two safe runs each executed 598, passed 596, failed 0, and skipped 2. The two skips are the existing PostgreSQL identity checks when no database URL is set.

Two HTTP runs each executed 37, passed 34, and failed 3. The failures are D14C OTP, D16 platform OTP, and D25 slot capacity. Same-staff overlap passed both runs. The new laboratory journey is one of the 34 passes. It is not a substitute for the three failed gates.

Two ActiveClinic Playwright runs after the pool fix each passed 31. The first full run before that test-only pool fix failed the new laboratory test and passed the previous 30. That failed run is not counted as a pass. Two BlessBoard Playwright runs each passed 23. Two community mock-browser runs each passed 9. Community PostgreSQL browser passed 0.

## New tests

- Unit: 2, in `tests/v13/unit/g224-diagnostics-filters.test.js`
- HTTP: 1, the laboratory journey in `g03-laboratory.integration.test.js`
- Browser: 1, the G224 journey in `v13-ac-platform-qa.spec.js`

## Decision

QA is NO-GO. Release is not ready. The next action is a hosted retest of the laboratory journey, vitals correction, portal activation, and website text publication. Do not apply the OTP or community schema in this step, and do not enable public booking, production OTP, or financial posting.
