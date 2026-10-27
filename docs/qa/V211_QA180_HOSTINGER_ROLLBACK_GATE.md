# V211-QA180 Hostinger Rollback Gate

## Current hosted revision

Both `https://blessboard.pronline.org/healthz` and `https://activeclinic.pronline.org/healthz` currently report:

- `gitSha=3df272ba6388`
- Full baseline SHA: `3df272ba6388b2a2360cd77b665aeba8ee8cacd3`
- `branch=V9`
- `deploymentCode=moovex-platform-testing`
- `environment=testing`
- `productSelection=hostname`
- `expectedIdentityKey=moovex-platform-v7`
- `expectedDatabaseEnvironment=testing`
- `schemaCompatible=true`

The identical runtime identity confirms unified BB/AC routing, but does not expose Hostinger operator controls.

## Rollback archive

The QA166 archive existed and matched the expected checksum:

- Temporary source: `/tmp/getpro-v211-rollback-3df272ba.tar.gz`
- Durable local copy: `.qa-operator-backups/getpro-v211-rollback-3df272ba.tar.gz`
- SHA-256: `9dd827f9755ff551282a96e7f81e79a5c24d40f282b8d92be64b38ef715596cc`

The archive was inspected for obvious secret filenames. It contains only source, examples, build output, and lockfile material; no secret values were introduced or uploaded. Environment examples are templates, not credentials.

## Hostinger operator controls

No authorized hPanel, SSH, deployment-history API, artifact registry, or Git deployment control is available in this environment. Therefore the following remain unverified:

- prior deployment selection;
- specific Git revision redeployment;
- previous artifact restoration;
- environment-variable preservation;
- one action restoring both BB and AC;
- operator restart and rollback execution.

No Hostinger setting, application, or deployment was changed.

## Restore procedure prepared

An operator with Hostinger access should select or redeploy the exact baseline SHA above in the unified `moovex-platform-testing` application, preserve the testing environment profile and database identity, build with `npm run build`, start with `npm start`, and verify `/healthz` on both hostnames. Startup failure requires restoring the last known-good application revision and retained environment configuration before repeating health checks.

Database compatibility is supported by the current health response (`schemaCompatible=true`) and the unchanged testing identity contract, but no database operation was performed.

## Alternative staging

A separate disposable staging deployment is possible only if an operator supplies an isolated Node application, isolated testing database with `moovex-platform-v7/testing`, distinct hostnames/certificates, retained environment secrets, and a documented rollback artifact. It must not share the current BB/AC runtime or database. No alternative was provisioned.

## Classification

`ROLLBACK_PROCEDURE_PREPARED`. The reproducible archive and instructions exist, but Hostinger revision selection, environment preservation, and operator restoration cannot be verified here. Deployment readiness remains `NO`.

No deployment, database mutation, commit, or push was performed.
