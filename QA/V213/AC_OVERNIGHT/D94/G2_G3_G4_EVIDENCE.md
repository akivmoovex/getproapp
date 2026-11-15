# G2, G3, and G4 evidence

G2 executed 0. Both write flags are `0` and no database URL is set. Portal activation has no stored row. Appointment capacity has no competing sessions. Clinical, billing, and document checks have no persisted result. Restore was not drilled.

G3 executed 0. The browser flag is `0`. The seven Playwright tests stop in `hold()` and were not launched. AC-05 has no authenticated HTTP 403.

G4 has no workflow job. It was not run.

A planned restore, a prepared Playwright file, and a mocked denial are not evidence for those gates.
