# V2.13.2 G128 — shared hardening

BlessBoard member login, invitation accept, and testing OTP delivery were not changed. Production OTP was not enabled. `048_otp_challenges.sql` was not added. Public booking and production media upload flags were not enabled.

Cross-clinic patient matching stays inside the healthcare organization predicate. Vitals correction uses the signed-in facility and organization. Appointment locks are scoped to that organization and healthcare organization.

The previous 23 BlessBoard and 20 ActiveClinic browser scenarios remain in the suite. This document does not treat an older green run as proof after these edits.
