# ActiveClinic demo seed command

## Command

```bash
DATABASE_URL=… \
DATABASE_IDENTITY_EXPECTED=blessboard-platform-v5 \
  npm run activeclinic:seed-demo-clinics -- --dry-run

DATABASE_URL=… \
DATABASE_IDENTITY_EXPECTED=blessboard-platform-v5 \
  npm run activeclinic:seed-demo-clinics -- --confirm

DATABASE_URL=… \
DATABASE_IDENTITY_EXPECTED=blessboard-platform-v5 \
  npm run activeclinic:seed-demo-clinics -- --confirm --reset-demo-password \
    --clinic=activeclinic-demo

DATABASE_URL=… \
DATABASE_IDENTITY_EXPECTED=blessboard-platform-v5 \
  npm run activeclinic:seed-demo-clinics -- --audit
```

## Options

| Option | Meaning |
|--------|---------|
| `--dry-run` | Plan only (default unless `--confirm`) |
| `--confirm` | Apply writes |
| `--clinic=<key>` | Limit to `activeclinic-demo` or `julflona-clinic` (repeatable) |
| `--reset-demo-password` | Allow credential (re)set. Demo admin + departmental users use `ACTIVECLINIC_DEMO_STAFF_PASSWORD` or built-in testing default (`mustChangePassword=true`). Julflona uses `--julflona-password` / temp handoff path. |
| `--demo-password=…` | Optional override for demo admin + departmental demo staff passwords (testing/demo only) |
| `--julflona-password=…` | Override requested Julflona credential (default is the mission-requested value) |
| `--audit` | Read-only demo tenant report |

## Safety gates

- Requires `DATABASE_IDENTITY_EXPECTED` match
- Allows only `environment_code` in `testing` \| `demo`
- Refuses unknown / production identity environments
- Never prints password hashes or session tokens
- One-time Julflona login secret (when policy blocks the requested value) is printed once on stderr as `CREDENTIAL_HANDOFF … oneTimeLoginSecret=…`

## Implementation

- Spec: `src/activeclinic/services/activeClinicDemoClinicSpec.js`
- Service: `src/activeclinic/services/activeClinicDemoClinicSeedService.js`
- CLI: `db/scripts/activeclinic-seed-demo-clinics.js`
- Tests: `npm run test:activeclinic:demo-clinics-seed`

## Idempotency

- Stable organization keys
- Upserts services by `service_key`, procedures by `procedure_key`, clinicians by `public_profile_key`
- Does not delete patient/appointment data
- Does not reset passwords on normal rerun without `--reset-demo-password`
