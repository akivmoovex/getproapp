# Coverage quality review

No feature has a verified test. Verified would require a persisted result, the negative case, and a CI job that fails when the assertion fails. None of the 92 rows has that.

| Feature bucket | Count | Areas |
|---|---|---|
| Verified | 0 | None |
| Partial, source text only | 16 | Tenants, roles, merge, consent, encounters, nursing, notes, orders, billing, documents, retention, break-glass, offline, Juflona, BlessBoard, privacy |
| Mock only | 6 | Registration, critical acknowledgement, pharmacy, portal, appointments, OTP |
| No test for the area | 2 | Backup and restore, accessibility and monitoring |

The matrix has 84 acceptance rows and 8 supplementary rows. Twenty-two acceptance IDs appear in a test title. Sixty-two do not. An ID inside a title is not a pass. Seventeen of those titles only read source. Four call a function with a fake database. `APT-01-03` is prepared and does not run.

Portal, appointment, and OTP areas do have unit tests, in `d38`, `d47`, `d39`, `d48`, and `d14c`. Those files do not name `PAT-01`, `APT-01-01`, or `OTP-01`. The acceptance rows stay `MISSING`. The feature bucket above counts the unit files so the area is not described as untested.

A source test that proves merge, quarantine, break-glass, or Juflona is absent is partial coverage of the hold. It is not coverage of the feature.

Line coverage was not used.
