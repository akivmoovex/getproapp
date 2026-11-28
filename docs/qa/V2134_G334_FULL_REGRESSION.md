# V2134 G334 full local regression

DATABASE=getpro_v13_e2e_g78d2301  
HOST=127.0.0.1:55432  
ISOLATION=The HTTP runner preflights this database and refuses it when any clinic has public booking enabled.

| Suite | Run 1 | Run 2 |
| --- | --- | --- |
| Contract and unit | 697/697 | 697/697 |
| HTTP and PostgreSQL | 41/41 | 41/41 |
| ActiveClinic browser | 36/36 | 36/36 |
| BlessBoard browser | 23/23 | 23/23 |
| ActiveClinic recovery OTP | 9/9 | 9/9 |
| ActiveClinic staff OTP | 8/8 | 8/8 |
| ActiveClinic staff provider closed | 1/1 | 1/1 |
| ActiveClinic patient OTP | 7/7 | 7/7 |
| ActiveClinic patient provider closed | 1/1 | 1/1 |
| BlessBoard member OTP | 10/10 | 10/10 |
| Website editor 390, 768, 1440 | 1/1 | 1/1 |
| OTP security | 15/15 | 15/15 |

The ActiveClinic browser file includes patient activation, reception and appointments, vital correction, laboratory, radiology, website draft and publish, clinical print regions, role denial, and the disabled public booking page. The HTTP file includes the PostgreSQL checks for those workflows and the booking denial. No suite was skipped. No failure was suppressed.

Desktop and mobile editor coverage is the CMS suite. The clinical browser runs use the desktop Playwright project. A separate phone viewport was not opened for laboratory, radiology, or printing. Those phone layouts are NOT_RUN.
