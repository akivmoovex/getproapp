# V2134 G335 ActiveClinic and BlessBoard OTP tests

DATABASE=getpro_v13_e2e_g78d2301  
LIVE_EMAIL_SENT=NO

These results are the G334 double run on this same uncommitted tree. This phase did not change source after that run.

| Suite | Run 1 | Run 2 |
| --- | --- | --- |
| Contract and unit, including the Resend mock | 697/697 | 697/697 |
| HTTP and PostgreSQL | 41/41 | 41/41 |
| ActiveClinic browser, password login | 36/36 | 36/36 |
| BlessBoard browser | 23/23 | 23/23 |
| ActiveClinic staff OTP | 8/8 | 8/8 |
| ActiveClinic staff provider closed | 1/1 | 1/1 |
| ActiveClinic patient OTP | 7/7 | 7/7 |
| ActiveClinic patient provider closed | 1/1 | 1/1 |
| ActiveClinic recovery OTP | 9/9 | 9/9 |
| BlessBoard member OTP | 10/10 | 10/10 |
| OTP security | 15/15 | 15/15 |
| Website editor 390, 768, 1440 | 1/1 | 1/1 |

Staff, patient, and member suites check the session cookie and the protected route. A correct code is the only path that creates a session. Wrong, expired, replayed, cross-clinic, and cross-account codes do not. A missing provider returns the unavailable page and no cookie. Logout clears the staff and patient sessions.

BlessBoard recovery replay is covered by the OTP security unit file. There is no separate BlessBoard recovery browser spec.
