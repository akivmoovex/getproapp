# G2, G3, and G4 blockers

G2 execution is `NOT_RUN`. Both write flags are `0` and no disposable URL is set. `runGated` returns `NOT_RUN`. Fixture apply throws `V13_FIXTURE_HOLD`. If the gate were opened, `d25-appointment-concurrency` still throws `APT-01-03_NOT_IMPLEMENTED`.

G3 execution is `NOT_RUN`. The browser flag is `0`. The ActiveClinic Playwright config throws without `E2E_DATABASE_URL`. The seven tests call `hold()` first. AC-05 has no authenticated HTTP 403. Portal activation has no stored account link. Appointment concurrency has no competing sessions.

G4 has no job and was not run. Operational restore, retention, and offline writes have no drill. The AC-05 plan is `persisted: false`. ActiveClinic fixtures mint `ac-hqa-` clinics, not the `v13d19` plan keys.
