# Laptop continuation

Repository: `https://github.com/akivmoovex/getproapp.git`

```bash
git clone https://github.com/akivmoovex/getproapp.git
cd getproapp
git fetch origin
git switch V13
git pull --ff-only origin V13
npm ci
```

If `V13` is already checked out on the laptop:

```bash
git status --short
git fetch origin
git rev-parse HEAD origin/V13
git pull --ff-only origin V13
```

Stop if `git status --short` shows laptop changes you have not reviewed. Do not reset, stash, or force-push to clear them.

Node must be `>=20`. This checkpoint was checked with Node `v22.23.1` and npm `10.9.8`. G1 does not open PostgreSQL. This machine has PostgreSQL `16.2`, and that server is not required for the command below.

```bash
export NODE_ENV=test GETPRO_V13_ALLOW_DB_WRITES=0 GETPRO_V13_DB_STAGES_AUTHORIZED=0 GETPRO_V13_BROWSER_AUTHORIZED=0
unset DATABASE_URL TEST_DATABASE_URL E2E_DATABASE_URL
node --test --test-concurrency=1 \
  tests/v13/contract/*.test.js \
  tests/v13/unit/*.test.js \
  tests/v13/quality/d17-mutation-probes.test.js \
  tests/shared-website-section-lifecycle.test.js \
  tests/bb05-hq-add-member-csrf-contract.test.js \
  tests/v211-hq-add-member-get.test.js \
  tests/v213-version-initialization.test.js \
  tests/v2-02-platform-admin-rbac-convergence.test.js
npm run lint:css
```

Names only, with no values: `NODE_ENV`, `GETPRO_V13_ALLOW_DB_WRITES`, `GETPRO_V13_DB_STAGES_AUTHORIZED`, `GETPRO_V13_BROWSER_AUTHORIZED`, `DATABASE_URL`, `TEST_DATABASE_URL`, `E2E_DATABASE_URL`, `GETPRO_V13_CI_RUN_ID`, `DATABASE_IDENTITY_ENV`, `GETPRO_TEST_DB`. G2 and G3 stay off unless a later approval sets the write and browser flags. Logs under `/tmp` are local and are not in Git.
