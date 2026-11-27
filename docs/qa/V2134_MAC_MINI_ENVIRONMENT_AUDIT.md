# V2.13.4 Mac mini environment audit

**FINAL=V2134_MAC_MINI_OTP_AUDIT**

Date: 27 November 2026  
Host: `Mac-mini.local`  
Worktree: `/Users/akivsolomon/Development/getproapp-v13`  
Branch: `V13`  
`main` was not modified.

| Field | Value |
| --- | --- |
| LOCAL_SHA | `b781af3318478bff83e98284c81ba32afad23162` |
| REMOTE_SHA | `b781af3318478bff83e98284c81ba32afad23162` |
| REMOTE_MATCH | YES |
| MAC_MINI_DB_STATUS | ISOLATED_RUNNING; `getpro_v13_e2e_g78d2301` present; `getpro_v13_e2e_otpqa135` absent |
| MAC_MINI_SCHEMA_STATUS | OTP tables present on the approved disposable database; platform migration `048` absent |
| LAPTOP_PARITY | PARTIAL |
| D14C | PASS (disposable PostgreSQL; not live email) |
| D16 | PASS (disposable PostgreSQL; not live email) |
| RESEND_VERIFIED | NOT_OBSERVED |
| RESEND_KEY_PRESENT | NO |
| QA_RECIPIENT_CONFIGURED | NO |
| HOSTED_AC_SHA | `b781af331847` |
| HOSTED_BB_SHA | `b781af331847` |
| HOSTED_VERSION | `2.13.4` |
| REAL_EMAIL_ACCEPTED | NOT_RUN |
| REAL_EMAIL_DELIVERED | NOT_RUN |
| OTP_END_TO_END | NO |
| BLOCKERS | Live identity database absent; probe settings denied to the approved role; Resend key, pepper, allowlist, and dashboard proof absent |
| NEXT_ACTION | Keep using `getpro_v13_e2e_g78d2301` for disposable OTP. Do not create `getpro_v13_e2e_otpqa135` until a separate approval names it. Operator must supply a sending-only key, one exact QA recipient, and dashboard verification before any live mailbox test. |

Real email OTP is not working. Disposable PostgreSQL gates passed. No mailbox delivery or verification was performed.

## Phase 1 — Git

Local `V13` was `0c989ac90e99765825906e12c673612a216e2ead`, four commits behind `origin/V13`. The only uncommitted work was untracked:

- `bb-lifecycle.log`
- `docs/qa/V2131_GAP_G08_FINAL_REPORT.md`

Those files do not overlap the incoming commits. They were left untracked. `git merge --ff-only origin/V13` moved HEAD to `b781af3318478bff83e98284c81ba32afad23162`. After the fetch, local HEAD matches `origin/V13`.

`main` remains `44eafec486a18aeef2777bbcc9683e43f68ebe0d`.

BlessBoard and ActiveClinic share `PRODUCT_VERSION` `2.13.4` in `src/platform/build/applicationBuildInfo.js`. Hosted About pages report the same version for both products.

## Phase 2 — Mac mini versus documented G301/G315 laptop environment

G301/G315 documents do not record a Node patch, an npm version, or a machine hostname. They do record the disposable PostgreSQL target. Earlier isolated-instance notes (G77 / D23) record PostgreSQL 16.9 (Postgres.app) on `aarch64`. CI workflows pin Node 22. Browser configs for the G315 ActiveClinic and BlessBoard suites use Desktop Chrome.

| Check | Documented G301/G315 laptop target | Observed Mac mini |
| --- | --- | --- |
| OS / CPU | Not named in G301/G315 | macOS 27.0.1, arm64, Apple M5 Pro, 15 cores, 24 GiB |
| Node | CI pin `22`; patch not recorded | `v22.23.1` via nvm; npm `10.9.8`; `engines.node` is `>=20` |
| Playwright | Desktop Chrome suites | `@playwright/test` `1.59.1`; Chromium `1217` and headless shell installed (mac-arm64). Firefox and WebKit are not installed |
| PostgreSQL | 16.9 Postgres.app, aarch64 | 16.9 (Postgres.app) on `aarch64-apple-darwin21.6.0` |
| Isolated port | `127.0.0.1:55432` | Listening on `127.0.0.1:55432` only |
| Cluster | `v13-regression-213101` | Same cluster name, data directory, and socket directory under `.v13-isolated-pg` |
| Shared port 5432 | Forbidden for this work | Listening (Postgres.app `var-16`). Not queried |
| Approved disposable DB | `getpro_v13_e2e_g78d2301` | Present. Owner `v13_regression_213101` |
| Newer live-delivery DB | Not in the G301 register | `getpro_v13_e2e_otpqa135` does not exist |
| Older regression DB | Out of scope | `getpro_v13_e2e_regression213101` exists. Not opened |
| Role | `v13_regression_213101`, login, not superuser | Matches: login true; superuser, createdb, createrole, replication, bypassrls, and inherit all false |
| Identity | `moovex-platform-v7` / `testing` | Same on `getpro_v13_e2e_g78d2301` |
| OTP schema | Present; migration `048` absent | `platform.otp_challenges` and `platform.otp_rate_buckets` present. Platform `schema_migrations` stops at `047`. `db/migrations/platform/048_otp_challenges.sql` is absent |
| Schemas | Foundation disposable | `activeclinic`, `blessboard`, `getpro`, `ngo`, `platform`, `public` |
| App ports | Local disposable HTTP/browser ports | `3000`, `4186`, and `4187` are free. Port `5000` is macOS Control Center |
| Dependencies | node_modules for the worktree | Present. `pg` `8.20.0`. `express` present |
| Process env names | Testing disposable profile during QA | Agent process has no `NODE_ENV`, `DEPLOYMENT_ENV`, `DATABASE_URL`, or OTP/Resend variables |
| Resend key | Unset in the G301/G315 agent environment | Absent |
| OTP pepper | Not a live secret in Git | `GETPRO_OTP_PEPPER` absent in the agent environment |
| QA recipient allowlist | Unset; mailbox list unverified | `GETPRO_RESEND_QA_RECIPIENTS` absent |

No database was created, renamed, reset, or migrated.

### `getpro_v13_e2e_g78d2301` versus `getpro_v13_e2e_otpqa135`

These are not the same database.

| | `getpro_v13_e2e_g78d2301` | `getpro_v13_e2e_otpqa135` |
| --- | --- | --- |
| Named by the 26 November approval register | Yes | No |
| Used for the G301/G315 disposable PASS | Yes | No |
| Present on this isolated instance | Yes | No |
| Required by `src/platform/otp/otpQaLiveDelivery.js` at this tip | No | Yes |
| Accepted by the older disposable CI name rule | Yes | Would match the name rule only if it existed |

The current tip's live-delivery gate compares a fresh PostgreSQL observation with `getpro_v13_e2e_otpqa135`. The database that actually passed laptop OTP QA is still `getpro_v13_e2e_g78d2301`. Creating or renaming a database to close that gap is outside the register.

The live identity probe also reads `data_directory` and `unix_socket_directories`. The approved role `v13_regression_213101` is denied both settings (`42501`). `cluster_name` is readable. A live send cannot pass the current probe on this role even if the database name matched.

## Phase 3 — OTP gates on the approved disposable database

Safe OTP unit, contract, and security tests ran with database URLs and write flags unset:

`119` tests, `119` pass, `0` fail, `0` skipped.

Authorized non-destructive integration tests then ran only against `127.0.0.1:55432` / `getpro_v13_e2e_g78d2301` / `v13_regression_213101`, after the disposable harness accepted that identity. The run did not apply schema and did not send email. Each persistence test deletes only the synthetic challenge and rate-bucket rows it inserts.

| Suite | Result |
| --- | --- |
| D14C OTP authentication integration | PASS |
| D16 shared platform OTP integration | PASS |
| G185 shared OTP persistence | PASS |
| G272 email OTP disposable lifecycle | PASS |

| Gate | Result | Meaning |
| --- | --- | --- |
| D14C | PASS | Production activation stays blocked. Shared challenge row required |
| D16 | PASS | Second worker can verify the same disposable challenge |
| CROSS_WORKER | PASS | Two pools share `platform.otp_challenges` |
| REPLAY | PASS | A consumed challenge is not verified again |
| ATOMIC_CONSUMPTION | PASS | One of two parallel completions wins |
| SESSION_COMPLETION | PASS | Verification alone does not complete a session |

G272 also kept Resend fail-closed: mailbox delivery `NOT_EXECUTED`, acceptance `BLOCKED_MISSING_CREDENTIALS`.

The full G315 safe, HTTP, and Playwright suites were not re-executed. The Mac mini has the matching disposable database, Node 22, Chromium, and free application ports those suites need. That is readiness, not a new full-suite pass.

## What was not done

- No change to `main`
- No hosted deploy, restart, or environment edit
- No database create, rename, reset, or migration
- No connection to port `5432`
- No session opened on `getpro_v13_e2e_regression213101`
- No real email
- No OTP code or API secret written here
