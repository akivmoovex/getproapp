# V211-BB-QA96 Login and Portal Integration

## Implemented

- Canonical tenant login now preserves a strictly allowlisted local
  `/member/...` destination through the login form.
- `runTenantUnifiedLoginPost` redirects to that local destination only after
  normal authentication, session regeneration, and role-session setup.
- External URLs, protocol-relative URLs, and arbitrary paths are rejected.
- Existing role-based admin/staff destinations remain the default.
- Invitation acceptance continues to redirect to `/login?next=/member/dashboard`
  without carrying the invitation token.

## Call graph

`POST /login` → `runTenantUnifiedLoginPost` →
`authenticateTenantUnifiedLogin` → `regenerateSession` →
`applyRoleSession` → allowlisted member destination or
`destinationForRole`.

## Remaining limitation

The legacy member portal middleware still consumes the `churchMember` session
shape from `src/church/memberAuth.js`, while canonical login establishes the
platform role session. This change safely fixes destination handling but does
not fabricate a member session or bypass `requireVerifiedMemberSession`.
Database-backed member binding, approval and portal authorization therefore
remain required integration gates.

## Verification

Syntax checks for the modified JavaScript files and `git diff --check` pass.
No migration or database workflow was executed.
