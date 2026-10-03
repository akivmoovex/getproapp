# V2.06 production fresh reset

Manual runbook for `moovex-platform-production` only. Never use testing or
staging credentials. Do not paste secrets into tickets or terminals.

## Before reset

1. Enable the provider maintenance/worker-stop window if required.
2. Create a provider snapshot or confirm PITR at the provider.
3. Record and verify it (the command writes only a redacted event):

```sh
NODE_ENV=production DEPLOYMENT_ENV=production DATABASE_URL="$DATABASE_URL" \
  node scripts/record-church-backup-verification.js backup \
  --outcome success --environment production-provider-check \
  --evidence "<provider-snapshot-or-PITR-id>"
```

4. Confirm the hosting profile is `moovex-platform-production`, the database
   identity is `moovex-platform-v7`, and the database environment is
   `production`. Do not proceed on any mismatch.

## Reset and bootstrap

After the separate destructive approval `PROCEED_PRODUCTION_RESET`, run from
the V2.06 `main` checkout with hosting-provided environment variables:

```sh
NODE_ENV=production DEPLOYMENT_ENV=production \
PLATFORM_DEPLOYMENT_CODE=moovex-platform-production \
DATABASE_IDENTITY_EXPECTED=moovex-platform-v7 \
DATABASE_IDENTITY_ENV=production \
PRODUCTION_RESET_CONFIRMED=YES \
PROCEED_PRODUCTION_RESET=YES \
npm run db:production-fresh-bootstrap
```

The command refuses by default, preserves provider/system objects, drops only
the application schemas, runs `npm run db:migrate` through the shared
migrator, and verifies identity, schema ceilings, ledger checksums, and zero
pending migrations. It never prints `DATABASE_URL`.

## Deploy and verify

Deploy the pushed `main` SHA through the Hostinger production procedure, then
verify `/healthz`, `/about`, both public hosts, registration, login, dashboard
entry, and disposable first-run writes for BlessBoard and ActiveClinic.

## Rollback

Stop workers, restore the recorded provider snapshot/PITR, redeploy the
previous known-good SHA, restart all workers, and verify database identity,
migration status, `/healthz`, and both product entry points. Do not reverse
applied migration history.
