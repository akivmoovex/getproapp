# G239 full test execution

After G224 source changes, the following completed twice where applicable:

- safe suite: 598 executed, 596 passed, 0 failed, 2 skipped;
- HTTP suite: 37 executed, 34 passed, 3 failed;
- ActiveClinic browser: 31 passed per completed run;
- BlessBoard browser: 23 passed per run;
- Community mock browser: 9 passed per run.

The three HTTP failures are D14C OTP, D16 platform OTP, and D25 slot
capacity. Same-staff overlap passed. Community PostgreSQL persistence and
browser evidence remain 0. The authorized database target was not reset and
no new migration was executed.

The first G224 full ActiveClinic run failed only because the new browser
fixture exhausted the single PostgreSQL client while provisioning staff. The
fixture was changed to an authorized pool, the focused G224 browser test
passed, and the two complete ActiveClinic runs after that fix passed 31.
