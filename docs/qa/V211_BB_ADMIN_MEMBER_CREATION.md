# V211 BlessBoard administrator member creation investigation

## Scope and baseline

This investigation ran on `V11` at `75717c389eb9348c3d7b535fdd6bdb463edc5cbd`.
The worktree was clean and no runtime, database, migration, ActiveClinic, or
deployment changes were made.

No retained V2.09/V2.10 document explicitly describing a `BB209-03`
administrator-created-member symptom was found. The closest retained contract
defines administrator creation as the authenticated review/approval path:
public or intake registration creates a registration only; HQ or branch
administrators approve it, and approval transactionally creates or links the
member and branch membership without creating a login account.

## BB209-03 requirement recovery

`BB209-03` was not found in the retained QA or release documents, so the
original incident and acceptance wording are `REQUIREMENT_NOT_VERIFIED`.
Available UI evidence is mixed: Stitch/reference HTML contains an “Add Member”
affordance, while the HQ and branch parity audits explicitly record the
implemented directories as having no Add Member control. The current HQ
directory has filters, registration oversight, and view-profile actions only.
The branch template contains dormant `canCreateMember` and
`/branch-admin/members/new` locals, but no matching route or controller was
found.

This establishes a direct administrator-created-membership capability gap,
but not that it was the historical BB209-03 defect rather than a deferred
feature/parity item.

## Runtime call chain

```text
POST /hq/membership/registrations/:id/... or
POST /branch-admin/membership/registrations/:id/...
  -> membershipWorkflowAdminRoutes
  -> membershipWorkflowService / memberRegistrationService
  -> requireMemberManager
  -> requireActorPermission (members.view / members.edit)
  -> memberIdentityRepository
  -> blessboard.member_registrations
     blessboard.members
     blessboard.member_branch_memberships
     blessboard.member_registration_review_events
```

The review/approval implementation is in
`src/blessboard/services/memberRegistrationService.js`. It validates the
registration state, verifies the actor and tenant, resolves an existing member
by church-scoped email or phone, rejects email/phone identity conflicts,
inserts or activates the member, creates or activates the requested branch
membership, updates the registration, records a review event, and records an
audit event. The transaction never creates a password or login user.

HQ routes use church scope and may select a branch. Branch routes derive the
host branch from tenant context. Both route families require an authenticated
session, permission middleware, tenant resolution, and CSRF validation on
mutating actions.

## Matrix and results

| Scenario | Result | Evidence |
|---|---|---|
| HQ administrator approval creates member | PASS contract/integration test | `tests/v8-bb-membership.test.js` |
| Branch administrator approval creates member | PASS contract/integration test | `tests/v8-bb-membership.test.js`, `tests/v8-bb-hq-membership-route.test.js` |
| Branch administrator restricted to branch | PASS | `requireMemberManager`, branch-scoped listing/overview tests |
| Unauthorized member-management access | PASS | route and membership tests |
| Required fields and phone validation | PASS | registration service tests |
| Duplicate registration/member handling | PASS | duplicate and identity-conflict paths |
| Existing identity linking | PASS contract | church-scoped email/phone matching and `linkMemberToUser` |
| Member list and detail visibility | PASS contract | HQ/branch route and directory tests |
| Invitation and activation | NOT_VERIFIED | no distinct administrator invitation flow was identified in this path |
| Member login after activation | NOT_VERIFIED | no live browser/database activation run |
| Church and branch isolation | PASS contract; live coverage pending | service scope and transfer/isolation tests |
| Cross-product identity linking | PASS source boundary | BlessBoard repositories/services only; no ActiveClinic path |
| CSRF and auditability | PASS source/tests | `v5Csrf`, review events, `recordBlessBoardAudit` |

Administrator creation is not a separate direct “create member” endpoint in
the retained V2.11 workflow. It is the approval action on a submitted
registration. Self-registration and invitation are separate concerns and are
not interchangeable with this approval path.

## Decision

| Capability | Status |
|---|---|
| Administrator approves a prior registration into a member and branch membership | IMPLEMENTED_AND_CONTRACT_VERIFIED |
| Administrator directly creates a member with no prior registration | MISSING_REQUIRED_WORKFLOW |
| Administrator invitation and activation | REQUIREMENT_NOT_VERIFIED / no distinct path identified |
| Administrator links an existing login account to a member | IMPLEMENTED as a separate service contract |

`BB209-03` is classified as `REQUIREMENT_NOT_VERIFIED`, with
`REQUIREMENT_GAP=YES` for direct Add Member. It is not classified as a
confirmed product bug because the original requirement evidence is missing.
No implementation is made in this batch.

If direct Add Member is later approved, the smallest safe implementation is
an existing-service-backed HQ/branch form and route that accepts only
profile/contact fields, reuses church-scoped identity matching, creates one
authorized branch membership transactionally, prevents duplicates and
cross-scope writes, retains permission and CSRF gates, emits the existing
audit event, and uses the established invitation/activation mechanism without
administrator-selected passwords. It must not create a parallel identity
system or link ActiveClinic identities.

## Test execution

Executed:

```text
NODE_PATH=../getpro/node_modules node --test --test-concurrency=1 \
  tests/v8-bb-membership.test.js \
  tests/v8-bb-hq-membership-route.test.js \
  tests/blessboard-member-registration.test.js \
  tests/blessboard-member-journey-workflow.test.js \
  tests/blessboard-member-portal.test.js \
  tests/church-member-account-security.test.js \
  tests/church-member-csrf-coverage.test.js \
  tests/church-branch-member-directory.test.js \
  tests/church-platform-members-directory.test.js
```

Result: **75 passed, 0 failed, 3 skipped**. The skipped cases are existing
environment-dependent cases; this does not constitute live database or
browser verification.

No focused new tests were added because the existing approval, RBAC,
directory, privacy, CSRF, duplicate, and isolation coverage exercises the
identified administrator workflow. No confirmed product defect was
reproduced, and no repair was authorized.

## Release disposition

`BB209_03_STATUS=REQUIREMENT_NOT_VERIFIED_WITH_CAPABILITY_GAP`.

The administrator approval-to-member contract is covered and passes. Remaining
acceptance evidence requires an approved disposable database and browser
execution for real persistence, HQ/branch UI flows, invitation/activation
delivery, login after activation, and cross-tenant runtime isolation. No
production access or real invitation delivery was attempted.

## V211-BB-09 implementation review

The repository already contains a substantial V2.04 staff Add Member flow for
authorized branch administrators:

- `GET/POST /branch-admin/members/new`
- `/branch-admin/members/new/match`
- `/branch-admin/members/new/review`
- `blessBoardStaffAddMemberFormService`
- `blessBoardStaffAddMemberFlowService`
- `blessBoardMemberDomainService`

That flow performs signed expiring drafts, duplicate matching, explicit
different-person confirmation, idempotent creation, branch scoping, CSRF and
`members.create` authorization. It creates a member without an administrator
password and leaves portal access `not_activated`.

The HQ member directory route (`src/blessboard/http/hqMembersAdminRoutes.js`)
does not expose the corresponding Add Member form or creation routes. Its
current UI offers filtering, registration oversight, and profile viewing only.
The existing branch implementation also does not establish a verified
invitation/activation delivery path, and no safe HQ adapter was added in this
batch.

`V211-BB-09_STATUS=PARTIAL`. No runtime changes were made because completing
the HQ adapter and proving invitation/activation semantics requires a focused
implementation and regression batch; adding an unverified duplicate route or
inventing an activation system would violate the existing identity boundary.
The exact blocker is **HQ Add Member route/UI integration plus verified
invitation/activation support are incomplete**.

## V211-BB-10E HQ submission workflow

HQ now has the same staged flow boundary as branch administration:

- `POST /hq/members/new` validates the form and binds an authorized active
  church branch before calling `beginStaffAddMemberFlow`.
- `POST /hq/members/new/match` calls `handleMatchStep` with the signed,
  actor- and church-bound draft.
- `POST /hq/members/new/review` calls `confirmStaffAddMemberCreate`.
- `GET /hq/members/:id/created` performs a church-scoped lookup and reports
  `not_activated` portal status without claiming invitation delivery.

The HQ match, review, and created views use the HQ shell and existing signed
draft/service contracts. No SQL or identity logic was duplicated. Branch
selection is checked against the authorized church branch registry by branch
ID; submitted church/organization values are ignored.

The focused HQ suite passes 3/3 source/route-contract tests. Runtime
database-backed route execution, invitation delivery, activation, browser
responsive behavior, and live tenant isolation remain `NOT_VERIFIED`.

## V211-BB-10F integration regression gate

The combined non-database command covering the HQ-focused suite, existing
membership workflow, HQ membership routes, member-registration contracts, and
member directory contracts completed with **36 passed, 0 failed, 0 skipped**.
`npm run test:architecture` completed with **7 passed, 0 failed, 0 skipped**.

No safe disposable database was available for real Express route execution,
so HTTP integration of GET/POST/match/review/created responses is
`NOT_VERIFIED`, not passed. Browser coverage and live persistence are also
`NOT_VERIFIED`. No invitation, activation, or login behavior was changed.
The four unrelated accessibility failures previously recorded remain
individually classified and were not encountered in this focused command.

## V211-BB-10G HTTP integration status

An actual in-process Express mount was not established safely in this
environment. `createHqMembersAdminRouter` depends on tenant/auth-context
middleware and pool-backed permission resolution; no approved disposable
PostgreSQL or existing dependency-injected route fixture was available that
could exercise those boundaries without bypassing production authorization
logic. Real HTTP integration is therefore `NOT_VERIFIED`, not inferred from
source assertions.

## V211-BB-10H isolated PostgreSQL verification

The local Postgres.app PostgreSQL 16 instance on the local Unix socket was
verified before use. The previously absent database
`getpro_v211_test_01` was created as a new local database owned by the local
test user; it was not remote, production, V10, V9, or shared testing data.
The repository's existing `apply-test-db-schema.js` was run with only
process-local `TEST_DATABASE_URL` and `GETPRO_TEST_DB=1`; no migration files
were changed. The canonical schema and incremental files through
`127_church_attendance_tracker_uniqueness.sql` applied successfully.

Using that database, the existing BlessBoard membership, HQ membership-route,
and member-registration suites completed with **33 passed, 0 failed,
0 skipped**. This proves real PostgreSQL coverage for the existing membership
and approval contracts. A dedicated real HTTP suite for the newly added HQ
Add Member endpoints was not present, so HQ GET/POST/match/review/created
route integration remains `NOT_VERIFIED`; the database identity does not
convert source-only tests into route execution evidence. The local test
database contains synthetic test data only and was not reset or shared.

## V211-BB-10B authorization finding

The source-of-truth BlessBoard RBAC migration
`db/migrations/blessboard/057_create_rbac_permissions_roles.sql` grants
`members.create` to the authorized church/HQ role mappings. Therefore this is
not an authorization-policy decision blocker. The blocker is implementation
integration: `branchRegistrationAdminRoutes.js` contains the existing
multi-step Add Member flow, while `hqMembersAdminRoutes.js` has no equivalent
GET/POST adapter or HQ-specific form shell.

No runtime files were changed in this batch. The safe next implementation must
reuse `beginStaffAddMemberFlow`, `handleMatchStep`, and
`confirmStaffAddMemberCreate` with HQ church scope and an authorized branch
registry, then add route/UI regression tests. Invitation and activation remain
separate pending requirements.

## V211-BB-10D HQ GET implementation

The read-only HQ preparation page is now implemented:

- `GET /hq/members/new` is registered before `/hq/members/:id`.
- It uses a separate church-scoped `members.create` guard.
- It resolves the authenticated HQ tenant, loads active church branches with
  `listBlessBoardBranches`, builds defaults with
  `buildAddMemberFormModel`, and renders through the HQ shell.
- `/hq/members` exposes an Add Member link only when the existing
  `members.create` authorization check succeeds.
- `views/blessboard/v5/hq/member-add.ejs` contains the supported identity,
  contact, branch, and CSRF fields, but the form is explicitly disabled and
  has no POST submission path in this batch.

Focused source-level regression: **3 passed, 0 failed**. The broader combined
member/a11y run had **106 passed, 5 failed, 0 skipped**; four failures were
pre-existing unrelated a11y assertions, while one HQ directory assertion was
updated to reflect the approved Add Member control. No member writes occurred.
HQ POST creation, identity matching, activation, browser, and live database
verification remain BB-10E/BB-11 work.

## V211-BB-10D-GATE triage

The five failures from the combined BB-10D run were classified as follows:

| Test | Classification | Evidence |
|---|---|---|
| `tests/blessboard-v5-a11y-structure.test.js` — HQ member directory rejects `Add Member` (`:505`) | `STALE_TEST_EXPECTATION` | The assertion contradicted the approved BB-10D requirement and the new authorized directory action. Only `Add Member` was removed from that negative assertion; privacy/export/bulk guards remain. |
| Same suite — branch announcements `data-bb-hq-ann-branches` (`:1239`) | `PRE_EXISTING_PRODUCT_FAILURE` | Unrelated announcement template assertion; no BB-10D file or route dependency. |
| Same suite — HQ announcements Stitch marker (`:1273`) | `PRE_EXISTING_PRODUCT_FAILURE` | Unrelated announcement template assertion; no BB-10D file or route dependency. |
| Same suite — HQ announcement editor Stitch marker (`:2059`) | `PRE_EXISTING_PRODUCT_FAILURE` | Unrelated announcement template assertion; no BB-10D file or route dependency. |
| Same suite — home template fabricated-widget assertion (`:2399`) | `PRE_EXISTING_PRODUCT_FAILURE` | Unrelated public-home assertion; no BB-10D file or route dependency. |

The focused BB-10D suite passes **3/3**. The architecture suite passes
**7/7**. The broad a11y suite remains **106 passed, 5 failed, 0 skipped**
after the one stale HQ assertion correction; the four unrelated failures are
not in-scope regressions. The route source parses successfully, the static
route precedes `/:id`, and the form is GET-only with disabled submission.
Real middleware execution and browser/database rendering remain
`NOT_VERIFIED`.

`HQ_GET_STATUS=HQ_GET_READY_FOR_NEXT_BATCH`. POST creation, match/review,
activation, and invitation remain disabled and are not claimed complete.

## V211-BB-10 implementation outcome

The existing branch Add Member implementation was rechecked at the requested
baseline. It already includes the complete multi-step route family,
`members.create` authorization, signed expiring drafts, duplicate matching,
explicit match resolution, idempotent creation, CSRF, branch scoping, and the
existing member-domain transaction. It is not safe to duplicate that flow in
the HQ router without first adapting its shell, route targets, branch-selector
policy, and test fixtures.

No HQ runtime change was made in this batch. The requested safe subset remains
blocked by the missing HQ adapter/UI integration; invitation and activation
remain outside the verified existing flow. The branch workflow was preserved
unchanged.

## V211-BB-10I real HTTP integration attempt

Added `tests/v211-hq-add-member-http-integration.test.js` using the actual
`createV5FoundationApp` mount, HQ router, session creation, RBAC, tenant
resolution, CSRF handling, and PostgreSQL pool against
`getpro_v211_test_01`. Fixture setup failed closed because the existing
supported `provisionPlatformTenant` fixture returned `transaction_error` on
the prepared database; direct reproduction returned the same result.

Result: **0 passed, 0 failed, 3 skipped**. No privileged sessions were
fabricated and no authorization middleware was bypassed. Real Express route
execution, persistence assertions, and browser coverage remain
`NOT_VERIFIED`. This is a fixture/database provisioning blocker, not route
success evidence. Invitation, activation, and login remain BB-11 scope.

## V211-BB-10J fixture diagnosis and repair

The original `transaction_error` was caused by an incomplete test database
baseline. `getpro_v211_test_01` contained the legacy `public` schema but did
not contain the supported `platform` catalogue tables. The existing migrator
was run only against this verified local target with `phase=migrations`,
followed by the existing seed phase. No migration files changed.

Fixture provisioning then succeeded with unique synthetic tenant data. The
real HTTP suite passed **3/3**: authorized HQ GET, anonymous/branch-only
denial, valid POST reaching server validation, and invalid-CSRF rejection.
Full match/review/created persistence assertions remain to be expanded; this
does not claim full feature completion. Invitation, activation, and login
remain BB-11 scope.

## V211-BB-10L security and identity-match completion

Extended the existing real Express/PostgreSQL suite without changing
production logic. The suite now verifies authorized existing-identity match
handling and the supported `open_existing` transition, cross-actor draft
rejection, foreign-branch/foreign-tenant submission rejection with no
foreign membership mutation, and visibility of the created synthetic member
in the authorized HQ directory.

The extended suite passed **6/6, 0 failed, 0 skipped**. Existing lifecycle
assertions continue to verify persistence, church/branch scope, duplicate
prevention, idempotent replay, and pending activation. Browser verification
and invitation/activation/login remain outside this batch and remain BB-11
scope.

## V211-BB-10K complete HQ lifecycle verification

The HTTP suite now executes the full no-match lifecycle through the real
Express application and PostgreSQL pool: form GET, valid initial POST,
service-issued draft token, review confirmation, created-member redirect,
created page, church/branch persistence assertions, pending portal state,
and idempotent confirmation replay. The original three security/CSRF tests
remain intact. The complete suite passed **4/4**.

The focused regression command covering the HTTP suite, HQ route-contract
tests, branch/HQ membership workflows, and member registration passed
**40/40, 0 failed, 0 skipped**. Database assertions verified exactly one
synthetic membership, the expected church and branch, and
`portal_access_status=not_activated`. No administrative role was assigned.
Browser coverage remains `NOT_VERIFIED`; invitation, activation, and login
remain BB-11 scope.

## V211-BB-10M final security edge cases

The real HTTP suite now passes **7/7, 0 failed, 0 skipped**. It verifies
unsupported match-action rejection, cross-church draft replay rejection with
separate authorized tenants, and preserves the existing identity-match,
cross-actor, foreign-branch, foreign-tenant, directory, CSRF, persistence,
duplicate, replay, and pending-activation assertions.

An ambiguous-match fixture was not added because the current approved
BlessBoard member fixture contract does not provide a supported synthetic
multi-candidate identity constructor; no production matching or persistence
path was bypassed. Ambiguity remains characterized by existing duplicate
matching service tests, but is not claimed as real HTTP coverage. Browser
verification and BB-11 invitation/activation/login remain outstanding.

## V211-BB-10N final ambiguity characterization

The approved schema does not allow duplicate live church email/phone
identifiers, so a legitimate multi-candidate HTTP fixture cannot be created
from those identifiers. The real shared matching engine was therefore
characterized in `tests/v211-hq-add-member-ambiguous-match.test.js` with two
tenant-valid legitimate candidates sharing a phone, using the production
`evaluatePersonDuplicates` decision path. It returned both candidates,
`blocking=true`, and performed no merge or creation. The existing HTTP suite
verifies the HQ adapter invokes the same matching flow and preserves draft
and confirmation safety.

Final ambiguity classification: `SERVICE_AMBIGUITY_VERIFIED`; HTTP ambiguity
fixture is `NOT_VERIFIED` because the supported persistence contract prevents
that exact fixture. The characterization test, HQ HTTP suite, and
architecture suite passed **15/15, 0 failed, 0 skipped** in the final gate.
Commit readiness is `YES`; browser verification and BB-11 invitation,
activation, and login remain outside this milestone.
