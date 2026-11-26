# V2132 G241 baseline (executed on current V13 tip)

## Git / version

| Field | Value |
| --- | --- |
| Branch | `V13` |
| Prompt “last verified” SHA | `13740959…` (stale) |
| Actual work start HEAD | `157b2fc48217044e6fe0a0032962428706b6963d` (= `origin/V13`) |
| Product About version | **2.13.4** (already bumped in prior G314/G280 cycles; **not** downgraded) |
| Prompt requested version | 2.13.2 — superseded by later authorized work on V13 |
| `main` | unchanged |
| Untracked left alone | `bb-lifecycle.log`, `docs/qa/V2131_GAP_G08_FINAL_REPORT.md` |

## Prior cycles already present (do not re-claim as new)

- G223–G240 clinical / coverage hardening (lab, radiology, printing, BB, security)
- G301–G315 approved disposable OTP + Community Benefits schema apply + PG E2E
- G272–G280 recovery email OTP wiring + Resend fail-closed QA gates

## November 25 hosted reports

DOCX reports named in the prompt were **not accessible** in Downloads/Documents at execution time (same as G240). Hosted V2.13.1 observations remain separate from local tip evidence.

## Guards preserved

- No shared `5432` / production DB
- No unauthorized migration apply this cycle
- No real email/SMS
- No live financial posting
- No hosted/production deploy
- No `main` modification / no force-push
