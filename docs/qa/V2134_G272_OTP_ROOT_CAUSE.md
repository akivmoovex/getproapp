# V2134 G272 OTP root cause (rechecked)

Branch `V13`. Worktree `/Users/akivsolomon/Development/getproapp-v13`.  
Actual `origin/V13` at inspection: `60fab3d37e492f6aba4e81892495e9260fee5294` (newer than prompt base `df517e57…`).  
About version already `2.13.4`. Untracked only: `bb-lifecycle.log`, `docs/qa/V2131_GAP_G08_FINAL_REPORT.md` (left untouched).

## Rechecked evidence

| Fact | Evidence |
| --- | --- |
| Disposable OTP tables present | `to_regclass` on `127.0.0.1:55432` / `getpro_v13_e2e_g78d2301` → `platform.otp_challenges`, `platform.otp_rate_buckets` |
| Migration `048` | Still absent (contract) |
| This cycle schema apply | **Not authorized** by G272–G280 prompt |
| `RESEND_API_KEY` | unset in agent environment |
| `GETPRO_RESEND_*` | unset |
| Resend dashboard | `NOT_OBSERVED` |
| `pronline.org` DNS | DKIM TXT length 221; `rsend`/`send` CNAMEs present; DMARC `p=none` |
| `pronline.org` vs `notify.pronline.org` | Distinct; production catalog uses `notify.*`; hosted-QA uses apex `pronline.org` |
| `deliveryActivated` | Hard-`false` on all providers; `true` is rejected by `createOtpService` / `beginChallenge` |
| Default activation | `resolveOtpActivation` → `BLOCKED` unless non-production override `ACTIVE` |
| Password recovery default | Reset-link path while activation blocked |
| Live mailbox | Not executed |

## Exact runtime failure chain

1. Forgot Password routes call the recovery bridge with **no** `GETPRO_OTP_ACTIVATION=ACTIVE` → activation stays `BLOCKED` → link-reset continues.
2. Even when activation is forced `ACTIVE` in tests, routes historically lacked a code-entry + `completeProtectedAction` boundary for recovery.
3. Provider default is `inactive` unless `GETPRO_OTP_PROVIDER=resend|interface|fake`. Inactive dispatch returns `not_activated` (challenge may still persist).
4. Resend dispatch (with `deliveryActivated=false`) can call the network only when provider is selected **and** API key + verified-domain allowlist pass preflight. Those secrets are absent here.
5. A Resend 2xx is still not mailbox proof; allowlisted QA recipients are required and were not supplied.
6. Cross-worker PostgreSQL persistence works on the disposable DB when tables exist; HTTP D14C/D16/G185 pass. Schema apply remains separately gated.

## What “fixed” means for this cycle

Independently actionable: wire activation/env, recovery challenge→verify→completeProtectedAction, Resend QA recipient allowlist, diagnostics, and tests that fail closed without secrets/schema approval.

Not independently actionable here: live Resend acceptance, mailbox confirmation, production activation, or applying reviewed SQL without new approval.
