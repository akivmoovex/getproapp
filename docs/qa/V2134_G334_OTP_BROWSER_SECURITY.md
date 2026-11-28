# V2134 G334 OTP browser security

DATABASE=getpro_v13_e2e_g78d2301  
HOST=127.0.0.1:55432  
LIVE_EMAIL_SENT=NO

| Suite | Run 1 | Run 2 |
| --- | --- | --- |
| ActiveClinic staff login OTP | 8/8 | 8/8 |
| ActiveClinic staff missing provider | 1/1 | 1/1 |
| ActiveClinic patient login OTP | 7/7 | 7/7 |
| ActiveClinic patient missing provider | 1/1 | 1/1 |
| ActiveClinic recovery OTP | 9/9 | 9/9 |
| BlessBoard member login OTP | 10/10 | 10/10 |
| OTP security unit | 15/15 | 15/15 |
| Resend mock provider | 4/4 inside the contract run | 4/4 inside the contract run |

Staff coverage checks a pending challenge, no session cookie, a closed `/app`, the correct code, a wrong code, an expired code, replay, one winner from two simultaneous posts, another clinic, another account, resend cooldown, the account cap, a missing provider, and logout. Password-only staff login remains the 36-test ActiveClinic suite with the OTP flag removed.

Patient coverage checks a staff-created chart, password before the code, no portal session, the correct patient number, a wrong patient, another clinic, expiry, replay, unmatched registration with no new chart, activation, and recovery bound to that email. A missing provider shows one unavailable alert and no session.

BlessBoard member coverage checks credentials before the code, a withheld session, wrong and expired codes, the correct member and church, replay, organization binding, another member, one concurrent winner, the rate limit, and a missing provider. Password recovery replay is covered by `g280-email-otp-security-matrix.test.js`. There is no separate BlessBoard recovery browser file.

Session cookies and protected routes were checked. Success text alone was not treated as authentication.
