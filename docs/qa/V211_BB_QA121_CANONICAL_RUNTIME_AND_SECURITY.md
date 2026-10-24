# V211-BB-QA121 Canonical Runtime and Security

## Outcome

QA121 is partial. The authorized disposable database and branch were
verified, but the runtime configuration selected the V5 foundation profile.
Its startup diagnostics explicitly skip the legacy church login, member,
HQ-admin, branch-admin and portal routes. Consequently `/login` on the local
runtime is not a valid canonical member-login surface for this fixture.

The real HTTP probe returned:

- `GET /login`: `303`
- `POST /login`: `400`
- response: `Sign-in must continue on the BlessBoard home site.`

This is a runtime/profile routing blocker, not evidence that the active-status
validator accepts or rejects the member. The earlier focused tests also
failed while attempting to create obsolete `public.tenants` fixtures; that
relation is intentionally absent from the V5 database and was not created.

## Test disposition

The portal dashboard/profile and 20-case security matrix were not claimed as
executed passes because the canonical authenticated member surface could not
be established. No database reset, migration, protected-database access,
authorization-state SQL mutation, commit, push, or deployment was performed.

The active-member login correction remains in
`src/services/church/tenantUnifiedLoginService.js`; it accepts `active` and
maps it to the existing verified session contract, while retaining tenant,
branch, password, suspension and rejection checks.
