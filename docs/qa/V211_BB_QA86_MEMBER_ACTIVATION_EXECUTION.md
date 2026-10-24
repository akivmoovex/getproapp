# V211-BB-QA86 Member Activation Execution

## Environment

- Branch: `qa-v211-overnight-20261017`
- HEAD: `93833a15c8543cf14e059b5cf1cbdf231240421d`
- Database: `getpro_v211_qa_disposable_03`
- Identity/environment: `moovex-platform-v7` / `testing`
- No reset, migration, truncation, production change, commit, or push

## Actual Add Member workflow

The current V2.11 routes were identified in
`src/blessboard/http/hqMembersAdminRoutes.js`:

- `GET /hq/members/new`
- `POST /hq/members/new`
- `POST /hq/members/new/match`
- `POST /hq/members/new/review`

The authenticated HQ administrator successfully opened
`GET /hq/members/new` with HTTP `200` and received the normal Add Member form,
CSRF token, and active branch selector.

A real CSRF-protected `POST /hq/members/new` was attempted with unique
synthetic full name, email, phone, and the QA75 HQ branch ID. The route
returned HTTP `400` and stayed on the form; no draft token was produced.
The follow-up review request therefore returned HTTP `403` with
“This member draft is no longer available.”

No member, invitation, activation, or account-binding record was created.
No direct SQL activation or legacy schema access was used.

## Blocker

The Add Member form submission is currently failing V2.11 validation before
the match/review flow produces a draft token. The exact field-level validation
message needs to be captured from the returned form model/source to continue;
without a draft token the supported `POST /hq/members/new/review` cannot
execute. Invitation acceptance and portal access were not claimed.

Browser verification was not run.
