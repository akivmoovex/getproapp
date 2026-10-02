# ActiveClinic hosted authenticated QA fixture

**TESTING ONLY.** Never run against production. Never use the shared demo tenant.

## Purpose

Provision one disposable ActiveClinic clinic, exercise real hosted authentication against `https://activeclinic.pronline.org`, then purge that organization with the existing scoped testing-tenant purge.

Strategy: `DISPOSABLE_QA_TENANT`.

Do **not** use `activeclinic-demo`, `julflona-clinic`, or documented demo QA role users for this mutating path.

## Allowed environment

The CLI and purge fail closed unless all of these are true:

```text
deploymentEnv=testing
database identity=moovex-platform-v7
deployment profile=moovex-platform-testing
```

Refuses production, wrong database identity, reserved demo keys, and any organization key outside:

```text
ac-hqa-*
hosted-qa-*
```

(`hosted-qa-*` is accepted only so leftover keys from an earlier clinic-name slug can still be purged.)

There is no public unauthenticated cleanup route.

## Setup

```bash
scripts/local/run-with-blessboard-env.sh testing \
  npm run activeclinic:hosted-auth-qa:testing -- --confirm --repeat
```

Dry-run (no writes):

```bash
scripts/local/run-with-blessboard-env.sh testing \
  npm run activeclinic:hosted-auth-qa:testing -- --dry-run
```

The runner:

1. Asserts `moovex-platform-v7` / `testing`.
2. Registers a real clinic (`Ac Hqa {stamp}`) so the slug is `ac-hqa-…`.
3. Creates one `qa-consultation` service and enables public booking for that org only.
4. Publishes the clinic website with the same product publication services as CMS (`allowEmpty`, readiness override reason `hosted_auth_qa`).
5. Logs in over HTTPS with the real staff password (never printed).
6. Exercises staff app, onboarding, website hub, invite, public booking, patient portal.
7. Purges the organization.
8. With `--repeat`, runs the same path a second time.

## Actors

| Actor | How created | Role | Notes |
| ----- | ----------- | ---- | ----- |
| Staff admin | Real clinic registration | organization admin from registration | Password credential, org + facility membership |
| Invitee | Optional `POST /app/staff` invitation | receptionist | Purged with the org; testing does not send email |
| Patient | Guest booking → portal register | `principalKind=patient` | Synthetic phone only |

Passwords, session cookies, and CSRF tokens must never appear in reports. The public fixture record exposes `passwordSet: true` only.

## Cleanup

Cleanup is `purgeActiveClinicTestingOrganization` keyed to the disposable `organization_key`.

| Entity | Creation | Cleanup | Scoped identifier |
| ------ | -------- | ------- | ----------------- |
| Organization / HCO / facility | Registration | Org purge | `ac-hqa-*` key |
| Staff identity + memberships + roles | Registration | Org purge | org id |
| Staff invitation | Invite POST | Org purge (`staffInvitations`) | org id |
| Website publication | Fixture publish + optional CMS POST | Org purge | org id |
| Booking request + guest token | Public MF10 | Org purge | org id |
| Patient + portal link | Portal register | Org purge | org id |
| Sessions | Login | Cookie clear + org/identity purge | org identities |

Do not use time-window deletes. Do not purge `activeclinic-demo`.

Verify leftovers by selecting `organization_key` from `platform.organizations` where the key is `ac-hqa-%` or `hosted-qa-%`.

## Safety guards

- `hostedQaEnv()` forces `DEPLOYMENT_ENV=testing` and the expected identity key.
- Prefix + reserved-key checks before purge or website publish.
- Organization id must match the hosted-QA key before booking/website mutations.
- Automated tests in `tests/activeclinic-hosted-auth-qa-safety.test.js` prove production refusal, wrong DB identity refusal, demo-tenant refusal, and password stripping.
