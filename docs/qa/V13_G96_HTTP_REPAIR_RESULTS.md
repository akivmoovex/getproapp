# V13 G96 HTTP repair results

Authoritative run: `.v13-isolated-pg/g91-http3.log`.

EXECUTED=34
PASSED=30
FAILED=4
SKIPPED=0

The immediately previous run, `.v13-isolated-pg/g91-http2.log`, had the same totals.

Remaining failures, all external blockers:

| Test | Error | Why it stays |
| --- | --- | --- |
| D14C OTP | `platform.otp_challenges` is not present | Adding the table is not authorized |
| D16 platform OTP | Same absent table | Same |
| D25 slot | `APT-01-03_NOT_IMPLEMENTED` | The slot lock is not authorized |
| D25 overlap | `BLOCKED_APPROVAL_REQUIRED` | The in-transaction overlap check is not authorized |

BB-WEB-08, BB-AUTH-04, AC-WEB-08, AC-WEB-09, AC-REC-02, AC-REC-03, AC-PUB-01, BB-ANN-02, and the public sermon, event, and announcement HTTP scenarios passed in both runs. They were not converted to skips.
