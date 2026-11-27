# V2134 G316 email OTP readiness

**FINAL=V2134_G316_EMAIL_OTP_READINESS**

Date: 27 November 2026  
Worktree: `/Users/akivsolomon/Development/getproapp-v13`  
Branch: `V13`  
Base at start: `31eefeb0762af887b0fb6dba3d1c7ec0989a9589`  
Versions: ActiveClinic `2.13.4`, BlessBoard `2.13.4`

| Field | Value |
| --- | --- |
| FINAL_SHA | recorded after the G316 push |
| REMOTE_SHA_MATCH | recorded after the G316 push |
| APPROVED_DB_IDENTITY | PASS `127.0.0.1:55432` / `getpro_v13_e2e_g78d2301` / `testing` / `moovex-platform-v7` |
| OTPQA135_STATUS | ABSENT_NOT_CREATED |
| IDENTITY_PROBE_STATUS | PASS_LEAST_PRIVILEGE |
| OTP_PERSISTENCE | PASS |
| D14C | PASS |
| D16 | PASS |
| RESEND_DOMAIN_VERIFIED | NOT_OBSERVED |
| RESEND_KEY_PRESENT | NO |
| QA_RECIPIENT_PRESENT | NO |
| PEPPER_PRESENT | NO |
| LIVE_SEND_AUTHORIZED | NO |
| REAL_EMAIL_ACCEPTED | NOT_RUN |
| REAL_EMAIL_DELIVERED | NOT_RUN |
| OTP_END_TO_END | NO |
| HOSTED_METADATA_STATUS | SOURCE_CORRECT_PANEL_BRANCH_V11 |
| TEST_RESULTS | Safe contract/unit 672 pass / 0 fail, twice. OTP integration 4 pass / 0 fail, twice. Browser OTP NOT_RUN |
| BLOCKERS | Resend key, verified-domain proof, one QA recipient, and pepper are absent. Live send stays fail-closed |
| REQUIRED_OPERATOR_ACTION | Confirm the Resend dashboard, then supply a sending-only key, exactly one QA recipient, and a non-published pepper outside Git |
| COMMIT | this G316 commit |
| PUSH | `origin/V13` only |
| MAIN_UNCHANGED | YES |
| DEPLOYMENT | NOT_PERFORMED |
| QA_GO_NO_GO | NO-GO |

Real email OTP did not succeed. No message was accepted or delivered, and no protected action was completed from a received code.

## What changed

The live-delivery database constant now matches the approved disposable database `getpro_v13_e2e_g78d2301`. `getpro_v13_e2e_otpqa135` is rejected. The bootstrap selector was not given permission to rebuild `getpro_v13_e2e_g78d2301`.

The identity probe no longer calls `current_setting('data_directory')` or `current_setting('unix_socket_directories')`. The approved role cannot read those settings. Path evidence now comes from the process listening on `127.0.0.1:55432` and that process's `postmaster.pid`. SQL rows cannot supply the paths. A live probe against the approved database matched the database, port, role, identity, cluster, data directory, and socket directory. The report contained no secret.

`deliveryActivated` remains false. Missing Resend configuration still refuses a send.

## Tests

Untracked `bb-lifecycle.log` and `docs/qa/V2131_GAP_G08_FINAL_REPORT.md` were left untracked.

| Suite | Run 1 | Run 2 |
| --- | --- | --- |
| `tests/v13/contract` + `tests/v13/unit` | 672 pass / 0 fail | 672 pass / 0 fail |
| D14C, D16, G185 cross-worker, G272 | 4 pass / 0 fail | 4 pass / 0 fail |
| D161 BlessBoard OTP browser spec | NOT_RUN | NOT_RUN |

The OTP browser spec is held until disposable browser authorization and is not in the BlessBoard Playwright `testMatch`. The browser harness still refuses to target `getpro_v13_e2e_g78d2301` for foundation bootstrap. That refusal was kept. Full ActiveClinic and BlessBoard Playwright suites were not started.

Disposable integration covered persistence, cross-worker verification, replay denial, one-winner consumption, and session completion only after the protected action. G272 kept Resend blocked for missing credentials.

## Hosted metadata

Public `/healthz` on 27 November 2026:

| Surface | gitSha | branch | branchSource | environment |
| --- | --- | --- | --- | --- |
| ActiveClinic | `31eefeb0762a` | `V11` | `GETPRO_GIT_BRANCH` | `testing` |
| BlessBoard | `31eefeb0762a` | `V11` | `GETPRO_GIT_BRANCH` | `testing` |

`31eefeb0762a` is the prefix of `origin/V13` at the start of G316. The source prefers `GETPRO_GIT_BRANCH` over git, which is the documented Hostinger rule. The panel value is `V11` while the deployed commit is on `V13`. The source was not changed and the host was not restarted or redeployed.

About copy that says “branch V13” is release text. The runtime label is the panel branch. The safe correction is an operator change of `GETPRO_GIT_BRANCH` to `V13` on the hosted app, followed by a worker restart under a separate deployment approval.

## Still required before QA GO

1. Resend dashboard verification for `pronline.org`.
2. Sending-only key, one QA recipient, and a private pepper, outside Git.
3. One authorized BlessBoard login send and one ActiveClinic recovery send, with independent mailbox receipt, one completion, and replay denial.

`QA_GO_NO_GO=NO-GO`
