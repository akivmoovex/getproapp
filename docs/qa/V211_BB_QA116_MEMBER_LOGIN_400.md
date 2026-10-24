# V211-BB-QA116 Member Login HTTP 400

## Root cause

The canonical unified-login service accepted member statuses `pending` and
`verified`, but not the `active` status produced by the new HQ approval route.
The approved QA87 member therefore authenticated with valid credentials but
was rejected by local member-role validation and rendered the generic login
error with HTTP 400.

## Correction

The member-role validator now accepts `active` as an authorized member state
and maps it to the existing verified member session contract. No password,
tenant, CSRF, or authorization checks were weakened. The existing branch and
church ownership checks remain in force.

## Verification

- Branch: `qa-v211-overnight-20261017`
- Base HEAD before this change: `93833a15c8543cf14e059b5cf1cbdf231240421d`
- Account status: active
- Bound member account: verified by read-only database inspection
- Password authentication: the prior runtime supplied the accepted password
  through the invitation acceptance process; no password or hash is recorded
  here.
- CSRF: login route uses the existing canonical login contract.
- Product correction: required

The disposable runtime login request should be rerun after the correction to
verify session creation and member dashboard access. No database reset,
invitation reissue, protected-database access, commit, push, or deployment was
performed.
