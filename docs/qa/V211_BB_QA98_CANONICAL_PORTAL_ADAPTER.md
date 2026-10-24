# V211-BB-QA98 Canonical Portal Adapter

## Result

The requested canonical adapter already exists in the V2.11 portal route
stack; no additional product code was necessary.

`src/blessboard/http/memberPortalRoutes.js` and the related member feature
routers use `createRequireActiveMember` from
`src/blessboard/http/requireActiveMember.js`. That middleware consumes the
canonical `req.v5Session.session.userId`, resolves the tenant server-side,
and calls `requireActiveMemberForTenant`.

That service requires:

- active canonical platform user;
- active church;
- active tenant branch belonging to the church;
- canonical `members.user_id` binding within the church;
- active member branch membership;
- non-blocked portal access.

It places the resolved UUID member and membership in
`req.blessBoardMemberAccess`; it does not accept browser member, church or
branch IDs and does not create the legacy numeric `churchMember` session.

## Route inventory

V2.11 canonical routes include `/member/dashboard`, `/member/profile`,
`/member/giving`, `/member/events`, `/member/ministries`,
`/member/announcements`, and member forms/requests. They use UUID-aware
BlessBoard services. Legacy `src/routes/church/memberPortal.js` remains
separate and unchanged.

Pending, suspended, unbound, wrong-tenant, wrong-branch and blocked members
fail closed. Admin/staff roles do not grant member access.

## Verification

Source inspection and JavaScript syntax checks pass, and `git diff --check`
passes. No database or migration operation was executed. Runtime database
verification and browser verification remain required.
