# V211-BB-QA89 Member Portal Activation Lifecycle Audit

## Conclusion

The V2.11 lifecycle is incomplete. HQ Add Member creates a
`blessboard.members` record and branch membership, but leaves the member
pending, with `portal_access_status = not_activated` and `user_id = NULL`.
There is no supported ordinary-member invitation or activation route to bridge
that record to the member portal.

## Existing workflow map

| Stage | Evidence | Result |
|---|---|---|
| HQ Add Member | `src/blessboard/http/hqMembersAdminRoutes.js`, `blessBoardStaffAddMemberFlowService.js` | Draft, match, review and confirmation create member |
| Member registration | `src/blessboard/services/memberRegistrationService.js` | Registration review/approval creates or activates member membership, but no login account |
| Member account binding | `memberRegistrationService.linkMemberToUser()` | Manager-only binding of an already-active user; not an invitation or activation route |
| Portal authorization | `src/blessboard/services/requireActiveMemberForTenant.js` | Requires active user, active member, active branch membership, and non-blocked portal status |
| Portal login | `src/routes/church/memberPortal.js`, `src/church/memberAuth.js` | Uses a separate legacy session shape and requires verified member status |
| Staff invitation | `src/blessboard/services/inviteBlessBoardStaff.js` | Creates/accepts `user_invitations` and assigns staff catalogue roles; does not bind ordinary members |

The QA87 member (`9de7b247-c0c8-419e-8b29-c4569e10f498`) confirms the gap:
`pending`, `not_activated`, and no bound user.

## Alternatives audited

Public registration in `src/routes/church/auth.js` creates a separate
legacy pending-member record with a password hash and pending/verified session
flow. It is not connected to the V2.11 HQ-created member identity.
No email-verification, member-specific invitation, account-claim, or portal
setup route was found for the V2.11 member record. The staff invitation flow
is not a safe substitute because it grants staff roles.

## Schema contract

The V2.11 contract supports `members.user_id`, member `status`,
`portal_access_status`, and `member_branch_memberships`. The V8 membership
workflow migration explicitly states that it does not create login accounts.
The existing invitation table is `blessboard.user_invitations`, whose
acceptance path is role-oriented. No ordinary-member invitation relation or
member activation token is present.

## Classification

`MISSING_MEMBER_INVITATION`, with consequential
`MISSING_ACCOUNT_BINDING`. Portal authorization exists, but its required
identity state cannot be reached through a supported V2.11 workflow.

## Minimal repair design

Reuse platform `blessboard.users` identities and the existing hash-only,
one-time token conventions:

1. Add a member-scoped invitation record or explicitly extend the canonical
   invitation contract with member ID and a non-role purpose.
2. Add HQ-authorized issue/reissue routes scoped to the member's church and
   branch, with CSRF and rate limiting.
3. Add public GET/POST acceptance routes that validate expiry, hash-only token,
   pending state, church/branch ownership, and replay.
4. On acceptance, create or activate the user through the existing password
   service, bind `members.user_id` transactionally after contact matching, and
   transition only the supported member activation fields.
5. Make portal authorization use the V2.11 member identity consistently, while
   preserving the existing staff invitation behavior.
6. Add audit events without exposing raw tokens; invalidate prior invitations
   on reissue and enforce duplicate identity constraints.

No schema change is strictly required if the canonical invitation table can
carry a member-purpose/member reference with constraints. Otherwise the
minimal additive schema is a member invitation table referencing organization,
church, branch, member and a hash-only token, with unique pending-member and
single-use constraints. Do not introduce legacy `public.tenants`.

## Planned tests

Add-member draft/review/confirmation; pending-state readback; invitation
issue/expiry/replay; account creation and member binding; member login and
authorized portal access; pending denial; blocked portal denial; wrong-branch
and cross-church denial; duplicate email/phone protection; CSRF and anonymous
denial; member denial of HQ routes; and staff-role non-escalation.
