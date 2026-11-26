# V2132 G270 final QA release notes

**FINAL=V2132_G270_QA_RELEASE_CANDIDATE**

Product About versions on tip: BlessBoard **2.13.4**, ActiveClinic **2.13.4**.  
Prompt version 2.13.2 was superseded by later authorized bumps and is **not** downgraded.

## Candidate identity

| Field | Value |
| --- | --- |
| Branch | V13 |
| Tip under test (pre-doc commit) | `da2f93fdee471c77528e070a9ac6f290167a0999` |
| Hosted testing SHA (read-only) | `8ca60bd2cbff` on both AC and BB hosts |
| Hosted env | `moovex-platform-testing` / identity `moovex-platform-v7` |
| Hosted deployment this cycle | **NOT_PERFORMED** |

## G267 reconciliation (G260 → G266)

| Area | G260 claim | G266 independent result | G270 status |
| --- | --- | --- | --- |
| Lab E2E | PASS | Confirmed; components print gap found & fixed | PASS |
| Radiology E2E | PASS | Confirmed with print/content assertions | PASS |
| Clinical print | PARTIAL | Strengthened for lab/rad; hosted visual still open | PARTIAL |
| Patient portal / website | PASS | Confirmed in browser dual runs | PASS |
| OTP disposable PG | PASS | Confirmed G185/G272 ×2 | PASS |
| Live Resend mailbox OTP | BLOCKED | Still BLOCKED | BLOCKED |
| Community mock + disposable PG | PASS | Confirmed; posting disabled | PASS |
| D25 slot | UNAPPROVED fail | Expected HTTP fail preserved | OPEN |
| D25 overlap | PASS | Preserved in HTTP | PASS |
| Safe suite count | G260 reported 615/2 skip | G266/G270 honest glob = **561/0** contract+unit+quality | Documented |

## Dual suites (G268, tip `da2f93fd`)

| Suite | Run 1 | Run 2 |
| --- | --- | --- |
| Safe | 561 pass / 0 fail | 561 / 0 |
| HTTP g79 | 41 / 40 / 1 (D25 slot) | same |
| AC Playwright | 32 | 32 |
| BB Playwright | 23 | 23 |
| Community mock browser | 9 | 9 |
| Disposable OTP+Community PG | 3 pass | 3 pass |

## Verdict

`QA_GO_NO_GO=NO-GO`  
`RELEASE_READY=NO` for production.  
`HOSTED_QA_DEPLOYMENT_READY=CONDITIONAL` — package complete; **requires explicit owner approval** before any hosted action.

## What this candidate safely includes

- Clinical lab (including FBC component print/read-back) and radiology journeys
- Patient portal, reception, vitals correction, website publish isolation
- BlessBoard member/content/isolation browser coverage
- Disposable OTP persistence and Community Benefits mock/PG with posting disabled
- Fail-closed production OTP / Resend deliveryActivated=false

## What it does **not** claim

- Live email OTP through Resend
- D25 slot capacity productization
- Community financial posting or agreement activation
- Public booking enabled
- Migration 048 on shared/hosted without separate approval
- Hosted retest of G266 print/component fix (hosted still on `8ca60bd2`)
