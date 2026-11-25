# V2.13.2 G149 — release gate matrix

QA is NO-GO. The release is not ready. Hosted browser rows are `NOT_RUN` or `BLOCKED`. None are hosted PASS. Local disposable evidence is listed only so QA can see what was already proved off the host.

| Gate | Hosted result | Local evidence | Release effect |
| --- | --- | --- | --- |
| About 2.13.2 | NOT_RUN | Templates say 2.13.2. Public About was not re-scraped this cycle | Required before hosted sign-off |
| Deployed SHA matches `origin/V13` | Public `/healthz` showed `155ada725926` while that was `origin/V13`. This session did not deploy it | Not a hosted test pass | Re-check after the next push |
| Branch label | `V11` from `GETPRO_GIT_BRANCH` | Unit test keeps the env label and the SHA separate | Operator sets `V13` only under the deploy plan |
| AC-FU-PORTAL-01 | NOT_RUN | Local Playwright pass | Hosted sign-off still required |
| AC-FU-PORTAL-02 | NOT_RUN | Policy mismatch. Unknown registration must not insert a patient | Not a bug to close |
| AC-FU-PORTAL-03 | NOT_RUN | Public booking disabled | Stays disabled |
| AC-FU-PORTAL-04 | BLOCKED | D14C and D16 fail without `platform.otp_challenges` | Not release-ready |
| AC-FU-WEB-01 through WEB-03 | NOT_RUN | Local website tests passed. Binary upload was not enabled | Hosted sign-off still required |
| AC-FU-REC-01 through REC-05 | NOT_RUN | Named local tests passed | Hosted sign-off still required |
| AC-FU-CLIN-01 through CLIN-03 | NOT_RUN | Local vitals and worklist tests passed | Hosted sign-off still required |
| Wrong-clinic denial | NOT_RUN | Local foreign-clinic denial | Hosted sign-off still required |
| Staff overlap | NOT_RUN as a hosted browser test | Local two-client PostgreSQL test passed in G146 | Do not treat the local test as hosted PASS |
| Slot capacity | NOT_RUN | `BLOCKED_APPROVAL_REQUIRED` | Do not invent a capacity number |
| BlessBoard registration, member, invitation, website, sermon, event, announcement, CSRF, role | NOT_RUN | Local Playwright 23 passed in G146 | Hosted sign-off still required |
| Media upload | NOT_RUN | Local refusal while the flag is unset | Stays disabled |
| Production OTP | BLOCKED | Fail-closed | Stays disabled |
| Resend `pronline.org` | BLOCKED | Exact-domain code. Verification not observed | DNS is not verification |
| Migrations 043, 044, 048 | Not proved by `schemaCompatible` | 043 and 044 exist only on disposable G78. 048 was not created | Do not apply them for this deploy |
| Community benefits posting | No flag in `src/` | Not enabled | Do not add it |

## Open items

1. Production OTP is disabled.
2. Patient OTP recovery is not release-ready.
3. D25 slot-capacity policy remains unapproved.
4. Public self-registration is not an approved feature.
5. Public appointment booking remains disabled.
6. Production binary media upload remains disabled.
7. A public health SHA can move without this repository session deploying it, and the branch label can stay `V11`.
8. Resend domain setup does not prove OTP delivery.

November 23 scenarios mapped: 15. Hosted checklist rows executed: 0.
