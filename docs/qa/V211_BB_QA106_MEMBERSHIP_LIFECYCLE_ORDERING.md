# V211-BB-QA106 Membership Lifecycle Ordering

## Result

QA106 is blocked at the supported lifecycle ordering gate.

The QA75 tenant setup is correct with authoritative host routing, and
authenticated `GET /hq/members` returns 200. The existing QA87 member has
`members.status=pending` and
`member_branch_memberships.membership_status=pending`.

The V2.11 HQ member routes expose creation/review/read flows but no approval
write. The supported approval route is the branch-admin route
`POST /branch/members/:memberId/approve`, not an HQ route. The migration 130
trigger and `memberPortalInvitationService.loadEligibleMember()` require an
active branch membership before an invitation can be issued.

Therefore invitation-before-approval cannot proceed with this fixture, and
QA106 did not alter membership state directly or bypass authorization.
