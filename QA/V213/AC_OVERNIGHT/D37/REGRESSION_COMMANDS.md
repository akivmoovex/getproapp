# Regression commands

Run these only with database URLs unset and the write and browser flags at `0`. They do not open a pool.

Fresh G1 command, the one that passed 264 on `2026-11-14T23:55:36+0200`:

```
export GETPRO_V13_ALLOW_DB_WRITES=0
export GETPRO_V13_DB_STAGES_AUTHORIZED=0
export GETPRO_V13_BROWSER_AUTHORIZED=0
export NODE_ENV=test
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
```

Portal and appointment contracts already inside that command:

- `tests/v13/unit/d24-patient-portal-security.test.js`
- `tests/v13/contract/d24-patient-portal-contract.test.js`
- `tests/v13/unit/d25-appointment-concurrency.test.js`
- `tests/v13/contract/d25-appointment-concurrency-contract.test.js`

Do not run `tests/v13/integration/*.test.js` or the Playwright configs. Those files are prepared and gated. Running them is not part of this baseline.

Shared platform surfaces to preserve while editing: `v5Csrf.js`, `sharedSessionSecurity.js`, `sharedTenantScope.js`, `src/platform/otp/` with activation blocked, and `auditEventService.js`. BlessBoard must keep its own roles and must not query clinical patient tables.
