# V13 G118 stability

The second HTTP run matched the first: 34 executed, 30 passed, 4 failed, 0 skipped. The second ActiveClinic browser run matched the first: 20 passed. The second BlessBoard browser run after the sign-in reduction matched the first: 23 passed.

The four HTTP failures are the same authorization blockers. They were not converted to skips or passes. No new skip appeared. Public booking, production media upload, and production OTP stayed disabled.

Checked in the browser runs:

- Church B does not render Church A’s member dashboard.
- A website editor receives 403 on member creation.
- A replayed staff invitation has no password form.
- The member recovery page does not contain the code.
- A wrong recovery code is rejected.
- The other church’s roles page does not list the invited email.

The appointment transaction lock and `platform.otp_challenges` were not added.
