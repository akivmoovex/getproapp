# V211-BB-QA91 Member Activation Verification

## Result

Migration and runtime verification were stopped before database mutation.
Review found security-critical contract failures in QA90:

1. `acceptMemberPortalInvitation()` updates a pending member to
   `status='active'` and `portal_access_status='active'` without checking an
   approved membership state. This can bypass the existing membership approval
   requirement.
2. The public acceptance route accepts a password and token but does not create
   a member portal session or establish the legacy verified-member session
   required by `src/church/memberAuth.js` and `src/routes/church/memberPortal.js`.
3. Existing active users are selected by member email only. The implementation
   does not require an authenticated verified-account claim or an equivalent
   ownership proof before binding.
4. The migration has no database trigger enforcing that `branch_id` belongs to
   `church_id` or that `member_id` belongs to the same church/branch. It relies
   on application queries.
5. The migration is not present in the database, so the new service would fail
   at runtime against the current QA schema.

These are stop conditions under QA91. No migration, reset, direct state update,
or database mutation was performed.

## Reviewed files

- `db/migrations/blessboard/111_member_portal_invitations.sql`
- `src/blessboard/http/hqMembersAdminRoutes.js`
- `src/blessboard/http/inviteAcceptRoutes.js`
- `src/blessboard/services/memberPortalInvitationService.js`

The repository is on the required branch and HEAD. Existing unrelated
uncommitted QA files were preserved. Syntax and `git diff --check` pass.

## Required correction before verification

Keep the migration additive, but add ownership constraints/triggers and a
member-approval predicate. Define the acceptance/session contract explicitly:
either integrate the platform login flow with the V2.11 portal authorization
path or create the required verified member session through the supported
authentication service. Existing-account binding must require a secure
authenticated claim, not an email lookup alone. Then apply the migration only
to the authorized disposable database and rerun the HTTP/security suite.
