# G227 historical bug matrix

| Group | Current classification | Evidence / blocker |
|---|---|---|
| Original 16 V2.13.1 regressions | ALREADY_REPAIRED_LOCAL or HOSTED_RETEST_REQUIRED | Existing G05/G03/G04/D05 and ActiveClinic browser journeys; hosted deployment was not authorized |
| November 23 follow-up | Mixed | G121 traceability; portal, vitals, website text are locally repaired; hosted retest remains required |
| November 25 sanity report | Source unavailable | DOCX was not found; use only repository and prompt-supplied findings |
| November 25 role report | Source unavailable | DOCX was not found; no missing scenarios were invented |
| G224 laboratory findings | ALREADY_REPAIRED_LOCAL | G224 HTTP and Playwright journey persisted order, specimen, result and verification |
| G224 radiology filter finding | ALREADY_REPAIRED_LOCAL | Completed status tab/counter added; full radiology workflow remains incomplete coverage |
| CB-01 through CB-14 | ALREADY_REPAIRED_LOCAL | G215 defect register and G223 tests |
| AC-05 | BLOCKED_BY_POLICY / COVERAGE GATE | Lower-privilege platform database administration remains denied |
| D14C and D16 | BLOCKED_BY_MIGRATION | `platform.otp_challenges` is absent; no OTP migration authorized |
| D25 capacity | POLICY_MISMATCH | Capacity policy is not approved |
| D25 overlap | VERIFIED_EXECUTED | Same-staff overlap transaction protection passes |
| Community PostgreSQL | BLOCKED_BY_MIGRATION | Community schema not applied; persistence pass 0 |
| Live OTP/email/payment | BLOCKED_BY_EXTERNAL_PROVIDER or POLICY | No live delivery or financial posting authorized |

Historical failures are not relabeled as current code defects merely because
they appeared in an earlier report. Every local PASS remains local evidence,
not hosted acceptance.
