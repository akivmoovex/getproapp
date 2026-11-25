# G188 OTP architecture handoff

Implementation evidence is `fbfcd4fcbbfcced4fcc76a5917657497feda4537`. This file does not name its own commit. Branch `V13`. Base `9b589495026b5660dba4a193f968ccc1a6136765`. Product version `2.13.2`. QA is NO-GO. Release is not ready.

The reviewed script remains `docs/qa/V2132_G181_OTP_CHALLENGES.sql`. It was not applied. `048_otp_challenges.sql` was not created. `platform.otp_challenges` was not created.

Two safe runs each executed 582, passed 580, failed 0, and skipped 2. Two HTTP runs each executed 36, passed 33, and failed 3: D14C, D16 platform OTP, and D25 slot capacity. Same-staff overlap passed both HTTP runs. One Playwright cycle passed ActiveClinic 30 and BlessBoard 23.

D14C and D16 still fail on the absent table. A later apply would not make D16 pass by itself: that test builds two services without a shared pool, expects `verifyChallenge` to set `sessionComplete`, and does not supply a pepper. `completeProtectedAction` remains the only step that completes a session, and it does so once.

`pronline.org` DNS is present. Resend verification was not observed. No API key is configured. No email was sent. Production OTP stays blocked. Public booking and production media upload stay disabled.

No deployment was performed. `main` was not modified.
