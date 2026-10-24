# V211-BB-QA113 Member Activation Runtime

## Executed results

Using the QA105 authoritative tenant host and a fresh supported V5 HQ session:

- `GET /hq/members`: `200`
- `POST /hq/members/:id/approve`: `303`
- member status: `pending` → `active`
- primary branch membership: `pending` → `active`
- `GET /member/invite/accept`: `200`
- `POST /member/invite/accept`: `303` to `/login?next=/member/dashboard`
- account binding: created platform user UUID and persisted `members.user_id`
- membership approval remained independent
- invitation was consumed

Acceptance left `portal_access_status=not_activated`; no staff or HQ role was
assigned.

## Blocker

The subsequent canonical member login POST returned `400`, after the
acceptance redirect. The member account exists and is active with the
expected synthetic email, but the current fresh-process login harness did not
complete the canonical member login. Member Portal dashboard authorization
was therefore not claimed.

Replay, expiry, revocation, concurrency, cross-tenant, pending/suspended,
blocked-account and browser checks were not executed after this blocker.
No direct SQL state update was used; read-only SQL was used for verification.
