# G239 full test execution

After the G229 radiology source and test changes, the following completed
twice after the last source modification:

- safe suite: 600 executed, 598 passed, 0 failed, 2 skipped;
- HTTP suite: 38 executed, 35 passed, 3 failed;
- ActiveClinic browser: 32 passed per run;
- BlessBoard browser: 23 passed per run;
- Community mock browser: 9 passed per run.

The three HTTP failures are D14C OTP, D16 platform OTP, and D25 slot
capacity. Same-staff overlap passed. Community PostgreSQL persistence and
browser evidence remain 0. The authorized database target was not reset and
no new migration was executed.
