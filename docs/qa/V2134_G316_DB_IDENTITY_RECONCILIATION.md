# V2134 G316 database identity reconciliation

Date: 27 November 2026  
Branch: `V13`  
Approved database: `getpro_v13_e2e_g78d2301`  
Unapproved name: `getpro_v13_e2e_otpqa135`

## Why the names diverged

The 26 November approval register names one disposable database:

| Field | Approved value |
| --- | --- |
| Host | `127.0.0.1` |
| Port | `55432` |
| Database | `getpro_v13_e2e_g78d2301` |
| Role | `v13_regression_213101` |
| Identity | `moovex-platform-v7` / `testing` |
| Cluster | `v13-regression-213101` |
| Data directory | worktree `.v13-isolated-pg/data` |

G301/G315 applied the reviewed OTP schema on that database only. Migration `048` stays out of `db/migrations`.

A later live-delivery gate hard-coded `getpro_v13_e2e_otpqa135` and treated `getpro_v13_e2e_g78d2301` as a mismatch. That name is not in the register. The database does not exist. It was not created in G316.

The isolated bootstrap selector still lists `getpro_v13_e2e_regression213101` and `getpro_v13_e2e_otpqa135`. That selector was not widened to `getpro_v13_e2e_g78d2301`. Foundation bootstrap still cannot target the approved OTP database.

## Decision

`getpro_v13_e2e_g78d2301` already meets the isolation checks the live gate enforces:

- loopback `127.0.0.1` only
- port `55432`, not shared port `5432`
- login role `v13_regression_213101` with no superuser, createdb, createrole, replication, bypassrls, or inherit
- `platform.database_identity` `moovex-platform-v7` / `testing`
- cluster `v13-regression-213101`
- project-local data directory and socket directory

Using that database for real OTP does not need a new database-scope approval. The register already names it for disposable OTP, including bounded real email once the operator supplies a verified sender, a sending-only key, and exactly one QA recipient.

G316 points the live-delivery constant at `getpro_v13_e2e_g78d2301`. A report of `getpro_v13_e2e_otpqa135` is now a wrong-database mismatch. No database was created, renamed, reset, or migrated.

## What remains blocked

Real email is still blocked. The register leaves these operator items unverified:

- Resend dashboard verification for `pronline.org`
- sending-only `RESEND_API_KEY` outside Git
- exactly one `GETPRO_RESEND_QA_RECIPIENTS` address
- a non-published `GETPRO_OTP_PEPPER`

`deliveryActivated` stays false until that whole contract passes. DNS records are not dashboard verification.
