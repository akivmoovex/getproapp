# V211-BB-QA112 Membership Approval Fix

Implemented the minimum canonical HQ approval operation:

- `POST /hq/members/:id/approve`
- CSRF and existing `members.create`/tenant authorization
- server-side UUID member/church/branch scope
- transactional member and branch-membership transition
- append-only `member.approved` audit event
- invalid state and missing branch membership rejection

The operation does not bind accounts, consume invitations, grant roles or
enable portal access by itself. It transitions a pending member and its
existing branch membership to active, matching the existing
`approveMemberRegistration` lifecycle contract.

Static syntax checks and `git diff --check` pass. Runtime approval and
invitation retest were not run in QA112; the disposable QA fixture was
preserved and no migration/database mutation was performed.
