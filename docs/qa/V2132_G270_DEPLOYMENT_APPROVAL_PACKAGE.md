# V2132 G270 hosted QA deployment approval package

**HOSTED_QA_DEPLOYMENT=NOT_PERFORMED**  
This package is for **explicit owner authorization only**. Do not deploy, restart, mutate env vars, or touch hosted databases from this document alone.

## 1. Targets

| Item | Value |
| --- | --- |
| ActiveClinic URL | https://activeclinic.pronline.org |
| BlessBoard URL | https://blessboard.pronline.org |
| Intended tip | Current `origin/V13` HEAD after G270 push (must equal local HEAD) |
| Pre-doc tip under dual suites | `da2f93fdee471c77528e070a9ac6f290167a0999` |
| Current hosted SHA (read-only 2026-11-26) | `8ca60bd2cbff` (both hosts) |
| Hosted branch label | `V11` via `GETPRO_GIT_BRANCH` (labeling only; code SHA is authoritative) |
| Hosted About version | 2.13.4 |

## 2. Environment identity (observed read-only)

From `/healthz` on both hosts:

- `deploymentCode`: `moovex-platform-testing`
- `environment`: `testing`
- `expectedIdentityKey`: `moovex-platform-v7`
- `expectedDatabaseEnvironment`: `testing`
- `sessionCookieName`: `moovex_platform_testing_sid`
- `mediaWriteNamespace`: `testing`
- `jobsEnabled`: false
- `schemaCompatible`: true (current hosted schema checks)

**Production separation:** testing cookie/media namespaces and testing deployment code. Do not use production hosts or production DB for this candidate.

## 3. Database isolation & schema

| Requirement | Action |
| --- | --- |
| Confirm testing DB identity before deploy | Operator: `db:identity:check` / health identity fields |
| OTP challenges table (migration 048) | **Do not apply** unless separately approved; expect OTP live E2E blocked |
| Community Benefits tables | **Do not apply/activate** unless separately approved; posting stays disabled |
| Backup | Full testing DB backup **before** any schema change |
| Rollback DB | Restore backup; do not “fix forward” without approval |

## 4. Feature flags / disabled states (must remain)

| Control | Required state |
| --- | --- |
| Public booking | DISABLED |
| Production OTP activation | BLOCKED |
| Resend `deliveryActivated` | false |
| Live email/SMS | FORBIDDEN unless separate ticket |
| Community financial posting | DISABLED |
| Agreement activation | UNAPPROVED |
| Production media binary uploads | Hold preserved |

## 5. Environment variables (do **not** change without approval)

Proposed QA-only Resend shape (install only after owner approval):

```
GETPRO_RESEND_SENDER_PROFILE=hosted-qa
GETPRO_RESEND_VERIFIED_DOMAINS=pronline.org
RESEND_API_KEY=<external secret — not in repo>
```

QA senders (proposed): `qa-blessboard@pronline.org`, `qa-activeclinic@pronline.org`  
Domain verification must be confirmed in Resend dashboard (`NOT_OBSERVED` as of local readiness docs).  
**This cycle did not install secrets or alter hosted env.**

## 6. Backup & rollback plan

1. Snapshot/backup hosted **testing** database.  
2. Record current hosted SHA `8ca60bd2cbff` as rollback target.  
3. Deploy approved tip only to testing hosts.  
4. If smoke fails: redeploy `8ca60bd2` (or last known-good), restore DB if schema changed.  
5. Never promote to production from this package.

## 7. Post-deploy health & smoke

1. `/healthz` on both hosts → new `gitSha`, still `testing`.  
2. `/about` → 2.13.4 + new SHA.  
3. Execute `docs/qa/V2132_G270_BROWSER_ACCEPTANCE_GUIDE.md` (AC + BB).  
4. Especially retest **lab components print** (G266-01) — not yet on hosted `8ca60bd2`.  
5. Confirm booking still disabled; no live OTP unless authorized.

## 8. Open items requiring approval (each with impact)

| Open item | Owner | Operator action | Evidence | Test afterward | Impact |
| --- | --- | --- | --- | --- | --- |
| Deploy tip to hosted QA | Owner | Approve + run deploy runbook | This package | Browser acceptance | Hosted catches G266 |
| Resend domain + QA key | Platform | Verify domain; set key/allowlist | G254 | Authorized OTP only | Unblocks live OTP QA |
| Migration 048 on testing | DB owner | Approve SQL + backup | G181 SQL | Disposable-style OTP PG on hosted testing | Schema risk |
| D25 slot productization | Product | Approve capacity rules | D25 HTTP fail | New capacity tests | Feature incomplete |
| Community posting | Product/legal | Keep disabled or approve | G256 | Settlement refuse | Financial risk |
| Production release | Owner | **Refuse** until gates clear | Gate matrix | Full prod plan | Out of scope |

## 9. Approval signature block (human)

```
APPROVED_FOR_HOSTED_QA_DEPLOY: YES / NO
APPROVER:
DATE:
APPROVED_SHA:
ALLOW_ENV_CHANGES: YES / NO
ALLOW_SCHEMA_CHANGES: YES / NO
ALLOW_LIVE_EMAIL: YES / NO  (default NO)
```

Without a completed signature block, deployment remains **forbidden**.
