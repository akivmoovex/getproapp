# G240 system-wide QA handoff

FINAL=`V2132_G240_SYSTEM_WIDE_QA_HARDENED`

Branch `V13`. Versions remain ActiveClinic 2.13.2 and BlessBoard 2.13.2.
Expected prompt base `13740959` is historical; work continued from tip
`8ef0a151` after the G225–G240 inventory commit and G224 laboratory repair.

## What closed

- Radiology order → report → verify → clinician read-back (HTTP + browser +
  PostgreSQL).
- Radiology reported filter/tab and dashboard counters.
- Radiology request detail with print and second-staff verification.
- Laboratory journey remains covered from G224.

## Suite evidence (after last source change)

| Suite | Run 1 | Run 2 |
| --- | --- | --- |
| Safe | 600/598/0/2 | 600/598/0/2 |
| HTTP | 38/35/3 | 38/35/3 |
| ActiveClinic browser | 32 | 32 |
| BlessBoard browser | 23 | 23 |
| Community mock browser | 9 | 9 |
| Community PostgreSQL E2E | 0 | 0 |

Known HTTP failures unchanged: D14C OTP, D16 platform OTP, D25 slot capacity.
D25 same-staff overlap passed. No OTP or community schema was applied. No
real email/SMS. No financial posting. No deployment. `main` untouched.

## Remaining P1

- Print contracts for SOAP, prescriptions and referrals beyond the existing
  laboratory and radiology print controls.
- SOAP/referral field-by-field persistence matrix.

## Decision

QA is NO-GO. Release-ready is NO. Local evidence is not hosted acceptance.
Next action is hosted retest of laboratory and radiology journeys plus the
existing portal, vitals and website publication checks, or a separate
approval for the remaining print/SOAP depth work.
