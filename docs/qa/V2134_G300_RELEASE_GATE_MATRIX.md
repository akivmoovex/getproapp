# V2134 G300 release gate matrix

| Gate | Result | Notes |
| --- | --- | --- |
| Safe 566×2 | PASS | Includes g300 print identity + g271 version |
| HTTP 41/40/1 ×2 | PASS except D25 slot | Expected policy fail |
| AC browser 32×2 | PASS | Includes G168 print identity, G224, G229 |
| BB browser 23×2 | PASS | |
| Community mock 9×2 | PASS | Not PostgreSQL UI |
| OTP/Community disposable PG 3×2 | PASS | posting_disabled |
| D14C/D16 disposable | PASS | Live mailbox blocked |
| D25 overlap | PASS | |
| D25 slot | FAIL | UNAPPROVED |
| About 2.13.4 | PASS | G271 attested |
| Live email | NOT_RUN | Forbidden / unconfigured |
| Hosted deploy this cycle | NOT_PERFORMED | |
| QA_GO_NO_GO | NO-GO | |
| RELEASE_READY | NO | |
