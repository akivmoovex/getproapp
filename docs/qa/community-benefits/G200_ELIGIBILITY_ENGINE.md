# G200 eligibility engine

`decideEligibility` returns `ELIGIBLE`, `MEMBER_ONLY`, `NOT_ELIGIBLE`, or `REVIEW_REQUIRED`.

Covered reasons: `introduced_repeat`, `walk_in_no_introduction`, `no_introduction`, `agreement_inactive`, `agreement_missing`, `agreement_expired`, `service_excluded`, `stale_policy`, `membership_blocked`, `membership_pending`, `duplicate_person`, and `forged_referral` on the introduction write. A duplicate evidence reference does not add a second introduction.

Membership is not financial entitlement. An introduced member stays `MEMBER_ONLY` until an agreement row is active. This cycle has no API that sets an agreement active. Unit tests mark a fixture row active only to exercise the decision. That fixture is not commercial policy.
