# Isolation safety

No database is selected. `DATABASE_URL`, `TEST_DATABASE_URL`, and `E2E_DATABASE_URL` are unset. Both write flags and the browser flag are `0`. `GETPRO_V13_CI_RUN_ID` is unset.

The guard refuses a non-local host and any URL containing `hostinger`, `pronline.org`, `blessboard.com`, `activeclinic`, `amazonaws.com`, `neon.tech`, `supabase.co`, `railway.app`, or `render.com`. It also refuses `getpro_ci`, `getpro_bb_browser_ci`, `blessboard_foundation_test`, `postgres`, `production`, `prod`, and `shared_qa`.

The browser base URL is `127.0.0.1` on port 4187. Playwright retries are 0. CI Stage B and Stage C stay `if: ${{ false }}`. These workflows do not deploy. Production OTP is excluded.

After a future authorized run, evidence for each scenario is the test id, fixture key, organization id, database name, commit SHA, assertion, pass or fail, transaction or rollback result, run id, and the trace path. A `NOT_RUN` from `runGated` is not that evidence.
