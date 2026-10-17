# V2.11 BlessBoard Member Invitation, Activation and Login Audit

## Scope and baseline

Audited at commit `8df053e8b1a22e2d30c8b378101cfc155afcaa6a` on `V11`.
The working tree and `origin/V11` were clean and matched. This audit made no
database or production changes.

## Current Add Member result

HQ and branch Add Member use the shared staff member workflow. Creation writes
a BlessBoard member and primary `member_branch_memberships` row, with the
requested church and branch bound by the signed draft and service transaction.
The member's portal state is `not_activated`; the workflow does not create a
login credential, send an invitation, or claim that delivery occurred.

The member stores email/phone contact data when supplied. A member record is
not itself a portal user identity. HQ and branch creation have the same
pending-activation semantics.

## Existing invitation and activation capabilities

| Capability | Classification | Evidence |
|---|---|---|
| BlessBoard staff invitation service | IMPLEMENTED | `src/blessboard/services/inviteBlessBoardStaff.js` |
| Hash-only invitation token | IMPLEMENTED | `randomBytes(32)` plus `hashSessionToken`; raw token is returned only for link construction |
| Seven-day expiry | IMPLEMENTED | `INVITE_TTL_MS` |
| Invitation acceptance/password setup | IMPLEMENTED | `src/blessboard/http/inviteAcceptRoutes.js`, `acceptInvitation` |
| Single-use replay protection | IMPLEMENTED | Pending invitation lookup plus `markAccepted` transaction |
| Invite table/status/audit records | IMPLEMENTED | `blessboard.user_invitations`, `invitation.created`, `invitation.accepted` |
| Automated email delivery for BlessBoard staff invite | PARTIAL | Invitation link is generated; current comments/tests describe copy/share delivery and no email delivery |
| Member-specific invitation from Add Member | NOT_IMPLEMENTED | Add Member does not call `inviteBlessBoardStaff` |
| Member portal activation integration | PARTIAL | Existing acceptance activates invited *users* and assigns catalogue roles; it is not wired to newly created member records |
| Member login | IMPLEMENTED/LEGACY PRODUCT FLOW | Existing `/login` flow authenticates BlessBoard users and gates member routes |
| Member password reset | IMPLEMENTED | Existing church member password-reset request/support flows |
| Background delivery provider | PARTIAL | Provider abstractions exist in other product/admin flows; no Add Member delivery job is connected |

The invitation service supports email and phone-only links, existing active
users, invited users, expiry, generic invalid-token errors, role assignment
on acceptance, and church/branch scope checks. It is primarily a staff/user
invitation mechanism and should not be assumed to be a complete member portal
activation contract.

## Login behavior

BlessBoard tenant login is `/login`; member-protected routes redirect there.
Authentication uses an existing BlessBoard user identity and password, then
creates a scoped session. Membership and church scope are checked for member
portal access. A newly created Add Member with no linked user/password cannot
log in. `not_activated` remains pending until a future activation flow links
or creates the portal identity and establishes credentials.

Existing tests include `tests/church-auth.test.js`,
`tests/church-unified-login-hardening.test.js`,
`tests/church-session-security-version.test.js`, and
`tests/church-foundation-workflows.test.js`. These cover login, pending/
verification behavior, session invalidation and tenant-scoped member access;
they do not prove the new HQ Add Member record can complete activation.

## Security findings

- Invitation tokens are cryptographically random, hash-stored, expiring and
  consumed transactionally.
- Acceptance uses generic invalid-token responses and locks the invitation
  row during consumption.
- Organization, church and active-branch checks occur before acceptance and
  catalogue role assignment.
- Passwords are hashed with bcrypt and shared password policy validation.
- Acceptance assigns catalogue roles explicitly; it does not grant platform
  administrator privileges.
- Audit records exist for creation, acceptance and role assignment.
- Resend/reissue is available through invitation-management service paths, but
  Add Member has no invitation/resend UI.
- Rate limiting and delivery reliability are not established as part of the
  Add Member flow.
- Existing active identities can be reused by invitation acceptance; this
  requires careful product policy for a member who belongs to another church.
- Members without email require a supported phone/link delivery and recovery
  policy; Add Member currently only preserves contact data.

## Product behavior matrix

- HQ creates member with email: membership is created pending activation; no
  invitation is sent.
- Branch creates member with email: same result.
- Existing Platform/BlessBoard account: Add Member identity matching prevents
  unsafe duplicate creation, but does not automatically attach portal login.
- Existing membership in another church: must be explicitly resolved by
  cross-church identity policy; no automatic cross-church privilege change is
  currently performed.
- No email: contact can be stored; delivery/activation policy is unresolved.
- Expired invite: generic failure and expiry state; a new invite is required.
- Resend: existing staff invitation infrastructure supports lifecycle
  management, but Add Member does not expose it.
- Reuse: accepted/revoked/non-pending tokens are rejected.
- Activation: existing invite acceptance sets password/active user and assigns
  the invited catalogue role; member linkage is not yet integrated.
- Post-activation login: existing `/login` can authenticate an active user
  with a password and scoped membership.

## Test inventory

Relevant existing coverage includes:

- `tests/blessboard-hq-branch-user-creation.test.js` — staff invitation,
  acceptance, phone-only invite, replay and audit behavior.
- `tests/blessboard-invitation-password-reset.test.js` — invitation/password
  and reset contracts.
- `tests/blessboard-platform-admin-team.test.js` — invitation/reuse,
  organization/branch scope and role assignment.
- `tests/church-auth.test.js` — member login and pending verification.
- `tests/church-unified-login-hardening.test.js` — login security, replay and
  session behavior.
- `tests/church-session-security-version.test.js` — login/session invalidation.
- `tests/e2e/foundation-security.spec.js` — browser member login path,
  not run in this audit.

No existing test demonstrates the newly created HQ/branch member completing
the invitation-to-portal-login lifecycle.

## Recommended BB-11 batches

### BB-11B — Member invitation domain adapter

Modify/add a BlessBoard member invitation adapter around the existing
invitation/token repositories and service. Add an explicit member-to-user
linking contract, invitation purpose, church/organization/branch binding,
expiry, revocation, resend idempotency and audit events. A migration is likely
required only if the current invitation table cannot represent member target
and purpose safely.

### BB-11C — Activation endpoint

Reuse `inviteAcceptRoutes`, CSRF and password policy. Add member-target
verification and safe activation/linking transaction. Test expiry, replay,
wrong church, wrong member, password setup and no role escalation.

### BB-11D — Member login integration

Verify the active linked user through existing `/login`, session creation and
membership scope. Add tests for pending `not_activated`, multiple church
memberships, duplicate identities and password reset.

### BB-11E — HQ/branch invitation UI and delivery

Add authorized invite/resend actions to both shells. Use copy-safe links or
the approved delivery provider; never claim email/SMS delivery unless a
provider acknowledges it. Add delivery status and audit presentation.

### BB-11F — HTTP/database/security regression

Run real Express and isolated PostgreSQL tests for creation, invitation,
activation, replay, expiry, resend, login, tenant isolation, RBAC, CSRF and
audit/transaction behavior.

### BB-11G — Release commit and push

Review the scoped diff, update the QA report, run the complete gate, then
commit and push only after browser/database limitations and delivery claims
are accurately recorded.

## Decisions required before implementation

1. Whether an Add Member invitation targets an existing Platform identity,
   creates a new BlessBoard user, or supports both.
2. Whether invitation acceptance creates/links a `blessboard.members.user_id`
   relationship and how existing cross-church memberships are handled.
3. Required behavior for phone-only members and delivery channels.
4. Whether staff invitation tables can be reused with a member-specific
   purpose or require an additive member activation table.
5. Resend, revocation, expiry duration and rate-limit policy.
6. Whether portal activation should change membership status or only
   `portal_access_status`.

## Conclusion

Invitation and password setup infrastructure exists, but it is not wired to
the new HQ/branch Add Member result. Newly created members remain
`not_activated` and cannot currently log in solely because the membership was
created. BB-11 should reuse the existing token, password, session, audit and
RBAC infrastructure while adding an explicit, tenant-bound member activation
adapter and complete HTTP/database coverage.

## BB-11B2 contract design

The design selects a separate additive `blessboard.member_portal_invitations`
table rather than extending the staff-only `blessboard.user_invitations`
table. This preserves staff role-key constraints and prevents ordinary
members from being processed as staff invitations. The proposed table binds
organization, church, optional branch, member target, purpose
`MEMBER_PORTAL_ACTIVATION`, hashed token, expiry, status, revocation and
acceptance actors.

Proposed migration: `129_member_portal_invitations.sql`; no migration was
created or executed. The design requires ownership validation and
member-scoped pending uniqueness. Identity linking is ownership-verified;
phone-only linking and automatic cross-church inheritance are prohibited.
Acceptance must atomically validate scope and token, link or create only the
intended user, avoid staff roles, consume the invitation and audit the result.

Full specification:
`docs/architecture/V211_BB_MEMBER_INVITATION_CONTRACT.md`.

## BB-11B3 schema verification

Implemented `db/migrations/blessboard/129_member_portal_invitations.sql`.
The additive table contains explicit organization, church, branch, member and
optional recipient-user references; fixed purpose
`MEMBER_PORTAL_ACTIVATION`; hashed-token uniqueness; pending-member
uniqueness; status/expiry/acceptance/revocation checks; tenant ownership
trigger; and lookup indexes. Staff `user_invitations` storage was unchanged.

Migration 129 applied successfully to local `getpro_v211_test_01`; rerunning
the supported migration runner skipped it cleanly. The focused schema suite
passed **3/3**, covering table/index presence, invalid purpose/status,
pending uniqueness, and preservation of staff invitation storage. No runtime
issuance, activation, login, delivery or UI behavior was implemented.

## BB-11B4 issuance service

Implemented `src/blessboard/services/memberPortalInvitationService.js` for
member invitation issuance, resend and revocation only. It enforces
`members.create`, authoritative organization/church/member scope, branch
scope, eligible email contact, pending-state eligibility and identity
conflict checks. It uses existing token hashing, seven-day expiry,
migration-129 storage, transaction row locks and BlessBoard audit events.
Plaintext tokens are returned only on new issuance and are not logged,
stored or included in audit metadata.

Focused schema and service tests passed **6/6** against
`getpro_v211_test_01`. Activation acceptance, delivery, login changes and UI
remain unimplemented. Existing staff invitation behavior was not modified.

## BB-11C1 identity ownership resolution

The identity and account-linking contract is documented in
`docs/architecture/V211_BB_MEMBER_ACTIVATION_IDENTITY_CONTRACT.md`.
New-account activation is blocked until approved email delivery/verification
exists. Existing-account linking requires an authenticated session for the
exact account or an equivalent verified ownership challenge; email or phone
equality alone is insufficient. Phone-only members remain pending.

Cross-church memberships remain explicit and church-scoped. Activation may
link only the intended member and must not assign staff roles or inherit
permissions. No runtime, migration, database, login or staff-invitation
changes were made in this contract-resolution batch.

## BB-11C2 identity-proof boundary

Implemented `src/blessboard/services/memberActivationIdentityOwnershipService.js`
with non-mutating `verifyMemberActivationIdentityOwnership` and
`authorizeLinkedMemberAccess` decisions. The boundary requires the trusted
authenticated session user, fixed member invitation purpose, pending and
unexpired invitation, matching organization/church, exact recipient or
existing `members.user_id` binding, and active portal access for ordinary
member authorization. Unbound invitations return
`OWNERSHIP_PROOF_REQUIRED`; email and phone equality are never treated as
ownership proof.

The focused boundary suite passed **4/4**. No accounts, identities,
memberships, invitations, roles or sessions were mutated. New-account
activation remains blocked pending verified email delivery proof; acceptance
and consumption remain BB-11C3 scope.

## BB-11C3 acceptance service

Implemented `src/blessboard/services/memberPortalInvitationAcceptanceService.js`
with `acceptMemberPortalInvitation` for the approved existing-user path. The
service locks and validates the hashed member-purpose token, reuses the
non-mutating ownership boundary, links only the exact authenticated user,
updates the intended portal state, consumes the invitation, audits and
commits atomically. It does not create accounts, passwords or sessions and
does not assign staff roles.

The ownership tests pass **4/4**. Real PostgreSQL acceptance execution is
blocked because `getpro_v211_test_01` has no existing synthetic member linked
to a user while still pending portal activation. Acceptance is not claimed
green until that supported fixture exists.

The linked-pending synthetic fixture is now provisioned with the existing
BlessBoard user creator and schema-valid member relationship in the isolated
database acceptance test. Real PostgreSQL acceptance passed **1/1**:
recipient ownership, member linkage, portal activation, invitation
consumption and replay rejection were verified. The combined ownership,
schema, issuance and acceptance tests passed **11/11**. New-account
activation, HTTP routes, delivery and login integration remain pending.

## BB-11C4 environment verification

The first HTTP verification attempt failed before test setup because the
isolated worktree could not resolve the declared `bcryptjs` dependency:
`MODULE_NOT_FOUND`. `package.json` and `package-lock.json` already declared
and locked `bcryptjs`; no dependency versions or package files were changed.
Running `npm ci` repaired only the local worktree installation.

After repair, `require.resolve("bcryptjs")` succeeded and the focused
ownership, schema, issuance and PostgreSQL acceptance suites passed **11/11**.
The mounted anonymous `GET /member-invite/accept` route returned the required
authentication state without mutation. A complete authenticated HTTP
acceptance matrix and concurrent HTTP verification remain pending; no
full-onboarding completion is claimed.

## BB-11C4 authenticated HTTP verification

Added `tests/v211-member-portal-invitation-http.test.js`. It provisions a
synthetic linked pending member, creates a real V5 deployment session using
`createV5Session`, obtains the signed CSRF cookie from the mounted Express
route, performs `GET /member-invite/accept`, then submits
`POST /member-invite/accept` through the real app and local PostgreSQL.

Command:
`NODE_ENV=test GETPRO_TEST_DB=1 node --test --test-concurrency=1 tests/v211-member-portal-invitation-http.test.js`

Result: **2/2 pass**. The database assertions verified the member remained
linked to the authenticated user, changed to `active`, and the invitation
changed to `accepted`. Anonymous POST and missing-CSRF POST were rejected.
The broader wrong-user, tenant-matrix and concurrent HTTP cases remain
unverified; new-account activation, delivery and administrator UI remain
blocked by contract.

## BB-11D member login and portal verification

The real activation HTTP fixture succeeds through `GET /member-invite/accept`
and `POST /member-invite/accept`, including PostgreSQL activation and
invitation consumption. The initial authenticated portal probe incorrectly
used legacy `/member/dashboard`, which returned **503**
(`Member portal is temporarily unavailable`) because it entered the legacy
member lookup path rather than the mounted V5 portal.

The actual V5 member dashboard route is `/member`. Re-running the same
authenticated V5 session fixture against `GET /member` returned **200** and
rendered the activated member dashboard. No runtime correction was required;
the failure was a test route-selection defect. The focused portal regression
suite passed **19/19** executed checks with **1** PostgreSQL-dependent check
skipped.

## BB-11D real credential login gate

The real V5 credential flow was exercised through `GET /login?tr=...`,
CSRF-protected `POST /login`, and the tenant auth-transfer path. Password
verification executed successfully and the V5 session cookie was issued.
The flow then returned **403 `You do not have access to that church site`**
before `/auth/callback`.

The exact cause is `authorizeBlessBoardTenantAccess` in
`src/blessboard/services/authorizeBlessBoardTenantAccess.js`: its
`evaluateRoleGrants` function only authorizes catalogue administrator roles
and `platform_administrator`; it does not treat the ordinary `member` role
or the activated `members.user_id` plus active portal membership as tenant
login authorization. Adding a legitimate scoped catalogue `member`
assignment to the synthetic fixture did not change the result because the
evaluator has no `member` branch. This is an existing authentication-policy
integration incompatibility, not a password or invitation failure.

No runtime policy bypass or role redesign was applied. Real member login
therefore remains blocked pending an approved member-specific tenant login
authorization correction.

## BB-11D-AUTHZ correction

`authorizeBlessBoardTenantAccess` now retains the existing catalogue-role
evaluation for staff and adds a separate fail-closed ordinary-member branch.
It authorizes only when the authenticated user exactly matches
`members.user_id`, the member is active in the resolved church, portal access
is `active`, and the requested branch has an active membership. It emits a
`member` capability only for that tenant; it does not create or grant staff
roles.

The real flow now passes: invitation POST, password-valid `POST /login`,
`GET /auth/callback`, and authenticated V5 `GET /member` all execute against
the local PostgreSQL database. The focused HTTP suite passed **2/2**.

## BB-11E invitation management

Added the mounted management router
`src/blessboard/http/memberPortalInvitationAdminRoutes.js` with HQ and
branch endpoints:

- `GET /hq/members/:id/invitation`
- `POST /hq/members/:id/invitation`
- `GET /branch-admin/members/:id/invitation`
- `POST /branch-admin/members/:id/invitation`

The routes require existing V5 authentication, CSRF for mutations, scoped
`members.view` for status display and scoped `members.create` for issue,
resend and revoke. They delegate token handling to the existing invitation
service, keep hashes in PostgreSQL, and present a returned plaintext token
only once in the response. No delivery is claimed and no new account or
staff role is created. Focused service and activation/login HTTP tests passed
**5/5**; the broader HQ/branch authorization matrix remains pending.

## BB-11E-HTTP verification

Added `tests/v211-member-invitation-management-http.test.js` and executed it
against `getpro_v211_test_01`. A real V5 session, CSRF cookie, Express router,
RBAC permission check and PostgreSQL-backed invitation service were used.
Authorized HQ issue returned **200**, persisted a pending
`MEMBER_PORTAL_ACTIVATION` invitation with a hash-only token, and a branch
mutation without CSRF returned **403**.

Resend, revoke, branch-authorized issue, foreign-scope denial and the complete
one-time-token matrix remain unverified. No delivery or account activation is
performed by management routes.

## BB-11E-HQ-LIFECYCLE verification

The HQ lifecycle test now executes real `GET`/`POST
/hq/members/:id/invitation` requests with a V5 HQ administrator session and
CSRF token. It passed **2/2**:

- issue persisted a pending member-purpose invitation with the exact recipient
  binding and hash-only token;
- resend revoked the prior pending row and created a replacement with a
  different token;
- revoke changed the replacement to `revoked`;
- the member remained `not_activated`;
- missing CSRF returned **403**.

The complete HQ negative matrix and branch lifecycle remain separate
coverage.

## BB-11E-BRANCH verification

The same real Express/PostgreSQL harness executed the branch route
`/branch-admin/members/:id/invitation` with a branch-scoped administrator.
Branch issue, resend and revoke each returned **200**; PostgreSQL confirmed
the branch-bound invitation lifecycle and no member activation. The focused
management suite passed **3/3**, including the existing HQ lifecycle,
missing-CSRF rejection, and branch lifecycle.

Full cross-branch/cross-church negative fixtures, view-only users and
revoked-token acceptance are not yet executed. No delivery or new-account
activation is enabled.

## BB-11F1 negative security gate

Real negative HTTP coverage passed for anonymous and ordinary-member HQ and
branch mutation attempts, plus missing-CSRF HQ mutation. Each returned 403
without an invitation mutation. View-only, foreign-scope, invalid-CSRF and
activation-token negative scenarios remain NOT_RUN; the mandatory negative
gate is not complete.

## BB-11F1B token and invalid-CSRF gate

Executed the focused management harness with real sessions and PostgreSQL.
The deliberately invalid CSRF HQ and branch mutation cases both returned
**403** before service mutation. The prior authorization-isolation cases
remained passing.

The seven required invitation-token HTTP rejection cases and authenticated
member-acceptance invalid-CSRF case were not added or executed in this batch;
no completion claim is made for the token-security gate.

## BB-11F1B-TOKEN-LIFECYCLE

Added and executed `tests/v211-member-invitation-token-lifecycle-http.test.js`
against local PostgreSQL. All three real acceptance HTTP cases passed:

- revoked token: **400**, invitation remained `revoked`, member remained
  `not_activated`;
- expired token: **400**, invitation remained pending-but-expired, member
  remained `not_activated`;
- consumed replay: first POST **200**, replay POST **400**, with one accepted
  invitation and one active member link.

PostgreSQL assertions confirmed the user/member binding and no unauthorized
mutation. The remaining replaced-token, wrong-recipient, unbound-invitation
and acceptance-invalid-CSRF cases remain pending.

## BB-11F1C remaining token tests

Added and executed real HTTP tests for unknown-token rejection and
acceptance invalid-CSRF rejection. They returned **400** and **403** with
PostgreSQL state unchanged. The revoked, expired and consumed replay tests
also passed.

## BB-11G-FORM-DIFF review

The validation contract is intentionally split: invalid field validation
returns `{ ok: false, error, form }`, while successful validation returns
`{ ok: true, data }`. The EJS registration form requires the redisplay object
with `full_name`, `phone`, `email`, and other permitted fields.

Accordingly, the validation-error path retains `validation.form`; the
duplicate-after-validation path uses `validation.data`. The extra
validation-error change was reverted as unjustified. The duplicate HTTP 400
fix remains.

The complete `church-auth` and `church-branch-admin` suites passed twice after
the correction. No new runtime or test file was added in this review.

Replaced-token, wrong-recipient and unbound-invitation scenarios remain
unimplemented in this batch, so the remaining-token gate is blocked.

## BB-11F1C-1 replaced-token HTTP verification

`tests/v211-member-invitation-token-lifecycle-http.test.js` executed with:

```text
NODE_ENV=test GETPRO_TEST_DB=1 node --test --test-concurrency=1 tests/v211-member-invitation-token-lifecycle-http.test.js
```

The new test issued and resent through the real HQ HTTP route using an
authenticated V5 session and valid CSRF. The original invitation was
`revoked`, the replacement was `pending`, there was exactly one pending
invitation, and the token hashes differed. Acceptance of the original token
through `POST /member-invite/accept` returned **400**. The member remained
`not_activated`, its user binding was unchanged, and no successful acceptance
or staff-role mutation occurred. The focused suite passed 6/6 with no skips.

Wrong-recipient and unbound-invitation tests remain outstanding.

## BB-11F1C-2 wrong-recipient HTTP verification

Added and executed a real HTTP wrong-recipient test in the lifecycle harness.
Two distinct synthetic users were provisioned; the invitation and member were
bound to User A. User B used a separate authenticated V5 session and valid
CSRF, and `POST /member-invite/accept` returned **400**. The invitation
remained pending and User A's member binding remained `not_activated`.

As a positive control, User A subsequently accepted the same invitation with
HTTP **200**. The invitation was consumed once and the member became active
for User A. No User B linkage or staff-role mutation occurred. The focused
suite passed 7/7 with no skips.

The unbound-invitation boundary test remains outstanding.

## BB-11F1C-3 unbound ownership boundary

The focused HTTP/PostgreSQL test exercised the actual HQ issuance route with
an active, email-addressed member whose `user_id` was `NULL`. The request
returned **200** and created a `pending` invitation with
`recipient_user_id IS NULL`; therefore issuance rejection is **not** the
current product contract. No account, identity binding, or staff role was
created.

The real ownership service then rejected the invitation for an authenticated
arbitrary user with `OWNERSHIP_PROOF_REQUIRED` / `unbound_member`. The member
remained `not_activated` and unbound. Acceptance HTTP is
`NOT_APPLICABLE_BY_CONTRACT` for a legitimate unbound invitation because the
acceptance boundary requires ownership proof; no fabricated token row was
used. The test passed its verified boundary assertions, but the requested
issuance-denial condition was not met, so this gate remains blocked pending a
product-policy decision.

## BB-11F1C-4 existing-user binding enforcement

The invitation service now rejects unbound members with `identity_required`
before token generation. Resend performs the same eligibility check before
revoking an existing row. The administrator view explains the requirement and
does not render issue/resend controls when `member.user_id` is null.

Focused real HTTP/PostgreSQL execution passed 8/8: HQ and branch unbound issue
returned **400** with zero new invitations; HQ and branch unbound resend
returned **400** without changing a legacy pending row. Existing bound-user
lifecycle and acceptance controls remained passing. Legacy unbound rows were
not bulk-deleted and remain blocked by `OWNERSHIP_PROOF_REQUIRED`.

## BB-11F2A concurrent acceptance

Added a real concurrent HTTP acceptance test to
`tests/v211-member-invitation-token-lifecycle-http.test.js`. Three independent
fixtures were executed; each pair used two separately created authenticated
V5 sessions and separately issued CSRF tokens, then dispatched both POST
requests with `Promise.allSettled`.

All three pairs completed without timeout or HTTP 500. Each produced exactly
one **200** and one **400** response. PostgreSQL confirmed one accepted
invitation, one active member binding, one successful acceptance audit event,
and no duplicate identity, member, or staff-role mutation.

## BB-11F2B one-time secret protection

Added one focused real HTTP test to
`tests/v211-member-invitation-management-http.test.js`. Authorized HQ and
branch issuance responses exposed the synthetic link only in the immediate
response. Subsequent management GETs, view-only GETs, and foreign-member GETs
did not contain the prior or replacement token. Resend generated a different
token. All management responses set `Cache-Control: no-store` and
`Referrer-Policy: no-referrer`.

PostgreSQL assertions confirmed only token hashes were persisted. The focused
management suite passed 13/13. Browser-level third-party-resource and
analytics inspection remains `NOT_VERIFIED_BROWSER`; it requires a browser
network/request test with external-resource interception.

## BB-11F2B-1 audit, logging and session persistence

The focused management harness captured real HQ issue, resend and revoke
requests while inspecting `platform.audit_events`, persisted V5 session
`context_json`, and captured application console logger calls. The synthetic
plaintext secrets were absent from audit metadata, session context, and all
captured log output. Audit events retained only action/entity identifiers and
non-secret metadata. The test passed 14/14 with no skips.

No browser or external logger transport was exercised in this batch; browser
third-party leakage remains a separate verification item.

## BB-11F2B-2 client-held cookie protection

The focused management HTTP harness captured `Set-Cookie` headers and the
authenticated cookie jar across issue, refresh, resend, refresh, revoke and
refresh. The session cookie was an opaque identifier; no invitation token,
encoded token, activation URL, or invitation-named cookie appeared. CSRF
cookies retained the established `SameSite=Lax`, `Path=/`, host-only scope.
The cookie test passed as part of the 15/15 management suite.

Cookie payload encryption/decryption was not required by the established
server-side session contract. Browser/network third-party leakage remains
outside this non-browser batch.

## BB-11F2C browser secret verification

Browser verification was not executed. The V11 worktree's configured
Playwright command references `scripts/local/run-local-qa-server.js`, but that
server launcher is unavailable in this worktree. Direct `index.js` startup
also exited before listening because the bootstrap environment contract did
not retain the supplied local test database variables. No browser results are
claimed; HQ, branch, acceptance-page network, and browser-storage checks
remain blocked until the supported local browser launcher is restored.

## BB-11F2C-FIX browser launcher restoration

The original V11 Playwright configuration referenced a missing local launcher
and the application entrypoint exited during bootstrap before binding. A
test-only `scripts/local/run-local-qa-server.js` was restored to construct the
existing V5 foundation app directly with the isolated
`getpro_v211_test_01` pool. `playwright.config.cjs` now uses that launcher and
supplies the local test `DATABASE_URL` default.

The repaired launcher remained running and a real browser reached
`http://127.0.0.1:4175/healthz`, returning the V5 foundation testing health
payload. Full invitation browser scenarios were not executed in this repair
turn; no browser-security completion claim is made.

## BB-11F2C-1 HQ/branch browser execution

Real browser login succeeded through `/login`, and the HQ invitation page
navigated successfully for a synthetic administrator/member fixture. HQ issue
and refresh were exercised; the one-time link appeared in the immediate
response and the subsequent refresh showed only pending status. Browser
localStorage and sessionStorage were empty; only the CSRF cookie was present.

The complete HQ resend/network assertions and independent branch issue/resend
sequence were not completed in this run. No green claim is made for this
gate.

## BB-11F2C-HQ persistent Playwright security test

Added `tests/bb-v211-hq-member-invitation-security.spec.js` and registered it
in `playwright.config.cjs`. Command executed:

```text
DATABASE_URL='postgresql:///getpro_v211_test_01?host=/tmp' GETPRO_TEST_DB=1 BB_BROWSER_SECURITY=1 PLAYWRIGHT_PORT=4175 npx playwright test tests/bb-v211-hq-member-invitation-security.spec.js --config=playwright.config.cjs --workers=1 --timeout=60000
```

The real Chromium test passed **1/1**. It performed real login, HQ issue,
refresh, resend, replacement-token rotation, second refresh, response-header,
network-request, cookie, local/session storage, IndexedDB and Cache Storage
assertions. External font/logo requests were blocked and inspected; neither
synthetic token appeared in their URLs or referers. Branch and acceptance-page
browser tests remain separate.

## BB-11F1A authorization isolation

The focused suite executed all seven required cases with real authenticated
V5 sessions, valid CSRF tokens, Express routes and PostgreSQL fixtures:

1. HQ view-only — **PASS**, 403.
2. Branch view-only — **PASS**, 403.
3. HQ foreign church — **PASS**, 404 safe masking.
4. Branch foreign church — **PASS**, 404 safe masking.
5. Branch foreign branch — **PASS**, 400 branch-scope rejection.
6. HQ foreign organization — **PASS**, 404 safe masking.
7. Branch foreign organization — **PASS**, 404 safe masking.

All seven cases recorded no invitation mutation and no token disclosure.
The focused file completed **11/11** tests, including the existing lifecycle
and anonymous/member/CSRF cases. No token-acceptance tests were run in this
batch.

## BB-11F2C-BRANCH persistent Playwright security test

Added `tests/bb-v211-branch-member-invitation-security.spec.js` and registered
it in `playwright.config.cjs`. The focused command passed **1/1**:

```text
DATABASE_URL='postgresql:///getpro_v211_test_01?host=/tmp' GETPRO_TEST_DB=1 BB_BROWSER_SECURITY=1 PLAYWRIGHT_PORT=4175 npx playwright test tests/bb-v211-branch-member-invitation-security.spec.js --config=playwright.config.cjs --workers=1 --timeout=60000
```

The real branch-admin login, branch member navigation, issue, refresh, resend,
replacement-token rotation, second refresh, response headers, network, cookie,
local/session storage, IndexedDB and Cache Storage assertions passed. External
font/logo requests were blocked and inspected without either synthetic token in
URL or referer. Acceptance-page browser coverage remains outstanding.

## BB-11F2C-ACCEPTANCE persistent Playwright security test

Added `tests/bb-v211-member-invitation-acceptance-security.spec.js` and
registered it in `playwright.config.cjs`. The focused command passed **1/1**:

```text
DATABASE_URL='postgresql:///getpro_v211_test_01?host=/tmp' GETPRO_TEST_DB=1 BB_BROWSER_SECURITY=1 PLAYWRIGHT_PORT=4175 npx playwright test tests/bb-v211-member-invitation-acceptance-security.spec.js --config=playwright.config.cjs --workers=1 --timeout=60000
```

The real browser executed anonymous navigation, wrong-user rejection, correct
recipient acceptance, member portal access, and consumed-token replay
rejection. PostgreSQL assertions confirmed the member remained pending after
denial, activated once for the recipient, and the invitation was consumed
once; no staff/admin role or account was created. Network, cookie, local and
session storage, IndexedDB, Cache Storage, and no-store/no-referrer assertions
passed. Browser-managed history retains the token-bearing URL as normal
navigation behavior; no application-managed storage or unrelated-origin leak
was observed.

## BB-11F3 consolidated regression gate

Fresh controlled execution used local `getpro_v211_test_01` only. The three
saved Playwright suites were run together with the restored launcher:

```text
DATABASE_URL='postgresql:///getpro_v211_test_01?host=/tmp' GETPRO_TEST_DB=1 BB_BROWSER_SECURITY=1 PLAYWRIGHT_PORT=4175 npx playwright test tests/bb-v211-hq-member-invitation-security.spec.js tests/bb-v211-branch-member-invitation-security.spec.js tests/bb-v211-member-invitation-acceptance-security.spec.js --config=playwright.config.cjs --workers=1 --timeout=60000
```

Result: **3 passed, 0 failed, 0 skipped**. HQ, branch, and acceptance
browser secret/ownership/storage/network scenarios all executed with a real
browser.

Focused BB invitation regression result: **37 passed, 0 failed, 0 skipped**
across the seven V211 member invitation and activation test files.

Existing BB member/staff regression selection returned **48 passed, 0 failed,
7 skipped**. The skips are pre-existing host-dependent cases in
`tests/church-auth.test.js` and `tests/church-branch-admin.test.js`; they were
not counted as passes.

ActiveClinic identity/patient and Platform identity/session selections both
returned **95 passed, 0 failed, 0 skipped**. No runtime, migration,
credential, or production changes were made. Full repository regression and
the skipped host-dependent church cases remain release limitations.

## BB-11F3-FIX targeted coverage completion

Discovered and executed:

- `tests/blessboard-member-registration.test.js`
- `tests/blessboard-staff-invitation.test.js`
- `tests/blessboard-registration-approval-invitation.test.js`
- `tests/blessboard-platform-account-recovery.test.js`
- `tests/blessboard-invitation-password-reset.test.js`
- `tests/activeclinic-account-lifecycle.test.js`
- `tests/activeclinic-staff-invitation.test.js`

Command:

```text
node --test tests/blessboard-member-registration.test.js tests/blessboard-staff-invitation.test.js tests/blessboard-registration-approval-invitation.test.js tests/blessboard-platform-account-recovery.test.js tests/blessboard-invitation-password-reset.test.js tests/activeclinic-account-lifecycle.test.js tests/activeclinic-staff-invitation.test.js
```

Result: **76 passed, 0 failed, 0 skipped**. This covered BB registration,
existing-member matching, staff invitation/acceptance, role lifecycle,
password recovery, legacy login behavior, AC staff invitation/activation and
platform action-token expiry/replay/revocation paths.

The host-dependent church suites were rerun with
`TEST_DATABASE_URL=postgresql:///getpro_v211_test_01?host=/tmp`,
`GETPRO_TEST_DB=1`, and `NODE_ENV=test`. The supported local database
connection worked, but four registration/member tests and one branch isolation
test failed during fixture setup with PostgreSQL
`23505 idx_church_branches_host_slug_unique` in
`src/db/pg/church/branchesRepo.js:174`; this is a fixture/database-state
collision, not an invitation runtime regression. Two host-independent tests
and the branch login/approval tests passed. The seven original skips therefore
remain unresolved and are not counted as passes.

## BB-11F3-FIXTURE host-slug fixture correction

The original `23505` failures were reproduced in
`tests/church-auth.test.js` and `tests/church-branch-admin.test.js` at
`branchesRepo.js:174`, against the global partial unique index:

```text
CREATE UNIQUE INDEX idx_church_branches_host_slug_unique
ON public.church_branches (lower(trim(host_slug)))
WHERE trim(host_slug) <> ''
```

The index is global across `public.church_branches`, not tenant-scoped. The
fixtures used fixed `slug: "main"` values while prior synthetic rows remained
in the shared local test database. The minimal test-only correction changes
those branch slugs to deterministic per-test `main_${suffix}` values and
`main_b_${suffix}` for the second cross-organization branch. No runtime code,
schema, or index changed.

The corrected `tests/church-branch-admin.test.js` suite passed **5/5** on two
independent executions. `tests/church-auth.test.js` now passes setup and
host-rendering cases, but two non-collision assertions remain failing:
duplicate registration returns 500 instead of expected 400, and the legacy
waiting-page assertion expects obsolete text (`Waiting for verification`) while
the rendered page uses `Verification in Progress`. These are classified as
pre-existing product/contract or stale-test issues, not fixture-collision
failures. The seven host-dependent skips remain environment limitations.

## BB-11F3-CHURCH-AUTH follow-up

The waiting-page assertion was minimally updated to accept the current
semantic UI (`Verification in Progress` or `Pending Verification`). The
corrected church-auth suite now passes **5/6**; the remaining duplicate
registration case still returns HTTP 500 instead of the route's documented
HTTP 400 contract. The sanitized server log identifies a `TypeError` during
the duplicate POST, while the response body contains no additional safe
diagnostic. No runtime correction was made without the underlying TypeError
evidence.

## BB-11F3-DUPLICATE-REGISTRATION resolution

Temporary test-only stack instrumentation proved the duplicate POST failed at
`src/routes/church/auth.js:148`: the conflict response passed `validation.form`,
but a successful validation result exposes submitted fields as
`validation.data`. EJS then raised:

```text
TypeError: Cannot read properties of undefined (reading 'full_name')
```

The minimal runtime correction uses `form: validation.data` in both controlled
duplicate-response paths. It preserves the established HTTP 400 contract and
does not alter successful registration or uniqueness policy.

The duplicate regression now records member, branch and organization counts
before and after the duplicate POST and asserts they remain unchanged (1/1/1).
No legacy user table exists in this contract; registration stores the member
record and password hash in `public.church_members`, with no new user row or
role assignment. The isolated duplicate case, full church-auth suite and
branch-admin suite passed; the combined church-auth/branch-admin command was
repeated successfully. Impacted BB invitation and Platform identity suites
also passed.
