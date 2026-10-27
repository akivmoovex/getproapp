# V211-BB-QA147 Staff Login Transfer

## Contract

The supported flow is:

1. Tenant `GET /login?next=/hq` creates a one-time tenant login transfer and
   returns `303` to apex `/login?tr=...`.
2. Apex `GET /login?tr=...` validates the pending transfer, issues the apex
   CSRF token/cookie, and renders the login form.
3. Apex `POST /login?tr=...` validates the apex CSRF cookie/form pair and
   credentials, then returns `303` to the tenant
   `/auth/callback?code=...`.
4. Tenant `GET /auth/callback?code=...` consumes the one-time code, creates a
   tenant-scoped session, and returns `303 /hq`.

Relevant implementation:

- `src/platform/http/v5FoundationServer.js`: tenant login initiation,
  apex credential POST, and callback handling.
- `src/blessboard/http/tenantLoginHelpers.js`: tenant/apex destination
  validation and `/hq` post-login resolution.
- `src/platform/services/authTransferService.js`: transfer creation,
  authorization, one-time redemption, and host-scoped session creation.

## Execution

Read-only database verification showed the QA146 activated user was `active`
with an active `organisation_administrator` assignment scoped to the expected
organization. The invitation acceptance had already completed in QA146.

The canonical transfer was then executed with the existing synthetic
credential:

- tenant login entry: `303`
- apex login form: `200`, CSRF issued
- apex credential POST: `303`
- tenant callback: `303 /hq`
- tenant HQ dashboard: `200`
- anonymous tenant HQ request: `401`

No raw transfer token, password, or session cookie was written to logs or this
report.

QA146's direct tenant `/login` POST `400` is classified as
`WRONG_LOGIN_ENDPOINT`: tenant login is redirect-only and credentials are
accepted by the apex form. It is not evidence of an activated-account or
CSRF product defect.

Wrong-tenant authenticated access and Playwright browser end-to-end coverage
were not executed in this run. No product source, migration, reset, protected
database mutation, commit, push, or deployment was performed.
