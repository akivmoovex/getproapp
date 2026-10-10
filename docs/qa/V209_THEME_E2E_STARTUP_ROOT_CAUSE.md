# V2.09 Phase 4H.1 — E2E Startup and Schema Root Cause

BRANCH_SHA=6c88ca7c5d9bfc4236ae908f235d3d4aa664e8e4
STARTUP_ENTRY=server.js -> server.legacy.js (the Phase 4H command did not set an authoritative PLATFORM_DEPLOYMENT_CODE; runtime diagnostics reported unprofiled, so server.js selected the legacy branch)
STARTUP_PROFILE=Unprofiled/legacy, NODE_ENV=test, DEPLOYMENT_ENV=testing, local E2E database
UNDEFINED_SYMBOL_ORIGIN_FILE=server.legacy.js
UNDEFINED_SYMBOL_ORIGIN_LINE=575
FUNCTION_EXPORT_EXISTS=YES — src/startup/blessBoardOrgDbGate.js exports assertBlessBoardDatabaseIdentityOrExit at line 457
FUNCTION_IMPORT_CORRECT=NO — server.legacy.js calls the symbol at line 575 but has no import from src/startup/blessBoardOrgDbGate.js
FULL_STACK_TRACE=The server entry point catches startup rejection and logs only `Startup error: assertBlessBoardDatabaseIdentityOrExit is not defined`; no stack is emitted. The reproducible originating call site is server.legacy.js:575. server.js:115 selects server.legacy.js when resolveDeploymentConfiguration() returns no runtime mode.
STARTUP_ROOT_CAUSE=Missing import in the unprofiled legacy startup path, not a missing export. The V5 foundation path has a separate correctly named import of assertPlatformDatabaseIdentityOrExit at v5FoundationServer.js:1930.
APPLICATION_BUG_CONFIRMED=YES — the executed legacy entry point references an undeclared identifier.
PROPOSED_FIX=Add a named import of assertBlessBoardDatabaseIdentityOrExit from ./src/startup/blessBoardOrgDbGate near the other server.legacy startup imports. Then rerun the local startup under the intended authoritative E2E profile and verify identity/schema gates; do not weaken either gate.
PLATFORM_SCHEMA_STATUS=MISSING — read-only inspection found no platform schema and no platform.schema_migrations ledger.
ACTIVECLINIC_SCHEMA_STATUS=MISSING — read-only inspection found no activeclinic schema.
BLESSBOARD_SCHEMA_STATUS=PARTIAL/PRESENT — public Church baseline and incremental BlessBoard structures are present; the required platform/ActiveClinic foundation schemas are absent.
MISSING_MIGRATION_SETS=The foundation migrator’s authoritative module order is platform, blessboard, activeclinic, getpro, ngo. For this browser scope the missing sets are all applicable files in db/migrations/platform (42 numbered migration versions, excluding duplicate `* 2.sql` files), db/migrations/blessboard (the repository’s BlessBoard module set), and db/migrations/activeclinic (35 numbered migration versions, excluding duplicate `* 2.sql` files). The runner creates platform.schema_migrations and records module/version/checksum rows.
SAFE_DATABASE_UPGRADE=YES in principle, subject to a bounded dry-run/preflight and identity gate: the approved database is marked testing, is not to be recreated, and the migrator is transactional per migration with checksum history. No upgrade was performed in this analysis phase.
NEXT_ACTION=First implement/review the minimal server.legacy import fix under a separate authorized change phase. Then, with the E2E URL scoped exclusively to getpro_v209_e2e_test and identity checks enabled, run the repository db:migrate orchestration in module order, verify platform.schema_migrations plus platform/activeclinic/blessboard compatibility, start the server with an explicit authoritative local testing profile, check /healthz, and only then provision disposable BB/AC fixtures and run Playwright.
APPLICATION_CODE_CHANGED=NO
DATABASE_MUTATION=NO
PRODUCTION_MUTATION=NO
FINAL=V209_THEME_E2E_STARTUP_ROOT_CAUSE_COMPLETE

Read-only evidence: current_database was getpro_v209_e2e_test, current_user was
akivsolomon, and public.church_database_identity.environment_code was testing.
The database inventory returned only the public schema among public/platform/
activeclinic/blessboard and no platform migration ledger.
