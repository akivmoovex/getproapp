# D72 final report

The patient reset token is now selected and consumed in the caller’s organization. A duplicate candidate from another organization is not returned. Registration text, staff-created patients, and the booking token are unchanged. Merge and a production OTP bypass were not added.

G1 passed 353 and failed 0. Stored patients and the live AC-05 denial were not run. No database write, commit, or push was made.
