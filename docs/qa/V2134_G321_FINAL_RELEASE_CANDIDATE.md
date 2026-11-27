# V2134 G321 final release candidate

FINAL=V2134_G321_FINAL_QA_HANDOFF

Date: 27 November 2026  
Branch: `V13`  
Worktree: `/Users/akivsolomon/Development/getproapp-v13`  
Candidate: `27a940e7809bd2f01ee22e9032443414b76a8dfa`  
Local and `origin/V13` match. `main` was not changed.

This is an owner review package. It does not deploy, restart hosted workers, change Hostinger, activate production OTP, or enable financial posting.

## Preserved work

| Gate | Commit | Still on the candidate |
| --- | --- | --- |
| G318 BlessBoard member-login OTP | `cee1286e830a92845d44f6c6a17cd581de2042f0` | Yes |
| G319 ActiveClinic recovery email OTP | `7b9b31d0c478188382d5802539bd60f9b9aebdf3` | Yes |
| G320 full regression | `27a940e7809bd2f01ee22e9032443414b76a8dfa` | Yes, and this is the candidate |

The sensitive approval register remains committed at `docs/approvals/V2134_SENSITIVE_APPROVAL_REGISTER.md`.

## Versions

BlessBoard About and ActiveClinic About both resolve to **2.13.4**.

- `src/platform/build/applicationBuildInfo.js` sets `PRODUCT_VERSION` and `PRODUCT_VERSION_V8` to `2.13.4` for every deployment profile.
- `views/blessboard/v5/apex/about.ejs` falls back to `2.13.4` and renders `Version 2.13.4`.
- `views/activeclinic/public/about.ejs` falls back to `2.13.4` and renders the same label.

Hosted About pages were not re-rendered in this review.

## What the candidate proved

Disposable database only: `127.0.0.1:55432` / `getpro_v13_e2e_g78d2301`. Evidence is `docs/qa/V2134_G320_FULL_REGRESSION.md`.

| Check | Result |
| --- | --- |
| Safe contract and unit | 682 pass, 0 fail, 0 skipped, twice |
| Authorized HTTP | 41 pass, 0 fail, 0 skipped, twice |
| BlessBoard browser regression | 23 pass, twice |
| BlessBoard dedicated OTP spec | 10 pass, twice |
| ActiveClinic browser regression | 32 pass, twice |
| ActiveClinic dedicated recovery OTP spec | 9 pass, twice |
| Community Benefits mock browser | 9 pass, twice |
| OTP PostgreSQL | PASS inside both HTTP runs |
| Community Benefits PostgreSQL | PASS inside both HTTP runs |
| D14C | PASS, staff login stays fail-closed |
| D16 | PASS |
| D25 Option C | PASS |
| AC-05 | PASS |

The dedicated OTP specs use the loopback observer on the disposable database. They are not live Resend deliveries. AC-AUTH-04 remains the reset-link journey and is not email-OTP evidence. The Community Benefits mock browser is not a PostgreSQL pass and is not a live email pass.

G320 fixed two test failures before the green pair. The authorized D25 case now asserts Option C: assigned-staff non-overlap is the capacity rule, and no slot-capacity integer was added. D05 clinic phones no longer reuse a seven-digit clock suffix. Clinical product source was not changed by that commit. Laboratory, radiology, referral print, prescription print, walk-in, vitals correction, patient search, and queue filters remained inside the ActiveClinic browser regression that passed twice. `deliveryActivated` stays false. `db/migrations/platform/048_otp_challenges.sql` stays absent.

## Live email

No authorized test message was received, and no received OTP completed a protected action.

| Gate | Result |
| --- | --- |
| Resend dashboard verification | NOT_OBSERVED |
| `RESEND_API_KEY` | ABSENT |
| QA recipient | ABSENT |
| Live pepper | ABSENT |
| Live email delivered | NO |
| Live OTP verified | NO |

Real Resend delivery remains NO-GO.

## Hosted dependency

Read-only public `/healthz` on 27 November 2026, after the candidate was pushed:

| Surface | gitSha | branch | branchSource |
| --- | --- | --- | --- |
| BlessBoard | `7b9b31d0c478` | `V11` | `GETPRO_GIT_BRANCH` |
| ActiveClinic | `7b9b31d0c478` | `V11` | `GETPRO_GIT_BRANCH` |

Both returned `ok=true`, `environment=testing`, `deploymentCode=moovex-platform-testing`, and `schemaCompatible=true`. The hosted commit is G319. The candidate is G320. The panel branch remains `V11`. Source still prefers the live panel value. Hostinger was not changed and workers were not restarted.

## Untracked files left in place

- `bb-lifecycle.log` is a local process log from 23 November 2026. It was not discarded and is not part of this handoff.
- `docs/qa/V2131_GAP_G08_FINAL_REPORT.md` is an older reconciliation from `97f31f07`. Its HTTP and browser rows were `NOT_RUN` at that time. Later executed QA supersedes that note. The file was not discarded and was not committed.

## Owner decision

QA_GO_NO_GO=NO-GO  
RELEASE_READY=NO

Release stays closed while live OTP is unverified and the hosted candidate, including the branch label, has not been deployed under a separate approval.

Open issue IDs: `OTP-LIVE-MAILBOX`, `OTP-MIGRATION-048`, `PUBLIC-BOOKING`, `CB-POSTING`, `HOSTED-RETEST`.

The next operator action is in `docs/qa/V2134_G321_RESEND_OPERATOR_ACTIONS.md`. The coverage map is `docs/qa/V2134_G321_COMPLETE_QA_MATRIX.md`.
