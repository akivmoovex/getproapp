# V2.09 Phase 4K.1 — BlessBoard Registration Contract Repair

BRANCH=V9
BASE_SHA=6c88ca7c5d9bfc4236ae908f235d3d4aa664e8e4
ROOT_CAUSE=The earlier diagnosis queried the wrong table. `assignBlessBoardRole` persists assignments in `blessboard.user_role_assignments`, not `blessboard.user_roles`. The fresh registered administrator has two active assignments in the approved E2E database.
CANONICAL_V5_PRINCIPAL=Direct `blessboard_user` principal is supported. `deploymentApplicationCompatibility` explicitly allows BlessBoard users; a platform identity bridge is not required for the BlessBoard profile. Linked platform identities are optional compatibility, not a prerequisite for this flow.
IDENTITY_BRIDGE_REQUIRED=NO for the tested `blessboard-org-staging` V5 path
ROLE_ASSIGNMENT_CAUSE=No role-assignment defect was proven. The actual fresh user has active `organisation_administrator` and `branch_administrator` assignments in `blessboard.user_role_assignments`, scoped to the fresh organization/church/branch. The prior zero-row result came from querying obsolete/wrong `blessboard.user_roles`.
FILES_CHANGED=Only this QA results report; no application or test files changed
SCHEMA_MIGRATION=NONE
FRESH_REGISTRATION=PASS — previously executed supported registration transaction created the legacy-compatible BlessBoard administrator and organization
V5_LOGIN_ELIGIBILITY=PASS by principal contract evidence — direct BlessBoard user is an allowed V5 principal and active role assignments exist; browser login was not rerun in this repair phase
WEBSITE_PERMISSIONS=NOT_REMEASURED in this phase; role assignments are present and existing RBAC services remain authoritative
EXISTING_USER_COMPATIBILITY=Preserved; no credentials or existing identities were changed
IDENTITY_REUSE=NOT_REMEASURED
REGISTRATION_RETRY=NOT_REMEASURED
CONFLICT_HANDLING=NOT_REMEASURED
INVITATION_FLOW=NOT_REMEASURED
ROLLBACK_TEST=NOT_REMEASURED
CROSS_TENANT_ISOLATION=NOT_REMEASURED
FOCUSED_PASS=2 — database identity and correct role-assignment persistence verification
FOCUSED_FAIL=0
REGRESSION_PASS=0
REGRESSION_FAIL=0
PRODUCT_RUNTIME_CHANGED=NO
PRODUCTION_MUTATION=NO
COMMIT=NOT_PERFORMED
PUSH=NOT_PERFORMED
FINAL=V209_BB_V5_REGISTRATION_REPAIR_VERIFIED

No runtime repair was necessary or safe to apply: the reported defect was
caused by an incorrect diagnostic query, not by missing V5 authorization.
