# V2134 G301 approval execution audit

## Starting tip

- Branch: `V13`
- Work started from `origin/V13` at `1fd1144be49a4e5c8593cbe6ee6c3bb4a9f7dad8`
- No reset or discard of newer commits

## Approval register

Attachment `V2134_SENSITIVE_APPROVAL_REGISTER.md` was not readable from the
worktree, Downloads, Documents, or Cursor uploads. The register was recreated
from the explicit G301–G315 authorization terms and marked
`UNVERIFIED_ATTACHMENT` for unavailable dashboard/recipient details.

Committed path: `docs/approvals/V2134_SENSITIVE_APPROVAL_REGISTER.md`

## Disposable database preflight

| Check | Result |
| --- | --- |
| Host/port | `127.0.0.1:55432` |
| Database | `getpro_v13_e2e_g78d2301` |
| Role | `v13_regression_213101` |
| Identity environment | `testing` |
| Public booking enabled count | `0` |
| Shared `5432` | not used |
| OTP script SHA-256 | `caf9c3ec3fe5935623381969feb3e53863618470826b87c7c06b95783295c161` |
| Community script SHA-256 | `870c1f71ec5a2b2a5818842eed510f9595fde8eb71bb3da9c251a6ef176dee2c` |
| Destructive SQL match | none (comment-only mentions) |

## Schema apply

| Script | Target | Applied | Migration promoted |
| --- | --- | --- | --- |
| `docs/qa/V2132_G181_OTP_CHALLENGES.sql` | disposable only | YES | NO (`048` remains absent) |
| `docs/qa/community-benefits/V2132_COMMUNITY_BENEFITS_SCHEMA.sql` | disposable only | YES | NO |

## Operator dependencies remaining

- Resend dashboard verification timestamp for `pronline.org`
- Sending-only API key in approved QA secret store
- Exact allowlisted QA recipient addresses outside Git

No secrets were written to the repository.

## Dual suite results after final functional source changes

| Suite | Run 1 | Run 2 |
| --- | --- | --- |
| Safe | 602/600/0/2 | 602/600/0/2 |
| HTTP g79 | 40/39/1 (D25 slot) | 40/39/1 (D25 slot) |
| AC Playwright | 32 | 32 |
| BB Playwright | 23 | 23 |
| Community mock Playwright | 9 | 9 |
| Community PG persistence | PASS | PASS |
| D14C / D16 / G185 | PASS | PASS |

OTP schema applied: YES (disposable).  
Community schema applied: YES (disposable).  
Financial posting: DISABLED.  
Hosted deployment: NOT_PERFORMED.  
`main`: unchanged.
