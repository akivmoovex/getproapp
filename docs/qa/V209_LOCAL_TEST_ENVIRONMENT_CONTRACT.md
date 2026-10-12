# V2.09 Local QA Environment Contract

## Canonical launcher

Playwright starts `scripts/local/run-local-qa-server.js`. It resolves the
repository root, loads the ignored `.env.test.local`, validates the local
database and identity before spawning `index.js`, then polls `/healthz` with a
bounded condition-based timeout. Signals are forwarded for graceful cleanup.

Effective precedence is: values from `.env.test.local` override inherited
process values; launcher-enforced `NODE_ENV`, `PORT`, and `HOST` override both.
Conflicting database/profile values cannot silently select another environment.

Required contract:

- `NODE_ENV=test`
- `PLATFORM_DEPLOYMENT_CODE=moovex-platform-testing`
- `DEPLOYMENT_ENV=testing`
- `DATABASE_URL` on localhost for `getpro_v209_unified_e2e_test`
- `DATABASE_IDENTITY_EXPECTED=moovex-platform-v7`
- `SESSION_SECRET`
- `PORT=4319` (or an explicitly supplied test port)

The launcher performs read-only identity verification and rejects missing,
non-local, wrong-name, wrong-profile, or wrong-identity configuration before
application startup. Secrets are not logged.

## Verification

- Startup/shutdown cycles: 5/5 PASS.
- Database identity: `moovex-platform-v7/testing`.
- Database host: local only.
- Health readiness: PASS in every cycle.
- AC/BB route navigation: not run in this infrastructure-only change.
- Negative unsafe-target checks: validation branches are enforced; no unsafe
  target was contacted.

Run Playwright with `npm run test:ui`. Node integration launchers should use
the same `.env.test.local` contract and must not inherit an alternate
`TEST_DATABASE_URL`.

Remaining limitation: browser registration/authentication remains a separate
workflow and is not claimed by this environment contract.
