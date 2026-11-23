# V13 G99 regression acceptance matrix

| BUG_ID | HTTP | BROWSER | STATUS |
| --- | --- | --- | --- |
| AC-REG-01 | Pass | Pass | VERIFIED_E2E |
| AC-AUTH-04 | Pass | Pass | VERIFIED_E2E |
| AC-REC-02 | Pass | Pass | VERIFIED_E2E |
| AC-REC-03 | Pass | Pass | VERIFIED_E2E |
| AC-PUB-01 | Pass, booking disabled | Pass, booking disabled | VERIFIED_E2E |
| AC-WEB-08 | Pass | Fail | VERIFIED_HTTP |
| AC-WEB-09 | Pass | Fail | VERIFIED_HTTP |
| BB-REG-07 | Pass | Fail | VERIFIED_HTTP |
| BB-AUTH-04 | Pass on both latest runs | Fail | VERIFIED_HTTP |
| BB-MEM-01 | Pass | Fail | VERIFIED_HTTP |
| BB-MEM-02 | Pass | Fail | VERIFIED_HTTP |
| BB-WEB-08 | Pass | Fail | VERIFIED_HTTP |
| BB-WEB-09 | Pass | Fail | VERIFIED_HTTP |
| BB-WEB-10 | Pass | Fail | VERIFIED_HTTP |
| BB-ANN-01 | Pass | Fail | VERIFIED_HTTP |
| BB-ANN-02 | Pass as uploads disabled | Fail | VERIFIED_HTTP |

Original 16: 5 VERIFIED_E2E, 11 VERIFIED_HTTP, 0 PARTIAL, 0 BLOCKED, 0 DEFERRED.

Browser observations that now pass: AC-PUB-01, AC-AUTH-04, AC-REC-02, AC-REC-03. AC-WEB-08, AC-WEB-09, and the BlessBoard browser journeys remain.

These four HTTP gates are outside the original 16 and stay blocked: D14C OTP, D16 platform OTP, D25 slot, D25 overlap.
