# V13 G87 Playwright retest

G82 full suites: 43 executed, 17 passed, 26 failed, 0 skipped.

G88 full suites, not combined with the focused reruns:

- ActiveClinic `.v13-isolated-pg/g88-ac-full.log`: 20 executed, 17 passed, 3 failed, 0 skipped.
- BlessBoard `.v13-isolated-pg/g88-bb-full.log`: 23 executed, 2 passed, 21 failed, 0 skipped.
- Combined: 43 executed, 19 passed, 24 failed, 0 skipped.

## ActiveClinic changes that passed in this full run

| Test | Result |
| --- | --- |
| AC-AUTH-04 | Passed. The used reset link is rejected in the browser without the previous POST hang |
| AC-REC-03 | Passed. Heart rate is saved, an anonymous post is redirected to login, and 72 bpm remains |
| AC-REG-01, AC-PUB-01, G66, G67, and the earlier staff denials | Still passed |

## ActiveClinic still failing

| Test | Evidence |
| --- | --- |
| AC-WEB-08 | Published page does not contain the new section heading |
| AC-WEB-09 | Draft preview remains `ac.default` after the mint theme API accepts the draft |
| AC-REC-02 | Receptionist check-in on the existing clinic still ends on the generic error page |

## BlessBoard

The full BlessBoard suite is unchanged from G82: BB-05 and the blocked OTP gate passed. The other 21 failed. The public pages still do not show the content markers, invitation and OTP secrets are absent, and media upload stays disabled. Screenshots and traces stayed under `test-results/` and were not staged.
