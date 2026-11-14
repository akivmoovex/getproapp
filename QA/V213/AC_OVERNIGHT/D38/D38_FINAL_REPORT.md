# D38 final report

Guest-token registration now requires the clinic organization, and a booking that already has a portal owner does not create a second identity. A repeated link for the same identity does not write the booking again. Claim updates match a null owner inside the caller's organization.

AC-05 guards were preserved. Staff-created patients still do not require a portal. Public booking lookup still does not revoke its token. No role, migration, OTP bypass, session-on-register, or database write was added.

G1 passed 272, failed 0, and skipped 0. That does not pass any of the 84 acceptance rows. Live denial and stored activation were not run.

HEAD remains `b8f6b420d25e908de64ba292866c218c32edc30c`. Nothing was committed or pushed.
