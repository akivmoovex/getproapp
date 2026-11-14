# D44 final report

The G2 and G3 procedures are written and were not executed. Fixture plans exist for two synthetic clinics, one patient, one 30-minute slot, and the AC-05 pair `platform-admin@v13d19.example` and `tenant-reader@v13d19.example`. Apply still throws `V13_FIXTURE_HOLD`. Browser tests still stop in `hold()`.

Write flags, the browser flag, and both database URLs are unset. No migration, browser session, commit, or push was made. AC-05 live denial, portal persistence, and appointment concurrency remain not run. Capacity remains unapproved, so that concurrency case is still blocked even after a database is authorized.
