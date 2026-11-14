# Approval requests

Nothing below was granted. A later run may start only when the request is already true in the environment. This stage does not set the flags.

| Request | Needed before | Current state |
|---|---|---|
| Both database write flags, testing identity, and a run id | Any fixture apply or `db:migrate` | Flags are off. No URL is set |
| A local run-owned database whose name the guard accepts | Bootstrap and teardown | Not created |
| `GETPRO_V13_BROWSER_AUTHORIZED=1` and `E2E_DATABASE_URL` | Any browser journey | Not set |
| AC-05 rows for `platform-admin@v13d19.example` and `tenant-reader@v13d19.example` | Live 403 | Plan says `persisted: false` |
| D21-05, naming the capacity rule | A capacity lock or column | `BLOCKED_APPROVAL_REQUIRED` |
| An approved OTP migration | `platform.otp_challenges` | The file must not be created here |

Do not approve a merge, a retention period, an allergy block, a substitution, or a change to the three registration sentences. Do not revoke the public booking lookup token.
