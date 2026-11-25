# G195 attribution results

Acquisition states are `CLINIC_DIRECT`, `PLATFORM_INTRODUCED`, and `UNKNOWN_OR_REVIEW_REQUIRED` is represented by `review_required` on the person plus `REVIEW_REQUIRED` from eligibility. History is append-only. A later walk-in does not replace `PLATFORM_INTRODUCED`. An introduction recorded after `CLINIC_DIRECT` does not convert that row.

An accepted introduction requires `source_type=platform_introduction`, the target clinic, the person, a timestamp, `evidenceRef`, `noticeVersion`, an actor, and `correlationId`. `claimed_referral` returns `forged_referral`. A repeated evidence reference returns the existing event.

| Scenario | Result |
| --- | --- |
| A. Platform introduction to clinic A | `PLATFORM_INTRODUCED`; repeat decision stays eligible when the fixture agreement is marked active inside the unit test |
| B. Walk-in at A, later introduction to B | A stays `CLINIC_DIRECT` and ineligible; B can be eligible |
| C. Existing clinic A patient | `converted: false` |
| D. QR at B without introduction | `presentPass` creates no introduction |
| E. No smartphone | Fallback code uses the same `presentPass` contract |
| F. Duplicate person | `flagDuplicate` sets review; no merge |
| G. Suspension | Future eligibility is `membership_blocked`; history remains |

Staff registration writes an audit note and no acquisition. Phone match, a scanned QR, a claimed referral, and a visit to another clinic do not attribute the clinic.
