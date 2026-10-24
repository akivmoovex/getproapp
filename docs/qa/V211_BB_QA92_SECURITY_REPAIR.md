# V211-BB-QA92 Security Repair

## Repairs

- Invitation acceptance no longer changes member `status` or
  `portal_access_status`; membership approval and portal access remain
  independent.
- Existing-user binding now requires the authenticated session user ID to
  equal the matched platform identity. Email matching alone is rejected.
- Acceptance remains transactional and locks the invitation and member rows.
- The additive migration now validates organization, church, member, and
  branch ownership with a database trigger.
- Token generation, hash-only storage, expiry, revocation and one-time status
  checks remain in place.
- No staff or HQ role is assigned by member acceptance.
- The public route passes an authenticated V5 session identity when available;
  otherwise a matching existing account cannot be silently bound.

## Verification

Static JavaScript syntax checks and `git diff --check` pass. No migration was
applied and no database-backed or browser test was run, as required by QA92.
The migration remains additive and unexecuted.

## Remaining integration work

The normal member login/session handoff still requires integration testing.
Pending members must be approved through the existing church workflow before
portal authorization can pass. Focused HTTP tests should be run only after
the migration is applied to the authorized disposable database.
