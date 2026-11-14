# D47 final report

Patient reset tokens now stay inside the clinic that issued them, and the password changes only after the existing one-time consume succeeds. Registration still does not open a session, staff-created patients still do not require a portal, and the public registration sentences were left as the D24 contract requires.

G1 passed 296, failed 0, and skipped 0. Portal persistence was not run. No database write, OTP bypass, commit, or push was made.
