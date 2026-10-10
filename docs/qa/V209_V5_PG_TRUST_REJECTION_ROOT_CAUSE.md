# V2.09 Phase 4K.2H — V5 PostgreSQL Trust Rejection Root Cause

```text
BRANCH_SHA=6c88ca7c5d9bfc4236ae908f235d3d4aa664e8e4
ERROR_SOURCE_FILE=external Postgres.app/node-pg connection path; no repository trust-policy string found
ERROR_SOURCE_LINE=server.js V5 startup catch reports the rejected pool startup error; v5FoundationServer.js:1928-1929 creates the pool and calls verifyFoundationPool
ERROR_FUNCTION=Pool connection during verifyFoundationPool initialization
ERROR_CLASS=PostgreSQL connection/authentication error as surfaced by the V5 startup catch
ERROR_CODE=NOT_SURFACED; SQLSTATE unavailable
CONNECTION_ESTABLISHED_BEFORE_REJECTION=NO evidence in V5 path; failure occurs before verifyFoundationPool completes and before HTTP listen
POSTGRES_ERROR_OR_APPLICATION_GUARD=PostgreSQL/node-pg authentication failure; no application trust guard identified
TRUST_POLICY=No repository policy explicitly prohibits local trust; application does not emit the phrase
NODE_ENV_EFFECT=NODE_ENV=test selected TEST_DATABASE_URL; NODE_ENV=development selected DATABASE_URL; both standalone configurations succeeded, while V5 pool startup still failed
STANDALONE_VS_V5_DIFFERENCE=Standalone node-pg SELECT and psql succeeded; V5 pool path fails during startup before health/listen, with no SQLSTATE exposed
ROOT_CAUSE=Unresolved external pool authentication-path discrepancy, not database target mismatch or an identified application guard
SECURE_CORRECTION=Expose the original pg error code/cause in redacted local diagnostics, then use the verified local password-authenticated connection configuration; do not weaken pg_hba or use trust as a workaround
APPLICATION_CODE_CHANGED=NO
DATABASE_MUTATION=NO
PRODUCTION_MUTATION=NO
FINAL=V209_V5_PG_TRUST_ROOT_CAUSE_COMPLETE
```

Read-only tracing found no application source string for “Postgres.app” or
“trust authentication.” The repository creates the pool in
`v5FoundationServer.js` and immediately performs `SELECT 1` in
`verifyFoundationPool`; the reported failure precedes schema compatibility and
HTTP listening. No database or authentication configuration was changed.
