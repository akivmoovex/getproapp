# G208 adversarial review

| Question | Result |
| --- | --- |
| Could a test pass without the correct clinic attribution? | No. Clinic A walk-in expects `walk_in_no_introduction` and clinic B introduction expects `introduced_repeat`. |
| Could a clinic A walk-in qualify at A? | No. Staff registration writes no acquisition. Walk-in stays `CLINIC_DIRECT`. |
| Could clinic B read clinic A's chart? | No. `readChart` returns `cross_clinic_chart`. The browser body must not contain `private-chart-note-a`. |
| Could a QR scan create a referral? | No. `presentPass` leaves `introductions` empty. |
| Could another staff user consume the credential? | Presentation is not single-use redemption. It does not post a benefit. Rotation and revocation reject the old code. |
| Could a failed link still create a mapping? | Phone-only and ambiguous calls return `review_required` with `links.length === 0`. Concurrent confirms leave one row. |
| Could a discount appear without an approved agreement? | The service cannot set `ACTIVE`. The inactive clinic A browser path expects no discount. The clinic B discount exists only because the test server mutates one fixture. |
| Could a repeated callback accrue twice? | The second `planLedger` call is `duplicate: true`. `commitLedger` never appends to `ledger`. |
| Could the patient see a saving they did not receive? | Ineligible previews say no discount is applied. |
| Could an expired agreement still apply? | `agreement_expired` is `NOT_ELIGIBLE`. |
| Could the test pass because the service was mocked? | Browser and HTTP tests call `registerCommunityBenefitsRoutes` and the real service. |
| Could the flag-off application write a ledger? | Flag off returns 404 before the service. `commitLedger` returns `posting_disabled` even when called directly. |

No assertion was weakened to obtain these results.
