# Unexpected file review

No unclassified file, secret, patient record, database dump, or migration was found in the 176-path inventory.

## Secrets and local URLs

Dirty files contain no private key, live API key, or hosted database URL that the suite is allowed to use.

Items that are present and are not production credentials:

- `V13-synthetic-qa-password` in the fixture module. It is a synthetic test value. The fixture apply path still throws before any connection when the write flags are unset.
- `postgres://127.0.0.1/...` strings in unit tests. Those calls are expected to stop at the fixture hold.
- `postgresql://postgres:postgres@127.0.0.1:5432/...` inside the V13 workflow files. Those jobs are behind `if: ${{ false }}`. The password is the local placeholder, not a hosted credential.
- A `db.blessboard.com` URL inside `v13-ci-isolation-guards.test.js`. The test asserts that the guard rejects it.

`.env.example` files exist in the repository and are not part of this dirty set. No `.sql`, dump, or SQLite file is in the dirty set.

## Product files excluded from the QA commit

These are expected leftovers from D03–D19 product work. They are unexpected only if someone treats the next commit as QA-only and then adds the whole worktree.

Forty-six modified tracked product files, including ActiveClinic OTP call sites, BlessBoard route and view edits, platform session and startup checks, and `public/blessboard/v5/apex.css`.

Fourteen untracked product files: twelve under `src/platform/otp/` and two BlessBoard public-contact modules.

No file under `db/migrations/` is modified or untracked. No scheduler or deploy workflow was added.
