# G218 browser QA execution guide

Run this from `/Users/akivsolomon/Development/getproapp-v13` on branch `V13`.

## Community Benefits browser

```bash
npx playwright test --config=playwright.v13-ac-community.config.cjs
```

The config listens on `127.0.0.1:4191` and starts `tests/e2e/v13/communityBenefitsServer.cjs`. The server injects the memory store. It does not open PostgreSQL. A pass is `BROWSER_MOCK_BACKED`.

This cycle passed 8 tests twice. The tests submit forms and check the resulting status, eligibility, disclosure, link text, or error. A page load is not the assertion.

Do not point this config at the disposable database runner. Do not record the result as `BROWSER_POSTGRES_E2E`.

## Existing ActiveClinic browser

```bash
node .v13-isolated-pg/g80-playwright.cjs ac
```

This uses the disposable database on `127.0.0.1:55432` / `getpro_v13_e2e_g78d2301`. This cycle passed 30 tests twice. It does not exercise Community Benefits tables.

## Existing BlessBoard browser

```bash
node .v13-isolated-pg/g80-playwright.cjs bb
```

This cycle passed 23 tests twice. Run it only after the ActiveClinic browser process has exited.

## What a failure means

A community failure means the route or page outcome changed. An ActiveClinic or BlessBoard failure means an existing regression changed. Do not skip either failure. Do not repair a community failure by creating tables in the disposable database.
